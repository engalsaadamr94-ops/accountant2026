import type { AccountType, DocType, Num, Role, Scope } from "@/lib/types";

// ───────────── المبالغ (الحساب بالهللات لتجنّب أخطاء الفاصلة العائمة) ─────────────
export const toCents = (v: Num | null | undefined): number => {
  const n = typeof v === "number" ? v : Number(v ?? 0);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};
export const fromCents = (c: number) => c / 100;
export const n = (v: Num | null | undefined): number => fromCents(toCents(v));
export const add = (...vals: (Num | null | undefined)[]) => fromCents(vals.reduce<number>((s, v) => s + toCents(v), 0));

const fmt2 = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt0 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

/** مبلغ بقيمته المطلقة بخانتين عشريتين */
export function money(v: Num | null | undefined, opts: { decimals?: 0 | 2; signed?: boolean } = {}): string {
  const x = n(v);
  const f = opts.decimals === 0 ? fmt0 : fmt2;
  const s = f.format(Math.abs(x));
  if (opts.signed && x < 0) return `(${s})`;
  return s;
}

/** اختصار للبطاقات: 12.4 ألف، 1.2 مليون */
export function compact(v: Num): string {
  const x = Math.abs(n(v));
  if (x >= 1_000_000) return `${(x / 1_000_000).toFixed(x >= 10_000_000 ? 1 : 2)} مليون`;
  if (x >= 10_000) return `${(x / 1000).toFixed(1)} ألف`;
  return fmt2.format(x);
}

export type Side = "مدين" | "دائن" | "";
export const side = (v: Num | null | undefined): Side => (n(v) > 0 ? "مدين" : n(v) < 0 ? "دائن" : "");

/** طبيعة الحساب: الرصيد الطبيعي للأصول والمصروفات مدين */
export const normalDebit = (t: AccountType) => t === "asset" || t === "expense";
/** الرصيد بإشارة طبيعة الحساب (موجب = رصيد طبيعي) */
export const natural = (v: Num, t: AccountType) => (normalDebit(t) ? n(v) : -n(v));

// ───────────── العملات ─────────────
export const CURRENCY_LABEL: Record<string, string> = {
  SAR: "ر.س", USD: "$", YER_ADN: "ر.ي عدن", YER_SAN: "ر.ي صنعاء", AED: "د.إ", EUR: "€",
};
export const cur = (code?: string | null) => (code ? CURRENCY_LABEL[code] || code : "");

// ───────────── التواريخ ─────────────
export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return toISO(d);
}
export function addMonths(iso: string, months: number): string {
  const [y, m, day] = iso.split("-").map(Number);
  const target = new Date(y, m - 1 + months, 1);
  const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  return toISO(new Date(target.getFullYear(), target.getMonth(), Math.min(day, last)));
}
export function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10)) - Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10))) / 86400000);
}

const MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
export function dateLong(iso?: string | null): string {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}
export function monthLabel(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}
export function monthShort(iso: string): string {
  return MONTHS[Number(iso.slice(5, 7)) - 1];
}
export function hijri(iso?: string | null): string {
  if (!iso) return "";
  try {
    return new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura-nu-latn", { day: "numeric", month: "long", year: "numeric" })
      .format(new Date(iso.slice(0, 10) + "T12:00:00"));
  } catch {
    return "";
  }
}
export function relativeDue(iso: string, today = todayISO()): string {
  const d = daysBetween(today, iso);
  if (d === 0) return "اليوم";
  if (d === 1) return "غداً";
  if (d === -1) return "أمس";
  if (d > 1) return d <= 10 ? `بعد ${d} أيام` : `بعد ${d} يوماً`;
  return -d <= 10 ? `متأخر ${-d} أيام` : `متأخر ${-d} يوماً`;
}

// ───────────── التسميات ─────────────
export const DOC_LABEL: Record<DocType, string> = {
  journal: "قيد يومية", receipt: "سند قبض", payment: "سند صرف", transfer: "تحويل بين الصناديق",
  expense: "مصروف", income: "دخل", opening: "قيد افتتاحي", debt: "تسجيل دين", debt_payment: "سداد دين",
  reversal: "قيد عكسي", adjustment: "قيد تسوية", closing: "قيد إقفال",
};
export const ROLE_LABEL: Record<Role, string> = { owner: "المالك", admin: "مدير", accountant: "محاسب", viewer: "مطّلع" };
export const TYPE_LABEL: Record<AccountType, string> = { asset: "أصول", liability: "خصوم", equity: "حقوق ملكية", revenue: "إيرادات", expense: "مصروفات" };
export const SCOPE_LABEL: Record<Scope, string> = { personal: "شخصي", business: "عمل حر", both: "مشترك" };
export const PARTY_KIND_LABEL = { customer: "عميل", supplier: "مورد", both: "عميل ومورد", person: "شخص" } as const;
export const CASH_KIND_LABEL = { cash: "صندوق نقدي", bank: "حساب بنكي", wallet: "محفظة إلكترونية", card: "بطاقة ائتمان" } as const;
export const DEBT_KIND_LABEL: Record<string, string> = {
  loan: "قرض/سلفة", credit_sale: "بيع آجل", credit_purchase: "شراء آجل", financing: "تمويل بنكي", card: "بطاقة", jamiya: "جمعية", other: "أخرى",
};
export const DEBT_STATUS_LABEL = { active: "قائم", settled: "مسدَّد", forgiven: "مُبرأ", cancelled: "ملغى" } as const;

/** تحويل رسائل الخطأ من قاعدة البيانات إلى نص مفهوم */
export function errorText(e: unknown): string {
  const msg = (e as { message?: string })?.message || String(e);
  if (/Failed to fetch|NetworkError/i.test(msg)) return "تعذّر الاتصال بالخادم. تحقق من الإنترنت ثم أعد المحاولة.";
  if (/duplicate key.*code/i.test(msg)) return "هذا الرمز مستخدم لحساب آخر.";
  if (/duplicate key/i.test(msg)) return "هذا السجل موجود مسبقاً.";
  if (/row-level security/i.test(msg)) return "لا تملك صلاحية تنفيذ هذه العملية.";
  if (/Invalid login credentials/i.test(msg)) return "البريد أو كلمة المرور غير صحيحة.";
  if (/Email not confirmed/i.test(msg)) return "لم يُؤكَّد البريد بعد. افتح رسالة التأكيد في بريدك.";
  if (/User already registered/i.test(msg)) return "هذا البريد مسجّل مسبقاً. سجّل الدخول بدلاً من ذلك.";
  if (/Password should be at least/i.test(msg)) return "كلمة المرور قصيرة؛ استخدم 8 أحرف على الأقل.";
  return msg;
}
