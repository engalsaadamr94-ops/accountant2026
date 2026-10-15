"use client";

import { useEffect, useState } from "react";
import { Lock, Unlock } from "lucide-react";
import { useBook } from "@/lib/book";
import { supabase } from "@/lib/supabase/client";
import { addDays, dateLong, errorText, todayISO } from "@/lib/format";
import { Field, Spinner, useConfirm, useToast } from "@/components/ui";

export default function LockPanel() {
  const { book, canAdmin, reloadBooks } = useBook();
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const [date, setDate] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const t = todayISO();
    setDate(book?.lock_date || addDays(`${t.slice(0, 8)}01`, -1));
  }, [book]);
  if (!book) return null;

  async function apply(value: string | null) {
    if (value === null && !(await confirm("فتح الفترات", "سيُسمح بالترحيل والعكس في الفترات المقفلة سابقاً. يُسجَّل هذا في سجل التدقيق.", { ok: "فتح" }))) return;
    setBusy(true);
    const { error } = await supabase().from("books").update({ lock_date: value }).eq("id", book!.id);
    setBusy(false);
    if (error) return toast(errorText(error), "error");
    await reloadBooks();
    toast(value ? `أُقفلت الفترة حتى ${dateLong(value)}` : "فُتحت كل الفترات");
  }

  return (
    <section className="panel space-y-4 p-5">
      <h2 className="text-[16px] font-bold">إقفال الفترات</h2>
      <p className="text-[14px] text-ink-soft">بعد مراجعة شهر أو سنة، أقفلها حتى لا يتغير أي رقم فيها: لا ترحيل ولا عكس بتاريخ مساوٍ لتاريخ الإقفال أو قبله. التصحيح بعدها يكون بقيد بتاريخ لاحق.</p>
      <div className={`rounded-field px-4 py-3 text-[14px] ${book.lock_date ? "bg-brand-tint" : "bg-amber-tint"}`}>
        {book.lock_date ? <>الدفتر مقفل حتى <b>{dateLong(book.lock_date)}</b> (شاملاً).</> : "لا توجد فترات مقفلة؛ يمكن الترحيل بأي تاريخ."}
      </div>
      {canAdmin ? (
        <div className="flex flex-wrap items-end gap-3">
          <Field label="إقفال حتى تاريخ" htmlFor="l-date"><input id="l-date" type="date" className="field" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} /></Field>
          <button className="btn-primary" disabled={busy || !date} onClick={() => apply(date)}>{busy ? <Spinner /> : <Lock className="h-4 w-4" />} إقفال</button>
          {book.lock_date && <button className="btn-ghost" disabled={busy} onClick={() => apply(null)}><Unlock className="h-4 w-4" /> فتح الكل</button>}
        </div>
      ) : <p className="text-[13px] text-muted">الإقفال لمدير الدفتر.</p>}
      {dialog}
    </section>
  );
}
