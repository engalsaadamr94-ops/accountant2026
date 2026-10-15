"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { FileSpreadsheet, Printer } from "lucide-react";
import { useBook } from "@/lib/book";
import { supabase } from "@/lib/supabase/client";
import { exportExcel } from "@/lib/export";
import { DOC_LABEL, cur, dateLong, errorText, n, side } from "@/lib/format";
import { Balance, ErrorBox, Loading, Money } from "@/components/ui";
import type { StatementRow } from "@/lib/types";

export type StatementProps = {
  accountId?: string | null;
  partyId?: string | null;
  costCenterId?: string | null;
  from?: string;
  to?: string;
  includeChildren?: boolean;
  /** عرض المبالغ بعملة الحساب (للصناديق بعملة أجنبية) */
  fcCurrency?: string | null;
  /** عكس إشارة الرصيد للعرض (الخصوم والبطاقات) */
  title?: string;
  showAccount?: boolean;
  fileName?: string;
  /** يُستدعى بالإجماليات بعد التحميل */
  onTotals?: (t: { opening: number; debit: number; credit: number; closing: number }) => void;
};

/** كشف حساب برصيد افتتاحي وجارٍ وإجمالي بخط المحاسب المزدوج */
export default function Statement({ accountId, partyId, costCenterId, from, to, includeChildren = true, fcCurrency, showAccount, fileName = "كشف حساب", onTotals }: StatementProps) {
  const { book, accountById } = useBook();
  const [rows, setRows] = useState<StatementRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fc = !!fcCurrency && fcCurrency !== book?.base_currency;

  const load = useCallback(async () => {
    if (!book) return;
    setRows(null);
    setError(null);
    const { data, error } = await supabase().rpc("report_statement", {
      p_book: book.id, p_account: accountId || null, p_party: partyId || null, p_cost_center: costCenterId || null,
      p_from: from || null, p_to: to || null, p_include_children: includeChildren,
    });
    if (error) return setError(errorText(error));
    setRows(data as StatementRow[]);
  }, [book, accountId, partyId, costCenterId, from, to, includeChildren]);
  useEffect(() => { load(); }, [load]);

  const opening = rows?.find((r) => r.is_opening);
  const lines = rows?.filter((r) => !r.is_opening) || [];
  const dr = lines.reduce((s, r) => s + n(fc ? r.debit_fc : r.debit), 0);
  const cr = lines.reduce((s, r) => s + n(fc ? r.credit_fc : r.credit), 0);
  const op = n(fc ? opening?.balance_fc : opening?.balance);
  const closing = lines.length ? n(fc ? lines[lines.length - 1].balance_fc : lines[lines.length - 1].balance) : op;

  useEffect(() => {
    if (rows) onTotals?.({ opening: op, debit: dr, credit: cr, closing });
  }, [rows]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) return <ErrorBox error={error} onRetry={load} />;
  if (!rows) return <Loading />;

  async function doExport() {
    await exportExcel(fileName, "كشف", [
      { "التاريخ": from || "", "الرقم": "", "النوع": "", "البيان": "رصيد أول المدة", ...(showAccount ? { "الحساب": "" } : {}), "مدين": null, "دائن": null, "الرصيد": Math.abs(op), "طبيعة الرصيد": side(op) },
      ...lines.map((r) => ({
        "التاريخ": r.entry_date || "", "الرقم": r.number_text || "", "النوع": r.doc_type ? DOC_LABEL[r.doc_type] : "", "البيان": r.description || "",
        ...(showAccount ? { "الحساب": r.account_id ? `${accountById[r.account_id]?.code} ${accountById[r.account_id]?.name}` : "" } : {}),
        "مدين": n(fc ? r.debit_fc : r.debit) || null, "دائن": n(fc ? r.credit_fc : r.credit) || null,
        "الرصيد": Math.abs(n(fc ? r.balance_fc : r.balance)), "طبيعة الرصيد": side(fc ? r.balance_fc : r.balance),
      })),
      { "التاريخ": "", "الرقم": "", "النوع": "", "البيان": "الإجمالي", ...(showAccount ? { "الحساب": "" } : {}), "مدين": dr, "دائن": cr, "الرصيد": Math.abs(closing), "طبيعة الرصيد": side(closing) },
    ]);
  }

  return (
    <div>
      <div className="mb-2 flex justify-end gap-2 no-print">
        <button className="btn-quiet !py-1.5" onClick={doExport}><FileSpreadsheet className="h-4 w-4" /> Excel</button>
        <button className="btn-quiet !py-1.5" onClick={() => window.print()}><Printer className="h-4 w-4" /> طباعة</button>
      </div>
      <div className="panel print-sheet overflow-x-auto">
        <table className="ledger min-w-[640px]">
          <thead>
            <tr>
              <th className="w-28">التاريخ</th><th className="w-32">الرقم</th><th>البيان</th>
              {showAccount && <th>الحساب</th>}
              <th className="amt">مدين</th><th className="amt">دائن</th><th className="amt">الرصيد</th>
            </tr>
          </thead>
          <tbody>
            <tr className="bg-brand-tint/40">
              <td className="text-ink-soft">{from ? dateLong(from) : ""}</td><td />
              <td className="font-medium">رصيد أول المدة</td>
              {showAccount && <td />}
              <td /><td />
              <td className="amt font-medium"><Balance v={op} /></td>
            </tr>
            {lines.map((r) => (
              <tr key={r.line_id}>
                <td className="whitespace-nowrap text-ink-soft">{dateLong(r.entry_date)}</td>
                <td><Link href={`/vouchers/${r.entry_id}`} className="num text-brand hover:underline">{r.number_text}</Link></td>
                <td>{r.description || (r.doc_type ? DOC_LABEL[r.doc_type] : "")}{fc ? null : r.currency && r.currency !== book?.base_currency && <span className="ms-1 text-[12px] text-muted">({n(r.debit_fc) || n(r.credit_fc)} {cur(r.currency)})</span>}</td>
                {showAccount && <td className="text-[13px] text-ink-soft">{r.account_id ? accountById[r.account_id]?.name : ""}</td>}
                <td className="amt">{n(fc ? r.debit_fc : r.debit) ? <Money v={fc ? r.debit_fc : r.debit} /> : ""}</td>
                <td className="amt">{n(fc ? r.credit_fc : r.credit) ? <Money v={fc ? r.credit_fc : r.credit} /> : ""}</td>
                <td className="amt"><Balance v={fc ? r.balance_fc : r.balance} /></td>
              </tr>
            ))}
            {lines.length === 0 && (
              <tr><td colSpan={showAccount ? 7 : 6} className="py-10 text-center text-muted">لا حركات في هذه الفترة.</td></tr>
            )}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={showAccount ? 4 : 3}>الإجمالي ({lines.length} حركة){fc ? ` — ${cur(fcCurrency)}` : ""}</td>
              <td className="amt"><Money v={dr} /></td>
              <td className="amt"><Money v={cr} /></td>
              <td className="amt"><span className="total-rule inline-block px-1 py-0.5"><Balance v={closing} /></span></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

/** شريط اختيار الفترة مع أزرار سريعة */
export function PeriodBar({ from, to, onChange }: { from: string; to: string; onChange: (from: string, to: string) => void }) {
  const t = new Date();
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const today = iso(t);
  const presets: [string, string, string][] = [
    ["هذا الشهر", iso(new Date(t.getFullYear(), t.getMonth(), 1)), today],
    ["الشهر الماضي", iso(new Date(t.getFullYear(), t.getMonth() - 1, 1)), iso(new Date(t.getFullYear(), t.getMonth(), 0))],
    ["هذه السنة", iso(new Date(t.getFullYear(), 0, 1)), today],
    ["السنة الماضية", iso(new Date(t.getFullYear() - 1, 0, 1)), iso(new Date(t.getFullYear() - 1, 11, 31))],
    ["الكل", "", ""],
  ];
  return (
    <div className="flex flex-wrap items-end gap-2 no-print">
      <label className="text-[13px]"><span className="label">من</span><input type="date" className="field !w-40" value={from} max={to || undefined} onChange={(e) => onChange(e.target.value, to)} /></label>
      <label className="text-[13px]"><span className="label">إلى</span><input type="date" className="field !w-40" value={to} min={from || undefined} onChange={(e) => onChange(from, e.target.value)} /></label>
      <div className="flex flex-wrap gap-1.5 pb-1">
        {presets.map(([l, f, x]) => (
          <button key={l} type="button" onClick={() => onChange(f, x)}
            className={`rounded-full border px-3 py-1 text-[12.5px] ${from === f && to === x ? "border-brand bg-brand-tint text-brand" : "border-rule-strong hover:bg-brand-tint"}`}>{l}</button>
        ))}
      </div>
    </div>
  );
}

export function yearStart() {
  const t = new Date();
  return `${t.getFullYear()}-01-01`;
}
