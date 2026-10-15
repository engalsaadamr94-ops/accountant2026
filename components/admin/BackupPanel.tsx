"use client";

import { useEffect, useState } from "react";
import { DatabaseBackup, FileSpreadsheet } from "lucide-react";
import { useBook } from "@/lib/book";
import { supabase } from "@/lib/supabase/client";
import { rpc, fetchAll } from "@/lib/api";
import { downloadJSON } from "@/lib/export";
import { DOC_LABEL, dateLong, n, todayISO } from "@/lib/format";
import { Spinner, useToast } from "@/components/ui";
import type { Entry, Line } from "@/lib/types";

const LS = "mahasi.lastBackup";

export default function BackupPanel() {
  const { book, accountById, partyById } = useBook();
  const toast = useToast();
  const [busy, setBusy] = useState<"" | "json" | "xlsx">("");
  const [last, setLast] = useState<string | null>(null);
  useEffect(() => { try { setLast(localStorage.getItem(`${LS}.${book?.id}`)); } catch { /* */ } }, [book]);
  if (!book) return null;

  const mark = () => { const t = todayISO(); try { localStorage.setItem(`${LS}.${book.id}`, t); } catch { /* */ } setLast(t); };

  async function json() {
    setBusy("json");
    try {
      const data = await rpc("export_book", { p_book: book!.id });
      downloadJSON(`mahasi-${book!.name}-${todayISO()}.json`, data);
      mark();
      toast("نُزّلت النسخة الاحتياطية");
    } catch (e) { toast((e as Error).message, "error"); }
    setBusy("");
  }
  async function xlsx() {
    setBusy("xlsx");
    try {
      const sb = supabase();
      const [entries, lines] = await Promise.all([
        fetchAll<Entry>((a, b) => sb.from("journal_entries").select("*").eq("book_id", book!.id).order("entry_date").range(a, b)),
        fetchAll<Line>((a, b) => sb.from("journal_lines").select("*").eq("book_id", book!.id).order("entry_id").order("line_no").range(a, b)),
      ]);
      const byId = Object.fromEntries(entries.map((e) => [e.id, e]));
      const XLSX = await import("xlsx");
      const wb = XLSX.utils.book_new();
      wb.Workbook = { Views: [{ RTL: true }] };
      const add = (name: string, rows: Record<string, unknown>[]) => XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), name);
      add("القيود", entries.map((e) => ({ "الرقم": e.number_text || "مسودة", "التاريخ": e.entry_date, "النوع": DOC_LABEL[e.doc_type], "البيان": e.memo || "", "المرجع": e.reference || "", "الطرف": e.party_id ? partyById[e.party_id]?.name || "" : "", "المبلغ": n(e.total), "الحالة": e.status })));
      add("أسطر القيود", lines.map((l) => ({ "رقم القيد": byId[l.entry_id]?.number_text || "مسودة", "التاريخ": byId[l.entry_id]?.entry_date, "رمز الحساب": accountById[l.account_id]?.code, "الحساب": accountById[l.account_id]?.name, "الطرف": l.party_id ? partyById[l.party_id]?.name || "" : "", "البيان": l.description || "", "العملة": l.currency, "سعر الصرف": n(l.fx_rate), "مدين بالعملة": n(l.debit_fc), "دائن بالعملة": n(l.credit_fc), "مدين": n(l.debit), "دائن": n(l.credit) })));
      add("الدليل", Object.values(accountById).sort((a, b) => a.code.localeCompare(b.code)).map((a) => ({ "الرمز": a.code, "الحساب": a.name, "النوع": a.type, "النطاق": a.scope, "نشط": a.is_active ? "نعم" : "لا" })));
      XLSX.writeFile(wb, `mahasi-${book!.name}-${todayISO()}.xlsx`);
      mark();
    } catch (e) { toast((e as Error).message, "error"); }
    setBusy("");
  }

  return (
    <div className="space-y-5">
      <section className="panel space-y-3 p-5">
        <h2 className="text-[16px] font-bold">نسخة احتياطية كاملة</h2>
        <p className="text-[14px] text-ink-soft">ملف JSON يحتوي كل بيانات الدفتر: الدليل، الأشخاص، الصناديق، القيود وأسطرها، الديون والأقساط، العملات والقوالب. احفظه في مكان آمن (Google Drive أو بريدك).</p>
        <p className={`text-[13.5px] ${last ? "text-muted" : "text-amber"}`}>{last ? `آخر نسخة من هذا الجهاز: ${dateLong(last)}` : "لم تأخذ نسخة احتياطية من هذا الجهاز بعد."}</p>
        <button className="btn-primary" disabled={!!busy} onClick={json}>{busy === "json" ? <Spinner /> : <DatabaseBackup className="h-4 w-4" />} تنزيل النسخة الاحتياطية</button>
      </section>
      <section className="panel space-y-3 p-5">
        <h2 className="text-[16px] font-bold">تصدير إلى Excel</h2>
        <p className="text-[14px] text-ink-soft">ملف Excel بثلاث أوراق: القيود، أسطر القيود بالحسابات، ودليل الحسابات. مناسب للمراجعة أو لنقل البيانات لمحاسب.</p>
        <button className="btn-ghost" disabled={!!busy} onClick={xlsx}>{busy === "xlsx" ? <Spinner /> : <FileSpreadsheet className="h-4 w-4" />} تصدير الدفتر كاملاً</button>
      </section>
      <p className="text-[12.5px] text-muted">قاعدة البيانات نفسها على Supabase تأخذ نسخاً احتياطية يومية تلقائياً في الخطط المدفوعة. الاستعادة من ملف JSON داخل البرنامج ستتوفر في المرحلة الثانية.</p>
    </div>
  );
}
