/**
 * DB에 base64로 저장된 이미지(오늘의 점심, 배경)를 Supabase Storage로 이전한다.
 *
 * 사용법:
 *   node scripts/migrate-images-to-storage.mjs          # dry-run: 변경 대상만 출력
 *   node scripts/migrate-images-to-storage.mjs --apply  # 실제 업로드 + DB 업데이트
 *
 * 필요 조건:
 *   - .env.local 의 NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY
 *   - SUPABASE_SERVICE_ROLE_KEY 가 있으면 그 키를 사용 (버킷 자동 생성 가능)
 *   - anon 키만 있으면 'meal-images' 공개 버킷과 anon INSERT 정책이 미리 있어야 함
 */
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const PROJECT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(PROJECT, 'package.json'));
const { createClient } = require('@supabase/supabase-js');
const sharp = require('sharp');

const APPLY = process.argv.includes('--apply');
const BUCKET = 'meal-images';

// .env.local 파싱 (키 값은 출력하지 않는다)
const env = {};
for (const line of fs.readFileSync(path.join(PROJECT, '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) env[m[1].trim()] = m[2].trim();
}

const key = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const usingServiceRole = Boolean(env.SUPABASE_SERVICE_ROLE_KEY);
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, key);
console.log(`키: ${usingServiceRole ? 'service_role' : 'anon'} | 모드: ${APPLY ? 'APPLY' : 'dry-run'}`);

const kb = (n) => `${(n / 1024).toFixed(0)}KB`;

/** base64 data URL → 리사이즈·압축. 재인코딩이 원본보다 커지면 원본 유지 */
async function compress(dataUrl, maxWidth) {
  const mime = dataUrl.match(/^data:([^;]+)/)?.[1] || 'image/jpeg';
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const input = Buffer.from(base64, 'base64');
  const recoded = await sharp(input)
    .resize({ width: maxWidth, withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();
  if (recoded.length < input.length) {
    return { input, out: recoded, mime: 'image/jpeg', ext: 'jpg' };
  }
  return { input, out: input, mime, ext: (mime.split('/')[1] || 'jpg').replace('jpeg', 'jpg') };
}

async function uploadDataUrl(dataUrl, prefix, label) {
  const maxWidth = prefix === 'background' ? 1920 : 1200;
  const { input, out, mime, ext } = await compress(dataUrl, maxWidth);
  const filePath = `${prefix}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  console.log(`  ${label}: ${kb(input.length)} -> ${kb(out.length)} (${filePath})`);
  if (!APPLY) return `(dry-run:${filePath})`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(filePath, out, { contentType: mime, cacheControl: '31536000' });
  if (error) throw new Error(`업로드 실패 (${filePath}): ${error.message}`);
  return supabase.storage.from(BUCKET).getPublicUrl(filePath).data.publicUrl;
}

async function ensureBucket() {
  if (!usingServiceRole) return; // anon 키로는 버킷 생성 불가 — 이미 있다고 가정
  const { data: buckets } = await supabase.storage.listBuckets();
  if (buckets?.some((b) => b.name === BUCKET)) return;
  if (!APPLY) {
    console.log(`버킷 '${BUCKET}' 없음 — apply 시 생성됨`);
    return;
  }
  const { error } = await supabase.storage.createBucket(BUCKET, { public: true });
  if (error) throw new Error(`버킷 생성 실패: ${error.message}`);
  console.log(`공개 버킷 '${BUCKET}' 생성 완료`);
}

/** 한 행의 settings/today_lunch에서 base64 이미지를 이전하고, 바뀐 필드만 반환 */
async function migrateRow(row, label) {
  const updates = {};

  const bg = row.settings?.backgroundImageUrl;
  if (bg && bg.startsWith('data:')) {
    const url = await uploadDataUrl(bg, 'background', `${label} 배경`);
    updates.settings = { ...row.settings, backgroundImageUrl: url };
  }

  const lunch = row.today_lunch?.imageUrl;
  if (lunch && lunch.startsWith('data:')) {
    const url = await uploadDataUrl(lunch, 'lunch', `${label} 점심`);
    updates.today_lunch = { ...row.today_lunch, imageUrl: url };
  }

  return Object.keys(updates).length ? updates : null;
}

await ensureBucket();

// 1. current_meal_state
const { data: state, error: stateErr } = await supabase
  .from('current_meal_state').select('*').eq('id', 1).single();
if (stateErr) throw new Error(`current_meal_state 조회 실패: ${stateErr.message}`);

const stateUpdates = await migrateRow(state, 'current_meal_state');
if (stateUpdates && APPLY) {
  const { error } = await supabase.from('current_meal_state').update(stateUpdates).eq('id', 1);
  if (error) throw new Error(`current_meal_state 업데이트 실패: ${error.message}`);
  console.log('  -> current_meal_state 업데이트 완료');
}

// 2. meal_history
const { data: history, error: histErr } = await supabase.from('meal_history').select('*');
if (histErr) throw new Error(`meal_history 조회 실패: ${histErr.message}`);

let migrated = 0;
for (const row of history) {
  const updates = await migrateRow(row, `"${row.week_title}"`);
  if (!updates) continue;
  migrated += 1;
  if (APPLY) {
    const { error } = await supabase.from('meal_history').update(updates).eq('id', row.id);
    if (error) throw new Error(`meal_history(${row.week_title}) 업데이트 실패: ${error.message}`);
    console.log(`  -> "${row.week_title}" 업데이트 완료`);
  }
}

console.log(`\n완료: 히스토리 ${migrated}건${stateUpdates ? ' + 현재 상태' : ''} ${APPLY ? '이전됨' : '이전 대상'}`);
if (!APPLY) console.log('실제 실행: node scripts/migrate-images-to-storage.mjs --apply');
