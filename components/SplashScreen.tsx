"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

export default function SplashScreen() {
  const [visible, setVisible] = useState(false);
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    // 모바일(768px 미만)에서만 표시
    if (window.innerWidth >= 768) return;

    const showTimer = setTimeout(() => setVisible(true), 0);
    const fadeTimer = setTimeout(() => setFadeOut(true), 1800);
    const hideTimer = setTimeout(() => setVisible(false), 2400);
    return () => {
      clearTimeout(showTimer);
      clearTimeout(fadeTimer);
      clearTimeout(hideTimer);
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        backgroundColor: "#8ec8e8",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "opacity 0.6s ease",
        opacity: fadeOut ? 0 : 1,
        pointerEvents: fadeOut ? "none" : "auto",
      }}
    >
      <div style={{ position: "relative", width: "100vw", height: "100vh" }}>
        <Image
          src="/images/loding-pic.png"
          alt="로딩 중"
          fill
          priority
          style={{ objectFit: "contain" }}
        />
      </div>
    </div>
  );
}
