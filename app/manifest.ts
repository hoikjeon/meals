import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "연세척 식단표",
    short_name: "연세척",
    description: "연세척병원 주간 식단표",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    icons: [
      {
        src: "/images/phonelogo.jpg",
        sizes: "192x192",
        type: "image/jpeg",
      },
      {
        src: "/images/phonelogo.jpg",
        sizes: "512x512",
        type: "image/jpeg",
      },
    ],
  };
}
