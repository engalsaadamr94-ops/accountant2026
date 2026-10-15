"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { FileSpreadsheet, Printer } from "lucide-react";
import { useBook } from "@/lib/book";
import { exportExcel } from "@/lib/export";
import { dateLong, natural, todayISO } from "@/lib/format";
import { accountTree } from "@/components/pickers";
import { PrintHeader, rollUp, useTrialBalance } from "@/components/ReportKit";
import { ErrorBox, Field, Loading, Money, PageHeader } from "@/components/ui";
import type { AccountType } from "@/lib/types";

export default function BalanceSheetPage() {
  const { accounts, book } = useBook();
  const [asOf, setAsOf] = useState(todayISO());
  const { tb, error, reload } = useTrialBalance("", asOf);

  const data = useMemo(() => {
    if (!tb) return null;
    const closing = rollUp(accounts, Object.fromEntries(Object.entries(tb).map(([id, r]) => [id, r.closing])));
    const tree = accountTree(accounts);
    const root = (t: AccountType) => tree.find((a) => a.depth === 0 && a.type === t);
    const val = (id?: string) => (id ? closing[id] || 0 : 0);
    const assets = natural(val(root("asset")?.id), "asset");
    const liabilities = natural(val(root("liability")?.id), "liability");
    const equity = natural(val(root("equity")?.id), "equity");
    const revenue = tree.filter((a) => a.depth === 0 && a.type === "revenue").reduce((s, a) => s + natural(val(a.id), "revenue"), 0);
    const expense = tree.filter((a) => a.depth === 0 && a.type === "expense").reduce((s, a) => s + natural(val(a.id), "expense"), 0);
    const earnings = Math.round((revenue - expense) * 100) / 100;
    return { closing, tree, assets, liabilities, equity, earnings };
  }, [tb, accounts]);

  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!data || !book) return <Loading />;
  const netWorth = Math.round((data.assets - data.liabilities) * 100) / 100;
  const block = (t: AccountType) => data.tree.filter((a) => a.type === t && a.depth <= 2 && data.closing[a.id]);

  async function doExport() {
    const rows: Record<string, string | number>[] = [];
    (["asset", "liability", "equity"] as AccountType[]).forEach((t) => block(t).forEach((a) => rows.push({ "الرمز": a.code, "البند": "  ".repeat(a.depth) + a.name, "المبلغ": natural(data!.closing[a.id], t) })));
    rows.push({ "الرمز": "", "البند": "فائض الفترة غير المقفل", "المبلغ": data!.earnings });
    rows.push({ "الرمز": "", "البند": "صافي الثروة", "المبلغ": netWorth });
    await exportExcel("المركز المالي", "المركز المالي", rows);
  }

  const Section = ({ t, title }: { t: AccountType; title: string }) => (
    <section className="mb-6">
      <h2 className="mb-2 font-display text-[17px] font-bold">{title}</h2>
      <dl>
        {block(t).filter((a) => a.depth > 0).map((a) => (
          <div key={a.id} className={`flex items-baseline justify-between border-b border-rule py-1.5 text-[14.5px] ${a.depth === 1 ? "font-semibold" : ""}`} style={{ paddingInlineStart: `${(a.depth - 1) * 1}rem` }}>
            <dt>{a.is_postable ? <Link href={`/reports/statement?account=${a.id}&to=${asOf}`} className="hover:text-brand">{a.name}</Link> : a.name}</dt>
            <dd><Money v={natural(data.closing[a.id], t)} signed /></dd>
          </div>
        ))}
      </dl>
    </section>
  );

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="المركز المالي وصافي الثروة" subtitle={`كما في ${dateLong(asOf)}`}
        actions={<><button className="btn-ghost" onClick={doExport}><FileSpreadsheet className="h-4 w-4" /> Excel</button><button className="btn-ghost" onClick={() => window.print()}><Printer className="h-4 w-4" /> طباعة</button></>} />
      <div className="mb-5 no-print"><Field label="كما في تاريخ" htmlFor="asof" className="max-w-[200px]"><input id="asof" type="date" className="field" value={asOf} onChange={(e) => setAsOf(e.target.value)} /></Field></div>
      <PrintHeader title="المركز المالي" period={`كما في ${dateLong(asOf)}`} />

      <div className="panel print-sheet px-6 py-6 sm:px-8">
        <Section t="asset" title="ما تملك (الأصول)" />
        <div className="-mt-3 mb-6 flex justify-between border-t border-ink/60 pt-2 font-semibold"><span>إجمالي الأصول</span><Money v={data.assets} signed /></div>
        <Section t="liability" title="ما عليك (الخصوم)" />
        <div className="-mt-3 mb-6 flex justify-between border-t border-ink/60 pt-2 font-semibold"><span>إجمالي الخصوم</span><Money v={data.liabilities} signed /></div>

        <div className="total-rule flex items-baseline justify-between py-3">
          <span className="font-display text-[18px] font-bold">صافي الثروة</span>
          <Money v={netWorth} signed className={`font-display text-[26px] font-bold ${netWorth < 0 ? "text-loss" : ""}`} />
        </div>

        <section className="mt-6 text-[14px]">
          <h3 className="mb-2 font-semibold text-ink-soft">مكوّنات صافي الثروة (حقوق الملكية)</h3>
          <dl>
            {block("equity").filter((a) => a.depth > 0).map((a) => (
              <div key={a.id} className="flex justify-between border-b border-rule py-1.5"><dt>{a.name}</dt><dd><Money v={natural(data.closing[a.id], "equity")} signed /></dd></div>
            ))}
            <div className="flex justify-between border-b border-rule py-1.5"><dt>فائض الدخل على المصروف (غير مقفل)</dt><dd><Money v={data.earnings} signed /></dd></div>
            <div className="flex justify-between py-1.5 font-semibold"><dt>الإجمالي</dt><dd><Money v={data.equity + data.earnings} signed /></dd></div>
          </dl>
          {Math.abs(data.equity + data.earnings - netWorth) > 0.01 && <p className="mt-2 text-loss">تنبيه: المعادلة المحاسبية غير متوازنة.</p>}
        </section>
      </div>
    </div>
  );
}
