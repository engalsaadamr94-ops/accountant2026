"use client";
import { supabase } from "@/lib/supabase/client";
import { errorText } from "@/lib/format";

/** استدعاء دالة في قاعدة البيانات مع تحويل الخطأ إلى نص عربي مفهوم */
export async function rpc<T = unknown>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase().rpc(fn, args);
  if (error) throw new Error(errorText(error));
  return data as T;
}

/** جلب كل الصفوف على دفعات (تفادياً لحد الألف صف) */
export async function fetchAll<T>(make: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>, page = 1000): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += page) {
    const { data, error } = await make(from, from + page - 1);
    if (error) throw new Error(errorText(error));
    const rows = (data as T[]) || [];
    out.push(...rows);
    if (rows.length < page) break;
  }
  return out;
}
