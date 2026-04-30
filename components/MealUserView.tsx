"use client";

import React, { useState, useRef, useEffect } from 'react';
import { dummyFoodItems, dummyWeeklyMenus, dummySettings, dummyTodayLunch } from '@/lib/dummyData';
import { DayOfWeek, MealTime } from '@/lib/types';
import { DAYS, getWeekDatesFromTitle } from '@/lib/dateUtils';
import { BellRing, ChevronLeft, ChevronRight, Camera, Download, Settings, CalendarDays, List } from 'lucide-react';
import { toPng } from 'html-to-image';
import jsPDF from 'jspdf';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';


const TIMES: MealTime[] = ['아침', '점심', '저녁'];

export default function MealUserView() {
  const [hasNotification, setHasNotification] = useState(true);
  
  const [menus, setMenus] = useState(dummyWeeklyMenus);
  const [settings, setSettings] = useState(dummySettings);
  const [todayLunch, setTodayLunch] = useState(dummyTodayLunch);
  const [foodDb, setFoodDb] = useState(dummyFoodItems);
  const [isLoaded, setIsLoaded] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [currentHistoryIndex, setCurrentHistoryIndex] = useState(-1);
  const [mobileView, setMobileView] = useState<'daily' | 'weekly'>('daily');
  const [selectedDayIndex, setSelectedDayIndex] = useState(0);
  
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
        const sorted = [...historyData].sort((a: any, b: any) => {
          const parse = (title: string) => {
            const match = title.match(/(\d+)\s*월\s*(\d+)\s*주/);
            if (!match) return { month: 99, week: 99 };
            return { month: parseInt(match[1]), week: parseInt(match[2]) };
          };
          const pa = parse(a.week_title || '');
          const pb = parse(b.week_title || '');
          if (pa.month !== pb.month) return pa.month - pb.month;
          return pa.week - pb.week;
        });
        
        const historyEntries = sorted.map(h => ({
          id: h.id,
          weekTitle: h.week_title,
          menus: h.menus,
          settings: h.settings,
          todayLunch: h.today_lunch
        }));
        
        setHistory(historyEntries);

        // 오늘 날짜가 포함된 주차 찾기
        const today = new Date();
        const todayIdx = historyEntries.findIndex((h: any) => {
          const dates = getWeekDatesFromTitle(h.weekTitle);
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
          const idx = historyEntries.findIndex((h: any) => h.weekTitle === stateData.settings.weekTitle);
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
      const filter = (node: HTMLElement) => {
        const exclusionClasses = ['ignore-pdf'];
        return !exclusionClasses.some(cls => node.classList?.contains(cls));
      };

      const imgData = await toPng(pdfRef.current, { 
        cacheBust: true, 
        pixelRatio: 2,
        filter: filter as any
      });
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (pdfRef.current.offsetHeight * pdfWidth) / pdfRef.current.offsetWidth;
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save('주간식단표_사용자용.pdf');
    } catch (error) {
      console.error("PDF 생성 실패", error);
      alert("PDF 생성 중 오류가 발생했습니다.");
    }
  };



  const weekDates = getWeekDatesFromTitle(settings.weekTitle || '');
  const today = new Date();
  const todayDayIndex = DAYS.findIndex((_, i) => {
    const d = weekDates[i];
    return d.getDate() === today.getDate() && d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
  });
  const todayDayName = todayDayIndex >= 0 ? DAYS[todayDayIndex] : null;

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

  // 모바일: 오늘 요일로 자동 선택
  useEffect(() => {
    if (todayDayIndex >= 0) {
      setSelectedDayIndex(todayDayIndex);
    }
  }, [todayDayIndex]);
  
  if (!isLoaded) return <div className="min-h-screen bg-gray-50 flex items-center justify-center">로딩중...</div>;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      
      {/* Header */}
      <header className="w-full bg-white shadow-sm p-4 sticky top-0 z-10 flex justify-between items-center max-w-4xl mx-auto">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-gray-800">연세척 식단안내</h1>
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

      <div className="flex-1 w-full flex justify-center p-4 md:p-8 bg-gray-50">
        <main className="w-full max-w-4xl bg-white rounded-2xl shadow-sm border border-gray-200 p-4 md:p-6 flex flex-col gap-6 h-fit">
          
          {/* 주간 식단표 Section */}
          <section className="bg-transparent">
            <div className="text-center mb-4 md:mb-6">
              <h1 className="text-xl md:text-3xl font-black drop-shadow-sm mb-2 md:mb-3" style={{ color: settings.titleColor || '#f97316' }}>연세척 주간 식단표</h1>
              <div className="flex justify-center items-center gap-3 md:gap-4 mb-2">
                <button 
                  onClick={() => loadHistoryEntry(currentHistoryIndex - 1)}
                  className={`p-1 rounded-full transition-colors ${currentHistoryIndex > 0 ? 'hover:bg-black/10 text-gray-500 hover:text-gray-800' : 'text-gray-300 cursor-not-allowed'}`}
                  disabled={currentHistoryIndex <= 0}
                >
                  <ChevronLeft size={20} />
                </button>
                <h2 className="text-sm md:text-lg font-bold text-center text-gray-800 border-b border-gray-400 pb-1 px-2 md:px-4">
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
                const isSelected = i === selectedDayIndex;
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
                    <span className={`text-[9px] ${isSelected ? 'text-orange-100' : 'text-gray-400'}`}>{month}/{dateNum}</span>
                  </button>
                );
              })}
            </div>

            {/* 선택된 날의 식단 카드 */}
            <div className="flex flex-col gap-3">
              {TIMES.map(time => {
                const day = DAYS[selectedDayIndex];
                const menuEntry = menus.find(m => m.day === day && m.time === time);
                const foods = menuEntry ? menuEntry.foodIds.map(id => foodDb.find(f => f.id === id)!).filter(Boolean) : [];
                return (
                  <div key={time} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
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
                              <span className="text-sm font-semibold text-gray-800">{food.name}</span>
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
              <div className="min-w-[600px]">
                <table className="w-full border-collapse border border-gray-200 text-sm">
                  <thead>
                    <tr>
                      <th className="border border-gray-200 p-2 w-14 bg-orange-50 text-orange-800 text-xs"></th>
                      {DAYS.map((day, i) => {
                        const isToday = day === todayDayName;
                        const dateNum = weekDates[i]?.getDate();
                        const month = weekDates[i] ? weekDates[i].getMonth() + 1 : '';
                        return (
                          <th key={day} className={`border p-1.5 text-center font-semibold text-xs ${isToday ? 'bg-orange-500 text-white border-orange-500' : 'bg-orange-50 text-orange-800 border-gray-200'}`}>
                            <div>{day}</div>
                            <div className={`text-[9px] font-normal ${isToday ? 'text-orange-100' : 'text-orange-400'}`}>{month}/{dateNum}</div>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {TIMES.map(time => (
                      <tr key={time}>
                        <td className="border border-gray-200 p-1.5 text-center font-semibold bg-gray-50 text-gray-700 text-xs">{time}</td>
                        {DAYS.map(day => {
                          const menuEntry = menus.find(m => m.day === day && m.time === time);
                          const foods = menuEntry ? menuEntry.foodIds.map(id => foodDb.find(f => f.id === id)!).filter(Boolean) : [];
                          return (
                            <td key={`${day}-${time}`} className="border border-gray-200 p-1 text-center align-top h-[120px]">
                              <div className="min-h-[120px] flex flex-col gap-1 items-center justify-start">
                                {foods.length > 0 ? foods.map(food => (
                                  <div key={food.id} className="flex flex-col">
                                    <span className="text-[10px] font-bold text-gray-800 break-keep leading-tight">{food.name}</span>
                                    {food.origin && <span className="text-[8px] text-gray-500">({food.origin})</span>}
                                  </div>
                                )) : <span className="text-gray-300 mt-8">-</span>}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* ===== 데스크탑 주간 테이블 ===== */}
          <div className="hidden md:block overflow-x-auto pb-4">
            <div className="min-w-full">
              <table className="w-full border-collapse border border-gray-200 text-sm">
                <thead>
                  <tr>
                    <th className="border border-gray-200 p-2 w-16 bg-orange-50 text-orange-800"></th>
                    {DAYS.map((day, i) => {
                      const isToday = day === todayDayName;
                      const dateNum = weekDates[i]?.getDate();
                      const month = weekDates[i] ? weekDates[i].getMonth() + 1 : '';
                      return (
                        <th key={day} className={`border p-2 text-center font-semibold w-[12%] ${isToday ? 'bg-orange-500 text-white border-orange-500 border-2' : 'bg-orange-50 text-orange-800 border-gray-200'}`}>
                          <div>{day}</div>
                          <div className={`text-[10px] font-normal ${isToday ? 'text-orange-100' : 'text-orange-400'}`}>{month}/{dateNum}</div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {TIMES.map(time => (
                    <tr key={time}>
                      <td className="border border-gray-200 p-2 text-center font-semibold bg-gray-50 text-gray-700">{time}</td>
                      {DAYS.map(day => {
                        const menuEntry = menus.find(m => m.day === day && m.time === time);
                        const foods = menuEntry ? menuEntry.foodIds.map(id => foodDb.find(f => f.id === id)!).filter(Boolean) : [];
                        return (
                          <td key={`${day}-${time}`} className="border border-gray-200 p-0 text-center align-top h-[160px] w-[13%]">
                            <div className="min-h-[160px] h-full p-2 flex flex-col gap-2 items-center justify-start">
                              {foods.length > 0 ? (
                                <div className="flex flex-col gap-2 w-full h-full justify-start mt-1">
                                  {foods.map(food => (
                                    <div key={food.id} className="flex flex-col gap-0.5">
                                      <span className="text-[11px] font-bold text-gray-800 break-keep leading-tight">{food.name}</span>
                                      {food.origin && <span className="text-[9px] text-gray-500 leading-tight">({food.origin})</span>}
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
                  ))}
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
              <div className="relative aspect-[4/3] w-full bg-gray-100">
                {todayLunch.imageUrl ? (
                  <img 
                    src={todayLunch.imageUrl} 
                    alt="오늘의 점심" 
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-2">
                    <Camera size={40} className="text-gray-300" />
                    <p className="text-sm">사진이 아직 올라오지 않았습니다.</p>
                  </div>
                )}
                {todayLunch.imageUrl && (
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-4">
                    <p className="text-white font-medium">{new Date().getMonth() + 1}월 {new Date().getDate()}일 맛있는 점심 드세요! 🍚</p>
                  </div>
                )}
              </div>
            </section>

            {/* 원산지 정보 - 모바일에서 아래로 */}
            <div className="mt-2 md:mt-4 p-3 md:p-4 bg-white/60 rounded-xl text-xs text-gray-600 whitespace-pre-wrap border border-gray-200 order-2 md:order-1">
              {settings.originText}
            </div>
          </div>
        </section>
        </main>
      </div>

      {/* Hidden A4 Canvas for PDF Download */}
      <div className="absolute left-[-9999px] top-0 pointer-events-none">
        <div 
          ref={pdfRef}
          className="bg-white shadow-lg relative p-6"
          style={{ 
            width: '210mm', 
            minHeight: '297mm',
            backgroundColor: settings.backgroundColor,
            backgroundImage: settings.backgroundImageUrl ? `url(${settings.backgroundImageUrl})` : 'none',
            backgroundSize: 'cover',
            backgroundPosition: 'center'
          }}
        >
          <div className="w-full h-full min-h-[270mm] bg-white/85 backdrop-blur-md rounded-2xl p-8 shadow-sm border border-white/50 flex flex-col">
            <div className="text-center mb-6">
              <h2 className="text-3xl font-black drop-shadow-md mb-2" style={{ color: settings.titleColor || '#f97316' }}>연세척 주간 식단표</h2>
              <h3 className="text-xl font-bold text-gray-800 border-b border-gray-400 pb-1 px-4 inline-block">{settings.weekTitle || '이번 주 식단'}</h3>
            </div>

            <table className="w-full border-collapse border-2 border-gray-800 bg-white bg-opacity-90">
              <thead>
                <tr>
                  <th className="border border-gray-400 p-2 w-12 text-center bg-gray-100"></th>
                  {DAYS.map(day => (
                    <th key={day} className="border border-gray-400 p-2 text-center bg-gray-50 font-bold">
                      {day}요일
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {TIMES.map(time => (
                  <tr key={time}>
                    <td className="border border-gray-400 p-2 text-center font-bold bg-gray-50 align-middle">
                      {time}
                    </td>
                    {DAYS.map(day => {
                      const menuEntry = menus.find(m => m.day === day && m.time === time);
                      const foods = menuEntry ? menuEntry.foodIds.map(id => foodDb.find(f => f.id === id)!).filter(Boolean) : [];
                      
                      return (
                        <td key={`${day}-${time}`} className="border border-gray-400 p-0 align-top relative h-[160px] w-[13%]">
                          <div className="min-h-[160px] h-full p-2 flex flex-col gap-2 items-center justify-start">
                            {foods.map(food => (
                              <div key={food.id} className="text-[11px] text-center relative w-full flex flex-col gap-0.5">
                                <div className="font-bold text-gray-800 leading-tight break-keep">{food.name}</div>
                                {food.origin && <div className="text-[9px] text-gray-500 leading-tight">({food.origin})</div>}
                              </div>
                            ))}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="mt-6 bg-white bg-opacity-90 p-4 rounded border border-gray-200 flex-1">
              <div className="w-full h-full min-h-[200px] text-xs p-2 whitespace-pre-wrap text-gray-800">
                {settings.originText}
              </div>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
