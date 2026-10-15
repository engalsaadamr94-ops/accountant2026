"use client";

import Link from "next/link";
import { useState } from "react";
import { Plus, Pencil, Wallet, Landmark, Smartphone, CreditCard, ArrowLeftRight } from "lucide-react";
import { useBook } from "@/lib/book";
import { supabase } from "@/lib/supabase/client";
import { rpc } from "@/lib/api";
import { CASH_KIND_LABEL, add, cur, dateLong, errorText, n } from "@/lib/format";
import { CurrencySelect } from "@/components/pickers";
import { EmptyState, ErrorBox, Field, Modal, Money, PageHeader, Spinner, useToast } from "@/components/ui";
import type { CashBalance } from "@/lib/types";

const ICON = { cash: Wallet, bank: Landmark, wallet: Smartphone, card: CreditCard };

type Form = { id?: string; name: string; kind: CashBalance["kind"]; currency: string; bank_name: string; iban: string; allow_negative: boolean; is_active: boolean };

export default function CashPage() {
  const { book, cash, canWrite, refresh } = useBook();
  const toast = useToast();
  const [form, setForm] = useState<Form | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(false);

  if (!book) return null;
  const list = cash.filter((c) => showInactive || c.is_active);
  const liquid = cash.filter((c) => c.kind !== "card" && c.is_active);
  const cards = cash.filter((c) => c.kind === "card" && c.is_active);
  const total = add(...liquid.map((c) => c.balance_base));
  const cardsOwed = add(...cards.map((c) => -n(c.balance_base)));

  async function save() {
    if (!form || !book) return;
    if (!form.name.trim()) return setError("الاسم مطلوب");
    setBusy(true);
    setError(null);
    try {
      if (form.id) {
        const { error } = await supabase().from("cash_accounts").update({ name: form.name.trim(), bank_name: form.bank_name || null, iban: form.iban || null, allow_negative: form.allow_negative, is_active: form.is_active }).eq("id", form.id);
        if (error) throw new Error(errorText(error));
        toast("حُفظت التعديلات");
      } else {
        await rpc("create_cash_account", { p: { book_id: book.id, name: form.name.trim(), kind: form.kind, currency: form.currency, bank_name: form.bank_name, iban: form.iban, allow_negative: form.kind === "card" ? true : form.allow_negative } });
        toast(`أُضيف «${form.name.trim()}»`);
      }
      await refresh(["cash", "accounts"]);
      setForm(null);
    } catch (e) { setError((e as Error).message); }
    setBusy(false);
  }

  return (
    <div>
      <PageHeader title="الصناديق والبنوك" subtitle="كل مكان يوجد فيه مالك: نقد، حسابات بنكية، محافظ إلكترونية، وبطاقات ائتمان."
        actions={canWrite && <>
          <Link href="/vouchers/new?type=transfer" className="btn-ghost"><ArrowLeftRight className="h-4 w-4" /> تحويل</Link>
          <button className="btn-primary" onClick={() => { setError(null); setForm({ name: "", kind: "bank", currency: book.base_currency, bank_name: "", iban: "", allow_negative: false, is_active: true }); }}><Plus className="h-4 w-4" /> إضافة</button>
        </>} />

      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <div className="panel px-5 py-4">
          <div className="text-[13px] text-muted">إجمالي النقد المتاح (بالعملة الأساسية)</div>
          <Money v={total} cur={book.base_currency} className="mt-1 font-display text-[26px] font-bold" />
        </div>
        {cards.length > 0 && (
          <div className="panel px-5 py-4">
            <div className="text-[13px] text-muted">المستحق على البطاقات</div>
            <Money v={cardsOwed} cur={book.base_currency} className="mt-1 font-display text-[26px] font-bold text-amber" />
          </div>
        )}
      </div>

      {list.length === 0 ? <div className="panel"><EmptyState title="لا صناديق" /></div> : (
        <div className="panel overflow-x-auto">
          <table className="ledger min-w-[600px]">
            <thead><tr><th>الاسم</th><th>النوع</th><th>آخر حركة</th><th className="amt">الرصيد</th><th className="amt">بالعملة الأساسية</th><th className="w-10" /></tr></thead>
            <tbody>
              {list.map((c) => {
                const Icon = ICON[c.kind];
                const bal = c.kind === "card" ? -n(c.balance_fc) : n(c.balance_fc);
                return (
                  <tr key={c.id} className={c.is_active ? "" : "opacity-50"}>
                    <td>
                      <Link href={`/cash/${c.id}`} className="flex items-center gap-2.5 font-medium hover:text-brand">
                        <span className="grid h-8 w-8 place-items-center rounded-field bg-brand-tint text-brand"><Icon className="h-4 w-4" /></span>
                        <span>{c.name}{c.bank_name && <span className="block text-[12px] font-normal text-muted">{c.bank_name}</span>}</span>
                      </Link>
                    </td>
                    <td className="text-ink-soft">{CASH_KIND_LABEL[c.kind]}{!c.is_active && " (معطّل)"}</td>
                    <td className="text-ink-soft">{c.last_date ? dateLong(c.last_date) : "—"}</td>
                    <td className="amt">
                      <Money v={bal} cur={c.currency} signed className={`font-semibold ${c.kind === "card" ? "text-amber" : bal < 0 ? "text-loss" : ""}`} />
                      {c.kind === "card" && bal > 0 && <div className="text-[11.5px] text-muted">مستحق</div>}
                    </td>
                    <td className="amt text-ink-soft">{c.currency !== book.base_currency ? <Money v={c.kind === "card" ? -n(c.balance_base) : c.balance_base} signed /> : ""}</td>
                    <td>{canWrite && <button className="btn-quiet !px-2" aria-label={`تعديل ${c.name}`} onClick={() => { setError(null); setForm({ id: c.id, name: c.name, kind: c.kind, currency: c.currency, bank_name: c.bank_name || "", iban: c.iban || "", allow_negative: c.allow_negative, is_active: c.is_active }); }}><Pencil className="h-4 w-4" /></button>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {cash.some((c) => !c.is_active) && (
        <label className="mt-3 flex items-center gap-2 text-[13.5px] text-muted"><input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> إظهار المعطّلة</label>
      )}

      <Modal open={!!form} onClose={() => setForm(null)} title={form?.id ? "تعديل" : "إضافة صندوق أو حساب"}
        footer={<><button className="btn-ghost" onClick={() => setForm(null)}>تراجع</button><button className="btn-primary" disabled={busy} onClick={save}>{busy && <Spinner />} حفظ</button></>}>
        {form && (
          <div className="space-y-4">
            {error && <ErrorBox error={error} />}
            {!form.id && (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {(Object.keys(CASH_KIND_LABEL) as CashBalance["kind"][]).map((k) => {
                  const Icon = ICON[k];
                  return (
                    <button key={k} type="button" onClick={() => setForm({ ...form, kind: k })} aria-pressed={form.kind === k}
                      className={`rounded-field border p-3 text-center text-[13px] ${form.kind === k ? "border-brand bg-brand-tint text-brand font-semibold" : "border-rule hover:bg-brand-tint/50"}`}>
                      <Icon className="mx-auto mb-1 h-5 w-5" />{CASH_KIND_LABEL[k]}
                    </button>
                  );
                })}
              </div>
            )}
            <Field label="الاسم" htmlFor="c-name"><input id="c-name" className="field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={form.kind === "bank" ? "مثلاً: الراجحي - جاري" : form.kind === "wallet" ? "مثلاً: STC Pay" : form.kind === "card" ? "مثلاً: بطاقة الأهلي" : "مثلاً: صندوق المكتب"} /></Field>
            {!form.id && <Field label="العملة" htmlFor="c-cur" hint="لا يمكن تغييرها بعد تسجيل حركات"><CurrencySelect id="c-cur" value={form.currency} onChange={(v) => setForm({ ...form, currency: v })} /></Field>}
            {(form.kind === "bank" || form.kind === "card") && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="البنك" htmlFor="c-bank"><input id="c-bank" className="field" value={form.bank_name} onChange={(e) => setForm({ ...form, bank_name: e.target.value })} /></Field>
                {form.kind === "bank" && <Field label="الآيبان" htmlFor="c-iban"><input id="c-iban" dir="ltr" className="field text-left" value={form.iban} onChange={(e) => setForm({ ...form, iban: e.target.value.toUpperCase() })} placeholder="SA…" /></Field>}
              </div>
            )}
            {form.kind !== "card" && (
              <label className="flex items-start gap-2 text-[14px]"><input type="checkbox" className="mt-1" checked={form.allow_negative} onChange={(e) => setForm({ ...form, allow_negative: e.target.checked })} />
                <span>السماح برصيد سالب<span className="block text-[12.5px] text-muted">اتركه مغلقاً ليمنعك البرنامج من صرف أكثر من الموجود فعلاً.</span></span></label>
            )}
            {form.id && <label className="flex items-center gap-2 text-[14px]"><input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} /> نشط</label>}
            <p className="text-[12.5px] text-muted">{form.kind === "card" ? "البطاقة تُعامل كالتزام: المشتريات بها تزيد المستحق، وسدادها من البنك ينقصه." : `${cur(form.currency)} — يُنشأ له حساب في الدليل تلقائياً.`}</p>
          </div>
        )}
      </Modal>
    </div>
  );
}
