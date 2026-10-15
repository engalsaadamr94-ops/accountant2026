// اختبار تشغيلي كامل في متصفح حقيقي على البيئة المحلية
// node tests/e2e/journey.mjs [مجلد اللقطات]
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = "http://localhost:3000";
const OUT = process.argv[2] || "/tmp/shots";
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--headless=new"] });
const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 }, locale: "ar" });
const page = await ctx.newPage();
const errors = [];
page.on("console", (m) => { if (m.type() === "error" && !/ERR_TUNNEL_CONNECTION_FAILED|status of 500/.test(m.text())) errors.push(m.text()); });
page.on("pageerror", (e) => errors.push("PAGEERROR " + e.message));
page.on("response", (r) => { if (r.status() >= 500) errors.push(`HTTP ${r.status()} ${r.request().method()} ${r.url().slice(0, 140)}`); });
page.on("requestfailed", (r) => { if (!/fonts\.g|_rsc=/.test(r.url())) errors.push(`REQFAIL ${r.url().slice(0, 140)}`); });

let step = 0;
async function shot(name) { await page.waitForTimeout(500); await page.screenshot({ path: `${OUT}/${String(++step).padStart(2, "0")}-${name}.png`, fullPage: true }); }
async function ok(cond, msg) { if (!cond) throw new Error("FAILED: " + msg); console.log("✓", msg); }
const toast = async (re) => { await page.getByText(re).first().waitFor({ timeout: 10000 }); };

