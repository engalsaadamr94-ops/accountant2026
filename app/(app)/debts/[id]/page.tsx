"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowRight, MessageCircle, Printer, CalendarClock, HandHeart, Banknote } from "lucide-react";
import { useBook } from "@/lib/book";
import { supabase } from "@/lib/supabase/client";
import { rpc } from "@/lib/api";
import { generateInstallments, whatsappLink, type Frequency } from "@/lib/vouchers";
import { DEBT_KIND_LABEL, DEBT_STATUS_LABEL, addMonths, cur, dateLong, errorText, money, n, relativeDue, todayISO } from "@/lib/format";
import { CashSelect } from "@/components/pickers";
import { AmountInput, Chip, ErrorBox, Field, Loading, Modal, Money, PageHeader, Spinner, useToast } from "@/components/ui";
import type { Debt, Installment } from "@/lib/types";

type Payment = { id: string; pay_date: string; amount: number; kind: string; entry_id: string; journal_entries: { number_text: string; status: string } | null };

const STATE: Record<Installment["state"], { label: string; tone: "brand" | "amber" | "loss" | "neutral" }> = {
  paid: { label: "مسدَّد", tone: "brand" }, partial: { label: "جزئي", tone: "amber" }, overdue: { label: "متأخر", tone: "loss" }, upcoming: { label: "قادم", tone: "neutral" },
};

