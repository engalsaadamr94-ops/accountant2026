"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { FileSpreadsheet, Printer } from "lucide-react";
import { useBook } from "@/lib/book";
import { supabase } from "@/lib/supabase/client";
import { exportExcel } from "@/lib/export";
import { errorText, n } from "@/lib/format";
import { PeriodBar, yearStart } from "@/components/Statement";
import { PrintHeader, periodText } from "@/components/ReportKit";
import { ErrorBox, Loading, Money, PageHeader } from "@/components/ui";

type Row = { cost_center_id: string | null; revenue: number; expense: number; lines: number };
const KIND = { personal: "شخصي", business: "عمل", project: "مشروع" } as const;

export default function CostCentersReport() {
  const { book, costCenters } = useBook();
  const [from, setFrom] = useState(yearStart());
  const [to, setTo] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (!book) return;
    setRows(null);
    const { data, error } = await supabase().rpc("report_cost_centers", { p_book: book.id, p_from: from || null, p_to: to || null });
    if (error) return setError(errorText(error));
    setRows(((data as Row[]) || []).map((r) => ({ ...r, revenue: n(r.revenue), expense: n(r.expense) })));
  }, [book, from, to]);
  useEffect(() => { load(); }, [load]);
  if (error) return <ErrorBox error={error} onRetry={load} />;
  if (!rows || !book) return <Loading />;
  const name = (id: string | null) => (id ? costCenters.find((c) => c.id === id)?.name || "—" : "بدون مركز تكلفة");
  const sorted = [...rows].sort((a, b) => (b.revenue - b.expense) - (a.revenue - a.expense));
  const tr = sorted.reduce((s, r) => s + r.revenue, 0), te = sorted.reduce((s, r) => s + r.expense, 0);
  return (
    <div>
      <PageHeader title="ربحية المشاريع ومراكز التكلفة" subtitle={`${periodText(from, to)} — أضف مشاريعك من «إدارة النظام ← مراكز التكلفة» واختر المشروع عند تسجيل كل مصروف أو إيراد.`}
        actions={<><button className="btn-ghost" onClick={() => exportExcel("مراكز التكلفة", "المراكز", sorted.map((r) => ({ "المركز": name(r.cost_center_id), "الإيراد": r.revenue, "المصروف": r.expense, "الصافي": Math.round((r.revenue - r.expense) * 100) / 100 })))}><FileSpreadsheet className="h-4 w-4" /> Excel</button><button className="btn-ghost" onClick={() => window.print()}><Printer className="h-4 w-4" /> طباعة</button></>} />
      <div className="mb-5"><PeriodBar from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} /></div>
      <PrintHeader title="ربحية مراكز التكلفة" period={periodText(from, to)} />
      <div className="panel print-sheet overflow-x-auto">
        <table className="ledger min-w-[560px]">
          <thead><tr><th>مركز التكلفة</th><th className="amt">الإيراد</th><th className="amt">المصروف</th><th className="amt">الصافي</th><th className="amt">هامش الربح</th></tr></thead>
          <tbody>
            {sorted.length === 0 && <tr><td colSpan={5} className="py-10 text-center text-muted">لا حركات في هذه الفترة.</td></tr>}
            {sorted.map((r) => {
              const net = Math.round((r.revenue - r.expense) * 100) / 100;
              const cc = costCenters.find((c) => c.id === r.cost_center_id);
              return (
                <tr key={r.cost_center_id || "none"}>
                  <td>{r.cost_center_id ? <Link className="hover:text-brand" href={`/reports/statement?cc=${r.cost_center_id}&from=${from}&to=${to}`}>{name(r.cost_center_id)}</Link> : <span className="text-muted">{name(null)}</span>}{cc && <span className="ms-2 text-[12px] text-muted">{KIND[cc.kind]}</span>}</td>
                  <td className="amt"><Money v={r.revenue} /></td>
                  <td className="amt"><Money v={r.expense} /></td>
                  <td className="amt font-semibold"><Money v={net} signed className={net < 0 ? "text-loss" : ""} /></td>
                  <td className="amt text-muted">{r.revenue ? <span className="num">{Math.round((net / r.revenue) * 100)}%</span> : "—"}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot><tr><td>الإجمالي</td><td className="amt"><Money v={tr} /></td><td className="amt"><Money v={te} /></td><td className="amt"><span className="total-rule inline-block px-1"><Money v={tr - te} signed /></span></td><td /></tr></tfoot>
        </table>
      </div>
    </div>
  );
}
