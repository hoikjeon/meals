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

  // 해당 월의 1일부터 시작하여 N주차 월요일을 구함
  const firstDay = new Date(currentYear, targetMonth - 1, 1);
  const firstDayOfWeek = firstDay.getDay(); // 0=Sun
  let firstMondayOffset: number;
  if (firstDayOfWeek === 0) {
    firstMondayOffset = 1;
  } else if (firstDayOfWeek === 1) {
    firstMondayOffset = 0;
  } else {
    firstMondayOffset = 8 - firstDayOfWeek;
  }

  let week1Monday: Date;
  if (firstDayOfWeek >= 1 && firstDayOfWeek <= 4) {
    week1Monday = new Date(currentYear, targetMonth - 1, 1 - (firstDayOfWeek - 1));
  } else {
    week1Monday = new Date(currentYear, targetMonth - 1, 1 + firstMondayOffset);
  }

  const targetMonday = new Date(week1Monday);
  targetMonday.setDate(week1Monday.getDate() + (targetWeek - 1) * 7);

  return DAYS.map((_, i) => {
    const d = new Date(targetMonday);
    d.setDate(targetMonday.getDate() + i);
    return d;
  });
};
