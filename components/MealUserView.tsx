"use client";

/* eslint-disable @next/next/no-img-element -- PDF capture and data URL images need plain img elements. */

import React, { useState, useRef, useEffect } from 'react';
import { dummyFoodItems, dummyWeeklyMenus, dummySettings, dummyTodayLunch } from '@/lib/dummyData';
import { DayOfWeek, FoodItem, HistoryEntry, MealEntry, MealTime, Settings as MealSettings, TodayLunch } from '@/lib/types';
import { formatDate, getWeekDatesFromTitle, getWeekDatesFromWeekStart, getWeekStartFromTitle, DAYS } from '@/lib/dateUtils';
import { BellRing, ChevronLeft, ChevronRight, Camera, Download, Settings, CalendarDays, List, ChevronDown } from 'lucide-react';
import { toPng } from 'html-to-image';
import jsPDF from 'jspdf';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';


const TIMES: MealTime[] = ['아침', '점심', '저녁'];
const MENU_NAME_WRAP_SIZE = 8;
const MENU_SLOT_COUNT = 6;

const splitMenuLine = (line: string) => {
  const chars = Array.from(line);
  if (chars.length <= MENU_NAME_WRAP_SIZE) return [line];

  const chunkCount = Math.ceil(chars.length / MENU_NAME_WRAP_SIZE);
  const baseSize = Math.floor(chars.length / chunkCount);
  const extraCount = chars.length % chunkCount;
  const chunks: string[] = [];
  let cursor = 0;

  for (let i = 0; i < chunkCount; i += 1) {
    const size = baseSize + (i < extraCount ? 1 : 0);
    chunks.push(chars.slice(cursor, cursor + size).join(''));
    cursor += size;
  }

  return chunks;
};

const renderMenuName = (name: string) => {
  const lines = name.split(/\r?\n/);
  const chunks = lines.flatMap((line) => splitMenuLine(line));

  return chunks.flatMap((chunk, idx) => {
    if (idx === chunks.length - 1) return chunk;
    return [chunk, <br key={`menu-name-line-${idx}`} />];
  });
};

const getFoodsForMeal = (
  menus: MealEntry[],
  foodDb: FoodItem[],
  day: DayOfWeek,
  time: MealTime
) => {
  const menuEntry = menus.find(m => m.day === day && m.time === time);
  return menuEntry
    ? menuEntry.foodIds
        .map(id => foodDb.find(f => f.id === id))
        .filter((food): food is FoodItem => Boolean(food))
    : [];
};

const getMenuNameLineCount = (name: string) => (
  name.split(/\r?\n/).reduce((total, line) => total + splitMenuLine(line).length, 0)
);

const getMenuSlotWeight = (food?: FoodItem) => {
  if (!food) return 1;
  return Math.max(2, getMenuNameLineCount(food.name) + 1);
};

const getMealGridStyle = (
  menus: MealEntry[],
  foodDb: FoodItem[],
  time: MealTime
): React.CSSProperties => {
  const foodsByDay = DAYS.map(day => getFoodsForMeal(menus, foodDb, day, time));
  const slotCount = Math.max(MENU_SLOT_COUNT, ...foodsByDay.map(foods => foods.length));
  const rowWeights = Array.from({ length: slotCount }, (_, idx) => (
    Math.max(1, ...foodsByDay.map(foods => getMenuSlotWeight(foods[idx])))
  ));

  return {
    gridTemplateRows: rowWeights.map(weight => `minmax(0, ${weight}fr)`).join(' '),
  };
};

type MealHistoryRow = {
  id: number;
  week_title: string | null;
  menus: MealEntry[];
  settings: MealSettings;
  today_lunch: TodayLunch | null;
};

const parseWeekTitle = (title: string | null | undefined) => {
  const match = (title || '').match(/(\d+)\s*월\s*(\d+)\s*주/);
  if (!match) return { month: 0, week: 0 };
  return { month: parseInt(match[1]), week: parseInt(match[2]) };
};

const sortMealHistoryAsc = (a: MealHistoryRow, b: MealHistoryRow) => {
  const pa = parseWeekTitle(a.week_title);
  const pb = parseWeekTitle(b.week_title);
  if (pa.month !== pb.month) return pa.month - pb.month;
  return pa.week - pb.week;
};

