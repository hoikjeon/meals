"use client";

import React from 'react';
import { useDraggable } from '@dnd-kit/core';
import { FoodItem } from '@/lib/types';
import { GripVertical, Edit2, Trash2, Star } from 'lucide-react';

interface DraggableFoodItemProps {
  food: FoodItem;
  isFavorite?: boolean;
  onToggleFavorite?: (food: FoodItem) => void;
  onEdit?: (food: FoodItem) => void;
  onDelete?: (food: FoodItem) => void;
}

export function DraggableFoodItem({ food, isFavorite, onToggleFavorite, onEdit, onDelete }: DraggableFoodItemProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: food.id,
  });

  return (
    <div 
      ref={setNodeRef} 
      {...listeners} 
      {...attributes}
      className={`group flex cursor-grab items-center gap-2 rounded-2xl border border-white/90 bg-white/62 p-3 shadow-sm transition-all hover:-translate-y-0.5 hover:border-blue-200 hover:bg-white/90 hover:shadow-md ${isDragging ? 'opacity-50' : 'opacity-100'}`}
    >
      <GripVertical size={16} className="flex-shrink-0 text-slate-300" />
      <div className="flex-1 overflow-hidden">
        <div className="truncate text-sm font-semibold text-slate-800">{food.name}</div>
        {food.origin && <div className="truncate text-xs text-slate-400">{food.origin}</div>}
      </div>
      <div className={`flex items-center transition-opacity ${isFavorite ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
        {onToggleFavorite && (
          <button 
            onClick={() => onToggleFavorite(food)}
            onPointerDown={(e) => e.stopPropagation()}
            className={`rounded-lg p-1.5 transition-colors ${isFavorite ? 'text-amber-400 hover:bg-amber-50 hover:text-amber-500' : 'text-slate-300 hover:bg-amber-50 hover:text-amber-400'}`}
            title={isFavorite ? "즐겨찾기 해제" : "즐겨찾기 추가"}
          >
            <Star size={14} fill={isFavorite ? 'currentColor' : 'none'} />
          </button>
        )}
        <div className="flex items-center opacity-0 group-hover:opacity-100">
          {onEdit && (
            <button 
              onClick={() => onEdit(food)}
              onPointerDown={(e) => e.stopPropagation()}
              className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-blue-50 hover:text-[#0071e3]"
              title="수정"
            >
              <Edit2 size={14} />
            </button>
          )}
          {onDelete && (
            <button 
              onClick={() => onDelete(food)}
              onPointerDown={(e) => e.stopPropagation()}
              className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
              title="삭제"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
