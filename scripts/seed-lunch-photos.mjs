/**
 * 기존 주차별로 1장씩만 남아 있던 점심 사진을 lunch_photos 테이블(날짜별)로 옮긴다.
 *
 * 사용법:
 *   node scripts/seed-lunch-photos.mjs          # dry-run
 *   node scripts/seed-lunch-photos.mjs --apply  # 실제 저장
 *
 * 선행 조건: scripts/lunch_photos.sql 을 Supabase SQL Editor에서 실행해 둘 것.
 */
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const PROJECT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(PROJECT, 'package.json'));
const { createClient } = require('@supabase/supabase-js');

const APPLY = process.argv.includes('--apply');

const env = {};
for (const line of fs.readFileSync(path.join(PROJECT, '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) env[m[1].trim()] = m[2].trim();
}
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
console.log(`모드: ${APPLY ? 'APPLY' : 'dry-run'}`);

const isUsable = (lunch) =>
  lunch && typeof lunch.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(lunch.date)
  && typeof lunch.imageUrl === 'string' && lunch.imageUrl.startsWith('http');

// 날짜별로 수집 (같은 날짜가 여러 주차에 있으면 마지막 것으로 정리)
const byDate = new Map();

const { data: state, error: stateErr } = await supabase
  .from('current_meal_state').select('today_lunch').eq('id', 1).single();
if (stateErr) throw new Error(`current_meal_state 조회 실패: ${stateErr.message}`);
if (isUsable(state?.today_lunch)) byDate.set(state.today_lunch.date, state.today_lunch.imageUrl);

const { data: history, error: histErr } = await supabase
  .from('meal_history').select('week_title, today_lunch');
if (histErr) throw new Error(`meal_history 조회 실패: ${histErr.message}`);

let skipped = 0;
for (const row of history || []) {
  if (isUsable(row.today_lunch)) byDate.set(row.today_lunch.date, row.today_lunch.imageUrl);
  else skipped += 1;
}

const rows = [...byDate.entries()]
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([date, image_url]) => ({ date, image_url }));

console.log(`\n이관 대상 ${rows.length}개 날짜 (사용 불가 ${skipped}건 제외):`);
for (const r of rows) console.log(`  ${r.date}  ${r.image_url.slice(-24)}`);

if (!APPLY) {
  console.log('\n실제 실행: node scripts/seed-lunch-photos.mjs --apply');
} else {
  const { error } = await supabase.from('lunch_photos').upsert(rows, { onConflict: 'date' });
  if (error) throw new Error(`lunch_photos 저장 실패: ${error.message}`);
  const { count } = await supabase.from('lunch_photos').select('*', { count: 'exact', head: true });
  console.log(`\n저장 완료. lunch_photos 총 ${count}건`);
}
