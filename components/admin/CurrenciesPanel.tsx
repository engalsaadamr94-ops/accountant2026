"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { useBook } from "@/lib/book";
import { supabase } from "@/lib/supabase/client";
import { dateLong, errorText, todayISO } from "@/lib/format";
import { AmountInput, ErrorBox, Field, Modal, Spinner, useToast } from "@/components/ui";

type Rate = { id: string; currency_code: string; rate_date: string; rate: number };

export default function CurrenciesPanel() {
  const { book, currencies, canWrite, refresh } = useBook();
  const toast = useToast();
  const [rates, setRates] = useState<Rate[]>([]);
  const [rateForm, setRateForm] = useState<{ code: string; date: string; rate: string } | null>(null);
  const [curForm, setCurForm] = useState<{ code: string; name: string; symbol: string; rate: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!book) return;
    const { data } = await supabase().from("fx_rates").select("*").eq("book_id", book.id).order("rate_date", { ascending: false }).limit(60);
    setRates((data as Rate[]) || []);
  }, [book]);
  useEffect(() => { load(); }, [load]);
  if (!book) return null;
  const latest = (code: string) => rates.find((r) => r.currency_code === code);

  async function saveRate() {
    if (!rateForm || !book) return;
    setBusy(true); setError(null);
    const { error } = await supabase().from("fx_rates").upsert({ book_id: book.id, currency_code: rateForm.code, rate_date: rateForm.date, rate: Number(rateForm.rate) }, { onConflict: "book_id,currency_code,rate_date" });
    setBusy(false);
    if (error) return setError(errorText(error));
    setRateForm(null); toast("حُفظ السعر"); load();
  }
  async function saveCur() {
    if (!curForm || !book) return;
    const code = curForm.code.trim().toUpperCase();
    if (!/^[A-Z_]{3,8}$/.test(code)) return setError("رمز العملة 3 أحرف إنجليزية على الأقل، مثل EGP");
    setBusy(true); setError(null);
    const { error } = await supabase().from("currencies").insert({ book_id: book.id, code, name: curForm.name || code, symbol: curForm.symbol || null, default_rate: Number(curForm.rate) || 1 });
    setBusy(false);
    if (error) return setError(errorText(error));
    setCurForm(null); toast("أُضيفت العملة"); refresh(["currencies"]);
  }
  async function toggle(code: string, active: boolean) {
    const { error } = await supabase().from("currencies").update({ is_active: active }).eq("book_id", book!.id).eq("code", code);
    if (error) return toast(errorText(error), "error");
    refresh(["currencies"]);
  }

  return (
    <div className="space-y-6">
      <section className="panel overflow-x-auto">
        <div className="flex items-center justify-between border-b border-rule px-5 py-3">
          <h2 className="text-[16px] font-bold">العملات</h2>
          {canWrite && <button className="btn-ghost !py-1.5" onClick={() => { setError(null); setCurForm({ code: "", name: "", symbol: "", rate: "" }); }}><Plus className="h-4 w-4" /> عملة</button>}
        </div>
        <table className="ledger min-w-[560px]">
          <thead><tr><th>العملة</th><th className="amt">آخر سعر مقابل {book.base_currency}</th><th>تاريخه</th><th /></tr></thead>
          <tbody>
            {currencies.map((c) => {
              const r = latest(c.code);
              return (
                <tr key={c.code} className={c.is_active ? "" : "opacity-50"}>
                  <td><span className="font-medium">{c.name}</span> <span className="num text-[12px] text-muted">{c.code}</span>{c.is_base && <span className="ms-2 text-[12px] text-brand">الأساسية</span>}</td>
                  <td className="amt"><span className="num">{c.is_base ? "1" : Number(r?.rate ?? c.default_rate).toString()}</span></td>
                  <td className="text-ink-soft">{c.is_base ? "—" : r ? dateLong(r.rate_date) : "الافتراضي"}</td>
                  <td className="text-end whitespace-nowrap">
                    {!c.is_base && canWrite && <>
                      <button className="btn-quiet !py-1" onClick={() => { setError(null); setRateForm({ code: c.code, date: todayISO(), rate: String(r?.rate ?? c.default_rate) }); }}>تحديث السعر</button>
                      <button className="btn-quiet !py-1" onClick={() => toggle(c.code, !c.is_active)}>{c.is_active ? "تعطيل" : "تفعيل"}</button>
                    </>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
      <p className="text-[13px] text-muted">الريال اليمني مسجل بعملتين منفصلتين (عدن وصنعاء) لاختلاف سعر الصرف بين المنطقتين. السعر يُستخدم افتراضياً في السندات بتاريخها، ويمكنك تعديله في كل سند.</p>

      {rates.length > 0 && (
        <section className="panel overflow-x-auto">
          <h2 className="border-b border-rule px-5 py-3 text-[16px] font-bold">سجل الأسعار</h2>
          <table className="ledger"><thead><tr><th>التاريخ</th><th>العملة</th><th className="amt">السعر</th></tr></thead>
            <tbody>{rates.map((r) => <tr key={r.id}><td>{dateLong(r.rate_date)}</td><td>{currencies.find((c) => c.code === r.currency_code)?.name || r.currency_code}</td><td className="amt"><span className="num">{Number(r.rate)}</span></td></tr>)}</tbody>
          </table>
        </section>
      )}

      <Modal open={!!rateForm} onClose={() => setRateForm(null)} title="سعر صرف"
        footer={<><button className="btn-ghost" onClick={() => setRateForm(null)}>تراجع</button><button className="btn-primary" disabled={busy} onClick={saveRate}>{busy && <Spinner />} حفظ</button></>}>
        {rateForm && <div className="space-y-4">
          {error && <ErrorBox error={error} />}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="التاريخ" htmlFor="r-date"><input id="r-date" type="date" className="field" value={rateForm.date} onChange={(e) => setRateForm({ ...rateForm, date: e.target.value })} /></Field>
            <Field label={`1 ${rateForm.code} = ? ${book.base_currency}`} htmlFor="r-rate"><AmountInput id="r-rate" value={rateForm.rate} onChange={(v) => setRateForm({ ...rateForm, rate: v })} /></Field>
          </div>
          {Number(rateForm.rate) > 0 && Number(rateForm.rate) < 1 && <p className="text-[12.5px] text-muted">أي أن 1 {book.base_currency} = <span className="num">{(1 / Number(rateForm.rate)).toFixed(2)}</span> {rateForm.code}</p>}
        </div>}
      </Modal>
      <Modal open={!!curForm} onClose={() => setCurForm(null)} title="عملة جديدة"
        footer={<><button className="btn-ghost" onClick={() => setCurForm(null)}>تراجع</button><button className="btn-primary" disabled={busy} onClick={saveCur}>{busy && <Spinner />} إضافة</button></>}>
        {curForm && <div className="space-y-4">
          {error && <ErrorBox error={error} />}
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="الرمز" htmlFor="c-code"><input id="c-code" dir="ltr" className="field text-left" value={curForm.code} onChange={(e) => setCurForm({ ...curForm, code: e.target.value.toUpperCase() })} placeholder="EGP" /></Field>
            <Field label="الاسم" htmlFor="c-name" className="sm:col-span-2"><input id="c-name" className="field" value={curForm.name} onChange={(e) => setCurForm({ ...curForm, name: e.target.value })} placeholder="جنيه مصري" /></Field>
          </div>
          <Field label={`السعر الافتراضي: 1 وحدة = ? ${book.base_currency}`} htmlFor="c-rate"><AmountInput id="c-rate" value={curForm.rate} onChange={(v) => setCurForm({ ...curForm, rate: v })} /></Field>
        </div>}
      </Modal>
    </div>
  );
}
