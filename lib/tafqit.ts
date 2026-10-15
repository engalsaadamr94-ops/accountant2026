// التفقيط: كتابة المبلغ بالحروف العربية للسندات
// مثال: 1250.25 ريال ⇒ «فقط ألف ومائتان وخمسون ريالاً وخمس وعشرون هللة لا غير»

const ONES_M = ["", "واحد", "اثنان", "ثلاثة", "أربعة", "خمسة", "ستة", "سبعة", "ثمانية", "تسعة", "عشرة",
  "أحد عشر", "اثنا عشر", "ثلاثة عشر", "أربعة عشر", "خمسة عشر", "ستة عشر", "سبعة عشر", "ثمانية عشر", "تسعة عشر"];
const ONES_F = ["", "واحدة", "اثنتان", "ثلاث", "أربع", "خمس", "ست", "سبع", "ثمان", "تسع", "عشر",
  "إحدى عشرة", "اثنتا عشرة", "ثلاث عشرة", "أربع عشرة", "خمس عشرة", "ست عشرة", "سبع عشرة", "ثماني عشرة", "تسع عشرة"];
const TENS = ["", "", "عشرون", "ثلاثون", "أربعون", "خمسون", "ستون", "سبعون", "ثمانون", "تسعون"];
const HUNDREDS = ["", "مائة", "مائتان", "ثلاثمائة", "أربعمائة", "خمسمائة", "ستمائة", "سبعمائة", "ثمانمائة", "تسعمائة"];

type Unit = { one: string; two: string; few: string; many: string; feminine: boolean };

const SCALES: Unit[] = [
  { one: "", two: "", few: "", many: "", feminine: false },
  { one: "ألف", two: "ألفان", few: "آلاف", many: "ألف", feminine: false },
  { one: "مليون", two: "مليونان", few: "ملايين", many: "مليون", feminine: false },
  { one: "مليار", two: "ملياران", few: "مليارات", many: "مليار", feminine: false },
];

function below1000(nv: number, feminine: boolean): string {
  const parts: string[] = [];
  const h = Math.floor(nv / 100);
  const r = nv % 100;
  if (h) parts.push(HUNDREDS[h]);
  if (r) {
    const ones = feminine ? ONES_F : ONES_M;
    if (r < 20) parts.push(ones[r]);
    else {
      const o = r % 10;
      parts.push(o ? `${ones[o]} و${TENS[Math.floor(r / 10)]}` : TENS[Math.floor(r / 10)]);
    }
  }
  return parts.join(" و");
}

/** العدد مع المعدود (يُستخدم للآلاف والملايين والعملة) */
function counted(nv: number, unit: Unit, feminine: boolean): string {
  if (nv === 0) return "";
  if (nv === 1) return unit.one;
  if (nv === 2) return unit.two;
  if (nv >= 3 && nv <= 10) return `${below1000(nv, feminine)} ${unit.few}`;
  const r = nv % 100;
  if (r >= 3 && r <= 10 && nv > 100) return `${below1000(nv, feminine)} ${unit.few}`;
  if (r === 1 || r === 2) return `${below1000(nv, feminine)} ${unit.one}`;
  return `${below1000(nv, feminine)} ${r === 0 ? unit.one : unit.many}`;
}

function integerWords(nv: number, feminine = false): string {
  if (nv === 0) return "صفر";
  const groups: number[] = [];
  let x = nv;
  while (x > 0) {
    groups.push(x % 1000);
    x = Math.floor(x / 1000);
  }
  const parts: string[] = [];
  for (let i = groups.length - 1; i >= 0; i--) {
    const g = groups[i];
    if (!g) continue;
    if (i === 0) parts.push(below1000(g, feminine));
    else parts.push(counted(g, SCALES[i], false));
  }
  return parts.join(" و");
}

export type CurrencyWords = { main: Unit; sub: Unit; subDivisor: number };

export const CURRENCY_WORDS: Record<string, CurrencyWords> = {
  SAR: {
    main: { one: "ريال", two: "ريالان", few: "ريالات", many: "ريالاً", feminine: false },
    sub: { one: "هللة", two: "هللتان", few: "هللات", many: "هللة", feminine: true },
    subDivisor: 100,
  },
  USD: {
    main: { one: "دولار", two: "دولاران", few: "دولارات", many: "دولاراً", feminine: false },
    sub: { one: "سنت", two: "سنتان", few: "سنتات", many: "سنتاً", feminine: false },
    subDivisor: 100,
  },
  YER: {
    main: { one: "ريال يمني", two: "ريالان يمنيان", few: "ريالات يمنية", many: "ريالاً يمنياً", feminine: false },
    sub: { one: "فلس", two: "فلسان", few: "فلوس", many: "فلساً", feminine: false },
    subDivisor: 100,
  },
  AED: {
    main: { one: "درهم", two: "درهمان", few: "دراهم", many: "درهماً", feminine: false },
    sub: { one: "فلس", two: "فلسان", few: "فلوس", many: "فلساً", feminine: false },
    subDivisor: 100,
  },
};

function amountWithUnit(nv: number, unit: Unit): string {
  if (nv === 1) return `${unit.one} واحد${unit.feminine ? "ة" : ""}`;
  if (nv === 2) return unit.two;
  const words = integerWords(nv, unit.feminine);
  const r = nv % 100;
  if (nv >= 3 && nv <= 10) return `${words} ${unit.few}`;
  if (nv > 100 && r >= 3 && r <= 10) return `${words} ${unit.few}`;
  if (r === 0 || r === 1 || r === 2) return `${words} ${unit.one}`;
  return `${words} ${unit.many}`;
}

export function tafqit(amount: number, currency = "SAR"): string {
  const key = currency.startsWith("YER") ? "YER" : currency;
  const cw = CURRENCY_WORDS[key] || CURRENCY_WORDS.SAR;
  const cents = Math.round(Math.abs(amount) * 100);
  const main = Math.floor(cents / 100);
  const sub = cents % 100;
  const parts: string[] = [];
  if (main > 0) parts.push(amountWithUnit(main, cw.main));
  if (sub > 0) parts.push(amountWithUnit(sub, cw.sub));
  if (!parts.length) parts.push(`صفر ${cw.main.one}`);
  return `فقط ${parts.join(" و")} لا غير`;
}
