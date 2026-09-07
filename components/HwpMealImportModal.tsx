"use client";

import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileText, FileUp, LoaderCircle, UploadCloud, X } from 'lucide-react';
import { DAYS } from '@/lib/dateUtils';
import { HwpMealPlan, parseHwpMealFile } from '@/lib/hwpMealParser';
import type { DayOfWeek, MealTime } from '@/lib/types';

const TIMES: MealTime[] = ['아침', '점심', '저녁'];

type HwpMealImportModalProps = {
  fallbackYear: number;
  onApply: (plan: HwpMealPlan) => Promise<boolean>;
  onClose: () => void;
};

const getErrorMessage = (error: unknown) => (
  error instanceof Error ? error.message : 'HWP 파일을 분석하지 못했습니다.'
);

export default function HwpMealImportModal({
  fallbackYear,
  onApply,
  onClose,
}: HwpMealImportModalProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [plan, setPlan] = useState<HwpMealPlan | null>(null);
  const [error, setError] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [isApplying, setIsApplying] = useState(false);

  const isBusy = isParsing || isApplying;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isBusy) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isBusy, onClose]);

  const analyzeFile = async (file?: File) => {
    if (!file) return;

    setError('');
    setPlan(null);
    setIsParsing(true);

    try {
      const parsedPlan = await parseHwpMealFile(file, fallbackYear);
      setPlan(parsedPlan);
    } catch (parseError) {
      console.error('HWP meal import failed:', parseError);
      setError(getErrorMessage(parseError));
    } finally {
      setIsParsing(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const handleApply = async () => {
    if (!plan) return;
    setError('');
    setIsApplying(true);

    try {
      const applied = await onApply(plan);
      if (applied) onClose();
    } catch (applyError) {
      console.error('HWP meal apply failed:', applyError);
      setError(getErrorMessage(applyError));
    } finally {
      setIsApplying(false);
    }
  };

  const foodsFor = (time: MealTime, day: DayOfWeek) => (
    plan?.menus.find((menu) => menu.time === time && menu.day === day)?.foods || []
  );

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/55 p-3 md:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="hwp-import-title"
    >
      <div className="flex max-h-[94vh] w-full max-w-[1180px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-200 bg-slate-50 px-5 py-4">
          <div>
            <h2 id="hwp-import-title" className="flex items-center gap-2 text-lg font-extrabold text-slate-800 md:text-xl">
              <FileUp className="text-blue-600" size={22} />
              한글 식단표 가져오기
            </h2>
            <p className="mt-1 text-xs text-slate-500 md:text-sm">파일은 브라우저 안에서 분석되며 외부 AI로 전송되지 않습니다.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isBusy}
            className="rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="닫기"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          {!plan && (
            <div className="mx-auto max-w-2xl">
              <button
                type="button"
                onClick={() => !isParsing && inputRef.current?.click()}
                onDragOver={(event) => {
                  event.preventDefault();
                  if (!isParsing) setIsDragOver(true);
                }}
                onDragLeave={(event) => {
                  event.preventDefault();
                  setIsDragOver(false);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  setIsDragOver(false);
                  if (!isParsing) void analyzeFile(event.dataTransfer.files?.[0]);
                }}
                disabled={isParsing}
                className={`flex min-h-72 w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-12 text-center transition-all ${
                  isDragOver
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-slate-300 bg-slate-50 hover:border-blue-400 hover:bg-blue-50/60'
                } disabled:cursor-wait`}
              >
                {isParsing ? (
                  <>
                    <LoaderCircle className="mb-4 animate-spin text-blue-600" size={46} />
                    <span className="text-lg font-bold text-slate-800">한글 파일을 분석하고 있습니다</span>
                    <span className="mt-2 text-sm text-slate-500">표의 행·열과 메뉴를 확인하는 중입니다.</span>
                  </>
                ) : (
                  <>
                    <UploadCloud className="mb-4 text-blue-600" size={52} />
                    <span className="text-lg font-bold text-slate-800">HWP 파일을 여기에 놓아주세요</span>
                    <span className="mt-2 text-sm text-slate-500">또는 클릭해서 파일 선택 · HWP/HWPX · 최대 20MB</span>
                  </>
                )}
              </button>
              <input
                ref={inputRef}
                type="file"
                accept=".hwp,.hwpx,application/haansofthwp,application/x-hwp,application/hwp+zip"
                className="hidden"
                onChange={(event) => void analyzeFile(event.target.files?.[0])}
              />
            </div>
          )}

          {error && (
            <div className="mx-auto mt-4 flex max-w-2xl items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <AlertTriangle className="mt-0.5 shrink-0" size={18} />
              <div>
                <p className="font-bold">파일을 불러오지 못했습니다.</p>
                <p className="mt-0.5">{error}</p>
              </div>
            </div>
          )}

          {plan && (
            <div className="space-y-4">
              <div className="flex flex-col gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 md:flex-row md:items-center md:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                  <CheckCircle2 className="shrink-0 text-emerald-600" size={24} />
                  <div className="min-w-0">
                    <p className="truncate font-bold text-emerald-900">{plan.fileName}</p>
                    <p className="text-xs text-emerald-700">식단표 구조를 정상적으로 읽었습니다.</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 text-xs font-semibold">
                  <span className="rounded-full bg-white px-3 py-1.5 text-slate-700 shadow-sm">{plan.tableSize.rows}행 × {plan.tableSize.columns}열</span>
                  <span className="rounded-full bg-white px-3 py-1.5 text-slate-700 shadow-sm">메뉴 {plan.itemCount}개</span>
                  <span className="rounded-full bg-white px-3 py-1.5 text-slate-700 shadow-sm">시작일 {plan.weekStart}</span>
                </div>
              </div>

              {plan.warnings.length > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  <div className="flex items-center gap-2 font-bold">
                    <AlertTriangle size={17} /> 확인이 필요한 내용
                  </div>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
                    {plan.warnings.map((warning, index) => <li key={`${warning}-${index}`}>{warning}</li>)}
                  </ul>
                </div>
              )}

              <div className="overflow-x-auto rounded-xl border border-slate-300">
                <table className="w-full min-w-[1000px] table-fixed border-collapse bg-white text-xs">
                  <thead>
                    <tr className="bg-slate-100">
                      <th className="w-16 border-b border-r border-slate-300 p-2 text-slate-700">구분</th>
                      {plan.headers.map((header) => (
                        <th key={header.day} className="border-b border-r border-slate-300 p-2 text-center text-slate-800 last:border-r-0">
                          <div className="font-extrabold">{header.label}</div>
                          {header.note && <div className="mt-0.5 text-[10px] font-medium text-blue-600">{header.note}</div>}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {TIMES.map((time) => (
                      <tr key={time}>
                        <th className="border-b border-r border-slate-300 bg-slate-50 p-2 text-center text-sm font-extrabold text-slate-800 last:border-b-0">
                          {time}
                        </th>
                        {DAYS.map((day) => (
                          <td key={`${time}-${day}`} className="border-b border-r border-slate-300 p-2 align-top last:border-r-0">
                            <div className="space-y-1.5">
                              {foodsFor(time, day).map((food, index) => (
                                <div key={`${food.name}-${food.origin || ''}-${index}`} className="rounded-md bg-slate-50 px-1.5 py-1 text-center">
                                  <div className="font-semibold leading-snug text-slate-800">{food.name}</div>
                                  {food.origin && <div className="mt-0.5 text-[10px] text-slate-500">({food.origin})</div>}
                                </div>
                              ))}
                            </div>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {plan.originText && (
                <details className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <summary className="cursor-pointer text-sm font-bold text-slate-700">추출된 원산지 표시판 확인</summary>
                  <p className="mt-3 whitespace-pre-wrap text-xs leading-relaxed text-slate-600">{plan.originText}</p>
                </details>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-gray-200 bg-white px-4 py-4 sm:flex-row sm:justify-end md:px-6">
          <button
            type="button"
            onClick={onClose}
            disabled={isBusy}
            className="rounded-lg bg-slate-200 px-5 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-300 disabled:opacity-40"
          >
            취소
          </button>
          {plan && (
            <>
              <button
                type="button"
                onClick={() => {
                  setPlan(null);
                  setError('');
                  window.setTimeout(() => inputRef.current?.click(), 0);
                }}
                disabled={isBusy}
                className="flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
              >
                <FileText size={16} /> 다른 파일 선택
              </button>
              <button
                type="button"
                onClick={() => void handleApply()}
                disabled={isBusy}
                className="flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-blue-700 disabled:cursor-wait disabled:bg-slate-400"
              >
                {isApplying ? <LoaderCircle className="animate-spin" size={17} /> : <CheckCircle2 size={17} />}
                {isApplying ? '식단표에 반영 중...' : '이 식단표 반영하기'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
