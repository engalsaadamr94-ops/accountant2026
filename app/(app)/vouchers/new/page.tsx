"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Plus, Trash2, BookmarkPlus, ArrowRight } from "lucide-react";
import { useBook } from "@/lib/book";
import { supabase } from "@/lib/supabase/client";
import { rpc } from "@/lib/api";
import { buildVoucherLines, type JournalRow, type VoucherRow } from "@/lib/vouchers";
import { add, cur, money, n, todayISO, toCents } from "@/lib/format";
import { AccountSelect, CashSelect, CostCenterSelect, PartySelect, suggestCostCenter } from "@/components/pickers";
import { AmountInput, ErrorBox, Field, Loading, Modal, PageHeader, Spinner, Tabs, useToast } from "@/components/ui";
import type { AccountType, Entry, Line, Template, VoucherKind } from "@/lib/types";

const KINDS: { value: VoucherKind; label: string }[] = [
  { value: "expense", label: "مصروف" },
  { value: "income", label: "دخل" },
  { value: "transfer", label: "تحويل" },
  { value: "receipt", label: "قبض" },
  { value: "payment", label: "صرف" },
  { value: "journal", label: "قيد يومية" },
];

const META: Record<VoucherKind, { title: string; cashLabel: string; rowLabel: string; types?: AccountType[]; hint: string }> = {
  expense: { title: "مصروف جديد", cashLabel: "دُفع من", rowLabel: "بند المصروف", types: ["expense"], hint: "ما دفعته على حاجة شخصية أو للعمل." },
  income: { title: "دخل جديد", cashLabel: "استُلم في", rowLabel: "مصدر الدخل", types: ["revenue"], hint: "راتب، أتعاب مشروع، إيجار، هدية…" },
  receipt: { title: "سند قبض", cashLabel: "استُلم في", rowLabel: "الحساب المقابل", hint: "استلام مبلغ من شخص أو عميل: سداد دين، دفعة مقدمة، أمانة…" },
  payment: { title: "سند صرف", cashLabel: "دُفع من", rowLabel: "الحساب المقابل", hint: "دفع مبلغ لشخص أو مورد: سداد فاتورة، سلفة، أمانة…" },
  transfer: { title: "تحويل بين الصناديق", cashLabel: "من", rowLabel: "", hint: "نقل مال بين صندوق وبنك أو محفظة، حتى بعملتين مختلفتين." },
  journal: { title: "قيد يومية", cashLabel: "", rowLabel: "", hint: "قيد حر: أدخل المدين والدائن بنفسك، ويجب أن يتوازنا." },
};

type Row = VoucherRow & { key: number };
type JRow = JournalRow & { key: number };
let keySeq = 1;
const emptyRow = (): Row => ({ key: keySeq++, account_id: "", amount: "", description: "", cost_center_id: "" });
const emptyJRow = (): JRow => ({ key: keySeq++, account_id: "", debit: "", credit: "", description: "", cost_center_id: "", party_id: "" });

