export type Category = '밥' | '국' | '반찬' | '기타';
export type MealTime = '아침' | '점심' | '저녁';
export type DayOfWeek = '월' | '화' | '수' | '목' | '금' | '토' | '일';

export interface FoodItem {
  id: string;
  name: string;
  category: Category;
  origin?: string; // 원산지 정보 (예: 국내산, 호주산 등)
}

/** 그 주 메뉴에 실제로 적힌 음식 한 줄. 원산지는 주마다 달라질 수 있어 여기에 둔다. */
export interface MealFood {
  name: string;
  origin?: string;
}

export interface MealEntry {
  id: string;
  day: DayOfWeek;
  time: MealTime;
  /** 음식 DB 참조 방식(구형). foods가 있으면 그쪽이 우선이다. */
  foodIds: string[];
  /** 메뉴 이름을 직접 담는 방식. 음식 DB에 행을 만들지 않아도 된다. */
  foods?: MealFood[];
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
