"use client";

import { useCallback, useEffect, useState } from "react";
import { useBook } from "@/lib/book";
import { supabase } from "@/lib/supabase/client";
import { rpc } from "@/lib/api";
import { errorText } from "@/lib/format";
import { ErrorBox, Loading, Modal } from "@/components/ui";

type Log = { id: number; table_name: string; row_id: string; action: string; old_data: Record<string, unknown> | null; new_data: Record<string, unknown> | null; user_id: string | null; at: string };
const TABLE: Record<string, string> = {
  books: "الدفتر", book_members: "المستخدمون", accounts: "الدليل", cost_centers: "مراكز التكلفة", parties: "الأشخاص", cash_accounts: "الصناديق",
  journal_entries: "القيود", debts: "الديون", debt_installments: "الأقساط", currencies: "العملات", fx_rates: "أسعار الصرف", entry_templates: "القوالب",
};
const ACTION: Record<string, string> = { insert: "إضافة", update: "تعديل", delete: "حذف" };
const PAGE = 50;

function describe(l: Log): string {
  const d = (l.new_data || l.old_data || {}) as Record<string, unknown>;
  if (l.table_name === "journal_entries") {
    if (l.action === "update" && l.old_data?.status !== l.new_data?.status) return `${String(d.number_text || "قيد")}: ${l.old_data?.status} ← ${l.new_data?.status}`;
    return String(d.number_text || d.memo || "مسودة");
  }
  return String(d.name || d.code || d.title || d.currency_code || d.role || l.row_id || "");
}

export default function AuditPanel() {
  const { book } = useBook();
  const [rows, setRows] = useState<Log[] | null>(null);
  const [users, setUsers] = useState<Record<string, string>>({});
  const [table, setTable] = useState("");
  const [page, setPage] = useState(0);
  const [count, setCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Log | null>(null);

  const load = useCallback(async () => {
    if (!book) return;
    let q = supabase().from("audit_log").select("*", { count: "exact" }).eq("book_id", book.id);
    if (table) q = q.eq("table_name", table);
    const { data, error, count } = await q.order("at", { ascending: false }).range(page * PAGE, page * PAGE + PAGE - 1);
    if (error) return setError(errorText(error));
    setRows(data as Log[]);
    setCount(count || 0);
  }, [book, table, page]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (book) rpc<{ user_id: string; email: string; full_name: string | null }[]>("list_members", { p_book: book.id }).then((m) => setUsers(Object.fromEntries(m.map((x) => [x.user_id, x.full_name || x.email])))).catch(() => {});
  }, [book]);

  if (error) return <ErrorBox error={error} onRetry={load} />;
  if (!rows) return <Loading />;
  const changed = open?.old_data && open?.new_data ? Object.keys(open.new_data).filter((k) => JSON.stringify(open.new_data![k]) !== JSON.stringify(open.old_data![k]) && k !== "updated_at") : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[14px] text-ink-soft">كل إضافة وتعديل وحذف في الدفتر مسجلة هنا بمن نفّذها ومتى، ولا يمكن تعديل هذا السجل.</p>
        <select className="field !w-auto" value={table} onChange={(e) => { setTable(e.target.value); setPage(0); }} aria-label="الجدول">
          <option value="">كل السجلات</option>{Object.entries(TABLE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      <div className="panel overflow-x-auto">
        <table className="ledger min-w-[640px]">
          <thead><tr><th>الوقت</th><th>المستخدم</th><th>العملية</th><th>السجل</th></tr></thead>
          <tbody>
            {rows.map((l) => (
              <tr key={l.id} className="cursor-pointer" onClick={() => setOpen(l)}>
                <td className="tnum whitespace-nowrap text-[13px] text-ink-soft">{new Date(l.at).toLocaleString("en-GB")}</td>
                <td className="text-[13.5px]">{l.user_id ? users[l.user_id] || "مستخدم" : "النظام"}</td>
                <td><span className={l.action === "delete" ? "text-loss" : ""}>{ACTION[l.action] || l.action}</span> · {TABLE[l.table_name] || l.table_name}</td>
                <td className="text-[13.5px]">{describe(l)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {count > PAGE && (
          <div className="flex items-center justify-between border-t border-rule px-4 py-3 text-[13.5px]">
            <span className="text-muted">{page * PAGE + 1}–{Math.min(count, page * PAGE + PAGE)} من {count}</span>
            <div className="flex gap-2"><button className="btn-ghost !py-1.5" disabled={page === 0} onClick={() => setPage(page - 1)}>الأحدث</button><button className="btn-ghost !py-1.5" disabled={(page + 1) * PAGE >= count} onClick={() => setPage(page + 1)}>الأقدم</button></div>
          </div>
        )}
      </div>
      <Modal open={!!open} onClose={() => setOpen(null)} title="تفاصيل السجل" wide>
        {open && (
          <div className="space-y-3 text-[13.5px]">
            <p>{ACTION[open.action]} في {TABLE[open.table_name]} — {new Date(open.at).toLocaleString("en-GB")}</p>
            {open.action === "update" ? (
              <table className="ledger"><thead><tr><th>الحقل</th><th>قبل</th><th>بعد</th></tr></thead>
                <tbody>{changed.map((k) => <tr key={k}><td className="tnum">{k}</td><td className="text-loss" dir="ltr">{JSON.stringify(open.old_data![k])}</td><td className="text-gain" dir="ltr">{JSON.stringify(open.new_data![k])}</td></tr>)}</tbody></table>
            ) : (
              <pre className="max-h-96 overflow-auto rounded-field bg-paper p-3 text-[12px]" dir="ltr">{JSON.stringify(open.new_data || open.old_data, null, 2)}</pre>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
