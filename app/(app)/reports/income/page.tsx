"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { FileSpreadsheet, Printer } from "lucide-react";
import { useBook } from "@/lib/book";
import { exportExcel } from "@/lib/export";
import { PeriodBar, yearStart } from "@/components/Statement";
import { PrintHeader, periodText, useTrialBalance } from "@/components/ReportKit";
import { ErrorBox, Loading, Money, PageHeader } from "@/components/ui";
import type { Account, Scope } from "@/lib/types";

type Item = { a: Account; v: number };
type Section = { key: Scope; title: string; revLabel: string; expLabel: string; netLabel: [string, string]; rev: Item[]; exp: Item[] };

export default function IncomePage() {
  const { accounts, book } = useBook();
  const [from, setFrom] = useState(yearStart());
  const [to, setTo] = useState("");
  const { tb, error, reload } = useTrialBalance(from, to);

  const sections = useMemo<Section[] | null>(() => {
    if (!tb) return null;
    const mk = (scope: Scope, type: "revenue" | "expense") =>
      accounts
        .filter((a) => a.type === type && a.scope === scope && tb[a.id])
        .map((a) => ({ a, v: Math.round((type === "revenue" ? tb[a.id].credit - tb[a.id].debit : tb[a.id].debit - tb[a.id].credit) * 100) / 100 }))
        .filter((x) => x.v !== 0)
        .sort((x, y) => x.a.code.localeCompare(y.a.code));
    return [
      { key: "business", title: "العمل الحر", revLabel: "إيرادات العمل", expLabel: "مصروفات العمل", netLabel: ["صافي ربح العمل الحر", "صافي خسارة العمل الحر"], rev: mk("business", "revenue"), exp: mk("business", "expense") },
      { key: "personal", title: "المالية الشخصية", revLabel: "الدخل الشخصي", expLabel: "المصروفات الشخصية", netLabel: ["الفائض الشخصي", "العجز الشخصي"], rev: mk("personal", "revenue"), exp: mk("personal", "expense") },
      { key: "both", title: "بنود مشتركة", revLabel: "إيرادات أخرى", expLabel: "مصروفات أخرى", netLabel: ["صافي البنود المشتركة", "صافي البنود المشتركة"], rev: mk("both", "revenue"), exp: mk("both", "expense") },
    ];
  }, [tb, accounts]);

  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!sections || !book) return <Loading />;
  const s = (xs: Item[]) => Math.round(xs.reduce((t, x) => t + x.v, 0) * 100) / 100;
  const totalRev = sections.reduce((t, x) => t + s(x.rev), 0);
  const totalExp = sections.reduce((t, x) => t + s(x.exp), 0);
  const net = Math.round((totalRev - totalExp) * 100) / 100;
  const visible = sections.filter((x) => x.rev.length || x.exp.length || (x.key === "business" && book.has_business) || x.key === "personal");

  async function doExport() {
    const rows: Record<string, string | number>[] = [];
    visible.forEach((x) => {
      rows.push({ "البند": x.title, "المبلغ": "" });
      x.rev.forEach((i) => rows.push({ "البند": `  ${i.a.name}`, "المبلغ": i.v }));
      rows.push({ "البند": `إجمالي ${x.revLabel}`, "المبلغ": s(x.rev) });
      x.exp.forEach((i) => rows.push({ "البند": `  ${i.a.name}`, "المبلغ": -i.v }));
      rows.push({ "البند": `إجمالي ${x.expLabel}`, "المبلغ": -s(x.exp) });
      rows.push({ "البند": x.netLabel[0], "المبلغ": s(x.rev) - s(x.exp) });
    });
    rows.push({ "البند": "صافي الفترة", "المبلغ": net });
    await exportExcel("قائمة الدخل", "قائمة الدخل", rows);
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="قائمة الدخل" subtitle={periodText(from, to)}
        actions={<><button className="btn-ghost" onClick={doExport}><FileSpreadsheet className="h-4 w-4" /> Excel</button><button className="btn-ghost" onClick={() => window.print()}><Printer className="h-4 w-4" /> طباعة</button></>} />
      <div className="mb-5"><PeriodBar from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} /></div>
      <PrintHeader title="قائمة الدخل" period={periodText(from, to)} />

      <div className="panel print-sheet px-6 py-5 sm:px-8">
        {visible.map((x) => {
          const sub = Math.round((s(x.rev) - s(x.exp)) * 100) / 100;
          return (
            <section key={x.key} className="mb-8 last:mb-4">
              <h2 className="mb-3 font-display text-[17px] font-bold">{x.title}</h2>
              <Group label={x.revLabel} items={x.rev} from={from} to={to} />
              <Group label={x.expLabel} items={x.exp} from={from} to={to} negative />
              <div className="mt-2 flex items-baseline justify-between border-t border-ink/60 pt-2 font-semibold">
                <span>{sub >= 0 ? x.netLabel[0] : x.netLabel[1]}</span>
                <Money v={sub} signed className={sub < 0 ? "text-loss" : ""} />
              </div>
            </section>
          );
        })}
        <div className="total-rule flex items-baseline justify-between py-3">
          <span className="font-display text-[17px] font-bold">{net >= 0 ? "صافي الفائض (ما يُضاف لثروتك)" : "صافي العجز"}</span>
          <Money v={net} signed className={`font-display text-[24px] font-bold ${net < 0 ? "text-loss" : ""}`} />
        </div>
        {totalRev > 0 && <p className="mt-3 text-[13px] text-muted">معدل الادخار في الفترة: <span className="num font-semibold text-ink">{Math.round((net / totalRev) * 100)}%</span> من إجمالي الدخل.</p>}
      </div>
    </div>
  );
}

function Group({ label, items, negative, from, to }: { label: string; items: Item[]; negative?: boolean; from: string; to: string }) {
  const total = Math.round(items.reduce((t, x) => t + x.v, 0) * 100) / 100;
  return (
    <div className="mb-3">
      <div className="mb-1 text-[13.5px] font-semibold text-ink-soft">{label}</div>
      {items.length === 0 ? <div className="py-1 text-[13.5px] text-muted">لا شيء في هذه الفترة</div> : (
        <dl>
          {items.map((i) => (
            <div key={i.a.id} className="flex items-baseline justify-between border-b border-rule py-1.5 ps-3 text-[14.5px]">
              <dt><Link href={`/reports/statement?account=${i.a.id}&from=${from}&to=${to}`} className="hover:text-brand">{i.a.name}</Link></dt>
              <dd><Money v={negative ? -i.v : i.v} signed /></dd>
            </div>
          ))}
          <div className="flex items-baseline justify-between py-1.5 ps-3 text-[14px] font-medium">
            <dt>الإجمالي</dt><dd><Money v={negative ? -total : total} signed /></dd>
          </div>
        </dl>
      )}
    </div>
  );
}