async function main() {
// ── تسجيل حساب جديد ──
await page.goto(BASE + "/signup");
await shot("signup");
const email = `amr${Date.now()}@test.com`;
await page.fill("#name", "عمرو السعد");
await page.fill("#email", email);
await page.fill("#pw", "password123");
await page.click("button:has-text('إنشاء الحساب')");
await page.waitForURL("**/onboarding", { timeout: 15000 });
await ok(true, "التسجيل يحوّل إلى الإعداد الأولي");
await shot("onboarding");
await page.click("button:has-text('إنشاء الدفتر')");
await page.getByText("كم معك الآن؟").waitFor({ timeout: 15000 });
await shot("opening-balances");
const inputs = page.locator("input[inputmode=decimal]");
await inputs.nth(0).fill("5000");   // الصندوق الرئيسي
await inputs.nth(2).fill("42000");  // الحساب البنكي
await page.click("button:has-text('حفظ والدخول إلى الدفتر')");
await page.waitForURL(BASE + "/", { timeout: 15000 });
await page.getByText("صافي الثروة").first().waitFor();
await ok(await page.getByText("47,000.00").first().isVisible(), "لوحة التحكم تعرض صافي الثروة 47,000 بعد الأرصدة الافتتاحية");
await shot("dashboard-start");

// ── مصروف بقالب مركز تكلفة آلي ──
await page.goto(BASE + "/vouchers/new?type=expense");
await page.getByText("مصروف جديد").waitFor();
await page.locator("[role=combobox]").nth(1).click(); // البند (الأول هو الصندوق)
await page.keyboard.type("محروقات");
await page.getByRole("option", { name: /السيارة والمحروقات/ }).click();
await page.getByLabel("المبلغ").first().fill("180");
await page.fill("#v-memo2", "بنزين الأسبوع");
await shot("expense-form");
await page.click("button[type=submit]:has-text('ترحيل')");
await page.waitForURL(/\/vouchers\/[0-9a-f-]{36}$/, { timeout: 15000 });
await page.getByText("فقط مائة وثمانون ريالاً لا غير").waitFor();
await ok(true, "سند المصروف يُرحَّل ويُكتب المبلغ بالحروف");
await shot("expense-voucher");

// ── دخل: راتب ──
await page.goto(BASE + "/vouchers/new?type=income");
await page.locator("[role=combobox]").nth(0).click();
await page.getByRole("option", { name: /الحساب البنكي/ }).click();
await page.locator("[role=combobox]").nth(1).click();
await page.keyboard.type("الراتب");
await page.getByRole("option", { name: /4201/ }).click();
await page.getByLabel("المبلغ").first().fill("15000");
await page.fill("#v-memo2", "راتب الشهر");
await page.click("button[type=submit]:has-text('ترحيل')");
await page.waitForURL(/\/vouchers\/[0-9a-f-]{36}$/);
await ok(true, "سند دخل الراتب");

// ── تحويل بمبلغ يفوق الرصيد يُمنع ──
await page.goto(BASE + "/vouchers/new?type=transfer");
await page.locator("[role=combobox]").nth(1).click();
await page.getByRole("option", { name: /الحساب البنكي/ }).click();
await page.fill("#v-amt", "999999");
await page.click("button[type=submit]:has-text('ترحيل')");
await page.getByText(/الرصيد غير كافٍ/).first().waitFor({ timeout: 10000 });
await ok(true, "التحويل الزائد عن الرصيد يُرفض برسالة واضحة");
await page.fill("#v-amt", "2000");
await page.click("button[type=submit]:has-text('ترحيل')");
await page.waitForURL(/\/vouchers\/[0-9a-f-]{36}$/);
await ok(true, "تحويل 2000 من الصندوق إلى البنك");

// ── شخص ودين بأقساط ──
await page.goto(BASE + "/debts/new?direction=receivable");
await page.locator("#d-party").click();
await page.keyboard.type("أبو فهد");
await page.getByText("إضافة جديد: «أبو فهد»").click();
await toast(/أُضيف «أبو فهد»/);
await page.fill("#d-title", "سلفة إصلاح السيارة");
await page.fill("#d-amt", "3000");
await page.locator("fieldset [role=combobox]").click();
await page.getByRole("option", { name: /الحساب البنكي/ }).click();
await page.click("button[role=tab]:has-text('أقساط')");
await page.fill("#d-cnt", "3");
await shot("debt-form");
await page.click("button:has-text('تسجيل الدين')");
await page.waitForURL(/\/debts\/[0-9a-f-]{36}$/, { timeout: 15000 });
await page.getByText("جدول الأقساط").waitFor();
await ok((await page.locator("table.ledger tbody tr").count()) >= 3, "الدين بثلاثة أقساط");
await page.click("button:has-text('تحصيل دفعة')");
await page.fill("#p-amt", "1000");
await page.locator("[role=dialog] [role=combobox]").click();
await page.getByRole("option", { name: /الحساب البنكي/ }).click();
await page.click("[role=dialog] button:has-text('تسجيل')");
await toast(/سُجِّل التحصيل/);
await page.getByText("مسدَّد").first().waitFor();
await ok(true, "تحصيل القسط الأول يغيّر حالته إلى مسدَّد");
await shot("debt-detail");

// ── دين عليّ قائم سابقاً ──
await page.goto(BASE + "/debts/new?direction=payable");
await page.locator("#d-party").click();
await page.keyboard.type("الوالد");
await page.getByText("إضافة جديد: «الوالد»").click();
await toast(/أُضيف «الوالد»/);
await page.fill("#d-amt", "4000");
await page.getByText("دين قائم من قبل").click();
await page.click("button:has-text('تسجيل الدين')");
await page.waitForURL(/\/debts\/[0-9a-f-]{36}$/);
await ok(true, "دين عليّ قائم سابقاً بدون حركة نقدية");

// ── عكس قيد ──
await page.goto(BASE + "/vouchers?type=expense");
await page.locator("table.ledger tbody tr").first().click();
await page.waitForURL(/\/vouchers\/[0-9a-f-]{36}$/);
await page.click("button:has-text('عكس القيد')");
await page.fill("#rr", "خطأ في المبلغ");
await page.click("[role=dialog] button:has-text('عكس القيد')");
await page.getByText(/هذا القيد معكوس بالقيد/).waitFor({ timeout: 10000 });
await ok(true, "عكس القيد يربط الأصل بالقيد العكسي");
await shot("reversed-voucher");

// ── الشاشات الرئيسية والتقارير ──
const pages = [
  ["/", "dashboard", "صافي الثروة"],
  ["/vouchers", "vouchers", "السندات والقيود"],
  ["/cash", "cash", "إجمالي النقد المتاح"],
  ["/debts", "debts", "ديون لي عند الناس"],
  ["/debts?tab=calendar", "debts-calendar", "تقويم الاستحقاقات"],
  ["/parties", "parties", "لك عند الناس"],
  ["/accounts", "accounts", "دليل الحسابات"],
  ["/reports", "reports", "القوائم المالية"],
  ["/reports/trial-balance", "trial-balance", "الميزان متوازن"],
  ["/reports/income", "income", "قائمة الدخل"],
  ["/reports/balance-sheet", "balance-sheet", "صافي الثروة"],
  ["/reports/expenses", "expenses", "المتوسط الشهري"],
  ["/reports/cash-flow", "cash-flow", "حركة الصناديق"],
  ["/reports/cost-centers", "cost-centers", "ربحية المشاريع"],
  ["/reports/debts", "aging", "أعمار الديون"],
  ["/admin", "admin-settings", "بيانات الدفتر"],
  ["/admin?s=members", "admin-members", "إضافة مستخدم"],
  ["/admin?s=currencies", "admin-currencies", "سجل الأسعار|العملات"],
  ["/admin?s=lock", "admin-lock", "إقفال الفترات"],
  ["/admin?s=audit", "admin-audit", "سجل التدقيق|كل إضافة"],
  ["/admin?s=backup", "admin-backup", "نسخة احتياطية كاملة"],
];
for (const [url, name, text] of pages) {
  await page.goto(BASE + url);
  await page.getByText(new RegExp(text)).first().waitFor({ timeout: 15000 });
  await shot(name);
  console.log("✓ صفحة", url);
}

// ── الميزان متوازن والأرقام صحيحة ──
await page.goto(BASE + "/reports/balance-sheet");
await page.getByText("صافي الثروة").first().waitFor();
// 5000 + 42000 − 180 (معكوس فلا أثر) + 15000 − 0 (التحويل داخلي) − 4000 (دين عليّ) = 58,000
await ok(await page.getByText("58,000.00").first().isVisible(), "صافي الثروة في المركز المالي = 58,000");

// ── الوضع الليلي والجوال ──
await page.goto(BASE + "/");
await page.getByText("صافي الثروة").first().waitFor();
await page.click("button[title='الوضع الليلي']");
await shot("dashboard-dark");
await page.click("button[title='الوضع النهاري']");
await page.click("button[title='إخفاء المبالغ']");
await ok(await page.getByText("••••").first().isVisible(), "وضع الخصوصية يخفي المبالغ");
await page.click("button[title='إظهار المبالغ']");

const mob = await browser.newContext({ viewport: { width: 390, height: 844 }, storageState: await ctx.storageState(), isMobile: true });
const mp = await mob.newPage();
mp.on("pageerror", (e) => errors.push("MOBILE " + e.message));
for (const [url, name] of [["/", "m-dashboard"], ["/vouchers/new?type=expense", "m-expense"], ["/debts", "m-debts"], ["/reports/income", "m-income"]]) {
  await mp.goto(BASE + url);
  await mp.waitForTimeout(1500);
  await mp.screenshot({ path: `${OUT}/${String(++step).padStart(2, "0")}-${name}.png`, fullPage: true });
  const overflow = await mp.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  await ok(overflow <= 1, `لا تمرير أفقي على الجوال في ${url} (${overflow}px)`);
}

}
try { await main(); } catch (e) {
  await page.screenshot({ path: `${OUT}/FAIL.png`, fullPage: true }).catch(() => {});
  const alerts = await page.locator('[role=alert]').allInnerTexts().catch(() => []);
  console.log('FAIL:', e.message.split('\n')[0], '| url:', page.url(), '| alerts:', alerts.join(' / '));
  console.log(errors.slice(0, 10).join('\n'));
  process.exit(1);
}
await browser.close();
console.log(errors.length ? `\nأخطاء المتصفح (${errors.length}):\n` + errors.slice(0, 15).join("\n") : "\nلا أخطاء في وحدة تحكم المتصفح");
