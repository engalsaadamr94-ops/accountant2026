"use client";

import { useEffect, useState } from "react";
import { useBook } from "@/lib/book";
import { supabase } from "@/lib/supabase/client";
import { PARTY_KIND_LABEL, errorText } from "@/lib/format";
import { ErrorBox, Field, Modal, Spinner, useToast } from "@/components/ui";
import type { Party } from "@/lib/types";

export type PartyDraft = Partial<Party> & { name: string; kind: Party["kind"] };

export default function PartyForm({ value, onClose, onSaved }: { value: PartyDraft | null; onClose: () => void; onSaved?: (p: Party) => void }) {
  const { book, refresh } = useBook();
  const toast = useToast();
  const [f, setF] = useState<PartyDraft | null>(value);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setF(value); setError(null); }, [value]);

  async function save() {
    if (!f || !book) return;
    if (!f.name.trim()) return setError("الاسم مطلوب");
    setBusy(true);
    const row = { name: f.name.trim(), kind: f.kind, relation: f.relation || null, phone: f.phone || null, email: f.email || null, vat_number: f.vat_number || null, address: f.address || null, notes: f.notes || null, is_active: f.is_active ?? true };
    const sb = supabase();
    const res = f.id ? await sb.from("parties").update(row).eq("id", f.id).select().single() : await sb.from("parties").insert({ ...row, book_id: book.id }).select().single();
    setBusy(false);
    if (res.error) return setError(errorText(res.error));
    await refresh(["parties"]);
    toast(f.id ? "حُفظت البيانات" : `أُضيف «${row.name}»`);
    onSaved?.(res.data as Party);
    onClose();
  }

  return (
    <Modal open={!!f} onClose={onClose} title={f?.id ? "تعديل البيانات" : "شخص أو جهة جديدة"}
      footer={<><button className="btn-ghost" onClick={onClose}>تراجع</button><button className="btn-primary" disabled={busy} onClick={save}>{busy && <Spinner />} حفظ</button></>}>
      {f && (
        <div className="space-y-4">
          {error && <ErrorBox error={error} />}
          <Field label="الاسم" htmlFor="p-name"><input id="p-name" className="field" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="الصفة" htmlFor="p-kind">
              <select id="p-kind" className="field" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as Party["kind"] })}>
                {(Object.keys(PARTY_KIND_LABEL) as Party["kind"][]).map((k) => <option key={k} value={k}>{PARTY_KIND_LABEL[k]}</option>)}
              </select>
            </Field>
            <Field label="العلاقة (اختياري)" htmlFor="p-rel"><input id="p-rel" className="field" list="relations" value={f.relation || ""} onChange={(e) => setF({ ...f, relation: e.target.value })} placeholder="قريب، صديق، زميل…" />
              <datalist id="relations"><option value="قريب" /><option value="صديق" /><option value="زميل" /><option value="جار" /><option value="جهة حكومية" /><option value="بنك" /></datalist>
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="الجوال" htmlFor="p-phone" hint="لإرسال التذكيرات عبر واتساب"><input id="p-phone" dir="ltr" inputMode="tel" className="field text-left" value={f.phone || ""} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="05xxxxxxxx" /></Field>
            <Field label="البريد" htmlFor="p-email"><input id="p-email" dir="ltr" type="email" className="field text-left" value={f.email || ""} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
          </div>
          {(f.kind === "customer" || f.kind === "supplier" || f.kind === "both") && (
            <Field label="الرقم الضريبي" htmlFor="p-vat"><input id="p-vat" dir="ltr" className="field num text-left" value={f.vat_number || ""} onChange={(e) => setF({ ...f, vat_number: e.target.value })} /></Field>
          )}
          <Field label="ملاحظات" htmlFor="p-notes"><textarea id="p-notes" rows={2} className="field" value={f.notes || ""} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
          {f.id && <label className="flex items-center gap-2 text-[14px]"><input type="checkbox" checked={f.is_active ?? true} onChange={(e) => setF({ ...f, is_active: e.target.checked })} /> نشط</label>}
        </div>
      )}
    </Modal>
  );
}
