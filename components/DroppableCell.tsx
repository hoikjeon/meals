"use client";

import React from 'react';
import { useDroppable } from '@dnd-kit/core';

interface DroppableCellProps {
  id: string;
  children: React.ReactNode;
}

export function DroppableCell({ id, children }: DroppableCellProps) {
  const { isOver, setNodeRef } = useDroppable({
    id,
  });

  return (
    <div 
      ref={setNodeRef} 
      className={`w-full h-full min-h-[120px] transition-colors ${isOver ? 'bg-blue-100 ring-2 ring-blue-400 inset-0' : ''}`}
    >
      {children}
    </div>
  );
}