const toHistoryEntry = (row: MealHistoryRow): HistoryEntry => ({
  id: row.id,
  weekTitle: row.week_title || '',
  menus: row.menus,
  settings: {
    ...row.settings,
    weekStart: row.settings.weekStart || getWeekStartFromTitle(row.week_title || '') || formatDate(getWeekDatesFromTitle(row.week_title || '')[0])
  },
  todayLunch: row.today_lunch || undefined
});

const getHistoryWeekDates = (entry: HistoryEntry) => (
  entry.settings.weekStart
    ? getWeekDatesFromWeekStart(entry.settings.weekStart)
    : getWeekDatesFromTitle(entry.weekTitle)
);

const applyHistoryOrder = (entries: HistoryEntry[], order?: number[]) => {
  if (!Array.isArray(order)) return entries;

  return [...entries].sort((a, b) => {
    const idxA = order.indexOf(a.id);
    const idxB = order.indexOf(b.id);
    if (idxA === -1 && idxB === -1) return 0;
    if (idxA === -1) return 1;
    if (idxB === -1) return -1;
    return idxA - idxB;
  });
};

export default function MealUserView() {
  const [hasNotification, setHasNotification] = useState(true);
  
  const [menus, setMenus] = useState(dummyWeeklyMenus);
  const [settings, setSettings] = useState(dummySettings);
  const [todayLunch, setTodayLunch] = useState(dummyTodayLunch);
  const [foodDb, setFoodDb] = useState(dummyFoodItems);
  const [isLoaded, setIsLoaded] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [currentHistoryIndex, setCurrentHistoryIndex] = useState(-1);
  const [mobileView, setMobileView] = useState<'daily' | 'weekly'>('daily');
  const [selectedDayIndex, setSelectedDayIndex] = useState<number | null>(null);
  const [showOrigin, setShowOrigin] = useState(false);
  
  useEffect(() => {
    const fetchData = async () => {
      // 1. Food DB 로드
      const { data: foodData } = await supabase
        .from('food_items')
        .select('*')
        .order('name', { ascending: true });
      if (foodData) setFoodDb(foodData);

      // 2. 현재 상태 로드
      const { data: stateData } = await supabase
        .from('current_meal_state')
        .select('*')
        .eq('id', 1)
        .single();
      
      if (stateData) {
        setMenus(stateData.menus);
        setSettings(stateData.settings);
        setTodayLunch(stateData.today_lunch);
      }

      // 3. 히스토리 로드
      const { data: historyData } = await supabase.from('meal_history').select('*');
      if (historyData) {
        const sorted = (historyData as MealHistoryRow[]).slice().sort(sortMealHistoryAsc);
        
        let historyEntries = sorted.map(toHistoryEntry);
        
        // Apply manual order if exists in current state
        historyEntries = applyHistoryOrder(historyEntries, stateData?.settings?.historyOrder);
        
        setHistory(historyEntries);

        // 오늘 날짜가 포함된 주차 찾기
        const today = new Date();
        const todayIdx = historyEntries.findIndex((h) => {
          const dates = getHistoryWeekDates(h);
          return dates.some(d => 
            d.getDate() === today.getDate() && 
            d.getMonth() === today.getMonth() && 
            d.getFullYear() === today.getFullYear()
          );
        });

        if (todayIdx >= 0) {
          // 오늘 날짜 주차가 히스토리에 있으면 해당 데이터로 설정
          const entry = historyEntries[todayIdx];
          setCurrentHistoryIndex(todayIdx);
          setMenus(entry.menus);
          setSettings(entry.settings);
          if (entry.todayLunch) setTodayLunch(entry.todayLunch);
        } else if (stateData) {
          // 없으면 기존처럼 current_meal_state 사용
          const idx = historyEntries.findIndex((h) => h.weekTitle === stateData.settings.weekTitle);
          setCurrentHistoryIndex(idx >= 0 ? idx : historyEntries.length - 1);
          setMenus(stateData.menus);
          setSettings(stateData.settings);
          setTodayLunch(stateData.today_lunch);
        }
      }
      
      setIsLoaded(true);
    };

    fetchData();
  }, []);

  const loadHistoryEntry = (index: number) => {
    if (index < 0 || index >= history.length) return;
    const entry = history[index];
    setMenus(entry.menus);
    setSettings(entry.settings);
    if (entry.todayLunch) setTodayLunch(entry.todayLunch);
    setCurrentHistoryIndex(index);
  };

  const pdfRef = useRef<HTMLDivElement>(null);

  const handlePdfDownload = async () => {
    if (!pdfRef.current) return;
    try {
      const element = pdfRef.current;

      await new Promise(r => setTimeout(r, 100));

      const captureW = element.offsetWidth;
      const captureH = element.scrollHeight;

      const imgData = await toPng(element, {
        cacheBust: true,
        pixelRatio: 2,
        width: captureW,
        height: captureH,
      });

      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pdfW = pdf.internal.pageSize.getWidth();
      const pdfH = pdf.internal.pageSize.getHeight();

      const imgHeightMM = pdfW * (captureH / captureW);

      if (imgHeightMM <= pdfH) {
        pdf.addImage(imgData, 'PNG', 0, 0, pdfW, imgHeightMM);
      } else {
        const scaledW = pdfH * (captureW / captureH);
        pdf.addImage(imgData, 'PNG', (pdfW - scaledW) / 2, 0, scaledW, pdfH);
      }

      pdf.save(`${settings.weekTitle || '주간식단표'}.pdf`);
    } catch (error) {
      console.error("PDF 생성 실패", error);
      alert("PDF 생성 중 오류가 발생했습니다.");
    }
  };



  const weekDates = settings.weekStart
    ? getWeekDatesFromWeekStart(settings.weekStart)
    : getWeekDatesFromTitle(settings.weekTitle || '');
  const today = new Date();
  const todayDayIndex = DAYS.findIndex((_, i) => {
    const d = weekDates[i];
    return d.getDate() === today.getDate() && d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
  });
  const todayDayName = todayDayIndex >= 0 ? DAYS[todayDayIndex] : null;
  const activeSelectedDayIndex = selectedDayIndex ?? (todayDayIndex >= 0 ? todayDayIndex : 0);
  
  const getTodayDateString = () => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const isLunchForToday = !!(todayLunch && todayLunch.imageUrl && todayLunch.date === getTodayDateString());

  // 모바일: 선택된 날의 라벨 (오늘/내일/모레/요일)
  const getDayLabel = (idx: number) => {
    if (todayDayIndex < 0) return `${DAYS[idx]}요일`;
    const diff = idx - todayDayIndex;
    if (diff === 0) return '오늘';
    if (diff === 1) return '내일';
    if (diff === 2) return '모레';
    if (diff === -1) return '어제';
    return `${DAYS[idx]}요일`;
  };

  const MEAL_ICONS: Record<string, string> = { '아침': '☀️', '점심': '🍱', '저녁': '🌙' };

  if (!isLoaded) return <div className="min-h-screen bg-gray-50 flex items-center justify-center">로딩중...</div>;

  const pageBackgroundStyle = {
    backgroundColor: settings.backgroundColor,
    backgroundImage: settings.backgroundImageUrl ? `url(${settings.backgroundImageUrl})` : 'none',
    backgroundSize: 'cover',
    backgroundPosition: 'center',
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      
      {/* Header */}
      <header className="w-full bg-white shadow-sm p-4 sticky top-0 z-10 flex justify-between items-center max-w-6xl mx-auto">
        <div className="flex items-center gap-2">
          <img src="/images/yslogo.png" alt="연세척병원 로고" className="h-8 md:h-10 w-auto object-contain" />
          <h1 className="text-lg md:text-xl font-bold text-gray-800 hidden sm:block">식단안내</h1>
          <Link href="/admin/meals" className="p-2 text-gray-400 hover:text-gray-600 transition-colors" title="관리자 페이지">
            <Settings size={20} />
          </Link>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={handlePdfDownload}
            className="p-2 rounded-full hover:bg-gray-100 transition-colors flex items-center gap-1 text-gray-600 text-sm font-medium"
            title="식단표 PDF 다운로드"
          >
            <Download size={20} />
            <span className="hidden sm:inline">다운로드</span>
          </button>
          <button 
            onClick={() => setHasNotification(false)}
            className="relative p-2 rounded-full hover:bg-gray-100 transition-colors"
          >
            <BellRing size={24} className="text-gray-600" />
            {hasNotification && (
              <span className="absolute top-1 right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-white"></span>
            )}
          </button>
        </div>
      </header>

      <div className="flex-1 w-full flex justify-center px-3 py-4 sm:px-6 md:py-8" style={pageBackgroundStyle}>
        <main className="w-full max-w-6xl bg-white/95 backdrop-blur-sm rounded-[28px] shadow-xl border border-white/70 p-4 sm:p-6 md:p-8 flex flex-col gap-7 h-fit">
          
          {/* 주간 식단표 Section */}
          <section className="bg-transparent">
            <div className="text-center mb-5 md:mb-8">
              <h1 className="text-2xl md:text-4xl font-black drop-shadow-sm mb-2 md:mb-4" style={{ color: settings.titleColor || '#f97316' }}>연세척 주간 식단표</h1>
              <div className="flex justify-center items-center gap-3 md:gap-4 mb-2">
                <button 
                  onClick={() => loadHistoryEntry(currentHistoryIndex - 1)}
                  className={`p-1 rounded-full transition-colors ${currentHistoryIndex > 0 ? 'hover:bg-black/10 text-gray-500 hover:text-gray-800' : 'text-gray-300 cursor-not-allowed'}`}
                  disabled={currentHistoryIndex <= 0}
                >
                  <ChevronLeft size={20} />
                </button>
                <h2 className="text-base md:text-xl font-bold text-center text-gray-800 border-b-2 border-gray-400 pb-1 px-3 md:px-6">
                  {settings.weekTitle || '이번 주 식단'}
                </h2>
                <button 
                  onClick={() => loadHistoryEntry(currentHistoryIndex + 1)}
                  className={`p-1 rounded-full transition-colors ${currentHistoryIndex < history.length - 1 ? 'hover:bg-black/10 text-gray-500 hover:text-gray-800' : 'text-gray-300 cursor-not-allowed'}`}
                  disabled={currentHistoryIndex >= history.length - 1}
                >
                  <ChevronRight size={20} />
                </button>
              </div>
              {/* 모바일 뷰 토글 */}
              <div className="md:hidden flex justify-center mt-2">
                <div className="inline-flex bg-gray-100 rounded-lg p-0.5">
                  <button
                    onClick={() => setMobileView('daily')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${mobileView === 'daily' ? 'bg-white text-orange-600 shadow-sm' : 'text-gray-500'}`}
                  >
                    <List size={14} /> 일별 보기
                  </button>
                  <button
                    onClick={() => setMobileView('weekly')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${mobileView === 'weekly' ? 'bg-white text-orange-600 shadow-sm' : 'text-gray-500'}`}
                  >
                    <CalendarDays size={14} /> 일주일 보기
                  </button>
                </div>
              </div>
            </div>

          {/* ===== 모바일 일별 보기 ===== */}
          <div className={`md:hidden ${mobileView === 'daily' ? 'block' : 'hidden'}`}>
            {/* 요일 탭 */}
            <div className="flex gap-1 overflow-x-auto pb-2 mb-3 scrollbar-hide">
              {DAYS.map((day, i) => {
                const isToday = i === todayDayIndex;
                const isSelected = i === activeSelectedDayIndex;
                const dateNum = weekDates[i]?.getDate();
                const month = weekDates[i] ? weekDates[i].getMonth() + 1 : '';
                return (
                  <button
                    key={day}
                    onClick={() => setSelectedDayIndex(i)}
                    className={`flex-shrink-0 flex flex-col items-center px-3 py-2 rounded-xl text-xs font-semibold transition-all min-w-[52px] ${
                      isSelected
                        ? 'bg-orange-500 text-white shadow-md scale-105'
                        : isToday
                          ? 'bg-orange-100 text-orange-700 border border-orange-300'
                          : 'bg-gray-50 text-gray-600 border border-gray-200'
                    }`}
                  >
                    <span className="text-[10px] font-normal">{getDayLabel(i)}</span>
                    <span className="text-sm font-bold">{day}</span>
                    <span className={`text-[11px] font-semibold ${isSelected ? 'text-orange-100' : 'text-gray-400'}`}>{month}/{dateNum}</span>
                  </button>
                );
              })}
            </div>

            {/* 선택된 날의 식단 카드 */}
            <div className="flex flex-col gap-3">
              {TIMES.map(time => {
                const day = DAYS[activeSelectedDayIndex];
                const menuEntry = menus.find(m => m.day === day && m.time === time);
                const foods = menuEntry ? menuEntry.foodIds.map(id => foodDb.find(f => f.id === id)!).filter(Boolean) : [];
                return (
                  <div key={time} className={`bg-white rounded-xl overflow-hidden ${
                    time === '점심'
                      ? 'border border-orange-200 shadow-md shadow-orange-100'
                      : 'border border-gray-200 shadow-sm'
                  }`}>
                    <div className={`px-4 py-2 flex items-center gap-2 font-bold text-sm ${
                      time === '아침' ? 'bg-amber-50 text-amber-700' :
                      time === '점심' ? 'bg-orange-50 text-orange-700' :
                      'bg-indigo-50 text-indigo-700'
                    }`}>
                      <span>{MEAL_ICONS[time]}</span>
                      <span>{time}</span>
                    </div>
                    <div className="px-4 py-3">
                      {foods.length > 0 ? (
                        <div className="flex flex-col gap-1.5">
                          {foods.map(food => (
                            <div key={food.id} className="flex items-baseline gap-1">
                              <span className="text-sm font-semibold text-gray-800">{renderMenuName(food.name)}</span>
                              {food.origin && <span className="text-[10px] text-gray-400">({food.origin})</span>}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-gray-300 text-center py-2">등록된 식단이 없습니다</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ===== 모바일 일주일 보기 ===== */}
          <div className={`md:hidden ${mobileView === 'weekly' ? 'block' : 'hidden'}`}>
            <div className="overflow-x-auto pb-4">
              <div className="min-w-[820px]">
                <table className="w-full border-collapse border-2 border-slate-700 bg-white text-sm">
                  <thead>
                    <tr>
                      <th className="border border-slate-300 p-2 w-12 bg-orange-50 text-orange-900 text-sm"></th>
                      {DAYS.map((day, i) => {
                        const isToday = day === todayDayName;
                        const dateNum = weekDates[i]?.getDate();
                        const month = weekDates[i] ? weekDates[i].getMonth() + 1 : '';
                        return (
                          <th key={day} className={`border p-2 text-center font-bold text-sm ${isToday ? 'bg-orange-500 text-white border-orange-500' : 'bg-orange-50 text-orange-900 border-slate-300'}`}>
                            <div>{day}</div>
                            <div className={`text-xs font-semibold ${isToday ? 'text-orange-100' : 'text-orange-500'}`}>{month}/{dateNum}</div>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {TIMES.map(time => {
                      const mealGridStyle = getMealGridStyle(menus, foodDb, time);
                      return (
                      <tr key={time}>
                        <td className="border border-slate-300 p-2 text-center font-bold bg-slate-50 text-slate-800 text-sm">{time}</td>
                        {DAYS.map(day => {
                          const foods = getFoodsForMeal(menus, foodDb, day, time);
                          return (
                            <td key={`${day}-${time}`} className="border border-slate-300 p-1.5 text-center align-top h-[145px]">
                              <div className="grid min-h-[145px] items-stretch" style={mealGridStyle}>
                                {foods.length > 0 ? foods.map(food => (
                                  <div key={food.id} className="grid h-full min-h-0 grid-rows-[auto_11px] content-start justify-items-center px-0.5 pt-0.5">
                                    <span className="inline-block max-w-none text-center text-xs font-bold leading-snug text-slate-900" style={{ wordBreak: 'keep-all', overflowWrap: 'normal' }}>{renderMenuName(food.name)}</span>
                                    <span className={`h-[11px] whitespace-nowrap text-[9px] leading-none text-slate-500 ${food.origin ? '' : 'invisible'}`}>
                                      {food.origin ? `(${food.origin})` : '-'}
                                    </span>
                                  </div>
                                )) : <span className="row-span-full flex items-center justify-center text-gray-300">-</span>}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* ===== 데스크탑 주간 테이블 ===== */}
          <div className="hidden md:block overflow-x-auto pb-4">
            <div className="min-w-[1120px]">
              <table className="w-full border-collapse border-2 border-slate-800 bg-white/95 text-base shadow-sm">
                <thead>
                  <tr>
                    <th className="border border-slate-300 p-2 w-14 bg-orange-50 text-orange-900"></th>
                    {DAYS.map((day, i) => {
                      const isToday = day === todayDayName;
                      const dateNum = weekDates[i]?.getDate();
                      const month = weekDates[i] ? weekDates[i].getMonth() + 1 : '';
                      return (
                        <th key={day} className={`border p-3 text-center font-extrabold w-[12%] ${isToday ? 'bg-orange-500 text-white border-orange-500 border-2' : 'bg-orange-50 text-orange-900 border-slate-300'}`}>
                          <div>{day}</div>
                          <div className={`text-sm font-semibold mt-1 ${isToday ? 'text-orange-100' : 'text-orange-500'}`}>{month}/{dateNum}</div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {TIMES.map(time => {
                    const mealGridStyle = getMealGridStyle(menus, foodDb, time);
                    return (
                    <tr key={time}>
                      <td className="border border-slate-300 p-2 text-center font-extrabold bg-slate-50 text-slate-800">{time}</td>
                      {DAYS.map(day => {
                        const foods = getFoodsForMeal(menus, foodDb, day, time);
                        return (
                          <td key={`${day}-${time}`} className="border border-slate-300 p-0 text-center align-top h-[190px] w-[13%]">
                            <div className="min-h-[190px] h-full px-1.5 py-3">
                              {foods.length > 0 ? (
                                <div className="grid h-full w-full items-stretch" style={mealGridStyle}>
                                  {foods.map(food => (
                                    <div key={food.id} className="grid h-full min-h-0 w-full grid-rows-[auto_12px] content-start justify-items-center px-0 pt-0.5 text-center">
                                      <span className="inline-block max-w-none text-center text-[13px] font-extrabold leading-snug text-slate-900" style={{ wordBreak: 'keep-all', overflowWrap: 'normal' }}>{renderMenuName(food.name)}</span>
                                      <span className={`h-[12px] whitespace-nowrap text-[10px] leading-none text-slate-500 ${food.origin ? '' : 'invisible'}`}>
                                        {food.origin ? `(${food.origin})` : '-'}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="flex w-full h-full items-center justify-center">
                                  <span className="text-gray-300">-</span>
                                </div>
                              )}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex flex-col">
            {/* 오늘의 점심 Section - 모바일에서 먼저 표시 */}
            <section className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden mt-2 order-1 md:order-2">
              <div className="bg-orange-500 p-3 text-white font-bold flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Camera size={20} />
                  오늘의 점심
                </div>
                <span className="text-orange-100 text-sm font-normal">
                  {new Date().getFullYear()}년 {new Date().getMonth() + 1}월 {new Date().getDate()}일 ({['일','월','화','수','목','금','토'][new Date().getDay()]}요일)
                </span>
              </div>
              <div className="relative w-full bg-black" style={{ aspectRatio: '1000/1350' }}>
                <img
                  src={isLunchForToday ? todayLunch.imageUrl : '/images/main food.png'}
                  alt="오늘의 점심"
                  className="w-full h-full object-contain"
                />
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-4">
                  <p className="text-white font-medium">
                    {isLunchForToday ? (
                      `${new Date().getMonth() + 1}월 ${new Date().getDate()}일 맛있는 점심 드세요! 🍚`
                    ) : (
                      '맛있는 점심 드세요! 🍚'
                    )}
                  </p>
                </div>
              </div>
            </section>

            {/* 원산지 정보 - 접기/펼치기 */}
            <div className="mt-2 md:mt-4 border border-gray-200 rounded-xl overflow-hidden order-2 md:order-1">
              <button
                onClick={() => setShowOrigin(v => !v)}
                className="w-full flex items-center justify-between px-4 py-2.5 bg-white/60 text-xs font-semibold text-gray-500 hover:bg-gray-50 transition-colors"
              >
                <span>원산지 정보</span>
                <ChevronDown size={15} className={`transition-transform duration-200 ${showOrigin ? 'rotate-180' : ''}`} />
              </button>
              {showOrigin && (
                <div className="p-3 md:p-4 bg-white/60 text-xs text-gray-600 whitespace-pre-wrap border-t border-gray-200">
                  {settings.originText}
                </div>
              )}
            </div>
          </div>
        </section>
        </main>
      </div>

      {/* Hidden A4 Canvas for PDF Download */}
      <div className="absolute left-[-9999px] top-0 pointer-events-none">
        <div 
          ref={pdfRef}
          className="bg-white shadow-lg relative p-3"
          style={{ 
            width: '210mm', 
            minHeight: '297mm',
            backgroundColor: settings.backgroundColor,
            backgroundImage: settings.backgroundImageUrl ? `url(${settings.backgroundImageUrl})` : 'none',
            backgroundSize: 'cover',
            backgroundPosition: 'center'
          }}
        >
          <div className="w-full h-full min-h-[281mm] bg-white/95 backdrop-blur-md rounded-[24px] px-3 py-5 shadow-md border border-white/70 flex flex-col">
            <div className="flex flex-col items-center mb-5">
              <img src="/images/yslogo.png" alt="연세척병원 로고" className="h-12 mb-3 object-contain" />
              <h2 className="text-4xl font-black drop-shadow-md mb-2" style={{ color: settings.titleColor || '#f97316' }}>주간 식단표</h2>
              <h3 className="text-xl font-extrabold text-slate-800 border-b-2 border-slate-400 pb-1 px-6 inline-block">{settings.weekTitle || '이번 주 식단'}</h3>
            </div>

            <table className="w-full border-collapse border-2 border-slate-800 bg-white/95 text-[13px]" style={{ tableLayout: 'fixed' }}>
              <thead>
                <tr>
                  <th className="border border-slate-400 p-1 w-8 text-center bg-slate-100"></th>
                  {DAYS.map((day, i) => {
                    const date = weekDates[i];
                    return (
                      <th key={day} className="border border-slate-400 p-2.5 text-center bg-slate-50 font-extrabold text-slate-900">
                        <div>{day}요일</div>
                        {date && (
                          <div className="mt-1 text-sm font-bold text-slate-600">
                            {date.getMonth() + 1}/{date.getDate()}
                          </div>
                        )}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {TIMES.map(time => {
                  const mealGridStyle = getMealGridStyle(menus, foodDb, time);
                  return (
                  <tr key={time}>
                    <td className="border border-slate-400 p-1 text-center font-extrabold bg-slate-50 text-slate-800 align-middle">
                      {time}
                    </td>
                    {DAYS.map(day => {
                      const foods = getFoodsForMeal(menus, foodDb, day, time);

                      return (
                        <td key={`${day}-${time}`} className="border border-slate-400 p-0 align-top relative h-[190px]">
                          <div className="grid min-h-[190px] h-full items-stretch px-0.5 py-2" style={mealGridStyle}>
                            {foods.map(food => (
                              <div key={food.id} className="relative grid h-full min-h-0 w-full grid-rows-[auto_11px] content-start justify-items-center px-0 pt-0.5 text-center text-[12px]">
                                <div className="inline-block max-w-none text-center font-extrabold leading-snug text-slate-900" style={{ wordBreak: 'keep-all', overflowWrap: 'normal' }}>{renderMenuName(food.name)}</div>
                                <div className={`h-[11px] whitespace-nowrap text-[9px] leading-none text-slate-500 ${food.origin ? '' : 'invisible'}`}>
                                  {food.origin ? `(${food.origin})` : '-'}
                                </div>
                              </div>
                            ))}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                  );
                })}
              </tbody>
            </table>

            <div className="mt-5 bg-white/95 p-4 rounded-xl border border-slate-200 flex-1">
              <div className="w-full h-full min-h-[185px] text-[12px] leading-relaxed p-2 whitespace-pre-wrap text-slate-800">
                {settings.originText}
              </div>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
