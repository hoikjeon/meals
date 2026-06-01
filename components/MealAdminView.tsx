"use client";

import React, { useState, useRef, useEffect } from 'react';
import { DndContext, DragEndEvent, DragOverlay, useSensor, useSensors, PointerSensor, DragStartEvent, closestCenter, useDraggable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { DAYS, getWeekDatesFromTitle } from '@/lib/dateUtils';
import { dummyFoodItems, dummyWeeklyMenus, dummySettings, dummyTodayLunch } from '@/lib/dummyData';
import { FoodItem, MealEntry, DayOfWeek, MealTime, Category, HistoryEntry } from '@/lib/types';
import { DroppableCell } from './DroppableCell';
import { DraggableFoodItem } from './DraggableFoodItem';
import { ImagePlus, Download, BellRing, Save, ArrowLeft, Trash2, Plus, ChevronLeft, ChevronRight, Camera, Lock, Eye, EyeOff, List, History, Edit2 } from 'lucide-react';
import { toPng } from 'html-to-image';
import jsPDF from 'jspdf';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import ImageCropModal from './ImageCropModal';

const ADMIN_ID = 'ys';
const ADMIN_PW = 'ys1004!';


const TIMES: MealTime[] = ['아침', '점심', '저녁'];
const CATEGORIES = ['밥', '국', '반찬', '기타'] as const;
const CHOSUNGS = ['전체', 'ㄱ', 'ㄴ', 'ㄷ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅅ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];

const getChosungGroup = (char: string) => {
  const mapping = ['ㄱ', 'ㄱ', 'ㄴ', 'ㄷ', 'ㄷ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅂ', 'ㅅ', 'ㅅ', 'ㅇ', 'ㅈ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
  const code = char.charCodeAt(0) - 0xAC00;
  if (code > -1 && code < 11172) return mapping[Math.floor(code / 588)];
  return '';
};

const PRESET_BACKGROUNDS = [
  { id: 'bg1', name: '여름 1', url: '/images/summer1.jpg', color: '#fff' },
  { id: 'bg2', name: '여름 2', url: '/images/summer2.jpg', color: '#fff' },
  { id: 'bg3', name: '여름 3', url: '/images/summer3.jpg', color: '#fff' },
  { id: 'bg4', name: '여름 4', url: '/images/summer4.jpg', color: '#fff' },
];

const buildWeekTitle = (month: number, week: number) => `${month}월 ${week}주차 식단표`;

function getCurrentWeekOfMonth(): { month: number; week: number } {
  const today = new Date();
  
  // 오늘이 속한 주의 월요일 구하기
  const day = today.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(today);
  monday.setDate(today.getDate() + mondayOffset);
  
  // 오늘이 속한 주의 일요일 구하기
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  
  // 월요일과 일요일의 월이 다르면, 일요일 기준의 1주차가 됨
  if (monday.getMonth() !== sunday.getMonth()) {
    return {
      month: sunday.getMonth() + 1,
      week: 1
    };
  }
  
  // 월요일과 일요일의 월이 같으면, 해당 월의 1일 기준 계산
  const targetMonth = monday.getMonth() + 1;
  const firstDay = new Date(monday.getFullYear(), monday.getMonth(), 1);
  const firstDayOfWeek = firstDay.getDay();
  const offset = firstDayOfWeek === 0 ? -6 : 1 - firstDayOfWeek;
  const firstMonday = new Date(firstDay);
  firstMonday.setDate(firstDay.getDate() + offset);
  
  const diffTime = monday.getTime() - firstMonday.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
  const week = Math.round(diffDays / 7) + 1;
  
  return { month: targetMonth, week };
}

export default function MealAdminView() {
  // 로그인 상태
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loginId, setLoginId] = useState('');
  const [loginPw, setLoginPw] = useState('');
  const [loginError, setLoginError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // 기존 상태들 (훅 규칙 준수를 위해 early return 전에 선언)
  const [menus, setMenus] = useState<MealEntry[]>([]);
  const [settings, setSettings] = useState(dummySettings);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Category>('반찬');
  const [bgImageFile, setBgImageFile] = useState<string | null>(null);
  const [todayLunch, setTodayLunch] = useState(dummyTodayLunch);
  const [foodDb, setFoodDb] = useState<FoodItem[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isBgModalOpen, setIsBgModalOpen] = useState(false);
  const [isWeekModalOpen, setIsWeekModalOpen] = useState(false);
  const [isFoodModalOpen, setIsFoodModalOpen] = useState(false);
  const [editingFood, setEditingFood] = useState<FoodItem | null>(null);
  const { month: initMonth, week: initWeek } = getCurrentWeekOfMonth();
  const [selectedMonth, setSelectedMonth] = useState(initMonth);
  const [selectedWeek, setSelectedWeek] = useState(initWeek);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedChosung, setSelectedChosung] = useState('전체');
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [isLunchModalOpen, setIsLunchModalOpen] = useState(false);
  const [isMobileFoodPanelOpen, setIsMobileFoodPanelOpen] = useState(false);
  const [isKimchiModalOpen, setIsKimchiModalOpen] = useState(false);
  const [isHistoryManageModalOpen, setIsHistoryManageModalOpen] = useState(false);
  const [isAIModalOpen, setIsAIModalOpen] = useState(false);
  const [aiInputText, setAiInputText] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [pendingKimchiDrop, setPendingKimchiDrop] = useState<{foodId: string; day: DayOfWeek; time: MealTime} | null>(null);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [lastSavedData, setLastSavedData] = useState<string>('');
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);

  // AI 관련 상태
  const [aiStep, setAiStep] = useState<'input' | 'review'>('input');
  const [reviewFoods, setReviewFoods] = useState<{name: string, category: Category, origin?: string, checked: boolean}[]>([]);
  const [extractedMenuData, setExtractedMenuData] = useState<{day: DayOfWeek, time: MealTime, foods: string[]}[]>([]);
  const [aiImagePreview, setAiImagePreview] = useState<string | null>(null);

  const canvasRef = useRef<HTMLDivElement>(null);
  const handleSaveRef = useRef<((options?: boolean | React.MouseEvent) => Promise<void>) | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    })
  );

  useEffect(() => {
    const auth = sessionStorage.getItem('mealAdminAuth');
    if (auth === 'true') setIsAuthenticated(true);
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      // 1. Food DB 로드
      const { data: foodData, error: foodError } = await supabase
        .from('food_items')
        .select('*')
        .order('name', { ascending: true });
      if (foodData) setFoodDb(foodData);
      else if (foodError) console.error('Error fetching food items:', foodError);

      // 2. 현재 식단 상태 로드
      const { data: stateData } = await supabase
        .from('current_meal_state')
        .select('*')
        .eq('id', 1)
        .single();
      
      // 3. 히스토리 로드
      const { data: historyData } = await supabase.from('meal_history').select('*');
      
      let historyEntries: HistoryEntry[] = [];
      if (historyData) {
        const sorted = [...historyData].sort((a: any, b: any) => {
          const parse = (title: string) => {
            const match = title.match(/(\d+)\s*월\s*(\d+)\s*주/);
            if (!match) return { month: 0, week: 0 };
            return { month: parseInt(match[1]), week: parseInt(match[2]) };
          };
          const pa = parse(a.week_title || '');
          const pb = parse(b.week_title || '');
          if (pa.month !== pb.month) return pb.month - pa.month;
          return pb.week - pa.week;
        });

        historyEntries = sorted.map(h => ({
          id: h.id,
          weekTitle: h.week_title,
          menus: h.menus,
          settings: h.settings,
          todayLunch: h.today_lunch
        }));

        // Apply manual order
        const order = stateData?.settings?.historyOrder;
        if (order && Array.isArray(order)) {
          historyEntries.sort((a, b) => {
            const idxA = order.indexOf(a.id);
            const idxB = order.indexOf(b.id);
            if (idxA === -1 && idxB === -1) return 0;
            if (idxA === -1) return 1;
            if (idxB === -1) return -1;
            return idxA - idxB;
          });
        }
        setHistory(historyEntries);
      }

      // 4. 초기 표시 데이터 결정
      const today = new Date();
      const todayIdx = historyEntries.findIndex((h) => {
        const dates = getWeekDatesFromTitle(h.weekTitle);
        return dates.some(d => 
          d.getDate() === today.getDate() && 
          d.getMonth() === today.getMonth() && 
          d.getFullYear() === today.getFullYear()
        );
      });

      let entryToLoad = null;
      if (todayIdx >= 0) {
        entryToLoad = historyEntries[todayIdx];
      } else if (historyEntries.length > 0) {
        entryToLoad = historyEntries[historyEntries.length - 1];
      } else if (stateData) {
        entryToLoad = stateData;
      }

      if (entryToLoad) {
        if (entryToLoad.menus) setMenus(entryToLoad.menus);
        if (entryToLoad.settings) setSettings(entryToLoad.settings);
        if (entryToLoad.today_lunch) setTodayLunch(entryToLoad.today_lunch);
        else if (entryToLoad.todayLunch) setTodayLunch(entryToLoad.todayLunch);

        // 초기 저장 상태 기록
        const initialData = {
          menus: entryToLoad.menus,
          settings: entryToLoad.settings,
          todayLunch: entryToLoad.today_lunch || entryToLoad.todayLunch
        };
        setLastSavedData(JSON.stringify(initialData));

        // 만약 불러온 데이터가 과거 기록이라 배경이 없을 경우, 최신 상태(stateData)의 배경을 적용
        if (stateData?.settings && (!entryToLoad.settings?.backgroundImageUrl && !entryToLoad.settings?.backgroundColor)) {
          setSettings(prev => ({
            ...prev,
            backgroundImageUrl: stateData.settings.backgroundImageUrl,
            backgroundColor: stateData.settings.backgroundColor
          }));
        }
      }

      setIsLoaded(true);
    };

    fetchData();
  }, []);

  // 3분마다 자동 저장 (180,000ms)
  useEffect(() => {
    if (!isAuthenticated) return;

    const interval = setInterval(() => {
      handleSaveRef.current?.(false);
    }, 180000);

    return () => clearInterval(interval);
  }, [isAuthenticated]); // menus/settings/todayLunch 제거: 편집마다 타이머가 리셋되지 않도록

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (loginId === ADMIN_ID && loginPw === ADMIN_PW) {
      setIsAuthenticated(true);
      sessionStorage.setItem('mealAdminAuth', 'true');
      setLoginError('');
    } else {
      setLoginError('아이디 또는 비밀번호가 올바르지 않습니다.');
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="fixed inset-0 bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center z-50">
        <div className="bg-white rounded-2xl shadow-2xl w-[400px] max-w-[90vw] overflow-hidden">
          {/* 헤더 */}
          <div className="bg-gradient-to-r from-orange-500 to-orange-600 p-6 text-center">
            <div className="bg-white p-3 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-lg w-fit">
              <img src="/images/yslogo.png" alt="연세척병원 로고" className="h-12 w-auto object-contain" />
            </div>
            <h2 className="text-xl font-bold text-white">관리자 로그인</h2>
            <p className="text-orange-100 text-sm mt-1">식단표 관리 페이지에 접근하려면 로그인하세요.</p>
          </div>

          {/* 로그인 폼 */}
          <form onSubmit={handleLogin} className="p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">아이디</label>
              <input
                type="text"
                value={loginId}
                onChange={(e) => { setLoginId(e.target.value); setLoginError(''); }}
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 focus:outline-none transition-all text-gray-800"
                placeholder="아이디를 입력하세요"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">비밀번호</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={loginPw}
                  onChange={(e) => { setLoginPw(e.target.value); setLoginError(''); }}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2.5 pr-10 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 focus:outline-none transition-all text-gray-800"
                  placeholder="비밀번호를 입력하세요"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {loginError && (
              <p className="text-red-500 text-sm font-medium bg-red-50 px-3 py-2 rounded-lg">{loginError}</p>
            )}

            <button
              type="submit"
              className="w-full bg-gradient-to-r from-orange-500 to-orange-600 text-white py-3 rounded-lg font-bold hover:from-orange-600 hover:to-orange-700 transition-all shadow-md hover:shadow-lg"
            >
              로그인
            </button>

            <div className="text-center">
              <Link href="/" className="text-sm text-gray-400 hover:text-gray-600 transition-colors">
                ← 사용자 화면으로 돌아가기
              </Link>
            </div>
          </form>
        </div>
      </div>
    );
  }

  const handleSave = async (options?: boolean | React.MouseEvent) => {
    const showNotification = typeof options === 'boolean' ? options : true;
    if (!isLoaded) return; // 데이터 로드 전엔 저장 금지 (stale closure 방어)
    // 1. 현재 상태 업데이트 (upsert)
    const { error: stateError } = await supabase
      .from('current_meal_state')
      .upsert({
        id: 1,
        menus,
        settings,
        today_lunch: todayLunch,
        updated_at: new Date().toISOString()
      });

    if (stateError) {
      console.error('Error saving state:', stateError);
      if (showNotification) alert('저장 실패: ' + (stateError?.message || '알 수 없는 오류'));
      return;
    }

    // 2. 같은 주차 제목이 있으면 덮어쓰기, 없으면 새로 추가
    const existing = history.find(h => h.weekTitle === settings.weekTitle);
    let historyError;
    if (existing) {
      ({ error: historyError } = await supabase
        .from('meal_history')
        .update({ menus, settings, today_lunch: todayLunch })
        .eq('id', existing.id));
    } else {
      ({ error: historyError } = await supabase
        .from('meal_history')
        .insert({ week_title: settings.weekTitle, menus, settings, today_lunch: todayLunch }));
    }

    if (historyError) {
      console.warn('Error saving history:', historyError);
    }

    // 3. 최신 히스토리 다시 불러오기
    const { data: historyData } = await supabase.from('meal_history').select('*');
    if (historyData) {
      const sorted = [...historyData].sort((a: any, b: any) => {
        const parse = (title: string) => {
          const match = title.match(/(\d+)\s*월\s*(\d+)\s*주/);
          if (!match) return { month: 0, week: 0 };
          return { month: parseInt(match[1]), week: parseInt(match[2]) };
        };
        const pa = parse(a.week_title || '');
        const pb = parse(b.week_title || '');
        if (pa.month !== pb.month) return pb.month - pa.month;
        return pb.week - pa.week;
      });

      const historyEntries = sorted.map(h => ({
        id: h.id,
        weekTitle: h.week_title,
        menus: h.menus,
        settings: h.settings,
        todayLunch: h.today_lunch
      }));

      // Apply manual order
      const order = settings.historyOrder;
      if (order && Array.isArray(order)) {
        historyEntries.sort((a, b) => {
          const idxA = order.indexOf(a.id);
          const idxB = order.indexOf(b.id);
          if (idxA === -1 && idxB === -1) return 0;
          if (idxA === -1) return 1;
          if (idxB === -1) return -1;
          return idxA - idxB;
        });
      }
      setHistory(historyEntries);
    }

    setLastSavedData(JSON.stringify({ menus, settings, todayLunch }));

    if (showNotification) {
      alert('저장되었습니다! 일반 사용자 화면에 반영됩니다.');
    } else {
      console.log('Auto-saved at:', new Date().toLocaleTimeString());
    }
  };

  // 자동저장 interval이 항상 최신 handleSave를 참조하도록 ref 갱신 (훅 규칙 준수: early return 이후 렌더 중 동기 업데이트)
  handleSaveRef.current = handleSave;

  const handleDeleteHistory = async (id: number) => {
    if (!confirm('이 식단 기록을 영구히 삭제하시겠습니까?')) return;
    
    const { error } = await supabase
      .from('meal_history')
      .delete()
      .eq('id', id);
      
    if (error) {
      alert('삭제 실패: ' + error.message);
    } else {
      setHistory(prev => prev.filter(h => h.id !== id));
    }
  };

  const handleLoadHistory = (direction: 'prev' | 'next') => {
    if (history.length === 0) {
      alert('저장된 과거 식단 기록이 없습니다.');
      return;
    }
    
    const currentIndex = history.findIndex(h => h.weekTitle === settings.weekTitle);
    let targetIndex = currentIndex;
    
    if (currentIndex === -1) {
      targetIndex = direction === 'prev' ? history.length - 1 : 0;
    } else {
      if (direction === 'prev') targetIndex = currentIndex - 1;
      if (direction === 'next') targetIndex = currentIndex + 1;
    }

    if (targetIndex < 0) {
      alert('가장 오래된 기록입니다.');
      return;
    }
    if (targetIndex >= history.length) {
      alert('가장 최근 기록입니다.');
      return;
    }

    const selected = history[targetIndex];
    const currentData = JSON.stringify({ menus, settings, todayLunch });
    const hasChanges = lastSavedData !== currentData;

    if (!hasChanges || confirm(`'${selected.weekTitle}' 식단표를 불러오시겠습니까?\n저장하지 않은 캔버스의 변경사항은 덮어씌워집니다.`)) {
      setMenus(selected.menus);
      setSettings({
        ...selected.settings,
        favoriteFoodIds: settings.favoriteFoodIds,
        historyOrder: settings.historyOrder,
      });
      if (selected.todayLunch) setTodayLunch(selected.todayLunch);
      setLastSavedData(JSON.stringify({
        menus: selected.menus,
        settings: {
          ...selected.settings,
          favoriteFoodIds: settings.favoriteFoodIds,
          historyOrder: settings.historyOrder,
        },
        todayLunch: selected.todayLunch
      }));
    }
  };

  const handleReset = () => {
    setIsWeekModalOpen(true);
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  // 배추김치 일괄 적용 처리
  const applyKimchiToAll = (foodId: string) => {
    setMenus((prev) => {
      const newMenus = [...prev];
      const ALL_DAYS: DayOfWeek[] = ['월', '화', '수', '목', '금', '토', '일'];
      const ALL_TIMES: MealTime[] = ['아침', '점심', '저녁'];

      ALL_DAYS.forEach(d => {
        ALL_TIMES.forEach(t => {
          const idx = newMenus.findIndex(m => m.day === d && m.time === t);
          if (idx >= 0) {
            if (!newMenus[idx].foodIds.includes(foodId)) {
              newMenus[idx] = { ...newMenus[idx], foodIds: [...newMenus[idx].foodIds, foodId] };
            }
          } else {
            newMenus.push({ id: Date.now().toString() + d + t, day: d, time: t, foodIds: [foodId] });
          }
        });
      });
      return newMenus;
    });
  };

  const addFoodToCell = (foodId: string, day: DayOfWeek, time: MealTime) => {
    setMenus((prev) => {
      const existingEntryIndex = prev.findIndex(m => m.day === day && m.time === time);
      if (existingEntryIndex >= 0) {
        const newMenus = [...prev];
        const currentFoods = [...newMenus[existingEntryIndex].foodIds];
        if (!currentFoods.includes(foodId)) {
          const food = foodDb.find(f => f.id === foodId);
          if (food?.name === '배추김치') {
            currentFoods.push(foodId); // 배추김치는 맨 뒤에 추가
          } else {
            // 다른 음식은 배추김치 앞, 혹은 맨 뒤에 추가
            const kimchiIdx = currentFoods.findIndex(id => foodDb.find(f => f.id === id)?.name === '배추김치');
            if (kimchiIdx >= 0) {
              currentFoods.splice(kimchiIdx, 0, foodId);
            } else {
              currentFoods.push(foodId);
            }
          }
          newMenus[existingEntryIndex] = {
            ...newMenus[existingEntryIndex],
            foodIds: currentFoods
          };
        }
        return newMenus;
      } else {
        return [...prev, { id: Date.now().toString(), day, time, foodIds: [foodId] }];
      }
    });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (over) {
      const isFromGrid = active.data.current?.source === 'grid';
      const foodId = isFromGrid ? active.data.current?.foodId : (active.id as string);
      const food = foodDb.find(f => f.id === foodId);
      
      const overId = over.id as string;
      const overParts = overId.split('-');
      
      let targetDay: DayOfWeek;
      let targetTime: MealTime;
      let isOverGridItem = false;
      let overIdx = -1;

      // ID 파싱 (UUID에 하이픈이 포함될 수 있으므로 뒤에서부터 파싱)
      if (overId.startsWith('grid-mobile-')) {
        targetDay = overParts[2] as DayOfWeek;
        targetTime = overParts[3] as MealTime;
        isOverGridItem = true;
        overIdx = parseInt(overId.split('-').pop() || '-1');
      } else if (overId.startsWith('grid-')) {
        targetDay = overParts[1] as DayOfWeek;
        targetTime = overParts[2] as MealTime;
        isOverGridItem = true;
        overIdx = parseInt(overId.split('-').pop() || '-1');
      } else if (overId.startsWith('mobile-')) {
        targetDay = overParts[1] as DayOfWeek;
        targetTime = overParts[2] as MealTime;
      } else {
        // desktop-
        targetDay = overParts[1] as DayOfWeek;
        targetTime = overParts[2] as MealTime;
      }

      // 그리드 내에서 이동하는 경우
      if (isFromGrid) {
        const sourceDay = active.data.current?.day as DayOfWeek;
        const sourceTime = active.data.current?.time as MealTime;
        const sourceIdx = active.data.current?.idx;
        
        // 같은 칸 안에서 드롭한 경우 (정렬)
        if (sourceDay === targetDay && sourceTime === targetTime) {
          if (isOverGridItem && sourceIdx !== overIdx) {
            setMenus(prev => {
              const entryIdx = prev.findIndex(m => m.day === sourceDay && m.time === sourceTime);
              if (entryIdx === -1) return prev;
              const newMenus = [...prev];
              const newFoodIds = arrayMove(newMenus[entryIdx].foodIds, sourceIdx, overIdx);
              newMenus[entryIdx] = { ...newMenus[entryIdx], foodIds: newFoodIds };
              return newMenus;
            });
          }
          return;
        }
        
        // 다른 칸으로 이동
        removeFood(sourceDay, sourceTime, foodId);
        addFoodToCell(foodId, targetDay, targetTime);
        return;
      }

      // 배추김치 특별 처리 - 커스텀 모달로 확인 (사이드바에서 올 때만)
      if (food && food.name === '배추김치') {
        setPendingKimchiDrop({ foodId, day: targetDay, time: targetTime });
        setIsKimchiModalOpen(true);
        return;
      }

      addFoodToCell(foodId, targetDay, targetTime);
      setSelectedChosung('전체');
      setSearchQuery('');
    }
  };


  const handleHistoryDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setHistory((prev) => {
        const oldIndex = prev.findIndex((h) => h.id === active.id);
        const newIndex = prev.findIndex((h) => h.id === over.id);
        const newHistory = arrayMove(prev, oldIndex, newIndex);
        
        // 순서 변경 시 DB에도 즉시 반영 (settings.historyOrder 업데이트)
        const newOrder = newHistory.map(h => h.id);
        const newSettings = { ...settings, historyOrder: newOrder };
        setSettings(newSettings);
        
        supabase.from('current_meal_state')
          .update({ settings: newSettings })
          .eq('id', 1)
          .then(({ error }) => {
            if (error) console.error('히스토리 순서 저장 실패:', error);
          });
          
        return newHistory;
      });
    }
  };

  const removeFood = (day: DayOfWeek, time: MealTime, foodId: string) => {
    setMenus((prev) => {
      const existingEntryIndex = prev.findIndex(m => m.day === day && m.time === time);
      if (existingEntryIndex >= 0) {
        const newMenus = [...prev];
        newMenus[existingEntryIndex] = {
          ...newMenus[existingEntryIndex],
          foodIds: newMenus[existingEntryIndex].foodIds.filter(id => id !== foodId)
        };
        return newMenus;
      }
      return prev;
    });
  };

  const moveFood = (day: DayOfWeek, time: MealTime, foodId: string, direction: 'up' | 'down') => {
    setMenus((prev) => {
      const entryIdx = prev.findIndex(m => m.day === day && m.time === time);
      if (entryIdx === -1) return prev;

      const newMenus = [...prev];
      const newFoodIds = [...newMenus[entryIdx].foodIds];
      const idx = newFoodIds.indexOf(foodId);
      if (idx === -1) return prev;

      const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= newFoodIds.length) return prev;

      // Swap
      [newFoodIds[idx], newFoodIds[targetIdx]] = [newFoodIds[targetIdx], newFoodIds[idx]];
      newMenus[entryIdx] = { ...newMenus[entryIdx], foodIds: newFoodIds };
      return newMenus;
    });
  };

  const handleBgImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const url = event.target?.result as string;
        setBgImageFile(url);
        const newSettings = { ...settings, backgroundImageUrl: url };
        setSettings(newSettings);
        setIsBgModalOpen(false);
        
        // 배경 변경 시 즉시 DB 저장
        supabase.from('current_meal_state').update({ settings: newSettings }).eq('id', 1).then(({ error }) => {
          if (error) console.error('배경 저장 실패:', error);
        });
      };
      reader.readAsDataURL(file);
    }
  };

  const applyPresetBackground = (url: string | null, color: string) => {
    const newSettings = { ...settings, backgroundImageUrl: url, backgroundColor: color };
    setSettings(newSettings);
    setIsBgModalOpen(false);
    
    // 배경 변경 시 즉시 DB 저장
    supabase.from('current_meal_state').update({ settings: newSettings }).eq('id', 1).then(({ error }) => {
      if (error) console.error('배경 저장 실패:', error);
    });
  };

  const handleLunchImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      setCropImageSrc(event.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleCropConfirm = async (croppedUrl: string) => {
    setCropImageSrc(null);
    const updated = { ...todayLunch, imageUrl: croppedUrl, date: new Date().toISOString().split('T')[0] };
    setTodayLunch(updated);

    try {
      const { error: stateError } = await supabase.from('current_meal_state').upsert({
        id: 1,
        menus,
        settings,
        today_lunch: updated,
        updated_at: new Date().toISOString()
      });
      if (stateError) throw stateError;

      const existing = history.find(h => h.weekTitle === settings.weekTitle);
      if (existing) {
        await supabase.from('meal_history').update({ today_lunch: updated }).eq('id', existing.id);
      }
      alert('오늘의 점심 사진이 저장되었습니다.');
    } catch (err) {
      console.error('Error saving lunch image:', err);
      alert('사진 저장 중 오류가 발생했습니다.');
    }
  };

  const handlePdfDownload = async () => {
    if (!canvasRef.current) return;

    let container: HTMLDivElement | null = null;
    try {
      const element = canvasRef.current;
      const CAPTURE_W = 794; // 210mm @ 96dpi

      // 오프스크린 컨테이너에 클론을 만들어 캡처
      // (원본의 mx-auto 마진이 이미지에 포함되는 문제 방지)
      container = document.createElement('div');
      container.style.cssText = `position:fixed;top:-9999px;left:-9999px;width:${CAPTURE_W}px;overflow:hidden;`;
      document.body.appendChild(container);

      const clone = element.cloneNode(true) as HTMLElement;
      clone.style.width = `${CAPTURE_W}px`;
      clone.style.minWidth = `${CAPTURE_W}px`;
      clone.style.maxWidth = `${CAPTURE_W}px`;
      clone.style.margin = '0';
      clone.style.boxShadow = 'none';
      clone.style.overflow = 'hidden';
      container.appendChild(clone);

      // 클론에서 ignore-pdf 요소 숨김
      (Array.from(clone.querySelectorAll('.ignore-pdf')) as HTMLElement[])
        .forEach(el => { el.style.display = 'none'; });

      await new Promise(r => setTimeout(r, 150));

      const captureH = clone.scrollHeight;

      const imgData = await toPng(clone, {
        cacheBust: true,
        pixelRatio: 2,
        width: CAPTURE_W,
        height: captureH,
      });

      document.body.removeChild(container);
      container = null;

      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pdfW = pdf.internal.pageSize.getWidth();   // 210
      const pdfH = pdf.internal.pageSize.getHeight();  // 297

      const imgHeightMM = pdfW * (captureH / CAPTURE_W);

      if (imgHeightMM <= pdfH) {
        pdf.addImage(imgData, 'PNG', 0, 0, pdfW, imgHeightMM);
      } else {
        const scaledW = pdfH * (CAPTURE_W / captureH);
        pdf.addImage(imgData, 'PNG', (pdfW - scaledW) / 2, 0, scaledW, pdfH);
      }

      pdf.save(`${settings.weekTitle || '주간식단표'}.pdf`);
    } catch (error) {
      if (container && document.body.contains(container)) {
        document.body.removeChild(container);
      }
      console.error("PDF 생성 실패", error);
      alert("PDF 생성 중 오류가 발생했습니다.");
    }
  };

  const activeFoodItem = activeId 
    ? (activeId.startsWith('grid-') 
        ? foodDb.find(f => f.id === activeId.split('-')[activeId.split('-').length - 2])
        : foodDb.find(f => f.id === activeId))
    : undefined;

  const handleToggleFavorite = async (food: FoodItem) => {
    const currentFavs = settings.favoriteFoodIds || [];
    const newFavs = currentFavs.includes(food.id)
      ? currentFavs.filter(id => id !== food.id)
      : [...currentFavs, food.id];
    
    const newSettings = { ...settings, favoriteFoodIds: newFavs };
    setSettings(newSettings);
    
    // DB에 즉시 저장
    supabase.from('current_meal_state').upsert({
      id: 1,
      menus,
      settings: newSettings,
      today_lunch: todayLunch,
      updated_at: new Date().toISOString()
    }).then(({ error }) => {
      if (error) console.error('Error saving favorite:', error);
    });
  };

  const filteredFoods = foodDb.filter(f => {
    // 검색어가 있으면 카테고리 무시하고 전체 검색
    if (searchQuery) {
      if (!f.name.includes(searchQuery)) return false;
    } else {
      if (f.category !== activeTab) return false;
    }
    if (showFavoritesOnly && !(settings.favoriteFoodIds || []).includes(f.id)) return false;
    if (selectedChosung !== '전체') {
      const chosung = getChosungGroup(f.name.charAt(0));
      if (chosung !== selectedChosung) return false;
    }
    return true;
  });

  if (!isLoaded) return <div className="h-screen flex items-center justify-center">로딩중...</div>;

  // 새로만들기 모달용 파생값
  const isDuplicateSelected = history.some(h => h.weekTitle === buildWeekTitle(selectedMonth, selectedWeek));

  const nextAvailableWeek = (() => {
    if (history.length === 0) return null;
    let maxMonth = 0, maxWeek = 0;
    history.forEach(h => {
      const match = h.weekTitle.match(/(\d+)\s*월\s*(\d+)\s*주/);
      if (match) {
        const m = parseInt(match[1]), w = parseInt(match[2]);
        if (m > maxMonth || (m === maxMonth && w > maxWeek)) { maxMonth = m; maxWeek = w; }
      }
    });
    if (maxMonth === 0) return null;
    let nextMonth = maxMonth, nextWeek = maxWeek + 1;
    if (nextWeek > 5) { nextWeek = 1; nextMonth = (maxMonth % 12) + 1; }
    if (history.some(h => h.weekTitle === buildWeekTitle(nextMonth, nextWeek))) return null;
    return { month: nextMonth, week: nextWeek };
  })();

  return (
    <>
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex flex-col md:flex-row h-screen bg-gray-100 md:p-4 md:gap-4 overflow-hidden">
      
      {/* Left Area: A4 Canvas Preview */}
      <div className="flex-1 overflow-y-auto flex flex-col items-center p-3 md:p-0">
        {/* Header */}
        <div className="flex justify-between w-full max-w-[800px] mb-3 md:mb-4">
          <div className="flex items-center gap-2 md:gap-4">
            <Link href="/" className="p-2 bg-gray-200 text-gray-700 rounded-full hover:bg-gray-300 transition-colors" title="사용자 화면으로 돌아가기">
              <ArrowLeft size={18} />
            </Link>
            <div className="flex items-center gap-2">
              <img src="/images/yslogo.png" alt="로고" className="h-6 md:h-8 w-auto object-contain" />
              <h1 className="text-base md:text-2xl font-bold text-gray-800">식단표 관리</h1>
            </div>
          </div>
          <div className="flex gap-1.5 md:gap-2 items-center">
            <button 
              onClick={() => setIsBgModalOpen(true)}
              className="bg-white p-2 md:px-3 md:py-2 rounded shadow text-sm font-medium hover:bg-gray-50 flex items-center gap-2"
              title="배경 선택/업로드"
            >
              <ImagePlus size={16} />
              <span className="hidden md:inline">배경 선택/업로드</span>
            </button>
            <button 
              onClick={() => setIsHistoryManageModalOpen(true)} 
              className="bg-gray-600 text-white p-2 md:px-3 md:py-2 rounded shadow text-sm font-medium hover:bg-gray-700 flex items-center gap-2" 
              title="히스토리 관리"
            >
              <List size={16} />
              <span className="hidden md:inline">기록 관리</span>
            </button>
            <button onClick={handleReset} className="bg-red-500 text-white p-2 md:px-3 md:py-2 rounded shadow text-sm font-medium hover:bg-red-600 flex items-center gap-2" title="새로 만들기">
              <Plus size={16} />
              <span className="hidden md:inline">새로 만들기</span>
            </button>
            <button onClick={handlePdfDownload} className="bg-blue-600 text-white p-2 md:px-3 md:py-2 rounded shadow text-sm font-medium hover:bg-blue-700 flex items-center gap-2 hidden md:flex" title="PDF 다운로드">
              <Download size={16} />
              <span className="hidden md:inline">PDF 다운로드</span>
            </button>
            <button onClick={handleSave} className="bg-green-600 text-white p-2 md:px-3 md:py-2 rounded shadow text-sm font-medium hover:bg-green-700 flex items-center gap-2" title="저장하기">
              <Save size={16} />
              <span className="hidden md:inline">저장하기</span>
            </button>
          </div>
        </div>

        {/* 모바일 전용 식단 편집 */}
        <div className="md:hidden w-full mb-4">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="flex flex-col items-center p-3 border-b border-gray-200">
              <img src="/images/yslogo.png" alt="로고" className="h-6 mb-1 object-contain" />
              <h2 className="text-lg font-bold" style={{ color: settings.titleColor || '#f97316' }}>주간 식단표</h2>
              <div className="flex items-center justify-center gap-2 mt-1">
                <button onClick={() => handleLoadHistory('prev')} className="p-1 text-gray-400"><ChevronLeft size={16} /></button>
                <input 
                  type="text" value={settings.weekTitle}
                  onChange={(e) => setSettings({...settings, weekTitle: e.target.value})}
                  className="text-center bg-transparent border-b border-gray-300 focus:outline-none font-bold text-gray-700 text-sm w-48"
                  placeholder="예: 3월 1주차 식단표"
                />
                <button onClick={() => handleLoadHistory('next')} className="p-1 text-gray-400"><ChevronRight size={16} /></button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px] border-collapse text-xs">
                <thead>
                  <tr>
                    <th className="border border-gray-200 p-1.5 w-10 bg-gray-50"></th>
                    {DAYS.map(day => (
                      <th key={day} className="border border-gray-200 p-1.5 text-center bg-gray-50 font-bold text-xs">{day}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {TIMES.map(time => (
                    <tr key={time}>
                      <td className="border border-gray-200 p-1 text-center font-bold bg-gray-50 text-[10px]">{time}</td>
                      {DAYS.map(day => {
                        const menuEntry = menus.find(m => m.day === day && m.time === time);
                        const foods = menuEntry ? menuEntry.foodIds.map(id => foodDb.find(f => f.id === id)!).filter(Boolean) : [];
                        return (
                          <td key={`m-${day}-${time}`} className="border border-gray-200 p-1 align-top h-[80px] w-[12%]">
                            <DroppableCell id={`mobile-${day}-${time}`}>
                              <div className="min-h-[70px] flex flex-col gap-1 items-center">
                                <SortableContext 
                                  items={foods.map((f, i) => `grid-mobile-${day}-${time}-${f.id}-${i}`)} 
                                  strategy={verticalListSortingStrategy}
                                >
                                  {foods.map((food, idx) => food && (
                                    <DraggableGridFoodMobile
                                      key={`${food.id}-${idx}`}
                                      food={food}
                                      day={day}
                                      time={time}
                                      idx={idx}
                                      total={foods.length}
                                      onRemove={() => removeFood(day, time, food.id)}
                                      onEdit={() => {
                                        setEditingFood(food);
                                        setIsFoodModalOpen(true);
                                      }}
                                    />
                                  ))}
                                </SortableContext>
                              </div>
                            </DroppableCell>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* 원산지 편집 */}
            <div className="p-3 border-t border-gray-200">
              <textarea 
                className="w-full text-[10px] p-2 border border-gray-200 rounded resize-none focus:ring-1 focus:ring-orange-400 focus:outline-none"
                rows={3}
                value={settings.originText}
                onChange={(e) => setSettings({...settings, originText: e.target.value})}
                placeholder="원산지 정보 입력..."
              />
            </div>
          </div>
        </div>

        {/* A4 Canvas (데스크탑 전용) */}
        <div className="hidden md:block w-full overflow-x-auto pb-8">
          <div className="flex justify-center min-w-max px-4">
            <div 
              ref={canvasRef}
              className="bg-white shadow-lg relative p-6 shrink-0 mx-auto"
              style={{ 
                width: '210mm', 
                minWidth: '210mm',
                minHeight: '297mm',
            backgroundColor: settings.backgroundColor,
            backgroundImage: settings.backgroundImageUrl ? `url(${settings.backgroundImageUrl})` : 'none',
            backgroundSize: 'cover',
            backgroundPosition: 'center'
          }}
        >
          <div className="w-full h-full min-h-[270mm] bg-white/85 backdrop-blur-md rounded-2xl p-8 shadow-sm border border-white/50 flex flex-col">
            <div className="flex flex-col items-center mb-6">
              <img src="/images/yslogo.png" alt="연세척병원 로고" className="h-12 mb-3 object-contain" />
              <div className="flex items-center justify-center gap-3 mb-2">
                <h2 className="text-3xl font-black drop-shadow-md" style={{ color: settings.titleColor || '#f97316' }}>주간 식단표</h2>
                <label className="ignore-pdf cursor-pointer bg-white p-1 rounded-full border border-gray-200 shadow-sm hover:bg-gray-50 flex items-center justify-center relative" title="제목 색상 변경">
                  <input 
                    type="color" 
                    value={settings.titleColor || '#f97316'} 
                    onChange={(e) => setSettings({...settings, titleColor: e.target.value})} 
                    className="opacity-0 absolute inset-0 w-full h-full cursor-pointer" 
                  />
                  <div className="w-5 h-5 rounded-full border border-gray-300" style={{ backgroundColor: settings.titleColor || '#f97316' }}></div>
                </label>
              </div>
              <div className="flex items-center justify-center gap-2 mb-1">
                <button 
                  onClick={() => handleLoadHistory('prev')}
                  className="ignore-pdf p-1 hover:bg-black/10 rounded-full text-gray-500 hover:text-gray-800 transition-colors"
                  title="이전 기록 불러오기"
                >
                  <ChevronLeft size={20} />
                </button>
                <input 
                  type="text" 
                  value={settings.weekTitle}
                  onChange={(e) => setSettings({...settings, weekTitle: e.target.value})}
                  className="text-center bg-transparent border-b border-gray-400 focus:outline-none font-bold text-gray-700 w-64"
                  placeholder="예: 3월 1주차 식단표"
                />
                <button 
                  onClick={() => handleLoadHistory('next')}
                  className="ignore-pdf p-1 hover:bg-black/10 rounded-full text-gray-500 hover:text-gray-800 transition-colors"
                  title="다음 기록 불러오기"
                >
                  <ChevronRight size={20} />
                </button>
              </div>
            </div>

            <table className="w-full border-collapse border-2 border-gray-800 bg-white bg-opacity-90" style={{ tableLayout: 'fixed' }}>
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
                        <td key={`${day}-${time}`} className="border border-gray-400 p-0 align-top relative h-[160px] overflow-hidden">
                          <DroppableCell id={`desktop-${day}-${time}`}>
                            <div className="min-h-[160px] h-full p-2 flex flex-col gap-2 items-center justify-start overflow-hidden">
                              <SortableContext 
                                items={foods.map((f, i) => `grid-${day}-${time}-${f.id}-${i}`)} 
                                strategy={verticalListSortingStrategy}
                              >
                                {foods.map((food, idx) => food && (
                                  <DraggableGridFood 
                                    key={`${food.id}-${idx}`}
                                    food={food}
                                    day={day}
                                    time={time}
                                    idx={idx}
                                    total={foods.length}
                                    onRemove={() => removeFood(day, time, food.id)}
                                    onEdit={() => {
                                      setEditingFood(food);
                                      setIsFoodModalOpen(true);
                                    }}
                                  />
                                ))}
                              </SortableContext>
                            </div>
                          </DroppableCell>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="mt-6 bg-white bg-opacity-90 p-4 rounded border border-gray-200 flex-1 flex flex-col">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-bold text-gray-500">원산지 정보</span>
                <button 
                  onClick={async () => {
                    const { error } = await supabase
                      .from('current_meal_state')
                      .upsert({
                        id: 1,
                        menus,
                        settings, // settings.originText가 포함되어 있음
                        today_lunch: todayLunch,
                        updated_at: new Date().toISOString()
                      });
                    if (!error) alert('원산지 정보가 저장되었습니다. 앞으로 새 식단표 작성 시에도 이 내용이 유지됩니다.');
                    else alert('저장 실패: ' + error.message);
                  }}
                  className="ignore-pdf text-[10px] bg-gray-100 hover:bg-gray-200 text-gray-600 px-2 py-1 rounded border border-gray-300 transition-colors font-bold"
                >
                  원산지 정보 저장
                </button>
              </div>
              <textarea 
                className="w-full h-full min-h-[200px] text-xs p-2 border-none resize-none focus:ring-0 bg-transparent flex-1"
                value={settings.originText}
                onChange={(e) => setSettings({...settings, originText: e.target.value})}
              />
            </div>
          </div>
        </div>
        </div>
      </div>
      </div>

      {/* Right Area: Component Block (데스크탑) */}
      <div className="hidden md:flex w-80 bg-white shadow-lg flex-col rounded-xl border border-gray-200 overflow-hidden">
        <div className="p-4 bg-gray-50 border-b border-gray-200">
          <div className="flex justify-between items-center mb-3">
            <h2 className="font-bold text-lg">음식 데이터베이스</h2>
            <button 
              onClick={() => {
                setEditingFood({ id: Date.now().toString(), name: '', category: activeTab, origin: '' });
                setIsFoodModalOpen(true);
              }}
              className="bg-blue-100 text-blue-600 px-2 py-1 rounded text-xs font-bold hover:bg-blue-200 flex items-center gap-1"
            >
              <Plus size={14} /> 추가
            </button>
          </div>
          <div className="flex gap-2 mb-2">
            {CATEGORIES.map(cat => (
              <button 
                key={cat}
                onClick={() => {
                  setActiveTab(cat);
                  setSelectedChosung('전체');
                  setSearchQuery('');
                }}
                className={`flex-1 py-1 px-2 rounded text-sm font-medium transition-colors ${activeTab === cat ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
              >
                {cat}
              </button>
            ))}
          </div>
          <div className="mb-3">
            <input 
              type="text" 
              placeholder="음식 이름 검색..." 
              className="w-full text-sm border border-gray-300 rounded p-1.5 focus:ring-1 focus:ring-blue-500 focus:outline-none"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                if (e.target.value) setSelectedChosung('전체');
              }}
            />
          </div>
          <div className="flex flex-wrap gap-1 mb-1 items-center">
            <button
              onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
              className={`text-[10px] px-2 py-0.5 rounded transition-colors border flex items-center gap-1 ${showFavoritesOnly ? 'bg-yellow-400 text-yellow-900 font-bold border-yellow-500' : 'bg-white text-gray-500 border-gray-300 hover:bg-gray-50'}`}
            >
              ★ 즐겨찾기
            </button>
            <div className="w-[1px] h-3 bg-gray-300 mx-1"></div>
            {CHOSUNGS.map(cho => (
              <button
                key={cho}
                onClick={() => setSelectedChosung(cho)}
                className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${selectedChosung === cho ? 'bg-gray-700 text-white font-bold' : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-100'}`}
              >
                {cho}
              </button>
            ))}
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2">
          {filteredFoods.map(food => (
              <DraggableFoodItem 
                key={food.id} 
                food={food} 
                isFavorite={(settings.favoriteFoodIds || []).includes(food.id)}
                onToggleFavorite={handleToggleFavorite}
                onEdit={(f) => {
                  setEditingFood(f);
                  setIsFoodModalOpen(true);
                }}
                onDelete={async (f) => {
                  if (confirm(`'${f.name}' 음식을 삭제하시겠습니까?`)) {
                    const { error } = await supabase.from('food_items').delete().eq('id', f.id);
                    if (!error) {
                      setFoodDb(foodDb.filter(item => item.id !== f.id));
                      setMenus(menus.map(m => ({...m, foodIds: m.foodIds.filter(id => id !== f.id)})));
                    } else {
                      alert('삭제 실패: ' + (error?.message || '알 수 없는 오류'));
                    }
                  }
                }}
              />
          ))}
        </div>

        <div className="p-4 border-t border-gray-200 bg-gray-50">
          <h3 className="font-bold text-sm mb-2">오늘의 점심 업로드</h3>
          <button 
            onClick={() => setIsLunchModalOpen(true)}
            className="w-full border-2 border-dashed border-gray-300 rounded-lg p-4 flex flex-col items-center justify-center text-center hover:bg-gray-100 cursor-pointer transition-colors relative overflow-hidden group min-h-[120px]"
          >
            {todayLunch.imageUrl ? (
              <>
                <img src={todayLunch.imageUrl} alt="오늘의 점심 미리보기" className="absolute inset-0 w-full h-full object-cover opacity-60 group-hover:opacity-30 transition-opacity" />
                <div className="relative z-10 flex flex-col items-center">
                  <ImagePlus className="text-gray-800 mb-2" />
                  <p className="text-xs text-gray-800 font-bold bg-white/80 px-2 py-1 rounded">{todayLunch.date} 사진 변경하기</p>
                </div>
              </>
            ) : (
              <>
                <ImagePlus className="text-gray-400 mb-2" />
                <p className="text-xs text-gray-500">클릭하여 오늘의 점심 업로드</p>
              </>
            )}
          </button>
        </div>

        {/* History Select Dropdown at Bottom */}
        {history.length > 0 && (
          <div className="p-4 border-t border-gray-200 bg-gray-50">
            <h3 className="font-bold text-sm mb-2 text-gray-700">과거 식단 불러오기</h3>
            <select 
              className="w-full bg-white border border-gray-300 rounded px-2 py-2 text-sm text-gray-700 focus:outline-none focus:border-blue-500 cursor-pointer shadow-sm"
              onChange={(e) => {
                if (e.target.value) {
                  const selected = history.find(h => h.id === Number(e.target.value));
                  if (selected) {
                    setMenus(selected.menus);
                    setSettings(selected.settings);
                    if (selected.todayLunch) setTodayLunch(selected.todayLunch);
                  }
                  e.target.value = "";
                }
              }}
            >
              <option value="">이전 식단 선택...</option>
              {history.map(h => <option key={h.id} value={h.id}>{h.weekTitle}</option>)}
            </select>
            <p className="text-[10px] text-gray-500 mt-1">* 저장하기를 누를 때마다 과거 식단에 저장됩니다.</p>
          </div>
        )}
      </div>

      {/* 모바일: 오늘의 점심 업로드 플로팅 버튼 */}
      <label 
        className="md:hidden fixed bottom-24 right-6 w-14 h-14 bg-orange-500 text-white rounded-full shadow-lg flex items-center justify-center z-30 hover:bg-orange-600 active:scale-95 transition-all cursor-pointer"
        title="오늘의 점심 사진 찍기"
      >
        <Camera size={28} />
        <input
          type="file"
          className="hidden"
          accept="image/*"
          onChange={handleLunchImageUpload}
        />
      </label>

      {/* 모바일: 음식DB 플로팅 버튼 */}
      <button
        onClick={() => setIsMobileFoodPanelOpen(true)}
        className="md:hidden fixed bottom-6 right-6 w-14 h-14 bg-blue-600 text-white rounded-full shadow-lg flex items-center justify-center z-30 hover:bg-blue-700 active:scale-95 transition-all"
      >
        <Plus size={28} />
      </button>

      {/* 모바일: 음식DB 슬라이드업 패널 */}
      {isMobileFoodPanelOpen && (
        <div className="md:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/40" onClick={() => setIsMobileFoodPanelOpen(false)} />
          <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl shadow-2xl max-h-[80vh] flex flex-col animate-in slide-in-from-bottom">
            {/* 패널 핸들 */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 bg-gray-300 rounded-full" />
            </div>
            <div className="p-4 border-b border-gray-200">
              <div className="flex justify-between items-center mb-3">
                <h2 className="font-bold text-lg">음식 데이터베이스</h2>
                <div className="flex gap-2">
                  <button 
                    onClick={() => {
                      setEditingFood({ id: Date.now().toString(), name: '', category: activeTab, origin: '' });
                      setIsFoodModalOpen(true);
                    }}
                    className="bg-blue-100 text-blue-600 px-2 py-1 rounded text-xs font-bold hover:bg-blue-200 flex items-center gap-1"
                  >
                    <Plus size={14} /> 추가
                  </button>
                  <button onClick={() => setIsMobileFoodPanelOpen(false)} className="text-gray-400 hover:text-gray-600 text-lg font-bold">✕</button>
                </div>
              </div>
              <div className="flex gap-2 mb-2">
                {CATEGORIES.map(cat => (
                  <button 
                    key={cat}
                    onClick={() => setActiveTab(cat)}
                    className={`flex-1 py-1 px-2 rounded text-sm font-medium transition-colors ${activeTab === cat ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-700'}`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
              <input 
                type="text" 
                placeholder="음식 이름 검색..." 
                className="w-full text-sm border border-gray-300 rounded p-1.5 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2">
              {filteredFoods.map(food => (
                <DraggableFoodItem 
                  key={food.id} 
                  food={food} 
                  onEdit={(f) => {
                    setEditingFood(f);
                    setIsFoodModalOpen(true);
                  }}
                  onDelete={async (f) => {
                    if (confirm(`'${f.name}' 음식을 삭제하시겠습니까?`)) {
                      const { error } = await supabase.from('food_items').delete().eq('id', f.id);
                      if (!error) {
                        setFoodDb(foodDb.filter(item => item.id !== f.id));
                        setMenus(menus.map(m => ({...m, foodIds: m.foodIds.filter(id => id !== f.id)})));
                      } else {
                        alert('삭제 실패: ' + (error?.message || '알 수 없는 오류'));
                      }
                    }
                  }}
                />
              ))}
            </div>
            {/* 모바일 히스토리 */}
            <div className="p-3 border-t border-gray-200">
              <button 
                onClick={() => { setIsHistoryManageModalOpen(true); setIsMobileFoodPanelOpen(false); }}
                className="w-full bg-gray-600 text-white py-2.5 rounded-lg text-sm font-bold flex items-center justify-center gap-2 shadow-sm"
              >
                <History size={18} /> 과거 식단 기록 관리
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Background Select Modal */}
      {isBgModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
          <div className="bg-white rounded-xl shadow-xl w-[600px] max-w-[90vw] overflow-hidden flex flex-col">
            <div className="p-4 border-b flex justify-between items-center bg-gray-50">
              <h2 className="font-bold text-lg">배경 이미지 선택</h2>
              <button onClick={() => setIsBgModalOpen(false)} className="text-gray-500 hover:text-gray-800">✕</button>
            </div>
            
            <div className="p-4 overflow-y-auto max-h-[60vh]">
              <div className="grid grid-cols-3 gap-4">
                {/* Custom Upload Button */}
                <label className="border-2 border-dashed border-gray-300 rounded-lg aspect-[4/3] flex flex-col items-center justify-center cursor-pointer hover:bg-gray-50 transition-colors">
                  <ImagePlus className="text-gray-400 mb-2" />
                  <span className="text-sm font-medium text-gray-600">내 PC에서 업로드</span>
                  <input type="file" className="hidden" accept="image/*" onChange={handleBgImageUpload} />
                </label>
                
                {/* Presets */}
                {PRESET_BACKGROUNDS.map(bg => (
                  <button 
                    key={bg.id}
                    onClick={() => applyPresetBackground(bg.url, bg.color)}
                    className="relative rounded-lg overflow-hidden aspect-[4/3] border-2 border-transparent hover:border-blue-500 transition-colors focus:outline-none"
                    style={{ backgroundColor: bg.color }}
                  >
                    {bg.url && (
                      <img src={bg.url} alt={bg.name} className="absolute inset-0 w-full h-full object-cover" />
                    )}
                    <div className="absolute inset-0 bg-black/30 flex items-end p-2 opacity-0 hover:opacity-100 transition-opacity">
                      <span className="text-white text-xs font-bold">{bg.name}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Week Select Modal */}
      {isWeekModalOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center"
          onKeyDown={(e) => { if (e.key === 'Escape') setIsWeekModalOpen(false); }}
          tabIndex={-1}
        >
          <div className="bg-white rounded-xl shadow-xl w-[460px] max-w-[90vw] flex flex-col p-6">
            {/* 헤더 */}
            <h2 className="font-bold text-xl mb-1 text-gray-800">새로운 식단표 만들기</h2>
            <p className="text-sm text-gray-500 mb-5">만들 주차를 선택하고 작업 방식을 골라주세요.</p>

            {/* 월/주차 선택 */}
            <div className="flex gap-3 mb-2">
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-600 mb-1">월 선택</label>
                <select
                  className="w-full border border-gray-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-400 focus:outline-none"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(Number(e.target.value))}
                >
                  {Array.from({length: 12}, (_, i) => i + 1).map(m => (
                    <option key={m} value={m}>{m}월</option>
                  ))}
                </select>
              </div>
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-600 mb-1">주차 선택</label>
                <select
                  className="w-full border border-gray-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-400 focus:outline-none"
                  value={selectedWeek}
                  onChange={(e) => setSelectedWeek(Number(e.target.value))}
                >
                  {[1, 2, 3, 4, 5].map(w => (
                    <option key={w} value={w}>{w}주차</option>
                  ))}
                </select>
              </div>
            </div>

            {/* 다음 주차 추천 배지 */}
            {nextAvailableWeek && (
              <button
                onClick={() => { setSelectedMonth(nextAvailableWeek.month); setSelectedWeek(nextAvailableWeek.week); }}
                className="text-xs text-blue-600 bg-blue-50 border border-blue-200 px-3 py-1 rounded-full mb-4 hover:bg-blue-100 self-start transition-colors"
              >
                다음 주차 추천: {nextAvailableWeek.month}월 {nextAvailableWeek.week}주차 →
              </button>
            )}
            {!nextAvailableWeek && <div className="mb-4" />}

            {/* 중복 경고 — 조건부 */}
            {isDuplicateSelected && (
              <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
                이미 &apos;{buildWeekTitle(selectedMonth, selectedWeek)}&apos; 기록이 존재합니다. 다른 주차를 선택해 주세요.
              </div>
            )}

            {/* 액션 카드 */}
            <div className="flex flex-col gap-2 mb-5">
              {/* 카드 1: 주차만 변경 */}
              <button
                disabled={isDuplicateSelected}
                onClick={() => {
                  const newTitle = buildWeekTitle(selectedMonth, selectedWeek);
                  setSettings({ ...settings, weekTitle: newTitle });
                  setIsWeekModalOpen(false);
                }}
                className="text-left p-4 border-2 border-gray-200 rounded-xl hover:border-blue-400 hover:bg-blue-50 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <div className="font-bold text-gray-800 text-sm mb-0.5">📝 주차만 변경</div>
                <div className="text-xs text-gray-500">현재 식단 내용을 그대로 유지하면서 주차 제목만 바꿉니다.</div>
              </button>

              {/* 카드 2: 내용 비우고 새로 만들기 */}
              <button
                disabled={isDuplicateSelected}
                onClick={() => {
                  const newTitle = buildWeekTitle(selectedMonth, selectedWeek);
                  setMenus([]);
                  setSettings({ ...settings, weekTitle: newTitle });
                  setIsWeekModalOpen(false);
                }}
                className="text-left p-4 border-2 border-gray-200 rounded-xl hover:border-red-400 hover:bg-red-50 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <div className="font-bold text-gray-800 text-sm mb-0.5">🗑️ 내용 비우고 새로 만들기</div>
                <div className="text-xs text-gray-500">현재 캔버스를 초기화하고 빈 식단표로 시작합니다.</div>
                <div className="text-xs text-red-500 mt-1">저장되지 않은 변경사항이 삭제됩니다.</div>
              </button>

              {/* 카드 3: AI 스마트 분석 */}
              <button
                disabled={isDuplicateSelected}
                onClick={() => {
                  const newTitle = buildWeekTitle(selectedMonth, selectedWeek);
                  setSettings({ ...settings, weekTitle: newTitle });
                  setMenus([]);
                  setIsWeekModalOpen(false);
                  setIsAIModalOpen(true);
                }}
                className="text-left p-4 border-2 border-purple-100 bg-purple-50 rounded-xl hover:border-purple-400 hover:bg-purple-100 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <div className="font-bold text-purple-700 text-sm mb-0.5">✨ AI 스마트 분석으로 만들기</div>
                <div className="text-xs text-purple-600">이미지나 텍스트를 AI가 분석해 식단표를 자동으로 채워줍니다.</div>
              </button>

              {/* 과거 식단 복사 */}
              {history.length > 0 && (
                <div className="mt-1">
                  <p className="text-xs text-gray-400 font-medium mb-1">과거 식단 복사해서 시작:</p>
                  <select
                    className="w-full border border-gray-300 rounded-lg p-2 text-sm text-gray-700 focus:ring-2 focus:ring-blue-400 focus:outline-none disabled:opacity-40"
                    disabled={isDuplicateSelected}
                    defaultValue=""
                    onChange={(e) => {
                      if (!e.target.value) return;
                      const src = history.find(h => String(h.id) === e.target.value);
                      if (src) {
                        const newTitle = buildWeekTitle(selectedMonth, selectedWeek);
                        setMenus(src.menus);
                        setSettings({ ...src.settings, weekTitle: newTitle, favoriteFoodIds: settings.favoriteFoodIds, historyOrder: settings.historyOrder });
                        setIsWeekModalOpen(false);
                      }
                      e.target.value = '';
                    }}
                  >
                    <option value="">선택하세요...</option>
                    {history.map(h => (
                      <option key={h.id} value={String(h.id)}>{h.weekTitle}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* 하단 안내 + 취소 버튼 */}
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-400">
                💡 변경 후 <b>적용하기</b>를 눌러야 사용자 화면에 반영됩니다.
              </p>
              <button
                onClick={() => setIsWeekModalOpen(false)}
                className="px-4 py-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 text-sm font-medium transition-colors"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Food Edit/Add Modal */}
      {isFoodModalOpen && editingFood && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
          <div className="bg-white rounded-xl shadow-xl w-[400px] max-w-[90vw] p-6">
            <h2 className="font-bold text-xl mb-4 text-gray-800">
              {foodDb.some(f => f.id === editingFood.id) ? '음식 수정' : '음식 추가'}
            </h2>
            
            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">카테고리</label>
                <select 
                  className="w-full border border-gray-300 rounded p-2 focus:ring-2 focus:ring-blue-500"
                  value={editingFood.category}
                  onChange={(e) => setEditingFood({ ...editingFood, category: e.target.value as Category })}
                >
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">음식 이름</label>
                <input 
                  type="text" 
                  className="w-full border border-gray-300 rounded p-2 focus:ring-2 focus:ring-blue-500"
                  value={editingFood.name}
                  onChange={(e) => setEditingFood({ ...editingFood, name: e.target.value })}
                  placeholder="예: 제육볶음"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">원산지 정보 (선택)</label>
                <input 
                  type="text" 
                  className="w-full border border-gray-300 rounded p-2 focus:ring-2 focus:ring-blue-500"
                  value={editingFood.origin || ''}
                  onChange={(e) => setEditingFood({ ...editingFood, origin: e.target.value })}
                  placeholder="예: 돈육: 국내산"
                />
              </div>
            </div>

            <div className="flex justify-between items-center">
              {foodDb.some(f => f.id === editingFood.id) ? (
                <button 
                  onClick={async () => {
                    if (confirm('이 음식을 삭제하시겠습니까?')) {
                      const { error } = await supabase.from('food_items').delete().eq('id', editingFood.id);
                      if (!error) {
                        setFoodDb(foodDb.filter(f => f.id !== editingFood.id));
                        setMenus(menus.map(m => ({...m, foodIds: m.foodIds.filter(id => id !== editingFood.id)})));
                        setIsFoodModalOpen(false);
                      } else {
                        alert('삭제 실패: ' + (error?.message || '알 수 없는 오류'));
                      }
                    }
                  }}
                  className="text-red-500 hover:bg-red-50 px-3 py-2 rounded text-sm font-bold"
                >
                  삭제
                </button>
              ) : <div></div>}
              <div className="flex gap-2">
                <button 
                  onClick={() => setIsFoodModalOpen(false)} 
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 font-medium"
                >
                  취소
                </button>
                <button 
                  onClick={async () => {
                    if (!editingFood.name.trim()) return alert('이름을 입력하세요.');
                    
                    const isEditing = foodDb.some(f => f.id === editingFood.id);
                    
                    // 중복 체크 (이름 기준)
                    const isDuplicate = foodDb.some(f => f.name.trim() === editingFood.name.trim() && f.id !== editingFood.id);
                    if (isDuplicate) {
                      return alert(`'${editingFood.name}'은(는) 이미 데이터베이스에 존재하는 음식입니다.`);
                    }
                    
                    if (isEditing) {
                      const { error } = await supabase
                        .from('food_items')
                        .update({ name: editingFood.name, category: editingFood.category, origin: editingFood.origin })
                        .eq('id', editingFood.id);
                      
                      if (!error) {
                        setFoodDb(foodDb.map(f => f.id === editingFood.id ? editingFood : f));
                      } else {
                        return alert('수정 실패: ' + (error?.message || '알 수 없는 오류'));
                      }
                    } else {
                      // Insert new (UUID is generated by DB)
                      const { data, error } = await supabase
                        .from('food_items')
                        .insert({ name: editingFood.name, category: editingFood.category, origin: editingFood.origin })
                        .select()
                        .single();
                      
                      if (data) {
                        setFoodDb([...foodDb, data]);
                      } else {
                        return alert('추가 실패: ' + (error?.message || '알 수 없는 오류'));
                      }
                    }
                    setIsFoodModalOpen(false);
                    setSelectedChosung('전체');
                    setSearchQuery('');
                  }} 
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 font-bold"
                >
                  저장
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* AI Smart Import Modal */}
      {isAIModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center">
          <div className="bg-white rounded-xl shadow-2xl w-[700px] max-w-[95vw] overflow-hidden flex flex-col p-6 max-h-[90vh]">
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-bold text-xl flex items-center gap-2">
                <span className="text-purple-600">✨</span> AI 스마트 식단 분석
              </h2>
              <button onClick={() => { setIsAIModalOpen(false); setAiStep('input'); }} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            
            {aiStep === 'input' ? (
              <div className="flex-1 overflow-y-auto space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-4">
                    <label className="block border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:bg-gray-50 transition-colors">
                      <input 
                        type="file" 
                        className="hidden" 
                        accept="image/*" 
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const reader = new FileReader();
                            reader.onload = (ev) => setAiImagePreview(ev.target?.result as string);
                            reader.readAsDataURL(file);
                          }
                        }}
                      />
                      <Camera className="mx-auto text-gray-400 mb-2" size={32} />
                      <span className="text-sm font-medium text-gray-600">식단표 이미지 업로드</span>
                    </label>
                    {aiImagePreview && (
                      <div className="relative aspect-video rounded-lg overflow-hidden border">
                        <img src={aiImagePreview} className="w-full h-full object-contain" />
                        <button 
                          onClick={() => setAiImagePreview(null)}
                          className="absolute top-1 right-1 bg-black/50 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs"
                        >✕</button>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-bold text-gray-700 mb-2">또는 텍스트 입력</span>
                    <textarea 
                      className="flex-1 border border-gray-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-purple-500 focus:outline-none font-mono"
                      placeholder="이미지 없이 텍스트만 분석하려면 여기에 붙여넣으세요..."
                      value={aiInputText}
                      onChange={(e) => setAiInputText(e.target.value)}
                    ></textarea>
                  </div>
                </div>

                <button 
                  onClick={async () => {
                    if (!aiImagePreview && !aiInputText) return alert('이미지를 업로드하거나 텍스트를 입력해주세요.');
                    
                    setIsAnalyzing(true);
                    try {
                      const response = await fetch('/api/ai/analyze', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          image: aiImagePreview ? aiImagePreview.split(',')[1] : null,
                          text: aiInputText
                        })
                      });

                      if (!response.ok) {
                        const errorData = await response.json();
                        throw new Error(errorData.error || '분석 중 오류가 발생했습니다.');
                      }

                      const data = await response.json();

                      // 리뷰 목록 구성
                      const foodsFromAI = data.all_extracted_foods || data.new_foods || [];
                      setReviewFoods(foodsFromAI.map((f: any) => {
                        const name = f.name.trim();
                        const alreadyExists = foodDb.some(db => db.name.trim() === name);
                        return {
                          ...f,
                          name,
                          checked: !alreadyExists // DB에 없으면 자동으로 체크
                        };
                      }));
                      setExtractedMenuData(data.menus || []);
                      setAiStep('review');
                    } catch (err: any) {
                      console.error(err);
                      alert('AI 분석 실패: ' + err.message);
                    } finally {
                      setIsAnalyzing(false);
                    }
                  }}
                  disabled={isAnalyzing}
                  className={`w-full py-4 rounded-xl font-bold text-white shadow-lg transition-all ${isAnalyzing ? 'bg-gray-400' : 'bg-purple-600 hover:bg-purple-700'}`}
                >
                  {isAnalyzing ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      AI가 이미지 분석 중...
                    </span>
                  ) : 'Gemini AI로 정밀 분석 시작'}
                </button>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto flex flex-col">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="font-bold text-gray-700">분석 결과 리뷰 및 확인</h3>
                  <p className="text-xs text-gray-500">카테고리를 확인하고 추가할 음식을 선택하세요.</p>
                </div>

                <div className="flex-1 border rounded-lg overflow-y-auto flex flex-col bg-gray-50 min-h-[300px]">
                  <table className="w-full text-sm border-collapse">
                    <thead className="bg-gray-100 sticky top-0 z-10">
                      <tr>
                        <th className="p-2 border-b w-10"><input type="checkbox" onChange={(e) => setReviewFoods(reviewFoods.map(f => ({...f, checked: e.target.checked})))} checked={reviewFoods.every(f => f.checked)} /></th>
                        <th className="p-2 border-b text-left">음식 이름</th>
                        <th className="p-2 border-b text-left w-24">카테고리</th>
                        <th className="p-2 border-b text-left">원산지</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reviewFoods.map((food, idx) => (
                        <tr key={idx} className={`hover:bg-white transition-colors ${!food.checked ? 'opacity-50' : ''}`}>
                          <td className="p-2 border-b text-center">
                            <input 
                              type="checkbox" 
                              checked={food.checked} 
                              onChange={(e) => {
                                const newFoods = [...reviewFoods];
                                newFoods[idx].checked = e.target.checked;
                                setReviewFoods(newFoods);
                              }}
                            />
                          </td>
                          <td className="p-2 border-b">
                            <input 
                              type="text" 
                              className="w-full bg-transparent border-none focus:ring-1 focus:ring-purple-300 rounded px-1"
                              value={food.name}
                              onChange={(e) => {
                                const newFoods = [...reviewFoods];
                                newFoods[idx].name = e.target.value;
                                setReviewFoods(newFoods);
                              }}
                            />
                          </td>
                          <td className="p-2 border-b">
                            <select 
                              className="bg-transparent border-none text-xs focus:ring-1 focus:ring-purple-300 rounded"
                              value={food.category}
                              onChange={(e) => {
                                const newFoods = [...reviewFoods];
                                newFoods[idx].category = e.target.value as Category;
                                setReviewFoods(newFoods);
                              }}
                            >
                              <option value="밥">밥</option>
                              <option value="국">국</option>
                              <option value="반찬">반찬</option>
                              <option value="기타">기타</option>
                            </select>
                          </td>
                          <td className="p-2 border-b">
                            <input 
                              type="text" 
                              className="w-full bg-transparent border-none focus:ring-1 focus:ring-purple-300 rounded px-1 text-xs"
                              value={food.origin || ''}
                              onChange={(e) => {
                                const newFoods = [...reviewFoods];
                                newFoods[idx].origin = e.target.value;
                                setReviewFoods(newFoods);
                              }}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {reviewFoods.length === 0 && (
                    <div className="p-8 text-center text-gray-400">인식된 새로운 음식이 없습니다.</div>
                  )}
                </div>

                <div className="flex gap-2 mt-4">
                  <button 
                    onClick={() => setAiStep('input')}
                    className="px-6 py-3 bg-gray-200 text-gray-700 rounded-lg font-bold hover:bg-gray-300"
                  >
                    이전으로
                  </button>
                  <button 
                    onClick={async () => {
                      setIsAnalyzing(true);
                      try {
                        const foodsToInsert = reviewFoods.filter(f => f.checked).map(({checked, ...rest}) => rest);
                        let finalFoodDb = [...foodDb];
                        
                        // 1. 선택한 신규 음식 DB 추가
                        if (foodsToInsert.length > 0) {
                          const { data, error } = await supabase.from('food_items').insert(foodsToInsert).select();
                          if (error) throw error;
                          if (data) finalFoodDb = [...finalFoodDb, ...data];
                        }
                        setFoodDb(finalFoodDb);

                        // 2. 추출된 메뉴 데이터로 식단표 구성
                        const newMenus: MealEntry[] = extractedMenuData.map(item => {
                          const foodIds = item.foods.map(name => {
                            const cleanName = name.includes('(') ? name.split('(')[0].trim() : name.trim();
                            // 리뷰에서 수정된 이름이 있을 수 있으므로 매칭 주의 (단순화를 위해 원본 이름 기준)
                            return finalFoodDb.find(f => f.name === cleanName || cleanName.includes(f.name))?.id;
                          }).filter(Boolean) as string[];

                          return {
                            id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
                            day: item.day,
                            time: item.time,
                            foodIds
                          };
                        });

                        setMenus(newMenus);
                        alert(`DB에 ${foodsToInsert.length}개의 음식을 추가하고 식단표 구성을 완료했습니다!`);
                        setIsAIModalOpen(false);
                        setAiStep('input');
                      } catch (err: any) {
                        alert('최종 저장 실패: ' + err.message);
                      } finally {
                        setIsAnalyzing(false);
                      }
                    }}
                    className="flex-1 py-3 bg-purple-600 text-white rounded-lg font-bold hover:bg-purple-700 shadow-lg"
                  >
                    데이터베이스 추가 및 식단표 반영
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Today's Lunch Upload Modal */}

      {/* Today's Lunch Upload Modal */}
      {isLunchModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
          <div className="bg-white rounded-xl shadow-xl w-[450px] max-w-[90vw] overflow-hidden flex flex-col">
            <div className="p-4 border-b flex justify-between items-center bg-orange-500">
              <div>
                <h2 className="font-bold text-lg text-white">오늘의 점심 업로드</h2>
                <p className="text-orange-100 text-sm">{new Date().getFullYear()}년 {new Date().getMonth() + 1}월 {new Date().getDate()}일 ({['일','월','화','수','목','금','토'][new Date().getDay()]}요일)</p>
              </div>
              <button onClick={() => setIsLunchModalOpen(false)} className="text-white hover:text-orange-200 text-xl">✕</button>
            </div>
            
            <div className="p-6">
              {todayLunch.imageUrl ? (
                <div className="relative rounded-lg overflow-hidden mb-4 border border-gray-200 bg-black">
                  <img src={todayLunch.imageUrl} alt="오늘의 점심" className="w-full object-contain" style={{ aspectRatio: '1000/1350' }} />
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-3">
                    <p className="text-white text-sm font-medium">{todayLunch.date} 점심</p>
                  </div>
                </div>
              ) : (
                <div className="w-full aspect-[4/3] bg-gray-100 rounded-lg border-2 border-dashed border-gray-300 flex flex-col items-center justify-center mb-4">
                  <Camera size={48} className="text-gray-300 mb-2" />
                  <p className="text-gray-400 text-sm">아직 사진이 없습니다</p>
                </div>
              )}

              <label className="w-full bg-orange-500 text-white py-3 rounded-lg flex items-center justify-center gap-2 cursor-pointer hover:bg-orange-600 transition-colors font-bold">
                <ImagePlus size={20} />
                {todayLunch.imageUrl ? '사진 변경하기' : '사진 업로드하기'}
                <input type="file" className="hidden" accept="image/*" onChange={(e) => {
                  handleLunchImageUpload(e);
                }} />
              </label>

              {todayLunch.imageUrl && (
                <button 
                  onClick={() => {
                    setTodayLunch({ ...todayLunch, imageUrl: '' });
                  }}
                  className="w-full mt-2 py-2 text-red-500 hover:bg-red-50 rounded-lg text-sm font-medium transition-colors"
                >
                  사진 삭제
                </button>
              )}
            </div>

            <div className="p-4 border-t bg-gray-50 flex justify-end">
              <button 
                onClick={() => setIsLunchModalOpen(false)} 
                className="px-6 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 font-bold"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 배추김치 일괄 적용 모달 */}
      {isKimchiModalOpen && pendingKimchiDrop && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
          <div className="bg-white rounded-xl shadow-2xl w-[420px] max-w-[90vw] overflow-hidden">
            <div className="bg-gradient-to-r from-green-500 to-green-600 p-5 text-center">
              <div className="text-4xl mb-2">🥬</div>
              <h2 className="text-xl font-bold text-white">배추김치 일괄 적용</h2>
            </div>
            <div className="p-6">
              <p className="text-gray-700 text-center mb-6 leading-relaxed">
                모든 식단 <span className="font-bold text-green-600">(월~일 아침/점심/저녁)</span>에<br/>
                배추김치를 한 번에 적용하시겠습니까?
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    if (pendingKimchiDrop) {
                      addFoodToCell(pendingKimchiDrop.foodId, pendingKimchiDrop.day, pendingKimchiDrop.time);
                    }
                    setIsKimchiModalOpen(false);
                    setPendingKimchiDrop(null);
                  }}
                  className="flex-1 py-3 bg-gray-200 text-gray-700 rounded-lg font-bold hover:bg-gray-300 transition-colors"
                >
                  이 칸에만 적용
                </button>
                <button
                  onClick={() => {
                    if (pendingKimchiDrop) {
                      applyKimchiToAll(pendingKimchiDrop.foodId);
                    }
                    setIsKimchiModalOpen(false);
                    setPendingKimchiDrop(null);
                  }}
                  className="flex-1 py-3 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-lg font-bold hover:from-green-600 hover:to-green-700 transition-all shadow-md"
                >
                  ✅ 전체 일괄 적용
                </button>
              </div>
              <button
                onClick={() => {
                  setIsKimchiModalOpen(false);
                  setPendingKimchiDrop(null);
                }}
                className="w-full mt-3 py-2 text-gray-400 hover:text-gray-600 text-sm transition-colors"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}

      {/* History Management Modal */}
      {isHistoryManageModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
          <div className="bg-white rounded-xl shadow-xl w-[500px] max-w-[90vw] flex flex-col" style={{maxHeight: '70vh'}}>
            <div className="p-4 border-b flex justify-between items-center bg-gray-50 shrink-0">
              <h2 className="font-bold text-lg flex items-center gap-2">
                <History size={20} className="text-gray-600" />
                저장된 식단 기록 관리
              </h2>
              <button onClick={() => setIsHistoryManageModalOpen(false)} className="text-gray-500 hover:text-gray-800">✕</button>
            </div>

            <div className="p-4 overflow-y-auto flex-1 min-h-0">
              {history.length === 0 ? (
                <div className="text-center py-10 text-gray-400">
                  저장된 기록이 없습니다.
                </div>
              ) : (
                <DndContext 
                  sensors={sensors} 
                  collisionDetection={closestCenter} 
                  onDragEnd={handleHistoryDragEnd}
                >
                  <SortableContext 
                    items={history.map(h => h.id)} 
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="space-y-2">
                      {history.map((h) => (
                        <SortableHistoryItem 
                          key={h.id} 
                          h={h} 
                          onUpdate={(entry) => {
                            setMenus(entry.menus);
                            setSettings({
                              ...entry.settings,
                              favoriteFoodIds: settings.favoriteFoodIds,
                              historyOrder: settings.historyOrder,
                            });
                            if (entry.todayLunch) setTodayLunch(entry.todayLunch);
                            setIsHistoryManageModalOpen(false);
                          }}
                          onDelete={handleDeleteHistory}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              )}
            </div>
            
            <div className="p-4 border-t bg-gray-50 text-center shrink-0">
              <button
                onClick={() => setIsHistoryManageModalOpen(false)}
                className="w-full py-2 bg-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-300 transition-colors"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      <DragOverlay zIndex={9999}>
        {activeFoodItem ? (
          <div className="bg-blue-100 border-blue-500 border p-3 rounded shadow-lg text-sm font-medium cursor-grabbing pointer-events-none scale-105 transition-transform flex items-center gap-2">
            <span className="font-bold text-gray-800">{activeFoodItem.name}</span>
            {activeFoodItem.origin && <span className="text-xs text-gray-500">({activeFoodItem.origin})</span>}
          </div>
        ) : null}
      </DragOverlay>

    </div>
    </DndContext>

    {cropImageSrc && (
      <ImageCropModal
        imageSrc={cropImageSrc}
        onConfirm={handleCropConfirm}
        onClose={() => setCropImageSrc(null)}
      />
    )}
    </>
  );
}

// 히스토리 항목 소트 가능 컴포넌트
function SortableHistoryItem({ h, onUpdate, onDelete }: { h: HistoryEntry, onUpdate: (h: HistoryEntry) => void, onDelete: (id: number) => void }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: h.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 100 : 0,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div 
      ref={setNodeRef} 
      style={style}
      className="flex items-center justify-between p-3 border rounded-lg bg-white hover:bg-gray-50 transition-colors group"
    >
      <div className="flex items-center gap-3 flex-1">
        <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing p-1 text-gray-400 hover:text-gray-600">
          <List size={18} />
        </div>
        <div className="flex flex-col">
          <span className="font-bold text-gray-800">{h.weekTitle}</span>
          <span className="text-[10px] text-gray-400">ID: {h.id}</span>
        </div>
      </div>
      <div className="flex gap-2">
        <button 
          onClick={() => onUpdate(h)}
          className="px-3 py-1 bg-blue-50 text-blue-600 rounded text-xs font-bold hover:bg-blue-100"
        >
          불러오기
        </button>
        <button 
          onClick={() => onDelete(h.id)}
          className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded"
          title="삭제"
        >
          <Trash2 size={18} />
        </button>
      </div>
    </div>
  );
}

function DraggableGridFood({ 
  food, day, time, idx, total, onRemove, onEdit 
}: { 
  food: any, day: string, time: string, idx: number, total: number,
  onRemove: () => void,
  onEdit: () => void
}) {
  const itemId = `grid-${day}-${time}-${food.id}-${idx}`;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: itemId,
    data: { source: 'grid', day, time, foodId: food.id, idx }
  });
  
  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    zIndex: isDragging ? 100 : 0,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div 
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`text-[11px] text-center relative group w-full flex flex-col items-center hover:bg-orange-50 hover:ring-1 hover:ring-orange-200 rounded p-1 transition-all cursor-grab active:cursor-grabbing ${isDragging ? 'z-50 opacity-50 shadow-lg' : ''}`}
    >
      <div className="font-bold text-gray-800 leading-tight" style={{ wordBreak: 'keep-all', overflowWrap: 'break-word' }}>{food.name}</div>
      {food.origin && <div className="text-[9px] text-gray-500 leading-tight">({food.origin})</div>}
      
      {/* 액션 버튼 패널 */}
      <div className="absolute -right-1 -top-1 opacity-0 group-hover:opacity-100 transition-opacity bg-white/90 shadow-sm rounded border border-gray-200 p-0.5 z-10 flex gap-0.5">
        <button 
          onPointerDown={(e) => { e.stopPropagation(); onEdit?.(); }}
          className="bg-blue-500 text-white rounded w-4 h-4 flex items-center justify-center text-[10px]"
          title="수정"
        ><Edit2 size={10} /></button>
        <button 
          onPointerDown={(e) => { e.stopPropagation(); onRemove?.(); }}
          className="bg-red-500 text-white rounded w-4 h-4 flex items-center justify-center text-[10px]"
          title="삭제"
        >✕</button>
      </div>
    </div>
  );
}

function DraggableGridFoodMobile({ 
  food, day, time, idx, total, onRemove, onEdit 
}: { 
  food: any, day: string, time: string, idx: number, total: number,
  onRemove: () => void,
  onEdit: () => void
}) {
  const itemId = `grid-mobile-${day}-${time}-${food.id}-${idx}`;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: itemId,
    data: { source: 'grid', day, time, foodId: food.id, idx }
  });
  
  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    zIndex: isDragging ? 100 : 0,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div 
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`text-[9px] text-center relative group w-full flex items-center justify-center gap-0.5 hover:bg-orange-50 hover:ring-1 hover:ring-orange-200 rounded py-0.5 transition-all cursor-grab active:cursor-grabbing ${isDragging ? 'z-50 opacity-50 shadow-lg' : ''}`}
    >
      <span 
        className="font-bold text-gray-800 leading-tight cursor-pointer"
        onClick={(e) => { e.stopPropagation(); onEdit(); }}
      >
        {food.name}
      </span>
      <button 
        onPointerDown={(e) => { e.stopPropagation(); onRemove(); }}
        className="text-red-400 text-[8px] font-bold"
      >✕</button>
    </div>
  );
}
