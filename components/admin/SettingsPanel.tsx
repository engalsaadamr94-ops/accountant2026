"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useBook } from "@/lib/book";
import { supabase } from "@/lib/supabase/client";
import { rpc } from "@/lib/api";
import { errorText } from "@/lib/format";
import { ErrorBox, Field, Modal, Spinner, useToast } from "@/components/ui";

const MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];

export default function SettingsPanel() {
  const { book, canAdmin, reloadBooks, refresh, role } = useBook();
  const toast = useToast();
  const router = useRouter();
  const [f, setF] = useState(book!);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [del, setDel] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  useEffect(() => { if (book) setF(book); }, [book]);
  if (!book) return null;
  const ro = !canAdmin;

  async function save() {
    setBusy(true);
    setError(null);
    const { error } = await supabase().from("books").update({
      name: f.name, owner_name: f.owner_name, phone: f.phone, address: f.address, fiscal_year_start_month: f.fiscal_year_start_month,
      has_business: f.has_business, vat_enabled: f.vat_enabled, vat_number: f.vat_number, vat_rate: f.vat_rate,
    }).eq("id", book!.id);
    setBusy(false);
    if (error) return setError(errorText(error));
    await reloadBooks();
    await refresh(["accounts"]);
    toast("حُفظت الإعدادات");
  }
  async function deleteBook() {
    try {
      await rpc("delete_book", { p_book: book!.id, p_confirm: confirmName });
      toast("حُذف الدفتر");
      await reloadBooks();
      router.replace("/");
    } catch (e) { toast((e as Error).message, "error"); }
  }

  return (
    <div className="space-y-6">
      <section className="panel space-y-4 p-5">
        <h2 className="text-[16px] font-bold">بيانات الدفتر</h2>
        {error && <ErrorBox error={error} />}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="اسم الدفتر" htmlFor="s-name"><input id="s-name" className="field" disabled={ro} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="اسم المالك (يظهر على السندات)" htmlFor="s-owner"><input id="s-owner" className="field" disabled={ro} value={f.owner_name || ""} onChange={(e) => setF({ ...f, owner_name: e.target.value })} /></Field>
          <Field label="الجوال" htmlFor="s-phone"><input id="s-phone" dir="ltr" className="field text-left" disabled={ro} value={f.phone || ""} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
          <Field label="العنوان" htmlFor="s-addr"><input id="s-addr" className="field" disabled={ro} value={f.address || ""} onChange={(e) => setF({ ...f, address: e.target.value })} /></Field>
          <Field label="بداية السنة المالية" htmlFor="s-fy" hint="تؤثر على ترقيم السندات السنوي">
            <select id="s-fy" className="field" disabled={ro} value={f.fiscal_year_start_month} onChange={(e) => setF({ ...f, fiscal_year_start_month: Number(e.target.value) })}>{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select>
          </Field>
          <Field label="العملة الأساسية" htmlFor="s-base" hint="لا تتغير بعد ترحيل قيود"><input id="s-base" className="field" disabled value={f.base_currency} /></Field>
        </div>
        <label className="flex items-start gap-2.5 text-[14px]"><input type="checkbox" className="mt-1" disabled={ro} checked={f.has_business} onChange={(e) => setF({ ...f, has_business: e.target.checked })} />
          <span>لدي عمل حر أو نشاط تجاري<span className="block text-[12.5px] text-muted">إلغاؤه يعطّل حسابات العمل في الدليل دون حذف أي حركة.</span></span></label>
      </section>

      <section className="panel space-y-4 p-5">
        <h2 className="text-[16px] font-bold">ضريبة القيمة المضافة</h2>
        <label className="flex items-center gap-2.5 text-[14px]"><input type="checkbox" disabled={ro} checked={f.vat_enabled} onChange={(e) => setF({ ...f, vat_enabled: e.target.checked })} /> النشاط مسجل في ضريبة القيمة المضافة</label>
        {f.vat_enabled && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="الرقم الضريبي" htmlFor="s-vat"><input id="s-vat" dir="ltr" className="field num text-left" disabled={ro} value={f.vat_number || ""} onChange={(e) => setF({ ...f, vat_number: e.target.value })} /></Field>
            <Field label="النسبة %" htmlFor="s-rate"><input id="s-rate" dir="ltr" className="field num text-left" disabled={ro} value={String(f.vat_rate)} onChange={(e) => setF({ ...f, vat_rate: e.target.value })} /></Field>
          </div>
        )}
        <p className="text-[12.5px] text-muted">فواتير المبيعات والمشتريات بالضريبة ورمز QR وإقرار الضريبة تأتي في المرحلة الثانية؛ الحسابات اللازمة (ضريبة المدخلات والمخرجات) موجودة في الدليل.</p>
      </section>

      {canAdmin && <div className="flex justify-end"><button className="btn-primary" disabled={busy} onClick={save}>{busy && <Spinner />} حفظ الإعدادات</button></div>}

      {role === "owner" && (
        <section className="rounded-panel border border-loss/40 p-5">
          <h2 className="text-[16px] font-bold text-loss">حذف الدفتر</h2>
          <p className="mt-1 text-[14px] text-ink-soft">يحذف الدفتر وكل قيوده وبياناته نهائياً لكل المستخدمين. خذ نسخة احتياطية أولاً.</p>
          <button className="btn-danger mt-3" onClick={() => { setConfirmName(""); setDel(true); }}>حذف هذا الدفتر</button>
        </section>
      )}
      <Modal open={del} onClose={() => setDel(false)} title="تأكيد حذف الدفتر"
        footer={<><button className="btn-ghost" onClick={() => setDel(false)}>تراجع</button><button className="btn-danger" disabled={confirmName !== book.name} onClick={deleteBook}>حذف نهائي</button></>}>
        <Field label={`اكتب اسم الدفتر «${book.name}» للتأكيد`} htmlFor="del-n"><input id="del-n" className="field" value={confirmName} onChange={(e) => setConfirmName(e.target.value)} /></Field>
      </Modal>
    </div>
  );
}
