import { DayOfWeek } from "./types";

export const DAYS: DayOfWeek[] = ['월', '화', '수', '목', '금', '토', '일'];

export const getWeekDatesFromTitle = (title: string) => {
  const now = new Date();
  const currentYear = now.getFullYear();
  
  const match = title.match(/(\d+)\s*월\s*(\d+)\s*주/);
  if (!match) {
    // fallback: 현재 주 기준
    const dayOfWeek = now.getDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(now);
    monday.setDate(now.getDate() + mondayOffset);
    return DAYS.map((_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return d;
    });
  }

  const targetMonth = parseInt(match[1]); // 1-indexed
  const targetWeek = parseInt(match[2]);   // 1-indexed

  // 1일이 포함된 주의 월요일을 구함 (월~일 기준)
  const firstDay = new Date(currentYear, targetMonth - 1, 1);
  const firstDayOfWeek = firstDay.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  
  // 1일이 속한 주의 월요일 날짜 계산
  // 일요일(0)이면 -6일, 그 외에는 1 - firstDayOfWeek 일
  const offset = firstDayOfWeek === 0 ? -6 : 1 - firstDayOfWeek;
  const week1Monday = new Date(firstDay);
  week1Monday.setDate(firstDay.getDate() + offset);

  const targetMonday = new Date(week1Monday);
  targetMonday.setDate(week1Monday.getDate() + (targetWeek - 1) * 7);

  return DAYS.map((_, i) => {
    const d = new Date(targetMonday);
    d.setDate(targetMonday.getDate() + i);
    return d;
  });
};
