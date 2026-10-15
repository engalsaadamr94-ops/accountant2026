"use client";
import { BookProvider } from "@/lib/book";
import { ToastProvider } from "@/components/ui";

export default function Providers({ children }: { children: React.ReactNode }) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return (
      <div className="mx-auto max-w-lg px-6 py-20">
        <h1 className="text-2xl font-bold">الإعداد غير مكتمل</h1>
        <p className="mt-3 text-ink-soft">
          أضف المتغيرين NEXT_PUBLIC_SUPABASE_URL و NEXT_PUBLIC_SUPABASE_ANON_KEY في ملف ‎.env.local‎ (أو في إعدادات Vercel)،
          ثم أعد تشغيل البرنامج. التفاصيل في ملف README.
        </p>
      </div>
    );
  }
  return (
    <ToastProvider>
      <BookProvider>{children}</BookProvider>
    </ToastProvider>
  );
}
