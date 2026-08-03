import { supabase } from './supabase';

/** 'YYYY-MM-DD' → 사진 URL */
export type LunchPhotoMap = Record<string, string>;

type LunchPhotoRow = { date: string; image_url: string };

/** 주어진 날짜들의 점심 사진을 한 번에 조회한다. 테이블이 없거나 실패하면 빈 맵을 반환한다. */
export async function fetchLunchPhotos(dates: string[]): Promise<LunchPhotoMap> {
  if (dates.length === 0) return {};

  const { data, error } = await supabase
    .from('lunch_photos')
    .select('date, image_url')
    .in('date', dates);

  if (error) {
    console.warn('점심 사진 조회 실패:', error.message);
    return {};
  }

  const map: LunchPhotoMap = {};
  for (const row of (data || []) as LunchPhotoRow[]) {
    map[row.date] = row.image_url;
  }
  return map;
}

/** 해당 날짜의 사진을 저장한다(이미 있으면 교체). */
export async function saveLunchPhoto(date: string, imageUrl: string) {
  return supabase
    .from('lunch_photos')
    .upsert({ date, image_url: imageUrl, updated_at: new Date().toISOString() }, { onConflict: 'date' });
}

/** 해당 날짜의 사진을 삭제한다. */
export async function deleteLunchPhoto(date: string) {
  return supabase.from('lunch_photos').delete().eq('date', date);
}
