import { supabase } from './supabase';
import { FoodItem } from './types';

// Supabase(PostgREST)는 한 요청당 최대 1000행만 반환한다.
// limit()이나 range()로는 이 상한을 넘길 수 없으므로 페이지 단위로 이어 받아야 한다.
const PAGE_SIZE = 1000;

/**
 * food_items 전체를 이름 오름차순으로 가져온다.
 *
 * 단순 select는 1000개까지만 돌려주기 때문에, 음식이 1000개를 넘으면
 * 뒷부분이 통째로 누락되어 식단표의 해당 메뉴가 화면에서 사라진다.
 */
export async function fetchAllFoodItems(): Promise<FoodItem[]> {
  const all: FoodItem[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('food_items')
      .select('*')
      .order('name', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      console.error('음식 목록 조회 실패:', error.message);
      break;
    }
    if (!data || data.length === 0) break;

    all.push(...data);
    if (data.length < PAGE_SIZE) break;
  }

  return all;
}
