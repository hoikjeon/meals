import { FoodItem, MealEntry, Settings, TodayLunch } from './types';

export const dummyFoodItems: FoodItem[] = [
  { id: 'f1', name: '바지락살부추국', category: '국', origin: '' },
  { id: 'f2', name: '돈육채피망볶음', category: '반찬', origin: '돈육:국내산' },
  { id: 'f3', name: '겨울초나물', category: '반찬', origin: '' },
  { id: 'f4', name: '감자양파조림', category: '반찬', origin: '' },
  { id: 'f5', name: '배추김치', category: '반찬', origin: '' },
  { id: 'f6', name: '크림스프', category: '국', origin: '' },
  { id: 'f7', name: '함박스테이크', category: '반찬', origin: '돈육:국내산' },
  { id: 'f8', name: '달걀오믈렛', category: '반찬', origin: '' },
  { id: 'f9', name: '무말랭이고춧잎지', category: '반찬', origin: '' },
  { id: 'f10', name: '오이피클', category: '반찬', origin: '' },
  { id: 'f11', name: '쇠고기샤브국', category: '국', origin: '쇠고기:호주산' },
  { id: 'f12', name: '참치깻잎달걀전', category: '반찬', origin: '참치:원양어산' },
  { id: 'f13', name: '도라지생채', category: '반찬', origin: '' },
  { id: 'f14', name: '톳두부무침', category: '반찬', origin: '' },
  
  // 기타 음식들
  { id: 'f15', name: '흰쌀밥', category: '밥', origin: '쌀:국내산' },
  { id: 'f16', name: '흑미밥', category: '밥', origin: '쌀:국내산' },
  { id: 'f17', name: '잡곡밥', category: '밥', origin: '쌀:국내산' },
  { id: 'f18', name: '만둣국', category: '국', origin: '돈육:국내산' },
  { id: 'f19', name: '햄버섯들깨볶음', category: '반찬', origin: '돈육:국내산' },
  { id: 'f20', name: '방풍나물무침', category: '반찬', origin: '' },
];

export const dummyWeeklyMenus: MealEntry[] = [
  {
    id: 'm1',
    day: '월',
    time: '아침',
    foodIds: ['f15', 'f1', 'f2', 'f3', 'f4', 'f5'],
  },
  {
    id: 'm2',
    day: '월',
    time: '점심',
    foodIds: ['f15', 'f6', 'f7', 'f8', 'f9', 'f10'],
  },
  {
    id: 'm3',
    day: '월',
    time: '저녁',
    foodIds: ['f15', 'f11', 'f12', 'f13', 'f14', 'f5'],
  },
  {
    id: 'm4',
    day: '화',
    time: '아침',
    foodIds: ['f16', 'f18', 'f19', 'f20', 'f5'],
  }
];

export const dummySettings: Settings = {
  weekTitle: '3월 1주차 식단표',
  originText: `쌀(밥,죽,누룽지):국내산
닭고기,오리고기(가공품들포함):국내산
고등어,새우젓:국내산
코다리,동태(슬라이스):러시아산
동태(국용):미국산
낙지:말레이지아산
가자미:미국산
배추김치(반찬용):배추-국내산 고춧가루-중국산
배추김치(국,찌개,볶음,조림,찜용):배추-중국산 고춧가루-중국산
배추,봄동,단배추(겉절이류):배추-국내산 고춧가루-중국산
꽃게,미꾸라지,일미채,낙지젓갈:중국산
두부,순두부,유부슬라이스:대두-외국산
갈치:남아공산
쭈꾸미:베트남산

원산지표시판 <이 외 원산지는 메뉴로 제공시 식단에 기재하며, 상기 식단은 시장 수급 사정에 따라 변경될 수 있습니다>`,
  backgroundImageUrl: null,
  backgroundColor: '#FFF6E5', // 노란빛 배경
  favoriteFoodIds: [],
};

export const dummyTodayLunch: TodayLunch = {
  id: 't1',
  date: new Date().toISOString().split('T')[0],
  imageUrl: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?q=80&w=800&auto=format&fit=crop', // 더미 이미지
};
