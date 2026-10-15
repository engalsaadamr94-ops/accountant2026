"use client";

import { useState } from "react";
import { Plus, Pencil } from "lucide-react";
import { useBook } from "@/lib/book";
import { supabase } from "@/lib/supabase/client";
import { errorText } from "@/lib/format";
import { ErrorBox, Field, Modal, Spinner, useToast } from "@/components/ui";
import type { CostCenter } from "@/lib/types";

const KIND = { personal: "شخصي", business: "عمل حر", project: "مشروع" } as const;
type F = { id?: string; code: string; name: string; kind: CostCenter["kind"]; notes: string; is_active: boolean };

export default function CostCentersPanel() {
  const { book, costCenters, canWrite, refresh } = useBook();
  const toast = useToast();
  const [f, setF] = useState<F | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!book) return null;

  async function save() {
    if (!f) return;
    if (!f.name.trim() || !f.code.trim()) return setError("الرمز والاسم مطلوبان");
    setBusy(true); setError(null);
    const row = { code: f.code.trim(), name: f.name.trim(), kind: f.kind, notes: f.notes || null, is_active: f.is_active };
    const { error } = f.id ? await supabase().from("cost_centers").update(row).eq("id", f.id) : await supabase().from("cost_centers").insert({ ...row, book_id: book!.id });
    setBusy(false);
    if (error) return setError(errorText(error));
    setF(null); toast("حُفظ"); refresh(["costCenters"]);
  }
  const nextCode = () => { let i = costCenters.length + 1; while (costCenters.some((c) => c.code === `PR${i}`)) i++; return `PR${i}`; };

  return (
    <div className="space-y-4">
      <section className="panel overflow-x-auto">
        <div className="flex items-center justify-between border-b border-rule px-5 py-3">
          <h2 className="text-[16px] font-bold">مراكز التكلفة والمشاريع</h2>
          {canWrite && <button className="btn-ghost !py-1.5" onClick={() => { setError(null); setF({ code: nextCode(), name: "", kind: "project", notes: "", is_active: true }); }}><Plus className="h-4 w-4" /> مشروع</button>}
        </div>
        <table className="ledger">
          <thead><tr><th>الرمز</th><th>الاسم</th><th>النوع</th><th className="w-10" /></tr></thead>
          <tbody>
            {costCenters.map((c) => (
              <tr key={c.id} className={c.is_active ? "" : "opacity-50"}>
                <td className="tnum text-muted">{c.code}</td><td className="font-medium">{c.name}{c.notes && <div className="text-[12px] font-normal text-muted">{c.notes}</div>}</td><td className="text-ink-soft">{KIND[c.kind]}</td>
                <td>{canWrite && <button className="btn-quiet !px-2" aria-label={`تعديل ${c.name}`} onClick={() => { setError(null); setF({ id: c.id, code: c.code, name: c.name, kind: c.kind, notes: c.notes || "", is_active: c.is_active }); }}><Pencil className="h-4 w-4" /></button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <p className="text-[13px] text-muted">أضف كل مشروع هندسي كمركز تكلفة، ثم اختره عند تسجيل إيراداته ومصروفاته؛ تقرير «ربحية المشاريع» يعرض صافي كل مشروع.</p>
      <Modal open={!!f} onClose={() => setF(null)} title={f?.id ? "تعديل" : "مشروع أو مركز تكلفة جديد"}
        footer={<><button className="btn-ghost" onClick={() => setF(null)}>تراجع</button><button className="btn-primary" disabled={busy} onClick={save}>{busy && <Spinner />} حفظ</button></>}>
        {f && <div className="space-y-4">
          {error && <ErrorBox error={error} />}
          <div className="grid gap-4 sm:grid-cols-[110px_1fr]">
            <Field label="الرمز" htmlFor="cc-code"><input id="cc-code" dir="ltr" className="field text-left" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} /></Field>
            <Field label="الاسم" htmlFor="cc-name"><input id="cc-name" className="field" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="مثلاً: تصميم إطفاء فيلا الياسمين" /></Field>
          </div>
          <Field label="النوع" htmlFor="cc-kind"><select id="cc-kind" className="field" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as CostCenter["kind"] })}>{(Object.keys(KIND) as CostCenter["kind"][]).map((k) => <option key={k} value={k}>{KIND[k]}</option>)}</select></Field>
          <Field label="ملاحظات" htmlFor="cc-notes"><input id="cc-notes" className="field" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="العميل، قيمة العقد…" /></Field>
          {f.id && <label className="flex items-center gap-2 text-[14px]"><input type="checkbox" checked={f.is_active} onChange={(e) => setF({ ...f, is_active: e.target.checked })} /> نشط</label>}
        </div>}
      </Modal>
    </div>
  );
}
