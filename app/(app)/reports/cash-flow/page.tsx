"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { FileSpreadsheet, Printer } from "lucide-react";
import { useBook } from "@/lib/book";
import { supabase } from "@/lib/supabase/client";
import { exportExcel } from "@/lib/export";
import { CASH_KIND_LABEL, cur, errorText, n } from "@/lib/format";
import { PeriodBar, yearStart } from "@/components/Statement";
import { PrintHeader, periodText } from "@/components/ReportKit";
import { ErrorBox, Loading, Money, PageHeader } from "@/components/ui";

type Row = { cash_account_id: string; opening_fc: number; in_fc: number; out_fc: number; closing_fc: number; in_base: number; out_base: number };

export default function CashFlowReport() {
  const { book, cash } = useBook();
  const [from, setFrom] = useState(yearStart());
  const [to, setTo] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (!book) return;
    setRows(null);
    const { data, error } = await supabase().rpc("report_cash_flow", { p_book: book.id, p_from: from || null, p_to: to || null });
    if (error) return setError(errorText(error));
    setRows(data as Row[]);
  }, [book, from, to]);
  useEffect(() => { load(); }, [load]);
  if (error) return <ErrorBox error={error} onRetry={load} />;
  if (!rows || !book) return <Loading />;
  const byId = Object.fromEntries(cash.map((c) => [c.id, c]));
  const list = rows.filter((r) => byId[r.cash_account_id] && (byId[r.cash_account_id].is_active || n(r.closing_fc) || n(r.in_fc) || n(r.out_fc)))
    .sort((a, b) => byId[a.cash_account_id].sort_order - byId[b.cash_account_id].sort_order);
  const tin = list.reduce((s, r) => s + n(r.in_base), 0), tout = list.reduce((s, r) => s + n(r.out_base), 0);
  return (
    <div>
      <PageHeader title="حركة الصناديق والبنوك" subtitle={periodText(from, to)}
        actions={<><button className="btn-ghost" onClick={() => exportExcel("حركة الصناديق", "الحركة", list.map((r) => ({ "الصندوق": byId[r.cash_account_id].name, "العملة": byId[r.cash_account_id].currency, "أول المدة": n(r.opening_fc), "الداخل": n(r.in_fc), "الخارج": n(r.out_fc), "آخر المدة": n(r.closing_fc) })))}><FileSpreadsheet className="h-4 w-4" /> Excel</button><button className="btn-ghost" onClick={() => window.print()}><Printer className="h-4 w-4" /> طباعة</button></>} />
      <div className="mb-5"><PeriodBar from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} /></div>
      <PrintHeader title="حركة الصناديق والبنوك" period={periodText(from, to)} />
      <div className="panel print-sheet overflow-x-auto">
        <table className="ledger min-w-[640px]">
          <thead><tr><th>الصندوق</th><th className="amt">أول المدة</th><th className="amt">الداخل</th><th className="amt">الخارج</th><th className="amt">آخر المدة</th></tr></thead>
          <tbody>
            {list.map((r) => {
              const c = byId[r.cash_account_id];
              return (
                <tr key={r.cash_account_id}>
                  <td><Link href={`/cash/${c.id}`} className="font-medium hover:text-brand">{c.name}</Link><div className="text-[12px] text-muted">{CASH_KIND_LABEL[c.kind]} · {cur(c.currency)}</div></td>
                  <td className="amt"><Money v={r.opening_fc} signed /></td>
                  <td className="amt text-gain"><Money v={r.in_fc} /></td>
                  <td className="amt"><Money v={r.out_fc} /></td>
                  <td className="amt font-semibold"><Money v={r.closing_fc} signed /></td>
                </tr>
              );
            })}
          </tbody>
          <tfoot><tr><td>الإجمالي بالعملة الأساسية</td><td /><td className="amt"><Money v={tin} /></td><td className="amt"><Money v={tout} /></td><td className="amt"><span className="total-rule inline-block px-1"><Money v={tin - tout} signed /></span><div className="text-[11px] font-normal text-muted">صافي التدفق</div></td></tr></tfoot>
        </table>
      </div>
      <p className="mt-3 text-[12.5px] text-muted">التحويل بين صندوقين يظهر داخلاً في أحدهما وخارجاً من الآخر، فلا يؤثر على صافي التدفق.</p>
    </div>
  );
}
