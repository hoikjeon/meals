"use client";

import React, { useState, useRef, useEffect } from 'react';
import { DndContext, DragEndEvent, DragOverlay, useSensor, useSensors, PointerSensor, DragStartEvent } from '@dnd-kit/core';
import { dummyFoodItems, dummyWeeklyMenus, dummySettings, dummyTodayLunch } from '@/lib/dummyData';
import { FoodItem, MealEntry, DayOfWeek, MealTime } from '@/lib/types';
import { DroppableCell } from './DroppableCell';
import { DraggableFoodItem } from './DraggableFoodItem';
import { ImagePlus, Download, BellRing, Save, ArrowLeft, Trash2, Plus, ChevronLeft, ChevronRight, Camera, Lock, Eye, EyeOff } from 'lucide-react';
import { toPng } from 'html-to-image';
import jsPDF from 'jspdf';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

const ADMIN_ID = 'ys';
const ADMIN_PW = 'ys1004!';

const DAYS: DayOfWeek[] = ['월', '화', '수', '목', '금', '토', '일'];
const TIMES: MealTime[] = ['아침', '점심', '저녁'];
const CATEGORIES = ['밥', '국', '반찬'] as const;
const CHOSUNGS = ['전체', 'ㄱ', 'ㄴ', 'ㄷ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅅ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];

const getChosungGroup = (char: string) => {
  const mapping = ['ㄱ', 'ㄱ', 'ㄴ', 'ㄷ', 'ㄷ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅂ', 'ㅅ', 'ㅅ', 'ㅇ', 'ㅈ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
  const code = char.charCodeAt(0) - 0xAC00;
  if (code > -1 && code < 11172) return mapping[Math.floor(code / 588)];
  return '';
};

const PRESET_BACKGROUNDS = [
  { id: 'bg1', name: '단색 (기본 노랑)', url: null, color: '#FFF6E5' },
  { id: 'bg2', name: '봄꽃 (분홍)', url: 'https://images.unsplash.com/photo-1490750967868-88aa4486c946?q=80&w=800&auto=format&fit=crop', color: '#fff' },
  { id: 'bg3', name: '자연 (초록)', url: 'https://images.unsplash.com/photo-1518531933037-91b2f5f229cc?q=80&w=800&auto=format&fit=crop', color: '#fff' },
  { id: 'bg4', name: '가을 (단풍)', url: 'https://images.unsplash.com/photo-1507371341162-763b5e419408?q=80&w=800&auto=format&fit=crop', color: '#fff' },
  { id: 'bg5', name: '겨울 (눈)', url: 'https://images.unsplash.com/photo-1478265409131-1f65c88f965c?q=80&w=800&auto=format&fit=crop', color: '#fff' },
];

export default function MealAdminView() {
  // 로그인 상태
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loginId, setLoginId] = useState('');
  const [loginPw, setLoginPw] = useState('');
  const [loginError, setLoginError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // 기존 상태들 (훅 규칙 준수를 위해 early return 전에 선언)
  const [menus, setMenus] = useState<MealEntry[]>(dummyWeeklyMenus);
  const [settings, setSettings] = useState(dummySettings);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'밥' | '국' | '반찬'>('반찬');
  const [bgImageFile, setBgImageFile] = useState<string | null>(null);
  const [todayLunch, setTodayLunch] = useState(dummyTodayLunch);
  const [foodDb, setFoodDb] = useState<FoodItem[]>(dummyFoodItems);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isBgModalOpen, setIsBgModalOpen] = useState(false);
  const [isWeekModalOpen, setIsWeekModalOpen] = useState(false);
  const [isFoodModalOpen, setIsFoodModalOpen] = useState(false);
  const [editingFood, setEditingFood] = useState<FoodItem | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedWeek, setSelectedWeek] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedChosung, setSelectedChosung] = useState('전체');
  const [history, setHistory] = useState<any[]>([]);
  const [isLunchModalOpen, setIsLunchModalOpen] = useState(false);
  const [isMobileFoodPanelOpen, setIsMobileFoodPanelOpen] = useState(false);
  const [isKimchiModalOpen, setIsKimchiModalOpen] = useState(false);
  const [pendingKimchiDrop, setPendingKimchiDrop] = useState<{foodId: string; day: DayOfWeek; time: MealTime} | null>(null);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);

  const canvasRef = useRef<HTMLDivElement>(null);

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
      const { data: stateData, error: stateError } = await supabase
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
      const { data: historyData, error: historyError } = await supabase
        .from('meal_history')
        .select('*');
      
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
        setHistory(sorted.map(h => ({
          id: h.id,
          weekTitle: h.week_title,
          menus: h.menus,
          settings: h.settings,
          todayLunch: h.today_lunch
        })));
      }

      setIsLoaded(true);
    };

    fetchData();
  }, []);

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
            <div className="w-16 h-16 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center mx-auto mb-3">
              <Lock size={32} className="text-white" />
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

  const handleSave = async () => {
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
      return alert('저장 실패: ' + (stateError?.message || '알 수 없는 오류'));
    }

    // 2. 히스토리에 추가
    const { error: historyError } = await supabase
      .from('meal_history')
      .insert({
        week_title: settings.weekTitle,
        menus,
        settings,
        today_lunch: todayLunch
      });

    if (historyError) {
      console.warn('Error saving history:', historyError);
    }

    // 3. 최신 히스토리 다시 불러오기
    const { data: historyData } = await supabase.from('meal_history').select('*');
    if (historyData) {
       setHistory(historyData.map(h => ({
          id: h.id,
          weekTitle: h.week_title,
          menus: h.menus,
          settings: h.settings,
          todayLunch: h.today_lunch
        })));
    }

    alert('저장되었습니다! 일반 사용자 화면에 반영됩니다.');
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
    if (confirm(`'${selected.weekTitle}' 식단표를 불러오시겠습니까?\n저장하지 않은 캔버스의 변경사항은 덮어씌워집니다.`)) {
      setMenus(selected.menus);
      setSettings(selected.settings);
      if (selected.todayLunch) setTodayLunch(selected.todayLunch);
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
      const foodId = active.id as string;
      const food = foodDb.find(f => f.id === foodId);
      // over.id format: "day-time" (e.g., "월-아침")
      const [day, time] = (over.id as string).split('-') as [DayOfWeek, MealTime];

      // 배추김치 특별 처리 - 커스텀 모달로 확인
      if (food && food.name === '배추김치') {
        setPendingKimchiDrop({ foodId, day, time });
        setIsKimchiModalOpen(true);
        return;
      }

      addFoodToCell(foodId, day, time);
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
        setSettings({ ...settings, backgroundImageUrl: url });
        setIsBgModalOpen(false);
      };
      reader.readAsDataURL(file);
    }
  };

  const applyPresetBackground = (url: string | null, color: string) => {
    setSettings({ ...settings, backgroundImageUrl: url, backgroundColor: color });
    setIsBgModalOpen(false);
  };

  const handleLunchImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const url = event.target?.result as string;
        const updated = { ...todayLunch, imageUrl: url, date: new Date().toISOString().split('T')[0] };
        setTodayLunch(updated);
        
        // Supabase에 즉시 반영
        supabase.from('current_meal_state').upsert({
          id: 1,
          menus,
          settings,
          today_lunch: updated,
          updated_at: new Date().toISOString()
        }).then(({ error }) => {
          if (error) console.error('Error auto-saving lunch image:', error);
        });
      };
      reader.readAsDataURL(file);
    }
  };

  const handlePdfDownload = async () => {
    if (!canvasRef.current) return;
    try {
      const filter = (node: HTMLElement) => {
        const exclusionClasses = ['ignore-pdf'];
        return !exclusionClasses.some(cls => node.classList?.contains(cls));
      };

      const imgData = await toPng(canvasRef.current, { 
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
      const pdfHeight = (canvasRef.current.offsetHeight * pdfWidth) / canvasRef.current.offsetWidth;
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save('주간식단표.pdf');
    } catch (error) {
      console.error("PDF 생성 실패", error);
      alert("PDF 생성 중 오류가 발생했습니다.");
    }
  };

  const activeFoodItem = foodDb.find(f => f.id === activeId);

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
    if (f.category !== activeTab) return false;
    if (showFavoritesOnly && !(settings.favoriteFoodIds || []).includes(f.id)) return false;
    if (searchQuery && !f.name.includes(searchQuery)) return false;
    if (selectedChosung !== '전체') {
      const chosung = getChosungGroup(f.name.charAt(0));
      if (chosung !== selectedChosung) return false;
    }
    return true;
  });

  if (!isLoaded) return <div className="h-screen flex items-center justify-center">로딩중...</div>;

  return (
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
            <h1 className="text-base md:text-2xl font-bold text-gray-800">식단표 관리</h1>
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
            <button onClick={handleReset} className="bg-red-500 text-white p-2 md:px-3 md:py-2 rounded shadow text-sm font-medium hover:bg-red-600 flex items-center gap-2" title="새로 만들기">
              <Plus size={16} />
              <span className="hidden md:inline">새로 만들기</span>
            </button>
            <button onClick={handlePdfDownload} className="bg-blue-600 text-white p-2 md:px-3 md:py-2 rounded shadow text-sm font-medium hover:bg-blue-700 flex items-center gap-2 hidden md:flex" title="PDF 다운로드">
              <Download size={16} />
              <span className="hidden md:inline">PDF 다운로드</span>
            </button>
            <button onClick={handleSave} className="bg-green-600 text-white p-2 md:px-3 md:py-2 rounded shadow text-sm font-medium hover:bg-green-700 flex items-center gap-2" title="적용하기">
              <Save size={16} />
              <span className="hidden md:inline">적용하기</span>
            </button>
          </div>
        </div>

        {/* 모바일 전용 식단 편집 */}
        <div className="md:hidden w-full mb-4">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="text-center p-3 border-b border-gray-200">
              <h2 className="text-lg font-bold" style={{ color: settings.titleColor || '#f97316' }}>연세척 주간 식단표</h2>
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
                            <DroppableCell id={`${day}-${time}`}>
                              <div className="min-h-[70px] flex flex-col gap-1 items-center">
                                {foods.map((food, idx) => food && (
                                  <div key={food.id} className="text-[9px] text-center relative group w-full flex items-center justify-center gap-0.5 hover:bg-orange-50 hover:ring-1 hover:ring-orange-200 rounded py-0.5 transition-all cursor-pointer">
                                    <div className="flex flex-col">
                                      {idx > 0 && <button onClick={(e) => { e.stopPropagation(); moveFood(day, time, food.id, 'up'); }} className="text-[7px] leading-none text-blue-400 hover:text-blue-600">▲</button>}
                                      {idx < foods.length - 1 && <button onClick={(e) => { e.stopPropagation(); moveFood(day, time, food.id, 'down'); }} className="text-[7px] leading-none text-blue-400 hover:text-blue-600">▼</button>}
                                    </div>
                                    <span className="font-bold text-gray-800 leading-tight">{food.name}</span>
                                    <button 
                                      onClick={(e) => { e.stopPropagation(); removeFood(day, time, food.id); }}
                                      className="text-red-400 text-[8px] font-bold"
                                    >✕</button>
                                  </div>
                                ))}
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
        <div className="hidden md:block">
        <div 
          ref={canvasRef}
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
              <div className="flex items-center justify-center gap-3 mb-2">
                <h2 className="text-3xl font-black drop-shadow-md" style={{ color: settings.titleColor || '#f97316' }}>연세척 주간 식단표</h2>
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
                          <DroppableCell id={`${day}-${time}`}>
                            <div className="min-h-[160px] h-full p-2 flex flex-col gap-2 items-center justify-start overflow-hidden">
                              {foods.map((food, idx) => food && (
                                <div key={food.id} className="text-[11px] text-center relative group w-full flex flex-col items-center hover:bg-orange-50 hover:ring-1 hover:ring-orange-200 rounded p-1 transition-all cursor-pointer">
                                  <div className="font-bold text-gray-800 leading-tight break-keep">{food.name}</div>
                                  {food.origin && <div className="text-[9px] text-gray-500 leading-tight">({food.origin})</div>}
                                  
                                  {/* 순서 변경 및 삭제 버튼 패널 */}
                                  <div className="absolute -right-1 -top-1 flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity bg-white/90 shadow-sm rounded border border-gray-200 p-0.5 z-10">
                                    <button 
                                      onClick={(e) => { e.stopPropagation(); removeFood(day, time, food.id); }}
                                      className="bg-red-500 text-white rounded w-4 h-4 flex items-center justify-center text-[10px]"
                                      title="삭제"
                                    >✕</button>
                                    {idx > 0 && (
                                      <button 
                                        onClick={(e) => { e.stopPropagation(); moveFood(day, time, food.id, 'up'); }}
                                        className="bg-blue-500 text-white rounded w-4 h-4 flex items-center justify-center text-[10px]"
                                        title="위로"
                                      >▲</button>
                                    )}
                                    {idx < foods.length - 1 && (
                                      <button 
                                        onClick={(e) => { e.stopPropagation(); moveFood(day, time, food.id, 'down'); }}
                                        className="bg-blue-500 text-white rounded w-4 h-4 flex items-center justify-center text-[10px]"
                                        title="아래로"
                                      >▼</button>
                                    )}
                                  </div>
                                </div>
                              ))}
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
                  className="text-[10px] bg-gray-100 hover:bg-gray-200 text-gray-600 px-2 py-1 rounded border border-gray-300 transition-colors font-bold"
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
              onChange={(e) => setSearchQuery(e.target.value)}
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
                  if (selected && confirm(`'${selected.weekTitle}' 식단표를 불러오시겠습니까?\n현재 캔버스에 있는 내용은 덮어씌워집니다.`)) {
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
            <p className="text-[10px] text-gray-500 mt-1">* 적용하기를 누를 때마다 과거 식단에 저장됩니다.</p>
          </div>
        )}
      </div>

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
            {/* 모바일 점심 업로드 + 히스토리 */}
            <div className="p-3 border-t border-gray-200 flex gap-2">
              <button 
                onClick={() => { setIsLunchModalOpen(true); setIsMobileFoodPanelOpen(false); }}
                className="flex-1 bg-orange-500 text-white py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-1"
              >
                <Camera size={16} /> 점심 사진
              </button>
              {history.length > 0 && (
                <select 
                  className="flex-1 bg-white border border-gray-300 rounded-lg px-2 py-2 text-xs text-gray-700"
                  onChange={(e) => {
                    if (e.target.value) {
                      const selected = history.find(h => h.id === Number(e.target.value));
                      if (selected && confirm(`'${selected.weekTitle}' 식단표를 불러오시겠습니까?`)) {
                        setMenus(selected.menus);
                        setSettings(selected.settings);
                        if (selected.todayLunch) setTodayLunch(selected.todayLunch);
                      }
                      e.target.value = "";
                    }
                  }}
                >
                  <option value="">과거 식단 불러오기</option>
                  {history.map(h => <option key={h.id} value={h.id}>{h.weekTitle}</option>)}
                </select>
              )}
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
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
          <div className="bg-white rounded-xl shadow-xl w-[400px] max-w-[90vw] overflow-hidden flex flex-col p-6">
            <h2 className="font-bold text-xl mb-2 text-gray-800">새로운 식단표 만들기</h2>
            <p className="text-sm text-red-500 mb-6">주의: 현재 캔버스에 작성된 식단 데이터가 모두 지워집니다.</p>
            
            <div className="flex gap-4 mb-6">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">월 선택</label>
                <select 
                  className="w-full border border-gray-300 rounded p-2 focus:ring-2 focus:ring-blue-500"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(Number(e.target.value))}
                >
                  {Array.from({length: 12}, (_, i) => i + 1).map(m => (
                    <option key={m} value={m}>{m}월</option>
                  ))}
                </select>
              </div>
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">주차 선택</label>
                <select 
                  className="w-full border border-gray-300 rounded p-2 focus:ring-2 focus:ring-blue-500"
                  value={selectedWeek}
                  onChange={(e) => setSelectedWeek(Number(e.target.value))}
                >
                  {[1, 2, 3, 4, 5].map(w => (
                    <option key={w} value={w}>{w}주차</option>
                  ))}
                </select>
              </div>
            </div>

            <p className="text-xs text-gray-500 mb-6">
              💡 초기화 후 상단의 초록색 <b>[적용하기]</b> 버튼을 누르셔야 실제 사용자 화면에 반영됩니다.
            </p>

            <div className="flex justify-end gap-2 mt-2">
              <button 
                onClick={() => setIsWeekModalOpen(false)} 
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 font-medium"
              >
                취소
              </button>
              <button 
                onClick={() => {
                  // setMenus([]) 를 호출하지 않아 기존 메뉴를 유지함
                  setSettings({ ...settings, weekTitle: `${selectedMonth}월 ${selectedWeek}주차 식단표` });
                  setIsWeekModalOpen(false);
                }} 
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 font-bold"
              >
                확인 및 내용 유지
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
                  onChange={(e) => setEditingFood({ ...editingFood, category: e.target.value as '밥' | '국' | '반찬' })}
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
                <div className="relative rounded-lg overflow-hidden mb-4 border border-gray-200">
                  <img src={todayLunch.imageUrl} alt="오늘의 점심" className="w-full aspect-[4/3] object-cover" />
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
  );
}
