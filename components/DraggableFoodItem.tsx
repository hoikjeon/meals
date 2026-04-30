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
      className={`flex items-center gap-2 p-3 bg-white border border-gray-200 rounded shadow-sm cursor-grab hover:border-blue-400 hover:shadow transition-all group ${isDragging ? 'opacity-50' : 'opacity-100'}`}
    >
      <GripVertical size={16} className="text-gray-400 flex-shrink-0" />
      <div className="flex-1 overflow-hidden">
        <div className="font-semibold text-sm text-gray-800 truncate">{food.name}</div>
        {food.origin && <div className="text-xs text-gray-500 truncate">{food.origin}</div>}
      </div>
      <div className={`flex items-center transition-opacity ${isFavorite ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
        {onToggleFavorite && (
          <button 
            onClick={() => onToggleFavorite(food)}
            onPointerDown={(e) => e.stopPropagation()}
            className={`p-1.5 rounded ${isFavorite ? 'text-yellow-400 hover:text-yellow-500' : 'text-gray-300 hover:text-yellow-400'}`}
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
              className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"
              title="수정"
            >
              <Edit2 size={14} />
            </button>
          )}
          {onDelete && (
            <button 
              onClick={() => onDelete(food)}
              onPointerDown={(e) => e.stopPropagation()}
              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
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
