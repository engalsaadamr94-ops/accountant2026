"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { FileSpreadsheet, Printer } from "lucide-react";
import { useBook } from "@/lib/book";
import { exportExcel } from "@/lib/export";
import { accountTree } from "@/components/pickers";
import { PeriodBar, yearStart } from "@/components/Statement";
import { PrintHeader, periodText, rollUp, useTrialBalance } from "@/components/ReportKit";
import { ErrorBox, Loading, Money, PageHeader } from "@/components/ui";

const dr = (v: number) => (v > 0 ? v : 0);
const cr = (v: number) => (v < 0 ? -v : 0);

export default function TrialBalancePage() {
  const { accounts } = useBook();
  const [from, setFrom] = useState(yearStart());
  const [to, setTo] = useState("");
  const [level, setLevel] = useState(9);
  const [hideZero, setHideZero] = useState(true);
  const { tb, error, reload } = useTrialBalance(from, to);

  const data = useMemo(() => {
    if (!tb) return null;
    const pick = (k: "opening" | "debit" | "credit" | "closing") => rollUp(accounts, Object.fromEntries(Object.entries(tb).map(([id, r]) => [id, r[k]])));
    return { opening: pick("opening"), debit: pick("debit"), credit: pick("credit"), closing: pick("closing") };
  }, [tb, accounts]);

  const rows = useMemo(() => {
    if (!data) return [];
    return accountTree(accounts).filter((a) => a.depth < level && (!hideZero || data.opening[a.id] || data.debit[a.id] || data.credit[a.id] || data.closing[a.id]));
  }, [accounts, data, level, hideZero]);

  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!data) return <Loading />;
  const roots = accountTree(accounts).filter((a) => a.depth === 0);
  const sum = (m: Record<string, number>, f: (v: number) => number) => Math.round(roots.reduce((s, a) => s + f(m[a.id] || 0), 0) * 100) / 100;
  // مجموع المدين والدائن على مستوى الحسابات التفصيلية (حتى يتوازن)
  const leafSum = (k: "opening" | "closing", f: (v: number) => number) => Math.round(Object.values(tb!).reduce((s, r) => s + f(r[k]), 0) * 100) / 100;
  const totals = { od: leafSum("opening", dr), oc: leafSum("opening", cr), pd: sum(data.debit, (v) => v), pc: sum(data.credit, (v) => v), cd: leafSum("closing", dr), cc: leafSum("closing", cr) };
  const balanced = Math.abs(totals.cd - totals.cc) < 0.005;

  async function doExport() {
    await exportExcel("ميزان المراجعة", "ميزان المراجعة", rows.map((a) => ({
      "الرمز": a.code, "الحساب": "  ".repeat(a.depth) + a.name,
      "افتتاحي مدين": dr(data!.opening[a.id] || 0), "افتتاحي دائن": cr(data!.opening[a.id] || 0),
      "حركة مدين": data!.debit[a.id] || 0, "حركة دائن": data!.credit[a.id] || 0,
      "ختامي مدين": dr(data!.closing[a.id] || 0), "ختامي دائن": cr(data!.closing[a.id] || 0),
    })));
  }

  return (
    <div>
      <PageHeader title="ميزان المراجعة" subtitle={periodText(from, to)}
        actions={<><button className="btn-ghost" onClick={doExport}><FileSpreadsheet className="h-4 w-4" /> Excel</button><button className="btn-ghost" onClick={() => window.print()}><Printer className="h-4 w-4" /> طباعة</button></>} />
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3 no-print">
        <PeriodBar from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />
        <div className="flex items-center gap-3">
          <select className="field !w-auto" value={level} onChange={(e) => setLevel(Number(e.target.value))} aria-label="المستوى">
            <option value={1}>المستوى الأول</option><option value={2}>حتى المستوى الثاني</option><option value={3}>حتى المستوى الثالث</option><option value={9}>تفصيلي</option>
          </select>
          <label className="flex items-center gap-2 text-[13.5px]"><input type="checkbox" checked={hideZero} onChange={(e) => setHideZero(e.target.checked)} /> إخفاء الأصفار</label>
        </div>
      </div>
      <PrintHeader title="ميزان المراجعة" period={periodText(from, to)} />
      <div className="panel print-sheet overflow-x-auto">
        <table className="ledger min-w-[860px]">
          <thead>
            <tr><th rowSpan={2}>الحساب</th><th colSpan={2} className="!text-center">رصيد أول المدة</th><th colSpan={2} className="!text-center">حركة الفترة</th><th colSpan={2} className="!text-center">الرصيد الختامي</th></tr>
            <tr><th className="amt">مدين</th><th className="amt">دائن</th><th className="amt">مدين</th><th className="amt">دائن</th><th className="amt">مدين</th><th className="amt">دائن</th></tr>
          </thead>
          <tbody>
            {rows.map((a) => {
              const group = !a.is_postable;
              const cell = (v: number) => (v ? <Money v={v} className={group ? "font-semibold" : ""} /> : "");
              const o = data.opening[a.id] || 0, c = data.closing[a.id] || 0;
              return (
                <tr key={a.id} className={a.depth === 0 ? "bg-brand-tint/30" : ""}>
                  <td style={{ paddingInlineStart: `${0.75 + a.depth * 1.1}rem` }}>
                    <span className="num pl-2 text-[12.5px] text-muted">{a.code}</span>
                    {a.is_postable ? <Link href={`/reports/statement?account=${a.id}&from=${from}&to=${to}`} className="hover:text-brand">{a.name}</Link> : <span className={a.depth === 0 ? "font-display font-bold" : "font-semibold"}>{a.name}</span>}
                  </td>
                  <td className="amt">{cell(dr(o))}</td><td className="amt">{cell(cr(o))}</td>
                  <td className="amt">{cell(data.debit[a.id] || 0)}</td><td className="amt">{cell(data.credit[a.id] || 0)}</td>
                  <td className="amt">{cell(dr(c))}</td><td className="amt">{cell(cr(c))}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td>الإجمالي</td>
              {[totals.od, totals.oc, totals.pd, totals.pc, totals.cd, totals.cc].map((v, i) => (
                <td key={i} className="amt"><span className="total-rule inline-block px-1 py-0.5"><Money v={v} /></span></td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
      <p className={`mt-3 text-[13.5px] ${balanced ? "text-gain" : "text-loss"}`}>{balanced ? "الميزان متوازن: مجموع الأرصدة المدينة يساوي مجموع الأرصدة الدائنة." : "تنبيه: الميزان غير متوازن. راجع القيود."}</p>
    </div>
  );
}
