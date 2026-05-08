import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import SplashScreen from "@/components/SplashScreen";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "연세척 식단표",
  description: "연세척병원 주간 식단표",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: '/images/phonelogo.jpg',
    apple: [{ url: '/images/phonelogo.jpg', sizes: '180x180', type: 'image/jpeg' }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "연세척 식단표",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <SplashScreen />
        {children}
      </body>
    </html>
  );
}
