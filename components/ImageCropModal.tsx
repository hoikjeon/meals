"use client";

import React, { useState, useCallback } from 'react';
import Cropper, { Area } from 'react-easy-crop';
import { X, Check, ZoomIn, ZoomOut } from 'lucide-react';

interface ImageCropModalProps {
  imageSrc: string;
  onConfirm: (croppedDataUrl: string) => void;
  onClose: () => void;
}

async function getCroppedImg(imageSrc: string, pixelCrop: Area): Promise<string> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = imageSrc;
  });

  const canvas = document.createElement('canvas');
  canvas.width = pixelCrop.width;
  canvas.height = pixelCrop.height;
  const ctx = canvas.getContext('2d')!;

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    pixelCrop.width,
    pixelCrop.height,
  );

  return canvas.toDataURL('image/jpeg', 0.92);
}

export default function ImageCropModal({ imageSrc, onConfirm, onClose }: ImageCropModalProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);

  const onCropComplete = useCallback((_: Area, croppedPixels: Area) => {
    setCroppedAreaPixels(croppedPixels);
  }, []);

  const handleConfirm = async () => {
    if (!croppedAreaPixels) return;
    const result = await getCroppedImg(imageSrc, croppedAreaPixels);
    onConfirm(result);
  };

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-black">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-black/80 text-white shrink-0">
        <button onClick={onClose} className="p-2 rounded-full hover:bg-white/10 transition-colors">
          <X size={22} />
        </button>
        <span className="font-bold text-sm">사진 위치·크기 조정</span>
        <button
          onClick={handleConfirm}
          className="flex items-center gap-1.5 bg-orange-500 hover:bg-orange-600 text-white px-4 py-1.5 rounded-full text-sm font-bold transition-colors"
        >
          <Check size={16} />
          완료
        </button>
      </div>

      {/* Crop area */}
      <div className="relative flex-1">
        <Cropper
          image={imageSrc}
          crop={crop}
          zoom={zoom}
          aspect={1000 / 1350}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={onCropComplete}
          showGrid={false}
          style={{
            containerStyle: { background: '#000' },
            cropAreaStyle: { border: '2px solid #f97316' },
          }}
        />
      </div>

      {/* Zoom slider */}
      <div className="shrink-0 bg-black/80 px-6 py-4 flex items-center gap-3">
        <button
          onClick={() => setZoom(z => Math.max(1, z - 0.1))}
          className="text-white hover:text-orange-400 transition-colors"
        >
          <ZoomOut size={20} />
        </button>
        <input
          type="range"
          min={1}
          max={3}
          step={0.01}
          value={zoom}
          onChange={e => setZoom(Number(e.target.value))}
          className="flex-1 accent-orange-500"
        />
        <button
          onClick={() => setZoom(z => Math.min(3, z + 0.1))}
          className="text-white hover:text-orange-400 transition-colors"
        >
          <ZoomIn size={20} />
        </button>
      </div>

      <p className="text-center text-white/50 text-xs pb-3 shrink-0">
        드래그로 위치 조정 · 슬라이더로 크기 조정
      </p>
    </div>
  );
}
