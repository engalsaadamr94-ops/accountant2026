"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Trash2, Plus } from "lucide-react";
import { useBook } from "@/lib/book";
import { rpc } from "@/lib/api";
import { generateInstallments, type Frequency } from "@/lib/vouchers";
import { DEBT_KIND_LABEL, add, addMonths, cur, money, n, todayISO } from "@/lib/format";
import { AccountSelect, CashSelect, CurrencySelect, PartySelect } from "@/components/pickers";
import { AmountInput, ErrorBox, Field, Loading, PageHeader, Spinner, Tabs, useToast } from "@/components/ui";
import type { Debt } from "@/lib/types";

type Mode = "cash" | "existing";

function NewDebt() {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const { book, cash, accounts, canWrite, refresh } = useBook();
  const [direction, setDirection] = useState<"receivable" | "payable">(params.get("direction") === "payable" ? "payable" : "receivable");
  const [partyId, setPartyId] = useState(params.get("party") || "");
  const [kind, setKind] = useState("loan");
  const [title, setTitle] = useState("");
  const [principal, setPrincipal] = useState("");
  const [currency, setCurrency] = useState("");
  const [rate, setRate] = useState("1");
  const [start, setStart] = useState(todayISO());
  const [mode, setMode] = useState<Mode>("cash");
  const [cashId, setCashId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [plan, setPlan] = useState<"single" | "installments">("single");
  const [due, setDue] = useState(addMonths(todayISO(), 1));
  const [count, setCount] = useState("6");
  const [freq, setFreq] = useState<Frequency>("monthly");
  const [firstDue, setFirstDue] = useState(addMonths(todayISO(), 1));
  const [rows, setRows] = useState<{ due_date: string; amount: string }[]>([]);
  const [reminder, setReminder] = useState("3");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (book && !currency) setCurrency(book.base_currency); }, [book, currency]);
  useEffect(() => { if (!cashId && cash.length) setCashId((cash.find((c) => c.kind === "cash") || cash[0]).id); }, [cash, cashId]);
  useEffect(() => {
    if (!book || !currency) return;
    if (currency === book.base_currency) return setRate("1");
    let alive = true;
    rpc<number>("rate_on", { p_book: book.id, p_currency: currency, p_date: start }).then((r) => alive && setRate(String(r))).catch(() => {});
    return () => { alive = false; };
  }, [book, currency, start]);
  // إعادة توليد الأقساط عند تغيير المعطيات
  useEffect(() => {
    if (plan !== "installments" || !n(principal) || !Number(count)) return;
    setRows(generateInstallments(principal, Math.min(120, Number(count)), firstDue, freq).map((r) => ({ due_date: r.due_date, amount: String(r.amount) })));
  }, [plan, principal, count, firstDue, freq]);

  const instTotal = useMemo(() => add(...rows.map((r) => r.amount)), [rows]);
  const cashAcc = cash.find((c) => c.id === cashId);
  const isFin = kind === "financing" || kind === "card";
  const defaultCtrl = accounts.find((a) => a.system_key === (direction === "receivable" ? "debts_receivable" : kind === "financing" ? "financing" : "debts_payable"));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!book) return;
    if (!partyId) return setError("اختر الشخص أو الجهة");
    if (!n(principal)) return setError("أدخل مبلغ الدين");
    if (plan === "installments" && instTotal !== n(principal)) return setError(`مجموع الأقساط ${money(instTotal)} لا يساوي مبلغ الدين ${money(principal)}`);
    setBusy(true);
    setError(null);
    try {
      const d = await rpc<Debt>("create_debt", { p: {
        book_id: book.id, direction, kind, party_id: partyId, title: title || null, currency, fx_rate: Number(rate) || 1,
        principal: n(principal), start_date: start, due_date: plan === "single" ? due : null,
        account_id: accountId || defaultCtrl?.id || null,
        cash_account_id: mode === "cash" ? cashId : null,
        reminder_days: Number(reminder) || 3, notes: notes || null,
        installments: plan === "installments" ? rows.map((r) => ({ due_date: r.due_date, amount: n(r.amount) })) : [{ due_date: due, amount: n(principal) }],
      } });
      await refresh(["cash"]);
      toast("سُجِّل الدين");
      router.push(`/debts/${d.id}`);
    } catch (err) { setError((err as Error).message); }
    setBusy(false);
  }

  if (!book) return <Loading />;
  if (!canWrite) return <ErrorBox error="صلاحيتك للاطلاع فقط." />;
  const recv = direction === "receivable";

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="دين جديد" subtitle="يُسجَّل الدين بقيد محاسبي، ويظهر في صافي ثروتك ورصيد الشخص، ويذكّرك بالأقساط."
        back={<Link href="/debts" className="mb-2 inline-flex items-center gap-1 text-[13px] text-muted hover:text-brand"><ArrowRight className="h-3.5 w-3.5" /> الديون</Link>} />

      <form onSubmit={save} className="panel space-y-6 p-5 sm:p-6">
        <Tabs value={direction} onChange={setDirection} items={[{ value: "receivable", label: "دين لي (أقرضت)" }, { value: "payable", label: "دين عليّ (اقترضت)" }]} />

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={recv ? "المدين (من عليه الدين)" : "الدائن (صاحب الدين)"} htmlFor="d-party"><PartySelect id="d-party" value={partyId} onChange={setPartyId} allowClear={false} /></Field>
          <Field label="النوع" htmlFor="d-kind">
            <select id="d-kind" className="field" value={kind} onChange={(e) => setKind(e.target.value)}>
              {Object.entries(DEBT_KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
          <Field label="الوصف (اختياري)" htmlFor="d-title" className="sm:col-span-2"><input id="d-title" className="field" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={recv ? "مثلاً: سلفة لإصلاح السيارة" : "مثلاً: قرض لدفعة الإيجار"} /></Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="المبلغ" htmlFor="d-amt"><AmountInput id="d-amt" value={principal} onChange={setPrincipal} placeholder="0.00" /></Field>
          <Field label="العملة" htmlFor="d-cur"><CurrencySelect id="d-cur" value={currency} onChange={setCurrency} /></Field>
          <Field label="تاريخ الدين" htmlFor="d-start"><input id="d-start" type="date" className="field" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
          {currency !== book.base_currency && (
            <Field label={`سعر الصرف: 1 ${cur(currency)} =`} htmlFor="d-rate" hint={n(principal) ? `≈ ${money(n(principal) * Number(rate))} ${cur(book.base_currency)}` : undefined}><AmountInput id="d-rate" value={rate} onChange={setRate} /></Field>
          )}
        </div>

        <fieldset className="rounded-field border border-rule p-4">
          <legend className="px-1 text-[13px] font-semibold text-ink-soft">حركة المال</legend>
          <div className="space-y-3">
            <label className="flex items-start gap-2.5"><input type="radio" name="mode" className="mt-1" checked={mode === "cash"} onChange={() => setMode("cash")} />
              <span><span className="font-medium">{recv ? "دفعتُ المبلغ الآن من صندوق أو بنك" : "استلمتُ المبلغ الآن في صندوق أو بنك"}</span></span></label>
            {mode === "cash" && <div className="ms-7"><CashSelect value={cashId} onChange={setCashId} />{cashAcc && cashAcc.currency !== currency && <p className="mt-1 text-[12.5px] text-muted">سيُحوَّل المبلغ إلى {cur(cashAcc.currency)} بسعر اليوم.</p>}</div>}
            <label className="flex items-start gap-2.5"><input type="radio" name="mode" className="mt-1" checked={mode === "existing"} onChange={() => setMode("existing")} />
              <span><span className="font-medium">دين قائم من قبل</span><span className="block text-[12.5px] text-muted">بدون حركة نقدية الآن؛ يُقابَل برصيد صافي الثروة الافتتاحي.</span></span></label>
          </div>
        </fieldset>

        <div>
          <Tabs value={plan} onChange={setPlan} items={[{ value: "single", label: "دفعة واحدة" }, { value: "installments", label: "أقساط" }]} />
          {plan === "single" ? (
            <div className="mt-4 grid gap-4 sm:grid-cols-3"><Field label="تاريخ الاستحقاق" htmlFor="d-due"><input id="d-due" type="date" className="field" value={due} min={start} onChange={(e) => setDue(e.target.value)} /></Field></div>
          ) : (
            <div className="mt-4 space-y-3">
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="عدد الأقساط" htmlFor="d-cnt"><input id="d-cnt" type="number" min={1} max={120} className="field num" value={count} onChange={(e) => setCount(e.target.value)} /></Field>
                <Field label="التكرار" htmlFor="d-freq">
                  <select id="d-freq" className="field" value={freq} onChange={(e) => setFreq(e.target.value as Frequency)}>
                    <option value="monthly">شهري</option><option value="weekly">أسبوعي</option><option value="quarterly">كل ثلاثة أشهر</option><option value="yearly">سنوي</option>
                  </select>
                </Field>
                <Field label="أول قسط" htmlFor="d-first"><input id="d-first" type="date" className="field" value={firstDue} onChange={(e) => setFirstDue(e.target.value)} /></Field>
              </div>
              {rows.length > 0 && (
                <div className="overflow-hidden rounded-field border border-rule">
                  <table className="ledger">
                    <thead><tr><th className="w-12">#</th><th>الاستحقاق</th><th className="amt">المبلغ</th><th className="w-10" /></tr></thead>
                    <tbody>
                      {rows.map((r, i) => (
                        <tr key={i}>
                          <td className="tnum text-muted">{i + 1}</td>
                          <td><input type="date" className="field !py-1" value={r.due_date} onChange={(e) => setRows((x) => x.map((y, j) => j === i ? { ...y, due_date: e.target.value } : y))} aria-label={`تاريخ القسط ${i + 1}`} /></td>
                          <td><AmountInput className="!py-1" value={r.amount} onChange={(v) => setRows((x) => x.map((y, j) => j === i ? { ...y, amount: v } : y))} aria-label={`مبلغ القسط ${i + 1}`} /></td>
                          <td><button type="button" className="btn-quiet !px-2" aria-label="حذف" disabled={rows.length === 1} onClick={() => setRows((x) => x.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></button></td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot><tr>
                      <td colSpan={2}><button type="button" className="btn-quiet !px-2 text-brand" onClick={() => setRows((x) => [...x, { due_date: addMonths(x[x.length - 1]?.due_date || firstDue, 1), amount: "0" }])}><Plus className="h-4 w-4" /> قسط</button></td>
                      <td className={`amt ${instTotal === n(principal) ? "" : "text-loss"}`}><span className="num">{money(instTotal)}</span></td><td />
                    </tr></tfoot>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="ذكّرني قبل الموعد بـ" htmlFor="d-rem"><select id="d-rem" className="field" value={reminder} onChange={(e) => setReminder(e.target.value)}><option value="0">يوم الاستحقاق</option><option value="1">يوم</option><option value="3">3 أيام</option><option value="7">أسبوع</option></select></Field>
          {isFin || !recv ? (
            <Field label="حساب الدين" htmlFor="d-acc" className="sm:col-span-2" hint={`الافتراضي: ${defaultCtrl?.name || ""}`}>
              <AccountSelect id="d-acc" value={accountId} onChange={setAccountId} types={recv ? ["asset"] : ["liability"]} excludeCash allowClear placeholder={defaultCtrl ? `${defaultCtrl.code} — ${defaultCtrl.name}` : undefined} />
            </Field>
          ) : null}
        </div>
        <Field label="ملاحظات (الشهود، سند الأمر، الاتفاق…)" htmlFor="d-notes"><textarea id="d-notes" rows={2} className="field" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>

        {error && <ErrorBox error={error} />}
        <div className="flex justify-end gap-2 border-t border-rule pt-4">
          <Link href="/debts" className="btn-ghost">تراجع</Link>
          <button className="btn-primary" disabled={busy}>{busy && <Spinner />} تسجيل الدين</button>
        </div>
      </form>
    </div>
  );
}

export default function NewDebtPage() {
  return <Suspense fallback={<Loading />}><NewDebt /></Suspense>;
}
