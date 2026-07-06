export type Category = '밥' | '국' | '반찬' | '기타';
export type MealTime = '아침' | '점심' | '저녁';
export type DayOfWeek = '월' | '화' | '수' | '목' | '금' | '토' | '일';

export interface FoodItem {
  id: string;
  name: string;
  category: Category;
  origin?: string; // 원산지 정보 (예: 국내산, 호주산 등)
}

export interface MealEntry {
  id: string;
  day: DayOfWeek;
  time: MealTime;
  foodIds: string[];
}

export interface Settings {
  weekTitle: string;
  weekStart?: string; // YYYY-MM-DD, 해당 식단 주의 월요일
  titleColor?: string;
  originText: string;
  backgroundImageUrl: string | null;
  backgroundColor: string;
  favoriteFoodIds?: string[];
  historyOrder?: number[];
}

export interface TodayLunch {
  id: string;
  date: string; // YYYY-MM-DD
  imageUrl: string;
}

export interface HistoryEntry {
  id: number;
  weekTitle: string;
  menus: MealEntry[];
  settings: Settings;
  todayLunch?: TodayLunch;
}
