"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FileSpreadsheet, Printer } from "lucide-react";
import { useBook } from "@/lib/book";
import { supabase } from "@/lib/supabase/client";
import { exportExcel } from "@/lib/export";
import { SCOPE_LABEL, errorText, monthShort, monthLabel, n } from "@/lib/format";
import { PeriodBar, yearStart } from "@/components/Statement";
import { PrintHeader, periodText } from "@/components/ReportKit";
import { HBars } from "@/components/charts";
import { ErrorBox, Loading, Money, PageHeader, Tabs } from "@/components/ui";

type Row = { account_id: string; month: string; amount: number };

export default function ExpensesPage() {
  const { book, accountById } = useBook();
  const [from, setFrom] = useState(yearStart());
  const [to, setTo] = useState("");
  const [scope, setScope] = useState<"all" | "personal" | "business">("all");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!book) return;
    setRows(null);
    const { data, error } = await supabase().rpc("report_expenses", { p_book: book.id, p_from: from || null, p_to: to || null });
    if (error) return setError(errorText(error));
    setRows(((data as Row[]) || []).map((r) => ({ ...r, amount: n(r.amount) })));
  }, [book, from, to]);
  useEffect(() => { load(); }, [load]);

  const view = useMemo(() => {
    if (!rows) return null;
    const ok = (id: string) => { const a = accountById[id]; return scope === "all" || a?.scope === scope || (a?.scope === "both" && scope === "business"); };
    const filtered = rows.filter((r) => ok(r.account_id));
    const months = Array.from(new Set(filtered.map((r) => r.month))).sort();
    const byAcc: Record<string, Record<string, number>> = {};
    filtered.forEach((r) => { (byAcc[r.account_id] ||= {})[r.month] = (byAcc[r.account_id][r.month] || 0) + r.amount; });
    const accs = Object.entries(byAcc).map(([id, m]) => ({ id, total: Math.round(Object.values(m).reduce((s, v) => s + v, 0) * 100) / 100, m }))
      .filter((x) => x.total !== 0).sort((a, b) => b.total - a.total);
    const total = Math.round(accs.reduce((s, a) => s + a.total, 0) * 100) / 100;
    const monthTotals = months.map((m) => Math.round(accs.reduce((s, a) => s + (a.m[m] || 0), 0) * 100) / 100);
    const personal = Math.round(filtered.filter((r) => accountById[r.account_id]?.scope === "personal").reduce((s, r) => s + r.amount, 0) * 100) / 100;
    return { months, accs, total, monthTotals, personal, business: Math.round((total - personal) * 100) / 100 };
  }, [rows, accountById, scope]);

  if (error) return <ErrorBox error={error} onRetry={load} />;
  if (!view || !book) return <Loading />;
  const avg = view.months.length ? view.total / view.months.length : 0;

  async function doExport() {
    await exportExcel("تحليل المصروفات", "المصروفات", view!.accs.map((a) => ({
      "البند": accountById[a.id]?.name || "", "النطاق": SCOPE_LABEL[accountById[a.id]?.scope || "both"],
      ...Object.fromEntries(view!.months.map((m) => [monthLabel(m), Math.round((a.m[m] || 0) * 100) / 100])), "الإجمالي": a.total,
    })));
  }

  return (
    <div>
      <PageHeader title="تحليل المصروفات" subtitle={periodText(from, to)}
        actions={<><button className="btn-ghost" onClick={doExport} disabled={!view.accs.length}><FileSpreadsheet className="h-4 w-4" /> Excel</button><button className="btn-ghost" onClick={() => window.print()}><Printer className="h-4 w-4" /> طباعة</button></>} />
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <PeriodBar from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />
        <Tabs value={scope} onChange={setScope} items={[{ value: "all", label: "الكل" }, { value: "personal", label: "شخصي" }, { value: "business", label: "العمل" }]} />
      </div>
      <PrintHeader title="تحليل المصروفات" period={periodText(from, to)} />

      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <div className="panel px-5 py-4"><div className="text-[12.5px] text-muted">إجمالي المصروف</div><Money v={view.total} className="font-display text-[22px] font-bold" /></div>
        <div className="panel px-5 py-4"><div className="text-[12.5px] text-muted">المتوسط الشهري</div><Money v={avg} className="text-[20px] font-semibold" /></div>
        <div className="panel px-5 py-4"><div className="text-[12.5px] text-muted">شخصي</div><Money v={view.personal} className="text-[20px] font-semibold" /></div>
        <div className="panel px-5 py-4"><div className="text-[12.5px] text-muted">العمل والمشترك</div><Money v={view.business} className="text-[20px] font-semibold" /></div>
      </div>

      {view.accs.length === 0 ? <div className="panel px-6 py-14 text-center text-muted">لا مصروفات في هذه الفترة.</div> : (
        <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
          <div className="panel p-5">
            <h2 className="mb-4 text-[15px] font-bold">أكبر البنود</h2>
            <HBars items={view.accs.slice(0, 10).map((a) => ({ label: accountById[a.id]?.name || "", value: a.total }))} />
          </div>
          <div className="panel overflow-x-auto">
            <table className="ledger min-w-[520px]">
              <thead><tr><th>البند</th>{view.months.slice(-6).map((m) => <th key={m} className="amt">{monthShort(m)}</th>)}<th className="amt">الإجمالي</th><th className="amt">النسبة</th></tr></thead>
              <tbody>
                {view.accs.map((a) => (
                  <tr key={a.id}>
                    <td><Link href={`/reports/statement?account=${a.id}&from=${from}&to=${to}`} className="hover:text-brand">{accountById[a.id]?.name}</Link></td>
                    {view.months.slice(-6).map((m) => <td key={m} className="amt text-ink-soft">{a.m[m] ? <Money v={a.m[m]} /> : ""}</td>)}
                    <td className="amt font-medium"><Money v={a.total} /></td>
                    <td className="amt text-muted"><span className="num">{view.total ? Math.round((a.total / view.total) * 100) : 0}%</span></td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr><td>الإجمالي</td>{view.monthTotals.slice(-6).map((v, i) => <td key={i} className="amt"><Money v={v} /></td>)}<td className="amt"><span className="total-rule inline-block px-1"><Money v={view.total} /></span></td><td /></tr></tfoot>
            </table>
            {view.months.length > 6 && <p className="px-4 py-2 text-[12px] text-muted">يظهر آخر ستة أشهر؛ ملف Excel يحتوي كل الأشهر.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
