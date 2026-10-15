"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FileSpreadsheet, Printer } from "lucide-react";
import { useBook } from "@/lib/book";
import { supabase } from "@/lib/supabase/client";
import { exportExcel } from "@/lib/export";
import { daysBetween, errorText, n, todayISO } from "@/lib/format";
import { PrintHeader } from "@/components/ReportKit";
import { ErrorBox, Loading, Money, PageHeader, Tabs } from "@/components/ui";
import type { Debt, Installment } from "@/lib/types";

const BUCKETS = ["غير مستحق", "1–30 يوماً", "31–60", "61–90", "أكثر من 90"];
const bucketOf = (days: number) => (days <= 0 ? 0 : days <= 30 ? 1 : days <= 60 ? 2 : days <= 90 ? 3 : 4);

export default function DebtAging() {
  const { book } = useBook();
  const [dir, setDir] = useState<"receivable" | "payable">("receivable");
  const [debts, setDebts] = useState<Debt[] | null>(null);
  const [inst, setInst] = useState<Installment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const today = todayISO();
  const load = useCallback(async () => {
    if (!book) return;
    const sb = supabase();
    const [d, i] = await Promise.all([
      sb.from("v_debts").select("*").eq("book_id", book.id).eq("status", "active"),
      sb.from("v_installments").select("*").eq("book_id", book.id).neq("state", "paid"),
    ]);
    if (d.error) return setError(errorText(d.error));
    setDebts(d.data as Debt[]);
    setInst((i.data as Installment[]) || []);
  }, [book]);
  useEffect(() => { load(); }, [load]);

  // توزيع المتبقي من كل قسط على شرائح التأخر، بالعملة الأساسية
  const table = useMemo(() => {
    if (!debts) return null;
    const byParty: Record<string, { name: string; id: string; b: number[] }> = {};
    const ds = Object.fromEntries(debts.filter((d) => d.direction === dir).map((d) => [d.id, d]));
    inst.forEach((i) => {
      const d = ds[i.debt_id];
      if (!d) return;
      const rem = (n(i.amount) - n(i.paid)) * n(d.fx_rate);
      const p = (byParty[d.party_id] ||= { name: d.party_name, id: d.party_id, b: [0, 0, 0, 0, 0] });
      p.b[bucketOf(daysBetween(i.due_date, today))] += rem;
    });
    const rows = Object.values(byParty).map((p) => ({ ...p, b: p.b.map((v) => Math.round(v * 100) / 100), total: Math.round(p.b.reduce((s, v) => s + v, 0) * 100) / 100 })).sort((a, b) => b.total - a.total);
    const totals = BUCKETS.map((_, k) => Math.round(rows.reduce((s, r) => s + r.b[k], 0) * 100) / 100);
    return { rows, totals, total: Math.round(totals.reduce((s, v) => s + v, 0) * 100) / 100 };
  }, [debts, inst, dir, today]);

  if (error) return <ErrorBox error={error} onRetry={load} />;
  if (!table || !book) return <Loading />;
  const title = dir === "receivable" ? "أعمار الديون لي" : "أعمار الديون عليّ";
  return (
    <div>
      <PageHeader title="أعمار الديون" subtitle={`المتبقي من الأقساط موزعاً حسب مدة التأخر، بالعملة الأساسية (${book.base_currency}).`}
        actions={<><button className="btn-ghost" onClick={() => exportExcel(title, "الأعمار", table.rows.map((r) => ({ "الطرف": r.name, ...Object.fromEntries(BUCKETS.map((b, k) => [b, r.b[k]])), "الإجمالي": r.total })))}><FileSpreadsheet className="h-4 w-4" /> Excel</button><button className="btn-ghost" onClick={() => window.print()}><Printer className="h-4 w-4" /> طباعة</button></>} />
      <Tabs className="mb-5 no-print" value={dir} onChange={setDir} items={[{ value: "receivable", label: "لي" }, { value: "payable", label: "عليّ" }]} />
      <PrintHeader title={title} period={`كما في ${today}`} />
      <div className="panel print-sheet overflow-x-auto">
        <table className="ledger min-w-[720px]">
          <thead><tr><th>الطرف</th>{BUCKETS.map((b, k) => <th key={b} className={`amt ${k >= 3 ? "text-loss" : ""}`}>{b}</th>)}<th className="amt">الإجمالي</th></tr></thead>
          <tbody>
            {table.rows.length === 0 && <tr><td colSpan={7} className="py-10 text-center text-muted">لا ديون قائمة.</td></tr>}
            {table.rows.map((r) => (
              <tr key={r.id}>
                <td><Link href={`/parties/${r.id}`} className="font-medium hover:text-brand">{r.name}</Link></td>
                {r.b.map((v, k) => <td key={k} className={`amt ${k >= 3 && v ? "text-loss" : ""}`}>{v ? <Money v={v} /> : ""}</td>)}
                <td className="amt font-semibold"><Money v={r.total} /></td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr><td>الإجمالي</td>{table.totals.map((v, k) => <td key={k} className="amt"><Money v={v} /></td>)}<td className="amt"><span className="total-rule inline-block px-1"><Money v={table.total} /></span></td></tr></tfoot>
        </table>
      </div>
    </div>
  );
}
