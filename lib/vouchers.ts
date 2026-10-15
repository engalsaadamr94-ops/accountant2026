// بناء أسطر القيد من نماذج السندات (منطق صافٍ قابل للاختبار)
// قاعدة البيانات تتحقق مرة أخرى من التوازن والصلاحيات؛ هذا للتحقق المبكر وبناء الأسطر.
import { addMonths, addDays, toCents, fromCents } from "@/lib/format";
import type { VoucherKind } from "@/lib/types";

export type LineInput = {
  account_id: string;
  debit?: number;
  credit?: number;
  party_id?: string | null;
  cost_center_id?: string | null;
  description?: string | null;
  currency?: string;
  fx_rate?: number;
};

export type VoucherRow = { account_id: string; amount: number | string; description?: string; cost_center_id?: string | null; party_id?: string | null };
export type JournalRow = { account_id: string; debit: number | string; credit: number | string; description?: string; cost_center_id?: string | null; party_id?: string | null };

export type CashRef = { id: string; account_id: string; currency: string };

export type VoucherInput = {
  kind: VoucherKind;
  cash?: CashRef;
  toCash?: CashRef;
  rows?: VoucherRow[];
  journalRows?: JournalRow[];
  party_id?: string | null;
  /** التحويل: المبلغ المرسل بعملة الصندوق المحوِّل */
  amount?: number | string;
  /** التحويل: المبلغ المستلم بعملة الصندوق المستلم (إن اختلفت العملة) */
  received?: number | string;
  /** التحويل: سعر صرف عملة الصندوق المحوِّل مقابل العملة الأساسية */
  fromRate?: number;
  fee?: number | string;
  feeAccountId?: string;
};

export type BuildResult = { ok: true; lines: LineInput[]; total: number } | { ok: false; error: string };

const pos = (v: unknown) => toCents(v as number) > 0;
const amt = (v: unknown) => fromCents(toCents(v as number));

export function buildVoucherLines(v: VoucherInput): BuildResult {
  if (v.kind === "journal") return buildJournal(v.journalRows || []);
  if (v.kind === "transfer") return buildTransfer(v);

  if (!v.cash) return { ok: false, error: "اختر الصندوق أو البنك" };
  const rows = (v.rows || []).filter((r) => r.account_id || pos(r.amount));
  if (!rows.length) return { ok: false, error: "أضف بنداً واحداً على الأقل" };
  for (let i = 0; i < rows.length; i++) {
    if (!rows[i].account_id) return { ok: false, error: `اختر الحساب في البند ${i + 1}` };
    if (!pos(rows[i].amount)) return { ok: false, error: `أدخل مبلغاً صحيحاً في البند ${i + 1}` };
    if (rows[i].account_id === v.cash.account_id) return { ok: false, error: `البند ${i + 1}: لا يمكن أن يكون الحساب هو الصندوق نفسه` };
  }
  const totalC = rows.reduce((s, r) => s + toCents(r.amount as number), 0);
  const total = fromCents(totalC);
  const cashIn = v.kind === "income" || v.kind === "receipt";
  const rowLines: LineInput[] = rows.map((r) => ({
    account_id: r.account_id,
    [cashIn ? "credit" : "debit"]: amt(r.amount),
    // الطرف يُربط بأسطر الحسابات المقابلة في القبض والصرف فقط (ذمم)، أما المصروف والدخل فيُحفظ الطرف في رأس السند
    party_id: r.party_id || (v.kind === "receipt" || v.kind === "payment" ? v.party_id : null) || null,
    cost_center_id: r.cost_center_id || null,
    description: r.description || null,
  }));
  const cashLine: LineInput = { account_id: v.cash.account_id, [cashIn ? "debit" : "credit"]: total };
  return { ok: true, total, lines: cashIn ? [cashLine, ...rowLines] : [...rowLines, cashLine] };
}

