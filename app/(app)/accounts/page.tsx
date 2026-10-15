"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronDown, Plus, Pencil, Search, Lock, FileSpreadsheet } from "lucide-react";
import { useBook } from "@/lib/book";
import { supabase } from "@/lib/supabase/client";
import { exportExcel } from "@/lib/export";
import { SCOPE_LABEL, TYPE_LABEL, errorText, n, natural } from "@/lib/format";
import { accountTree } from "@/components/pickers";
import { normalizeArabic, ErrorBox, Field, Loading, Modal, Money, PageHeader, Spinner, Tabs, useConfirm, useToast } from "@/components/ui";
import type { Account, AccountType, Scope, TBRow } from "@/lib/types";

type Form = { id?: string; parent_id: string | null; code: string; name: string; type: AccountType; scope: Scope; notes: string; is_active: boolean; system: boolean };

export default function AccountsPage() {
  const { book, accounts, canWrite, refresh } = useBook();
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const [tb, setTb] = useState<Record<string, number> | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const [type, setType] = useState<"all" | AccountType>("all");
  const [form, setForm] = useState<Form | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadTb = useCallback(async () => {
    if (!book) return;
    const { data } = await supabase().rpc("report_trial_balance", { p_book: book.id, p_from: null, p_to: null });
    setTb(Object.fromEntries(((data as TBRow[]) || []).map((r) => [r.account_id, n(r.closing)])));
  }, [book]);
  useEffect(() => { loadTb(); }, [loadTb]);

  const tree = useMemo(() => accountTree(accounts), [accounts]);
  // تجميع أرصدة الفروع إلى الآباء
  const totals = useMemo(() => {
    const t: Record<string, number> = {};
    if (!tb) return t;
    const byId = Object.fromEntries(accounts.map((a) => [a.id, a]));
    for (const [id, v] of Object.entries(tb)) {
      let cur: Account | undefined = byId[id];
      while (cur) { t[cur.id] = Math.round(((t[cur.id] || 0) + v) * 100) / 100; cur = cur.parent_id ? byId[cur.parent_id] : undefined; }
    }
    return t;
  }, [tb, accounts]);
  useEffect(() => { setOpen(new Set(tree.filter((a) => a.depth < 1).map((a) => a.id))); }, [tree.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const searching = q.trim().length > 0;
  const visible = useMemo(() => {
    const byId = Object.fromEntries(tree.map((a) => [a.id, a]));
    const ok = (a: Account) => type === "all" || a.type === type;
    if (searching) {
      const s = normalizeArabic(q);
      return tree.filter((a) => ok(a) && normalizeArabic(`${a.code} ${a.name}`).includes(s));
    }
    return tree.filter((a) => {
      if (!ok(a)) return false;
      let p = a.parent_id;
      while (p) { if (!open.has(p)) return false; p = byId[p]?.parent_id || null; }
      return true;
    });
  }, [tree, open, q, searching, type]);

  function suggestCode(parent: Account | null): string {
    const siblings = accounts.filter((a) => a.parent_id === (parent?.id || null));
    const prefix = parent ? parent.code : "";
    const width = parent ? (parent.code.length >= 4 ? 2 : parent.code.length === 1 ? 1 : 2) : 1;
    for (let i = 1; i < 100; i++) {
      const code = prefix + String(i).padStart(width, "0");
      if (!accounts.some((a) => a.code === code)) return code;
    }
    return prefix + String(siblings.length + 1);
  }

  function newChild(parent: Account) {
    setError(null);
    setForm({ parent_id: parent.id, code: suggestCode(parent), name: "", type: parent.type, scope: parent.scope, notes: "", is_active: true, system: false });
  }

  async function save() {
    if (!form || !book) return;
    if (!form.name.trim() || !form.code.trim()) return setError("الرمز والاسم مطلوبان");
    setBusy(true);
    setError(null);
    const sb = supabase();
    const res = form.id
      ? await sb.from("accounts").update({ name: form.name.trim(), code: form.code.trim(), scope: form.scope, notes: form.notes || null, is_active: form.is_active }).eq("id", form.id)
      : await sb.from("accounts").insert({ book_id: book.id, parent_id: form.parent_id, code: form.code.trim(), name: form.name.trim(), type: form.type, scope: form.scope, notes: form.notes || null });
    setBusy(false);
    if (res.error) return setError(errorText(res.error));
    await refresh(["accounts"]);
    if (form.parent_id) setOpen((o) => new Set(o).add(form.parent_id!));
    setForm(null);
    toast(form.id ? "حُفظ الحساب" : `أُضيف الحساب ${form.code}`);
  }

  async function remove() {
    if (!form?.id) return;
    if (!(await confirm("حذف الحساب", `سيُحذف «${form.name}» نهائياً. يُسمح بالحذف فقط إن لم تكن عليه حركات ولا فروع؛ وإلا عطّله.`, { danger: true, ok: "حذف" }))) return;
    const { error } = await supabase().from("accounts").delete().eq("id", form.id);
    if (error) return setError(/foreign key/i.test(error.message) ? "لا يمكن حذف حساب عليه حركات؛ يمكنك تعطيله بدلاً من ذلك." : errorText(error));
    await refresh(["accounts"]);
    setForm(null);
    toast("حُذف الحساب");
  }

  async function doExport() {
    await exportExcel("دليل الحسابات", "الدليل", tree.map((a) => ({
      "الرمز": a.code, "الحساب": "  ".repeat(a.depth) + a.name, "النوع": TYPE_LABEL[a.type], "النطاق": SCOPE_LABEL[a.scope],
      "يقبل قيوداً": a.is_postable ? "نعم" : "لا", "نشط": a.is_active ? "نعم" : "لا", "الرصيد": totals[a.id] ? natural(totals[a.id], a.type) : 0,
    })));
  }

  if (!book || !tb) return <Loading />;
  const roots = tree.filter((a) => a.depth === 0);

  return (
    <div>
      <PageHeader title="دليل الحسابات" subtitle={`${accounts.length} حساباً في خمس مجموعات. الرصيد يظهر بطبيعة الحساب، ويُجمع رصيد كل حساب رئيسي من فروعه.`}
        actions={<button className="btn-ghost" onClick={doExport}><FileSpreadsheet className="h-4 w-4" /> Excel</button>} />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input className="field pr-9" placeholder="ابحث بالرمز أو الاسم" value={q} onChange={(e) => setQ(e.target.value)} aria-label="بحث في الحسابات" />
        </div>
        <Tabs value={type} onChange={setType} items={[{ value: "all", label: "الكل" }, ...(["asset", "liability", "equity", "revenue", "expense"] as AccountType[]).map((t) => ({ value: t, label: TYPE_LABEL[t] }))]} />
        {!searching && <button className="btn-quiet" onClick={() => setOpen(new Set(open.size > roots.length ? roots.map((r) => r.id) : tree.filter((a) => a.hasChildren).map((a) => a.id)))}>{open.size > roots.length ? "طيّ الكل" : "فتح الكل"}</button>}
      </div>

      <div className="panel overflow-x-auto">
        <table className="ledger min-w-[640px]">
          <thead><tr><th>الحساب</th><th>النطاق</th><th className="amt">الرصيد</th><th className="w-24" /></tr></thead>
          <tbody>
            {visible.map((a) => {
              const bal = totals[a.id] || 0;
              const isOpen = open.has(a.id);
              return (
                <tr key={a.id} className={a.is_active ? "" : "opacity-50"}>
                  <td>
                    <div className="flex items-center gap-1.5" style={{ paddingInlineStart: searching ? 0 : `${a.depth * 1.25}rem` }}>
                      {a.hasChildren && !searching ? (
                        <button className="grid h-6 w-6 place-items-center rounded text-muted hover:bg-brand-tint" aria-expanded={isOpen} aria-label={isOpen ? "طيّ" : "فتح"}
                          onClick={() => setOpen((o) => { const x = new Set(o); if (x.has(a.id)) x.delete(a.id); else x.add(a.id); return x; })}>
                          {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
                        </button>
                      ) : <span className="w-6" />}
                      <span className="num w-16 shrink-0 text-[13px] text-muted">{a.code}</span>
                      {a.is_postable ? (
                        <Link href={`/reports/statement?account=${a.id}`} className="hover:text-brand">{a.name}</Link>
                      ) : <span className={a.depth === 0 ? "font-display font-bold" : "font-semibold"}>{a.name}</span>}
                      {a.system_key && <Lock className="h-3 w-3 text-muted" aria-label="حساب نظامي" />}
                    </div>
                  </td>
                  <td className="text-[13px] text-ink-soft">{SCOPE_LABEL[a.scope]}</td>
                  <td className="amt">{bal ? <Money v={natural(bal, a.type)} signed className={a.is_postable ? "" : "font-semibold"} /> : <span className="text-muted">—</span>}</td>
                  <td className="text-end whitespace-nowrap">
                    {canWrite && (
                      <>
                        <button className="btn-quiet !px-2" title="إضافة حساب فرعي" aria-label={`إضافة فرعي تحت ${a.name}`} onClick={() => newChild(a)}><Plus className="h-4 w-4" /></button>
                        <button className="btn-quiet !px-2" title="تعديل" aria-label={`تعديل ${a.name}`} onClick={() => { setError(null); setForm({ id: a.id, parent_id: a.parent_id, code: a.code, name: a.name, type: a.type, scope: a.scope, notes: a.notes || "", is_active: a.is_active, system: !!a.system_key }); }}><Pencil className="h-4 w-4" /></button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-[12.5px] text-muted">إضافة حساب فرعي تحت حساب عليه حركات غير مسموحة، لأن الحساب الرئيسي لا يقبل قيوداً. الحسابات النظامية (بالقفل) يعتمد عليها البرنامج ولا تُحذف.</p>

      <Modal open={!!form} onClose={() => setForm(null)} title={form?.id ? "تعديل حساب" : "حساب فرعي جديد"}
        footer={<>
          {form?.id && !form.system && <button className="btn-danger me-auto" onClick={remove}>حذف</button>}
          <button className="btn-ghost" onClick={() => setForm(null)}>تراجع</button>
          <button className="btn-primary" disabled={busy} onClick={save}>{busy && <Spinner />} حفظ</button>
        </>}>
        {form && (
          <div className="space-y-4">
            {error && <ErrorBox error={error} />}
            {!form.id && form.parent_id && <p className="text-[14px] text-ink-soft">تحت: <b>{accounts.find((a) => a.id === form.parent_id)?.name}</b> ({TYPE_LABEL[form.type]})</p>}
            <div className="grid gap-4 sm:grid-cols-[120px_1fr]">
              <Field label="الرمز" htmlFor="a-code"><input id="a-code" dir="ltr" className="field num text-left" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.replace(/\D/g, "") })} /></Field>
              <Field label="اسم الحساب" htmlFor="a-name"><input id="a-name" className="field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            </div>
            <Field label="النطاق" htmlFor="a-scope" hint="يحدد في أي قسم من قائمة الدخل يظهر الحساب">
              <select id="a-scope" className="field" value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value as Scope })}>
                {(Object.keys(SCOPE_LABEL) as Scope[]).map((s) => <option key={s} value={s}>{SCOPE_LABEL[s]}</option>)}
              </select>
            </Field>
            <Field label="ملاحظات" htmlFor="a-notes"><textarea id="a-notes" className="field" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
            {form.id && <label className="flex items-center gap-2 text-[14px]"><input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} /> نشط (المعطّل لا يظهر في القوائم ولا يقبل قيوداً جديدة)</label>}
          </div>
        )}
      </Modal>
      {dialog}
    </div>
  );
}