export default function DebtDetail() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const { book, cash, canWrite, refresh } = useBook();
  const [d, setD] = useState<Debt | null>(null);
  const [inst, setInst] = useState<Installment[]>([]);
  const [pays, setPays] = useState<Payment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<null | "pay" | "reschedule" | "forgive">(null);
  const [busy, setBusy] = useState(false);
  const [mErr, setMErr] = useState<string | null>(null);
  // نموذج السداد
  const [amt, setAmt] = useState("");
  const [payDate, setPayDate] = useState(todayISO());
  const [cashId, setCashId] = useState("");
  const [rate, setRate] = useState("");
  // إعادة الجدولة
  const [rCount, setRCount] = useState("3");
  const [rFirst, setRFirst] = useState(addMonths(todayISO(), 1));
  const [rFreq, setRFreq] = useState<Frequency>("monthly");
  // الإبراء
  const [fMode, setFMode] = useState<"gift" | "bad_debt">("gift");

  const load = useCallback(async () => {
    const sb = supabase();
    const [a, b, c] = await Promise.all([
      sb.from("v_debts").select("*").eq("id", id).single(),
      sb.from("v_installments").select("*").eq("debt_id", id).order("due_date").order("seq"),
      sb.from("debt_payments").select("*, journal_entries(number_text, status)").eq("debt_id", id).order("pay_date"),
    ]);
    if (a.error) return setError(errorText(a.error));
    setD(a.data as Debt);
    setInst((b.data as Installment[]) || []);
    setPays((c.data as Payment[]) || []);
  }, [id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (!cashId && cash.length) setCashId((cash.find((c) => c.kind === "cash") || cash[0]).id); }, [cash, cashId]);
  // سعر الصرف بتاريخ السداد نفسه (وليس اليوم) مع تجاهل الردود المتأخرة
  useEffect(() => {
    if (modal !== "pay" || !d || !book || d.currency === book.base_currency) return;
    let alive = true;
    rpc<number>("rate_on", { p_book: book.id, p_currency: d.currency, p_date: payDate }).then((r) => alive && r && setRate(String(r))).catch(() => {});
    return () => { alive = false; };
  }, [modal, payDate, d, book]);

  if (error) return <ErrorBox error={error} />;
  if (!d || !book) return <Loading />;
  const recv = d.direction === "receivable";
  const foreign = d.currency !== book.base_currency;
  const pct = Math.min(100, Math.round((n(d.paid) / Math.max(n(d.principal), 0.01)) * 100));
  const today = todayISO();
  const active = d.status === "active";

  function openPay() {
    setMErr(null);
    setAmt(String(n(d!.overdue_amount) || n(d!.next_due_amount) || n(d!.remaining)));
    setPayDate(todayISO());
    setModal("pay");
  }
  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    setMErr(null);
    try { await fn(); await refresh(["cash"]); toast(ok); setModal(null); load(); }
    catch (e) { setMErr((e as Error).message); }
    setBusy(false);
  }
  const pay = () => run(() => rpc("pay_debt", { p: { debt_id: d.id, amount: n(amt), pay_date: payDate, cash_account_id: cashId, fx_rate: foreign ? Number(rate) : null } }), recv ? "سُجِّل التحصيل" : "سُجِّل السداد");
  const reschedule = () => run(() => rpc("reschedule_debt", { p_debt: d.id, p_installments: generateInstallments(d.remaining, Number(rCount), rFirst, rFreq) }), "أُعيدت الجدولة");
  const forgive = () => run(() => rpc("forgive_debt", { p: { debt_id: d.id, mode: fMode, date: todayISO() } }), "سُجِّل الإبراء");

  const waText = `السلام عليكم ${d.party_name}، تذكير لطيف بخصوص ${d.title || "المبلغ المتفق عليه"}: المتبقي ${money(d.remaining)} ${cur(d.currency)}${d.next_due_date ? `، والقسط القادم ${money(d.next_due_amount)} بتاريخ ${dateLong(d.next_due_date)}` : ""}. شاكر لك.`;

  return (
    <div>
      <PageHeader
        back={<Link href={`/debts?tab=${d.direction}`} className="mb-2 inline-flex items-center gap-1 text-[13px] text-muted hover:text-brand"><ArrowRight className="h-3.5 w-3.5" /> الديون</Link>}
        title={d.title || (recv ? `دين لي على ${d.party_name}` : `دين عليّ لـ ${d.party_name}`)}
        subtitle={<span className="flex flex-wrap items-center gap-2">
          <Link href={`/parties/${d.party_id}`} className="hover:text-brand">{d.party_name}</Link> · {recv ? "لي" : "عليّ"} · {DEBT_KIND_LABEL[d.kind]} · منذ {dateLong(d.start_date)}
          <Chip tone={active ? (n(d.overdue_amount) > 0 ? "loss" : "amber") : d.status === "settled" ? "brand" : "neutral"}>{active && n(d.overdue_amount) > 0 ? "متأخر" : DEBT_STATUS_LABEL[d.status]}</Chip>
        </span>}
        actions={<>
          {active && canWrite && <button className="btn-primary" onClick={openPay}><Banknote className="h-4 w-4" /> {recv ? "تحصيل دفعة" : "سداد دفعة"}</button>}
          {active && canWrite && <button className="btn-ghost" onClick={() => { setMErr(null); setModal("reschedule"); }}><CalendarClock className="h-4 w-4" /> إعادة جدولة</button>}
          {active && canWrite && <button className="btn-ghost" onClick={() => { setMErr(null); setModal("forgive"); }}><HandHeart className="h-4 w-4" /> إبراء</button>}
          {recv && active && d.party_phone && <a className="btn-ghost" target="_blank" rel="noreferrer" href={whatsappLink(d.party_phone, waText)}><MessageCircle className="h-4 w-4" /> تذكير</a>}
          <button className="btn-quiet" onClick={() => window.print()}><Printer className="h-4 w-4" /></button>
        </>}
      />

      <section className="panel mb-6 grid gap-5 p-6 sm:grid-cols-4">
        <div><div className="text-[12.5px] text-muted">أصل الدين</div><Money v={d.principal} cur={d.currency} className="text-[18px] font-semibold" /></div>
        <div><div className="text-[12.5px] text-muted">{recv ? "المحصَّل" : "المسدَّد"}</div><Money v={d.paid} cur={d.currency} className="text-[18px] font-semibold text-gain" /></div>
        <div><div className="text-[12.5px] text-muted">المتبقي</div><Money v={d.remaining} cur={d.currency} className="font-display text-[24px] font-bold" />{foreign && <div className="text-[12px] text-muted">≈ <Money v={d.remaining_base} cur={book.base_currency} /></div>}</div>
        <div>
          <div className="text-[12.5px] text-muted">{n(d.overdue_amount) > 0 ? "متأخر" : "القسط القادم"}</div>
          {n(d.overdue_amount) > 0 ? <Money v={d.overdue_amount} cur={d.currency} className="text-[18px] font-semibold text-loss" />
            : d.next_due_date ? <><Money v={d.next_due_amount} cur={d.currency} className="text-[18px] font-semibold" /><div className="text-[12.5px] text-amber">{relativeDue(d.next_due_date, today)}</div></> : <span className="text-muted">—</span>}
        </div>
        <div className="sm:col-span-4">
          <div className="mb-1 flex justify-between text-[12.5px] text-muted"><span>نسبة السداد</span><span className="num">{pct}%</span></div>
          <div className="h-2 rounded-full bg-rule"><div className="h-2 rounded-full bg-brand" style={{ width: `${pct}%` }} /></div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <section>
          <h2 className="mb-2 text-[15px] font-bold">جدول الأقساط</h2>
          <div className="panel overflow-x-auto">
            <table className="ledger">
              <thead><tr><th className="w-10">#</th><th>الاستحقاق</th><th className="amt">القسط</th><th className="amt">المسدَّد</th><th>الحالة</th></tr></thead>
              <tbody>
                {inst.map((i) => (
                  <tr key={i.id}>
                    <td className="tnum text-muted">{i.seq}</td>
                    <td>{dateLong(i.due_date)}{i.note && <div className="text-[12px] text-muted">{i.note}</div>}{i.state !== "paid" && <div className={`text-[12px] ${i.state === "overdue" ? "text-loss" : "text-muted"}`}>{relativeDue(i.due_date, today)}</div>}</td>
                    <td className="amt"><Money v={i.amount} /></td>
                    <td className="amt">{n(i.paid) ? <Money v={i.paid} /> : "—"}</td>
                    <td><Chip tone={STATE[i.state].tone}>{STATE[i.state].label}</Chip></td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr><td colSpan={2}>الإجمالي</td><td className="amt"><span className="total-rule inline-block px-1"><Money v={d.principal} /></span></td><td className="amt"><Money v={d.paid} /></td><td /></tr></tfoot>
            </table>
          </div>
        </section>
        <section>
          <h2 className="mb-2 text-[15px] font-bold">سجل {recv ? "التحصيل" : "السداد"}</h2>
          <div className="panel overflow-hidden">
            {pays.length === 0 ? <p className="px-5 py-8 text-center text-[14px] text-muted">لا دفعات بعد.</p> : (
              <table className="ledger">
                <tbody>
                  {pays.map((p) => {
                    const rev = p.journal_entries?.status === "reversed";
                    return (
                      <tr key={p.id} className={rev ? "opacity-50" : ""}>
                        <td>{dateLong(p.pay_date)}<div className="text-[12px]"><Link href={`/vouchers/${p.entry_id}`} className="num text-brand hover:underline">{p.journal_entries?.number_text}</Link>{p.kind === "forgiveness" && " · إبراء"}{rev && " · معكوس"}</div></td>
                        <td className="amt"><Money v={p.amount} cur={d.currency} className={rev ? "line-through" : "font-medium"} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
          {d.entry_id && <p className="mt-3 text-[13px] text-muted">قيد التسجيل: <Link href={`/vouchers/${d.entry_id}`} className="text-brand hover:underline">عرض القيد</Link></p>}
          {d.notes && <p className="mt-2 text-[13.5px] text-ink-soft">ملاحظات: {d.notes}</p>}
        </section>
      </div>

      <Modal open={modal === "pay"} onClose={() => setModal(null)} title={recv ? `تحصيل من ${d.party_name}` : `سداد لـ ${d.party_name}`}
        footer={<><button className="btn-ghost" onClick={() => setModal(null)}>تراجع</button><button className="btn-primary" disabled={busy} onClick={pay}>{busy && <Spinner />} تسجيل</button></>}>
        <div className="space-y-4">
          {mErr && <ErrorBox error={mErr} />}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={`المبلغ (${cur(d.currency)})`} htmlFor="p-amt" hint={`المتبقي ${money(d.remaining)}`}><AmountInput id="p-amt" value={amt} onChange={setAmt} /></Field>
            <Field label="التاريخ" htmlFor="p-date"><input id="p-date" type="date" className="field" value={payDate} onChange={(e) => setPayDate(e.target.value)} /></Field>
          </div>
          <Field label={recv ? "استُلم في" : "دُفع من"} htmlFor="p-cash"><CashSelect id="p-cash" value={cashId} onChange={setCashId} /></Field>
          {foreign && (
            <Field label={`سعر الصرف اليوم: 1 ${cur(d.currency)} =`} htmlFor="p-rate" hint={`سعر نشأة الدين ${Number(d.fx_rate)}؛ الفرق يُسجَّل ربحاً أو خسارة فرق عملة تلقائياً.`}>
              <AmountInput id="p-rate" value={rate} onChange={setRate} />
            </Field>
          )}
          <div className="flex flex-wrap gap-2">
            {[n(d.next_due_amount), n(d.overdue_amount), n(d.remaining)].filter((v, i, a) => v > 0 && a.indexOf(v) === i).map((v) => (
              <button key={v} type="button" className="rounded-full border border-rule-strong px-3 py-1 text-[12.5px] hover:bg-brand-tint" onClick={() => setAmt(String(v))}>
                <span className="num">{money(v)}</span> {v === n(d.remaining) ? "(الكل)" : v === n(d.overdue_amount) ? "(المتأخر)" : "(القسط)"}
              </button>
            ))}
          </div>
        </div>
      </Modal>

      <Modal open={modal === "reschedule"} onClose={() => setModal(null)} title="إعادة جدولة المتبقي"
        footer={<><button className="btn-ghost" onClick={() => setModal(null)}>تراجع</button><button className="btn-primary" disabled={busy} onClick={reschedule}>{busy && <Spinner />} حفظ الجدول الجديد</button></>}>
        <div className="space-y-4">
          {mErr && <ErrorBox error={mErr} />}
          <p className="text-[14px] text-ink-soft">يُقسَّم المتبقي (<Money v={d.remaining} cur={d.currency} />) على أقساط جديدة. المدفوع سابقاً يبقى محفوظاً.</p>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="عدد الأقساط" htmlFor="r-c"><input id="r-c" type="number" min={1} max={120} className="field num" value={rCount} onChange={(e) => setRCount(e.target.value)} /></Field>
            <Field label="التكرار" htmlFor="r-f"><select id="r-f" className="field" value={rFreq} onChange={(e) => setRFreq(e.target.value as Frequency)}><option value="monthly">شهري</option><option value="weekly">أسبوعي</option><option value="quarterly">ربع سنوي</option></select></Field>
            <Field label="أول قسط" htmlFor="r-d"><input id="r-d" type="date" className="field" value={rFirst} onChange={(e) => setRFirst(e.target.value)} /></Field>
          </div>
          {Number(rCount) > 0 && <p className="text-[13px] text-muted">كل قسط ≈ <span className="num">{money(n(d.remaining) / Number(rCount))}</span> {cur(d.currency)}</p>}
        </div>
      </Modal>

      <Modal open={modal === "forgive"} onClose={() => setModal(null)} title="إبراء المتبقي"
        footer={<><button className="btn-ghost" onClick={() => setModal(null)}>تراجع</button><button className="btn-danger" disabled={busy} onClick={forgive}>{busy && <Spinner />} تأكيد الإبراء</button></>}>
        <div className="space-y-4">
          {mErr && <ErrorBox error={mErr} />}
          <p className="text-[14px] text-ink-soft">{recv ? `تُسقط المتبقي (${money(d.remaining)} ${cur(d.currency)}) عن ${d.party_name}، ويُغلق الدين.` : `${d.party_name} أسقط عنك المتبقي (${money(d.remaining)} ${cur(d.currency)})؛ يُسجَّل كهبة مستلمة ويُغلق الدين.`}</p>
          {recv && (
            <div className="space-y-2">
              <label className="flex items-start gap-2"><input type="radio" className="mt-1" checked={fMode === "gift"} onChange={() => setFMode("gift")} /><span><b>هبة أو صدقة</b><span className="block text-[12.5px] text-muted">تحويل الدين إلى عطاء (يُسجَّل في الصدقات والهدايا المقدمة).</span></span></label>
              <label className="flex items-start gap-2"><input type="radio" className="mt-1" checked={fMode === "bad_debt"} onChange={() => setFMode("bad_debt")} /><span><b>دين معدوم</b><span className="block text-[12.5px] text-muted">تعذّر التحصيل (يُسجَّل في الديون المعدومة).</span></span></label>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
