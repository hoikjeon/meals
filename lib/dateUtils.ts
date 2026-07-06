import { DayOfWeek } from "./types";

export const DAYS: DayOfWeek[] = ['월', '화', '수', '목', '금', '토', '일'];

export const formatDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const parseLocalDate = (dateString: string) => {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day);
};

export const addDays = (date: Date, days: number) => {
  const next = new Date(date);
  next.setDate(date.getDate() + days);
  return next;
};

export const getMonday = (date: Date) => {
  const dayOfWeek = date.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  return addDays(date, mondayOffset);
};

export const getWeekStartForMonthWeek = (month: number, week: number, year = new Date().getFullYear()) => {
  const firstDay = new Date(year, month - 1, 1);
  return addDays(getMonday(firstDay), (week - 1) * 7);
};

export const getWeekStartDateFromTitle = (title: string, year = new Date().getFullYear()) => {
  const match = title.match(/(\d+)\s*월\s*(\d+)\s*주/);
  if (!match) return null;

  const targetMonth = parseInt(match[1]);
  const targetWeek = parseInt(match[2]);
  return getWeekStartForMonthWeek(targetMonth, targetWeek, year);
};

export const getWeekStartFromTitle = (title: string, year = new Date().getFullYear()) => {
  const weekStart = getWeekStartDateFromTitle(title, year);
  return weekStart ? formatDate(weekStart) : null;
};

export const getWeekDatesFromWeekStart = (weekStart: string | Date) => {
  const start = typeof weekStart === 'string' ? parseLocalDate(weekStart) : new Date(weekStart);
  return DAYS.map((_, i) => addDays(start, i));
};

export const getWeekMetaFromStart = (weekStart: string | Date) => {
  const monday = typeof weekStart === 'string' ? parseLocalDate(weekStart) : new Date(weekStart);
  const sunday = addDays(monday, 6);
  const targetDate = monday.getMonth() === sunday.getMonth() ? monday : sunday;
  const month = targetDate.getMonth() + 1;
  const firstMonday = getMonday(new Date(targetDate.getFullYear(), targetDate.getMonth(), 1));
  const diffDays = Math.round((monday.getTime() - firstMonday.getTime()) / (1000 * 60 * 60 * 24));
  return { month, week: Math.round(diffDays / 7) + 1 };
};

export const getWeekRangeLabel = (weekStart: string | Date) => {
  const dates = getWeekDatesFromWeekStart(weekStart);
  const first = dates[0];
  const last = dates[6];
  return `${first.getMonth() + 1}/${first.getDate()}~${last.getMonth() + 1}/${last.getDate()}`;
};

export const getWeekDatesFromTitle = (title: string) => {
  const now = new Date();
  const weekStart = getWeekStartDateFromTitle(title, now.getFullYear());

  if (!weekStart) {
    // fallback: 현재 주 기준
    return getWeekDatesFromWeekStart(getMonday(now));
  }

  return getWeekDatesFromWeekStart(weekStart);
};