function buildJournal(rows: JournalRow[]): BuildResult {
  const used = rows.filter((r) => r.account_id || pos(r.debit) || pos(r.credit));
  if (used.length < 2) return { ok: false, error: "القيد يحتاج سطرين على الأقل" };
  let d = 0;
  let c = 0;
  const lines: LineInput[] = [];
  for (let i = 0; i < used.length; i++) {
    const r = used[i];
    if (!r.account_id) return { ok: false, error: `اختر الحساب في السطر ${i + 1}` };
    const dr = toCents(r.debit as number);
    const cr = toCents(r.credit as number);
    if (dr < 0 || cr < 0) return { ok: false, error: `السطر ${i + 1}: لا تُقبل مبالغ سالبة` };
    if (dr > 0 && cr > 0) return { ok: false, error: `السطر ${i + 1}: أدخل مديناً أو دائناً، لا كليهما` };
    if (dr === 0 && cr === 0) return { ok: false, error: `السطر ${i + 1}: المبلغ صفر` };
    d += dr;
    c += cr;
    lines.push({
      account_id: r.account_id,
      ...(dr ? { debit: fromCents(dr) } : { credit: fromCents(cr) }),
      party_id: r.party_id || null,
      cost_center_id: r.cost_center_id || null,
      description: r.description || null,
    });
  }
  if (d !== c) return { ok: false, error: `القيد غير متوازن: الفرق ${fromCents(Math.abs(d - c)).toFixed(2)}` };
  return { ok: true, lines, total: fromCents(d) };
}

function buildTransfer(v: VoucherInput): BuildResult {
  if (!v.cash) return { ok: false, error: "اختر الصندوق المحوِّل" };
  if (!v.toCash) return { ok: false, error: "اختر الصندوق المستلم" };
  if (v.cash.id === v.toCash.id) return { ok: false, error: "الصندوقان متماثلان" };
  if (!pos(v.amount)) return { ok: false, error: "أدخل المبلغ المحوَّل" };
  const sent = amt(v.amount);
  const sameCurrency = v.cash.currency === v.toCash.currency;
  const received = sameCurrency ? sent : amt(v.received);
  if (!sameCurrency && !pos(received)) return { ok: false, error: "أدخل المبلغ المستلم بعملة الصندوق المستلم" };
  const fromRate = v.fromRate && v.fromRate > 0 ? v.fromRate : 1;
  const lines: LineInput[] = [];
  const toLine: LineInput = { account_id: v.toCash.account_id, debit: received, currency: v.toCash.currency };
  // السعر الفعلي للعملة المستلمة = ما يعادل المرسل بالعملة الأساسية ÷ المستلم
  toLine.fx_rate = sameCurrency ? fromRate : (sent * fromRate) / received;
  lines.push(toLine);
  lines.push({ account_id: v.cash.account_id, credit: sent, currency: v.cash.currency, fx_rate: fromRate });
  if (pos(v.fee)) {
    if (!v.feeAccountId) return { ok: false, error: "حساب رسوم التحويل غير موجود" };
    const fee = amt(v.fee);
    lines.push({ account_id: v.feeAccountId, debit: fee, currency: v.cash.currency, fx_rate: fromRate, description: "رسوم التحويل" });
    lines.push({ account_id: v.cash.account_id, credit: fee, currency: v.cash.currency, fx_rate: fromRate, description: "رسوم التحويل" });
  }
  return { ok: true, lines, total: sent };
}

// ───────────── توليد جدول الأقساط ─────────────
export type Frequency = "monthly" | "weekly" | "quarterly" | "yearly";

export function generateInstallments(total: number | string, count: number, firstDue: string, freq: Frequency = "monthly") {
  const totalC = toCents(total as number);
  const cnt = Math.max(1, Math.floor(count));
  const base = Math.floor(totalC / cnt);
  const rem = totalC - base * cnt;
  return Array.from({ length: cnt }, (_, i) => ({
    due_date:
      freq === "weekly" ? addDays(firstDue, 7 * i)
      : freq === "quarterly" ? addMonths(firstDue, 3 * i)
      : freq === "yearly" ? addMonths(firstDue, 12 * i)
      : addMonths(firstDue, i),
    // الفرق الناتج عن القسمة يُضاف للقسط الأخير
    amount: fromCents(base + (i === cnt - 1 ? rem : 0)),
  }));
}

/** رسالة تذكير واتساب مهذبة */
export function whatsappLink(phone: string | null | undefined, text: string): string {
  const digits = (phone || "").replace(/[^\d]/g, "").replace(/^00/, "");
  const intl = digits.startsWith("05") ? "966" + digits.slice(1) : digits;
  return `https://wa.me/${intl}?text=${encodeURIComponent(text)}`;
}