function VoucherForm() {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const { book, cash, accounts, accountById, costCenters, canWrite, refresh } = useBook();

  const [kind, setKind] = useState<VoucherKind>((params.get("type") as VoucherKind) || "expense");
  const [date, setDate] = useState(todayISO());
  const [memo, setMemo] = useState("");
  const [reference, setReference] = useState("");
  const [partyId, setPartyId] = useState(params.get("party") || "");
  const [cashId, setCashId] = useState(params.get("cash") || "");
  const [toCashId, setToCashId] = useState(params.get("to") || "");
  const [rows, setRows] = useState<Row[]>([emptyRow()]);
  const [jrows, setJRows] = useState<JRow[]>([emptyJRow(), emptyJRow()]);
  const [amount, setAmount] = useState("");
  const [received, setReceived] = useState("");
  const [fee, setFee] = useState("");
  const [rate, setRate] = useState<string>("1");
  const [busy, setBusy] = useState<false | "post" | "draft">(false);
  const [error, setError] = useState<string | null>(null);
  const [tplOpen, setTplOpen] = useState(false);
  const [tplName, setTplName] = useState("");
  const [ready, setReady] = useState(false);

  const cashAcc = cash.find((c) => c.id === cashId);
  const toCashAcc = cash.find((c) => c.id === toCashId);
  const base = book?.base_currency || "SAR";
  const currency = kind === "journal" ? base : cashAcc?.currency || base;
  const foreign = currency !== base;

  // الصندوق الافتراضي
  useEffect(() => {
    if (!cashId && cash.length) setCashId((cash.find((c) => c.kind === "cash" && c.is_active) || cash[0]).id);
  }, [cash, cashId]);

  // تحميل قالب أو نسخ سند سابق
  useEffect(() => {
    if (!book || ready || !accounts.length) return;
    const tpl = params.get("template");
    const copy = params.get("copy");
    (async () => {
      if (tpl) {
        const { data } = await supabase().from("entry_templates").select("*").eq("id", tpl).single();
        const t = data as Template | null;
        const p = t?.payload as unknown as { kind: VoucherKind; cash_account_id?: string; to_cash_account_id?: string; party_id?: string; memo?: string; rows?: VoucherRow[]; journalRows?: JournalRow[]; amount?: string };
        if (p) {
          setKind(p.kind);
          if (p.cash_account_id) setCashId(p.cash_account_id);
          if (p.to_cash_account_id) setToCashId(p.to_cash_account_id);
          setPartyId(p.party_id || "");
          setMemo(p.memo || "");
          if (p.rows?.length) setRows(p.rows.map((r) => ({ ...r, key: keySeq++ })));
          if (p.journalRows?.length) setJRows(p.journalRows.map((r) => ({ ...r, key: keySeq++ })));
          if (p.amount) setAmount(String(p.amount));
        }
      } else if (copy) {
        const [{ data: e }, { data: ls }] = await Promise.all([
          supabase().from("journal_entries").select("*").eq("id", copy).single(),
          supabase().from("journal_lines").select("*").eq("entry_id", copy).order("line_no"),
        ]);
        const entry = e as Entry | null;
        const lines = (ls as Line[]) || [];
        if (entry) {
          setMemo(entry.memo || "");
          setReference(entry.reference || "");
          setPartyId(entry.party_id || "");
          const simple = ["expense", "income", "receipt", "payment"].includes(entry.doc_type) && entry.cash_account_id;
          const ca = cash.find((c) => c.id === entry.cash_account_id);
          if (simple && ca) {
            setKind(entry.doc_type as VoucherKind);
            setCashId(ca.id);
            setRows(lines.filter((l) => l.account_id !== ca.account_id).map((l) => ({ key: keySeq++, account_id: l.account_id, amount: String(n(l.debit_fc) || n(l.credit_fc)), description: l.description || "", cost_center_id: l.cost_center_id || "", party_id: l.party_id || "" })));
          } else {
            setKind("journal");
            setJRows(lines.map((l) => ({ key: keySeq++, account_id: l.account_id, debit: n(l.debit) ? String(n(l.debit)) : "", credit: n(l.credit) ? String(n(l.credit)) : "", description: l.description || "", cost_center_id: l.cost_center_id || "", party_id: l.party_id || "" })));
          }
        }
      }
      setReady(true);
    })();
  }, [book, ready, accounts.length, params, cash]);

  // سعر الصرف الافتراضي عند تغير العملة أو التاريخ
  useEffect(() => {
    if (!book) return;
    if (!foreign) { setRate("1"); return; }
    let alive = true;
    rpc<number>("rate_on", { p_book: book.id, p_currency: currency, p_date: date }).then((r) => alive && setRate(String(r ?? 1))).catch(() => {});
    return () => { alive = false; };
  }, [book, currency, foreign, date]);

  const transferCross = kind === "transfer" && cashAcc && toCashAcc && cashAcc.currency !== toCashAcc.currency;
  const feeAccount = accounts.find((a) => a.system_key === "transfer_fees");

  const built = useMemo(
    () =>
      buildVoucherLines({
        kind,
        cash: cashAcc ? { id: cashAcc.id, account_id: cashAcc.account_id, currency: cashAcc.currency } : undefined,
        toCash: toCashAcc ? { id: toCashAcc.id, account_id: toCashAcc.account_id, currency: toCashAcc.currency } : undefined,
        rows: rows.map(({ key: _k, ...r }) => r),
        journalRows: jrows.map(({ key: _k, ...r }) => r),
        party_id: partyId || null,
        amount, received, fee, fromRate: Number(rate) || 1, feeAccountId: feeAccount?.id,
      }),
    [kind, cashAcc, toCashAcc, rows, jrows, partyId, amount, received, fee, rate, feeAccount]
  );

  const total = kind === "journal"
    ? jrows.reduce((s, r) => s + toCents(r.debit as string), 0) / 100
    : kind === "transfer" ? n(amount) : rows.reduce((s, r) => s + toCents(r.amount as string), 0) / 100;
  const jDiff = kind === "journal" ? add(...jrows.map((r) => r.debit), ...jrows.map((r) => -n(r.credit))) : 0;
  const insufficient = cashAcc && !cashAcc.allow_negative && ["expense", "payment", "transfer"].includes(kind) && total + n(fee) > n(cashAcc.balance_fc);

  const reset = useCallback(() => {
    setMemo(""); setReference(""); setRows([emptyRow()]); setJRows([emptyJRow(), emptyJRow()]); setAmount(""); setReceived(""); setFee(""); setError(null);
  }, []);

  async function save(post: boolean, again = false) {
    if (!book) return;
    if (!built.ok) return setError(built.error);
    setBusy(post ? "post" : "draft");
    setError(null);
    try {
      const e = await rpc<Entry>("create_entry", { p: {
        book_id: book.id, doc_type: kind, entry_date: date, memo: memo || null, reference: reference || null,
        party_id: partyId || null, cash_account_id: kind === "journal" ? null : cashId || null,
        currency, fx_rate: Number(rate) || 1, post, lines: built.lines,
      } });
      await refresh(["cash"]);
      toast(post ? `رُحِّل ${e.number_text}` : "حُفظت المسودة");
      if (again) reset();
      else router.push(`/vouchers/${e.id}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function saveTemplate() {
    if (!book || !tplName.trim()) return;
    const payload = { kind, cash_account_id: cashId, to_cash_account_id: toCashId || undefined, party_id: partyId || undefined, memo,
      rows: rows.filter((r) => r.account_id).map(({ key: _k, ...r }) => r), journalRows: jrows.filter((r) => r.account_id).map(({ key: _k, ...r }) => r), amount: kind === "transfer" ? amount : undefined };
    const { error } = await supabase().from("entry_templates").insert({ book_id: book.id, name: tplName.trim(), doc_type: kind, payload });
    if (error) return toast(error.message, "error");
    setTplOpen(false);
    setTplName("");
    toast("حُفظ القالب؛ تجده في «عملية جديدة»");
  }

  if (!book || !ready) return <Loading />;
  if (!canWrite) return <ErrorBox error="صلاحيتك في هذا الدفتر للاطلاع فقط." />;
  const meta = META[kind];

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title={meta.title}
        subtitle={meta.hint}
        back={<Link href="/vouchers" className="mb-2 inline-flex items-center gap-1 text-[13px] text-muted hover:text-brand"><ArrowRight className="h-3.5 w-3.5" /> السندات</Link>}
      />
      <Tabs className="mb-5 flex-wrap" items={KINDS} value={kind} onChange={(k) => { setKind(k); setError(null); }} />

      <form className="panel p-5 sm:p-6" onSubmit={(e) => { e.preventDefault(); save(true); }}>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="التاريخ" htmlFor="v-date">
            <input id="v-date" type="date" className="field" value={date} onChange={(e) => setDate(e.target.value)} required />
          </Field>
          {kind !== "journal" && (
            <Field label={meta.cashLabel} htmlFor="v-cash" className="sm:col-span-2"
              error={insufficient ? `الرصيد المتاح ${money(cashAcc!.balance_fc)} ${cur(cashAcc!.currency)} لا يكفي` : null}>
              <CashSelect id="v-cash" value={cashId} onChange={setCashId} />
            </Field>
          )}
          {kind === "journal" && (
            <Field label="البيان" htmlFor="v-memo" className="sm:col-span-2">
              <input id="v-memo" className="field" value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="وصف القيد" />
            </Field>
          )}
        </div>

        {kind === "transfer" && (
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <Field label="إلى" htmlFor="v-to" className="sm:col-span-1"><CashSelect id="v-to" value={toCashId} onChange={setToCashId} exclude={cashId} /></Field>
            <Field label={`المبلغ المحوَّل${cashAcc ? ` (${cur(cashAcc.currency)})` : ""}`} htmlFor="v-amt"><AmountInput id="v-amt" value={amount} onChange={setAmount} placeholder="0.00" /></Field>
            {transferCross ? (
              <Field label={`المبلغ المستلم (${cur(toCashAcc!.currency)})`} htmlFor="v-rec"
                hint={n(amount) && n(received) ? `السعر الفعلي: 1 ${cur(cashAcc!.currency)} = ${(n(received) / n(amount)).toFixed(4)} ${cur(toCashAcc!.currency)}` : "كما وصل فعلاً بعد الصرف"}>
                <AmountInput id="v-rec" value={received} onChange={setReceived} placeholder="0.00" />
              </Field>
            ) : (
              <Field label="رسوم التحويل (اختياري)" htmlFor="v-fee"><AmountInput id="v-fee" value={fee} onChange={setFee} placeholder="0.00" /></Field>
            )}
            {transferCross && <Field label="رسوم التحويل (اختياري)" htmlFor="v-fee2"><AmountInput id="v-fee2" value={fee} onChange={setFee} placeholder="0.00" /></Field>}
          </div>
        )}

        {foreign && kind !== "transfer" && (
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <Field label={`سعر الصرف: 1 ${cur(currency)} =`} htmlFor="v-rate" hint={`بالعملة الأساسية (${cur(base)})`}>
              <AmountInput id="v-rate" value={rate} onChange={setRate} />
            </Field>
          </div>
        )}
        {foreign && kind === "transfer" && (
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <Field label={`سعر ${cur(currency)} مقابل ${cur(base)}`} htmlFor="v-rate2"><AmountInput id="v-rate2" value={rate} onChange={setRate} /></Field>
          </div>
        )}

        {/* بنود السند */}
        {["expense", "income", "receipt", "payment"].includes(kind) && (
          <div className="mt-6">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-[14px] font-bold">{rows.length > 1 ? "البنود" : meta.rowLabel}</h2>
              <span className="text-[12.5px] text-muted">يمكنك تقسيم المبلغ على أكثر من بند</span>
            </div>
            <div className="space-y-3">
              {rows.map((r, i) => (
                <div key={r.key} className="grid gap-2 rounded-field border border-rule p-3 sm:grid-cols-[1.6fr_0.8fr_1fr_auto] sm:items-start sm:border-0 sm:p-0">
                  <AccountSelect value={r.account_id} types={meta.types} excludeCash
                    placeholder={kind === "expense" ? "مثلاً: المحروقات، الغذاء…" : kind === "income" ? "مثلاً: الراتب، الخدمات…" : "ابحث عن حساب…"}
                    onChange={(v) => setRows((rs) => rs.map((x) => x.key === r.key ? { ...x, account_id: v, cost_center_id: x.cost_center_id || suggestCostCenter(accountById[v], costCenters) } : x))} />
                  <AmountInput aria-label="المبلغ" placeholder="المبلغ" value={r.amount as string} onChange={(v) => setRows((rs) => rs.map((x) => x.key === r.key ? { ...x, amount: v } : x))} />
                  <input className="field" aria-label="وصف البند" placeholder="وصف (اختياري)" value={r.description || ""} onChange={(e) => setRows((rs) => rs.map((x) => x.key === r.key ? { ...x, description: e.target.value } : x))} />
                  <button type="button" className="btn-quiet !px-2 justify-self-end" aria-label={`حذف البند ${i + 1}`} disabled={rows.length === 1} onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}><Trash2 className="h-4 w-4" /></button>
                </div>
              ))}
            </div>
            <button type="button" className="btn-quiet mt-2 !px-2 text-brand" onClick={() => setRows((rs) => [...rs, emptyRow()])}><Plus className="h-4 w-4" /> بند آخر</button>
          </div>
        )}

        {kind === "journal" && (
          <div className="mt-6 overflow-x-auto">
            <table className="ledger min-w-[720px]">
              <thead><tr><th className="w-[34%]">الحساب</th><th>الطرف</th><th className="amt w-28">مدين</th><th className="amt w-28">دائن</th><th>البيان</th><th className="w-10" /></tr></thead>
              <tbody>
                {jrows.map((r) => (
                  <tr key={r.key}>
                    <td><AccountSelect value={r.account_id} onChange={(v) => setJRows((rs) => rs.map((x) => x.key === r.key ? { ...x, account_id: v, cost_center_id: x.cost_center_id || suggestCostCenter(accountById[v], costCenters) } : x))} /></td>
                    <td><PartySelect value={r.party_id || ""} onChange={(v) => setJRows((rs) => rs.map((x) => x.key === r.key ? { ...x, party_id: v } : x))} placeholder="—" /></td>
                    <td><AmountInput aria-label="مدين" value={r.debit as string} onChange={(v) => setJRows((rs) => rs.map((x) => x.key === r.key ? { ...x, debit: v, credit: v ? "" : x.credit } : x))} /></td>
                    <td><AmountInput aria-label="دائن" value={r.credit as string} onChange={(v) => setJRows((rs) => rs.map((x) => x.key === r.key ? { ...x, credit: v, debit: v ? "" : x.debit } : x))} /></td>
                    <td><input className="field" aria-label="بيان السطر" value={r.description || ""} onChange={(e) => setJRows((rs) => rs.map((x) => x.key === r.key ? { ...x, description: e.target.value } : x))} /></td>
                    <td><button type="button" className="btn-quiet !px-2" aria-label="حذف السطر" disabled={jrows.length <= 2} onClick={() => setJRows((rs) => rs.filter((x) => x.key !== r.key))}><Trash2 className="h-4 w-4" /></button></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={2}><button type="button" className="btn-quiet !px-2 text-brand" onClick={() => setJRows((rs) => [...rs, emptyJRow()])}><Plus className="h-4 w-4" /> سطر</button></td>
                  <td className="amt"><span className="num">{money(jrows.reduce((s, r) => s + n(r.debit), 0))}</span></td>
                  <td className="amt"><span className="num">{money(jrows.reduce((s, r) => s + n(r.credit), 0))}</span></td>
                  <td colSpan={2} className={jDiff === 0 ? "text-gain" : "text-loss"}>{jDiff === 0 ? (total ? "متوازن" : "") : `الفرق ${money(jDiff)}`}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {kind !== "journal" && (
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            {kind !== "transfer" && (
              <Field label={kind === "receipt" ? "من (الشخص أو الجهة)" : kind === "payment" ? "إلى (الشخص أو الجهة)" : "الشخص أو الجهة (اختياري)"} htmlFor="v-party">
                <PartySelect id="v-party" value={partyId} onChange={setPartyId} />
              </Field>
            )}
            <Field label="البيان" htmlFor="v-memo2" className={kind === "transfer" ? "sm:col-span-2" : ""}>
              <input id="v-memo2" className="field" value={memo} onChange={(e) => setMemo(e.target.value)} placeholder={kind === "expense" ? "مثلاً: بنزين الأسبوع" : ""} />
            </Field>
            <Field label="رقم مرجعي (اختياري)" htmlFor="v-ref" hint="رقم فاتورة أو إيصال أو حوالة">
              <input id="v-ref" className="field" value={reference} onChange={(e) => setReference(e.target.value)} />
            </Field>
          </div>
        )}
        {kind === "journal" && (
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <Field label="رقم مرجعي (اختياري)" htmlFor="v-ref2"><input id="v-ref2" className="field" value={reference} onChange={(e) => setReference(e.target.value)} /></Field>
          </div>
        )}

        {["expense", "income"].includes(kind) && rows.length === 1 && (
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <Field label="مركز التكلفة" htmlFor="v-cc" hint="يُقترح آلياً حسب نوع البند">
              <CostCenterSelect id="v-cc" value={rows[0].cost_center_id || ""} onChange={(v) => setRows((rs) => [{ ...rs[0], cost_center_id: v }])} />
            </Field>
          </div>
        )}

        {error && <div className="mt-5"><ErrorBox error={error} /></div>}

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-rule pt-4">
          <div className="text-[15px]">
            <span className="text-muted">الإجمالي </span>
            <span className="num font-display text-[22px] font-bold">{money(total)}</span>
            <span className="ms-1 text-muted">{cur(currency)}</span>
            {foreign && total > 0 && <span className="ms-2 text-[13px] text-muted">≈ <span className="num">{money(total * (Number(rate) || 1))}</span> {cur(base)}</span>}
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-quiet" onClick={() => setTplOpen(true)} title="احفظ هذا النموذج لاستخدامه لاحقاً بنقرة"><BookmarkPlus className="h-4 w-4" /> قالب</button>
            <button type="button" className="btn-ghost" disabled={!!busy} onClick={() => save(false)}>{busy === "draft" && <Spinner />} مسودة</button>
            <button type="button" className="btn-ghost" disabled={!!busy} onClick={() => save(true, true)}>ترحيل وجديد</button>
            <button type="submit" className="btn-primary" disabled={!!busy}>{busy === "post" && <Spinner />} ترحيل</button>
          </div>
        </div>
      </form>

      <Modal open={tplOpen} onClose={() => setTplOpen(false)} title="حفظ كقالب"
        footer={<><button className="btn-ghost" onClick={() => setTplOpen(false)}>تراجع</button><button className="btn-primary" disabled={!tplName.trim()} onClick={saveTemplate}>حفظ القالب</button></>}>
        <Field label="اسم القالب" htmlFor="tpl" hint="مثلاً: إيجار الشقة، تحويل للوالدة، راتب الشهر">
          <input id="tpl" className="field" value={tplName} onChange={(e) => setTplName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && saveTemplate()} />
        </Field>
      </Modal>
    </div>
  );
}

export default function NewVoucherPage() {
  return <Suspense fallback={<Loading />}><VoucherForm /></Suspense>;
}
