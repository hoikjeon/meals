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

const normalize = (value?: string) => (value || '').replace(/\s+/g, ' ').trim();

/** 이름+원산지로 만든 음식 식별자. 같은 이름이라도 원산지가 다르면 다른 음식으로 본다. */
export const getMealFoodIdentity = (food: { name: string; origin?: string }) => (
  `${normalize(food.name)}\u0000${normalize(food.origin)}`
);

/**
 * 모든 칸을 foods 기준으로 바꿔 둔다.
 * 편집 화면은 이 형태만 다루므로 불러온 직후 한 번 통과시킨다.
 */
export const materializeMenus = (menus: MealEntry[], foodDb: FoodItem[]): MealEntry[] => (
  menus.map((entry) => (entry.foods ? entry : { ...entry, foods: resolveMealFoods(entry, foodDb) }))
);

/**
 * 구형 화면(배포 전 번들)이 읽을 수 있도록 foodIds를 이름으로 되찾아 채운다.
 * 음식 DB에 없는 이름은 건너뛰므로 어디까지나 보조 값이고, 기준은 언제나 foods다.
 */
export const withLegacyFoodIds = (menus: MealEntry[], foodDb: FoodItem[]): MealEntry[] => {
  const byIdentity = new Map(foodDb.map((food) => [getMealFoodIdentity(food), food.id]));
  const byName = new Map(foodDb.map((food) => [normalize(food.name), food.id]));

  return menus.map((entry) => {
    if (!entry.foods) return entry;
    const foodIds = entry.foods
      .map((food) => byIdentity.get(getMealFoodIdentity(food)) ?? byName.get(normalize(food.name)))
      .filter((id): id is string => Boolean(id));
    return { ...entry, foodIds };
  });
};
