import type { Metadata, Viewport } from "next";
import "./globals.css";
import Providers from "./providers";

export const metadata: Metadata = {
  title: { default: "محاسبي", template: "%s — محاسبي" },
  description: "دفترك المالي الشخصي والمهني: سندات، صناديق، ديون، تقارير.",
  icons: { icon: "/icon.svg" },
};
export const viewport: Viewport = { themeColor: "#0E4D45", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&family=Noto+Kufi+Arabic:wght@600;700;800&display=swap"
        />
        {/* تطبيق الوضع الليلي قبل الرسم لتجنّب الوميض */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var d=localStorage.getItem('mahasi.dark');if(d==='1'||(d===null&&matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.classList.add('dark')}catch(e){}`,
          }}
        />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
