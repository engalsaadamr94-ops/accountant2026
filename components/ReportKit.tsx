"use client";

import { useCallback, useEffect, useState } from "react";
import { useBook } from "@/lib/book";
import { supabase } from "@/lib/supabase/client";
import { dateLong, errorText, n } from "@/lib/format";
import type { Account, TBRow } from "@/lib/types";

export type TB = Record<string, { opening: number; debit: number; credit: number; closing: number }>;

/** ميزان المراجعة للحسابات التفصيلية */
export function useTrialBalance(from: string, to: string) {
  const { book } = useBook();
  const [tb, setTb] = useState<TB | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (!book) return;
    setTb(null);
    setError(null);
    const { data, error } = await supabase().rpc("report_trial_balance", { p_book: book.id, p_from: from || null, p_to: to || null });
    if (error) return setError(errorText(error));
    setTb(Object.fromEntries(((data as TBRow[]) || []).map((r) => [r.account_id, { opening: n(r.opening), debit: n(r.debit), credit: n(r.credit), closing: n(r.closing) }])));
  }, [book, from, to]);
  useEffect(() => { load(); }, [load]);
  return { tb, error, reload: load };
}

/** تجميع قيم الحسابات التفصيلية إلى كل الآباء */
export function rollUp(accounts: Account[], leaf: Record<string, number>): Record<string, number> {
  const byId = Object.fromEntries(accounts.map((a) => [a.id, a]));
  const out: Record<string, number> = {};
  for (const [id, v] of Object.entries(leaf)) {
    if (!v) continue;
    let a: Account | undefined = byId[id];
    while (a) {
      out[a.id] = Math.round(((out[a.id] || 0) + v) * 100) / 100;
      a = a.parent_id ? byId[a.parent_id] : undefined;
    }
  }
  return out;
}

/** ترويسة التقرير عند الطباعة */
export function PrintHeader({ title, period }: { title: string; period: string }) {
  const { book } = useBook();
  return (
    <div className="mb-5 hidden border-b-2 border-ink/70 pb-3 print:block">
      <div className="flex justify-between">
        <div><div className="text-[16px] font-bold">{book?.name}</div><div className="text-[12px]">{book?.owner_name}</div></div>
        <div className="text-end text-[12px]">طُبع في {dateLong(new Date().toISOString().slice(0, 10))}<br />العملة: {book?.base_currency}</div>
      </div>
      <div className="mt-3 text-center"><div className="text-[20px] font-bold">{title}</div><div className="text-[13px]">{period}</div></div>
    </div>
  );
}

export function periodText(from: string, to: string) {
  if (!from && !to) return "كل الفترات";
  if (!from) return `حتى ${dateLong(to)}`;
  return `من ${dateLong(from)} إلى ${to ? dateLong(to) : "اليوم"}`;
}
