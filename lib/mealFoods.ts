import { FoodItem, MealEntry, MealFood } from './types';

/**
 * 메뉴 한 칸의 음식 목록을 구한다.
 *
 * `foods`가 있으면 그대로 쓴다(빈 배열이면 빈 칸이라는 뜻이다).
 * 없는 과거 기록만 음식 DB에서 이름을 찾아 만든다.
 */
export const resolveMealFoods = (
  entry: MealEntry | undefined,
  foodDb: FoodItem[],
): MealFood[] => {
  if (!entry) return [];
  if (entry.foods) return entry.foods;

  return entry.foodIds
    .map((id) => foodDb.find((food) => food.id === id))
    .filter((food): food is FoodItem => Boolean(food))
    .map((food) => ({ name: food.name, origin: food.origin || undefined }));
};

/** 요일/끼니로 메뉴 칸을 찾아 음식 목록을 구한다. */
export const getMealFoods = (
  menus: MealEntry[],
  foodDb: FoodItem[],
  day: MealEntry['day'],
  time: MealEntry['time'],
): MealFood[] => (
  resolveMealFoods(menus.find((menu) => menu.day === day && menu.time === time), foodDb)
);
