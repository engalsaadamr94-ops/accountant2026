// اختبارات قاعدة البيانات: تُشغَّل على Postgres محلي بعد reset.sh
// node --test db.test.mjs
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";

const pool = new pg.Pool({ host: "127.0.0.1", user: "postgres", password: "postgres", database: process.env.DB || "mahasi_test" });
const A = "11111111-1111-1111-1111-111111111111";
const B = "22222222-2222-2222-2222-222222222222";
const today = new Date().toISOString().slice(0, 10);
const year = Number(today.slice(0, 4));

/** تنفيذ استعلام بهوية مستخدم (دور authenticated + auth.uid) داخل معاملة */
async function as(uid, sql, params = []) {
  const c = await pool.connect();
  try {
    await c.query("begin");
    await c.query("set local role authenticated");
    await c.query("select set_config('request.jwt.claim.sub', $1, true)", [uid]);
    const r = await c.query(sql, params);
    await c.query("commit");
    return r.rows;
  } catch (e) {
    await c.query("rollback");
    throw e;
  } finally {
    c.release();
  }
}
const one = async (uid, sql, p) => (await as(uid, sql, p))[0];
const rpc = async (uid, fn, arg) => (await one(uid, `select * from public.${fn}($1::jsonb)`, [JSON.stringify(arg)]));
const num = (v) => Number(v);

let book, acc, cash, bank, wallet, party, party2;

before(async () => {
  await pool.query("insert into auth.users (id, email) values ($1,'a@test.com'),($2,'b@test.com') on conflict do nothing", [A, B]);
  book = await rpc(A, "create_book", { name: "دفتر عمرو", owner_name: "عمرو", has_business: true });
  const rows = await as(A, "select id, code, system_key from accounts where book_id = $1", [book.id]);
  acc = Object.fromEntries(rows.map((r) => [r.code, r.id]));
  const cs = await as(A, "select * from cash_accounts where book_id = $1 order by sort_order", [book.id]);
  [cash, wallet, bank] = cs;
  party = await one(A, "insert into parties (book_id, name, kind, phone) values ($1,'أبو فهد','person','966500000000') returning *", [book.id]);
  party2 = await one(A, "insert into parties (book_id, name, kind) values ($1,'مؤسسة النور','customer') returning *", [book.id]);
});
after(() => pool.end());

const entry = (o) => ({ book_id: book.id, entry_date: today, ...o });

test("بذر الدفتر: الدليل والعملات والصناديق ومراكز التكلفة", async () => {
  assert.ok(Object.keys(acc).length >= 90);
  const cur = await as(A, "select code, is_base from currencies where book_id=$1", [book.id]);
  assert.ok(cur.some((c) => c.code === "SAR" && c.is_base));
  assert.ok(cur.some((c) => c.code === "YER_ADN") && cur.some((c) => c.code === "YER_SAN"));
  assert.equal(cash.name, "الصندوق الرئيسي");
  const parent = await one(A, "select is_postable from accounts where code='1101' and book_id=$1", [book.id]);
  assert.equal(parent.is_postable, false, "الحساب الأب لا يقبل قيوداً");
  const cc = await as(A, "select code from cost_centers where book_id=$1", [book.id]);
  assert.equal(cc.length, 2);
});

test("العزل: مستخدم آخر لا يرى الدفتر ولا يكتب فيه", async () => {
  const rows = await as(B, "select * from accounts where book_id=$1", [book.id]);
  assert.equal(rows.length, 0);
  await assert.rejects(rpc(B, "create_entry", entry({ doc_type: "journal", lines: [] })), /صلاحية/);
  const books = await as(B, "select * from books");
  assert.equal(books.length, 0);
});

test("سند قبض: راتب إلى البنك يُرحَّل بترقيم تسلسلي", async () => {
  const e = await rpc(A, "create_entry", entry({
    doc_type: "receipt", memo: "راتب", cash_account_id: bank.id,
    lines: [{ account_id: bank.account_id, debit: 10000 }, { account_id: acc["4201"], credit: 10000 }],
  }));
  assert.equal(e.status, "posted");
  assert.equal(e.number_text, `RV-${year}-00001`);
  assert.equal(num(e.total), 10000);
  const b = await one(A, "select balance_fc from v_cash_balances where id=$1", [bank.id]);
  assert.equal(num(b.balance_fc), 10000);
});

test("القيد غير المتوازن يُرفض، وفرق التقريب مقبول في القيود متعددة العملات فقط", async () => {
  await assert.rejects(rpc(A, "create_entry", entry({ doc_type: "journal",
    lines: [{ account_id: acc["6103"], debit: 100 }, { account_id: bank.account_id, credit: 90 }] })), /غير متوازن/);
  await assert.rejects(rpc(A, "create_entry", entry({ doc_type: "journal",
    lines: [{ account_id: acc["6103"], debit: 100.01 }, { account_id: bank.account_id, credit: 100 }] })), /غير متوازن/, "عملة واحدة: لا تقريب");
  // 33.33 دولار × 3.75 = 124.9875 ⇒ 124.99 مقابل 125.00 دائن ⇒ فرق هللة يُعالَج
  const e = await rpc(A, "create_entry", entry({ doc_type: "journal",
    lines: [{ account_id: acc["6103"], debit: 33.33, currency: "USD", fx_rate: 3.75 }, { account_id: bank.account_id, credit: 125 }] }));
  const lines = await as(A, "select a.system_key, l.debit, l.credit from journal_lines l join accounts a on a.id=l.account_id where entry_id=$1", [e.id]);
  assert.ok(lines.some((l) => l.system_key === "rounding" && Number(l.debit) === 0.01));
  // سعر مخصص على سطر بالعملة الأساسية يُتجاهل
  const e2 = await rpc(A, "create_entry", entry({ doc_type: "journal",
    lines: [{ account_id: acc["6103"], debit: 10, fx_rate: 2 }, { account_id: bank.account_id, credit: 10 }] }));
  const l2 = await one(A, "select debit, fx_rate from journal_lines where entry_id=$1 and line_no=1", [e2.id]);
  assert.equal(Number(l2.debit), 10);
  assert.equal(Number(l2.fx_rate), 1);
});

test("منع الرصيد السالب في الصندوق، والسماح بعد التمويل", async () => {
  await assert.rejects(rpc(A, "create_entry", entry({ doc_type: "expense",
    lines: [{ account_id: acc["6105"], debit: 200 }, { account_id: cash.account_id, credit: 200 }] })), /غير كافٍ/);
  await rpc(A, "create_entry", entry({ doc_type: "transfer",
    lines: [{ account_id: cash.account_id, debit: 1000 }, { account_id: bank.account_id, credit: 1000 }] }));
  const e = await rpc(A, "create_entry", entry({ doc_type: "expense", memo: "بنزين",
    lines: [{ account_id: acc["6105"], debit: 200 }, { account_id: cash.account_id, credit: 200 }] }));
  assert.equal(e.number_text, `EX-${year}-00001`, "المحاولة الفاشلة لا تستهلك رقماً");
});

test("القيد المرحّل لا يُعدَّل ولا يُحذف ولا تُضاف له أسطر مباشرة", async () => {
  const e = await one(A, "select * from journal_entries where book_id=$1 and status='posted' limit 1", [book.id]);
  const upd = await as(A, "update journal_entries set memo='x' where id=$1 returning id", [e.id]);
  assert.equal(upd.length, 0, "سياسة RLS تحجب تعديل المرحّل");
  await as(A, "delete from journal_entries where id=$1", [e.id]);
  assert.equal((await as(A, "select id from journal_entries where id=$1", [e.id])).length, 1, "الحذف لا يمر");
  await assert.rejects(as(A, "insert into journal_lines (entry_id, book_id, line_no, account_id, currency, debit) values ($1,$2,9,$3,'SAR',5)", [e.id, book.id, acc["6103"]]));
  await assert.rejects(as(A, "insert into journal_entries (book_id, doc_type, entry_date, currency, status) values ($1,'journal',current_date,'SAR','posted')", [book.id]));
});

test("لا ترحيل على حساب رئيسي، ولا إضافة فرع لحساب عليه حركات، ولا تلاعب بقبول القيود", async () => {
  await assert.rejects(rpc(A, "create_entry", entry({ doc_type: "journal",
    lines: [{ account_id: acc["61"], debit: 10 }, { account_id: bank.account_id, credit: 10 }] })), /لا تقبل قيوداً/);
  await assert.rejects(as(A, "insert into accounts (book_id, code, name, type, parent_id) values ($1,'610501','فرع','expense',$2)", [book.id, acc["6105"]]), /عليه حركات/);
  await assert.rejects(as(A, "update accounts set is_postable=true where id=$1", [acc["61"]]), /آلياً/);
  // إضافة فرع لحساب بلا حركات يجعله رئيسياً
  await as(A, "insert into accounts (book_id, code, name, type, scope, parent_id) values ($1,'610701','رسوم مدارس','expense','personal',$2)", [book.id, acc["6107"]]);
  const p = await one(A, "select is_postable from accounts where id=$1", [acc["6107"]]);
  assert.equal(p.is_postable, false);
});

test("عكس القيد: يُنشئ قيداً معاكساً مرقّماً ويُصفّر الأثر", async () => {
  const before = num((await one(A, "select balance_fc from v_cash_balances where id=$1", [bank.id])).balance_fc);
  const e = await rpc(A, "create_entry", entry({ doc_type: "payment", memo: "إيجار",
    lines: [{ account_id: acc["6101"], debit: 2500 }, { account_id: bank.account_id, credit: 2500 }] }));
  const r = await one(A, "select * from reverse_entry($1, null, 'خطأ في المبلغ')", [e.id]);
  assert.equal(r.doc_type, "reversal");
  assert.match(r.number_text, /^RJ-/);
  const orig = await one(A, "select status, reversed_by_id from journal_entries where id=$1", [e.id]);
  assert.equal(orig.status, "reversed");
  assert.equal(orig.reversed_by_id, r.id);
  const after = num((await one(A, "select balance_fc from v_cash_balances where id=$1", [bank.id])).balance_fc);
  assert.equal(after, before);
  await assert.rejects(one(A, "select reverse_entry($1)", [e.id]), /معكوس مسبقاً/);
});

test("المسودات: تعديل ثم ترحيل، وحذف", async () => {
  const d = await rpc(A, "create_entry", entry({ doc_type: "journal", post: false,
    lines: [{ account_id: acc["6104"], debit: 50 }, { account_id: bank.account_id, credit: 50 }] }));
  assert.equal(d.status, "draft");
  assert.equal(d.number, null);
  const u = await one(A, "select * from update_draft($1, $2::jsonb)", [d.id, JSON.stringify({ memo: "عشاء",
    lines: [{ account_id: acc["6104"], debit: 75 }, { account_id: bank.account_id, credit: 75 }], post: true })]);
  assert.equal(u.status, "posted");
  assert.equal(num(u.total), 75);
  const d2 = await rpc(A, "create_entry", entry({ doc_type: "journal", post: false,
    lines: [{ account_id: acc["6104"], debit: 5 }, { account_id: bank.account_id, credit: 5 }] }));
  await one(A, "select delete_draft($1)", [d2.id]);
  assert.equal((await as(A, "select id from journal_entries where id=$1", [d2.id])).length, 0);
});

test("تاريخ الإقفال يمنع الترحيل والعكس في الفترة المقفلة", async () => {
  const old = await rpc(A, "create_entry", entry({ doc_type: "journal", entry_date: `${year - 1}-12-15`,
    lines: [{ account_id: bank.account_id, debit: 500 }, { account_id: acc["3101"], credit: 500 }] }));
  await as(A, "update books set lock_date=$2 where id=$1", [book.id, `${year - 1}-12-31`]);
  await assert.rejects(rpc(A, "create_entry", entry({ doc_type: "journal", entry_date: `${year - 1}-12-20`,
    lines: [{ account_id: bank.account_id, debit: 5 }, { account_id: acc["3101"], credit: 5 }] })), /مقفلة/);
  await assert.rejects(one(A, "select reverse_entry($1)", [old.id]), /مقفلة/);
  // العكس بتاريخ بعد الإقفال مسموح
  const r = await one(A, "select * from reverse_entry($1, $2::date)", [old.id, today]);
  assert.equal(r.status, "posted");
  await as(A, "update books set lock_date=null where id=$1", [book.id]);
});

test("دين لي بالأقساط: تحصيل جزئي وتوزيع على الأقساط وتسوية", async () => {
  const d = await rpc(A, "create_debt", { book_id: book.id, direction: "receivable", party_id: party.id, principal: 3000,
    start_date: today, cash_account_id: bank.id, title: "سلفة أبو فهد",
    installments: [{ due_date: "2020-01-01", amount: 1000 }, { due_date: "2099-02-01", amount: 1000 }, { due_date: "2099-03-01", amount: 1000 }] });
  assert.equal(d.status, "active");
  let v = await one(A, "select * from v_debts where id=$1", [d.id]);
  assert.equal(num(v.remaining), 3000);
  assert.equal(num(v.overdue_amount), 1000, "القسط الأول متأخر");
  await rpc(A, "pay_debt", { debt_id: d.id, amount: 1500, cash_account_id: cash.id, pay_date: today });
  const ins = await as(A, "select seq, paid, state from v_installments where debt_id=$1 order by seq", [d.id]);
  assert.deepEqual(ins.map((i) => [i.seq, num(i.paid), i.state]), [[1, 1000, "paid"], [2, 500, "partial"], [3, 0, "upcoming"]]);
  await assert.rejects(rpc(A, "pay_debt", { debt_id: d.id, amount: 2000, cash_account_id: cash.id }), /أكبر من المتبقي/);
  const pay2 = await rpc(A, "pay_debt", { debt_id: d.id, amount: 1500, cash_account_id: cash.id });
  v = await one(A, "select * from v_debts where id=$1", [d.id]);
  assert.equal(v.status, "settled");
  assert.equal(num(v.remaining), 0);
  // عكس آخر دفعة يعيد الدين نشطاً
  await one(A, "select reverse_entry($1)", [pay2.id]);
  v = await one(A, "select * from v_debts where id=$1", [d.id]);
  assert.equal(v.status, "active");
  assert.equal(num(v.remaining), 1500);
  const pb = await one(A, "select net from v_party_balances where party_id=$1", [party.id]);
  assert.equal(num(pb.net), 1500, "صافي رصيد الشخص");
});

test("دين عليّ بالدولار: فروق العملة المحققة عند السداد", async () => {
  const d = await rpc(A, "create_debt", { book_id: book.id, direction: "payable", party_id: party2.id, principal: 1000,
    currency: "USD", fx_rate: 3.75, start_date: today, cash_account_id: bank.id });
  const bankBefore = num((await one(A, "select balance_base from v_cash_balances where id=$1", [bank.id])).balance_base);
  await rpc(A, "pay_debt", { debt_id: d.id, amount: 1000, cash_account_id: bank.id, fx_rate: 3.8 });
  const bankAfter = num((await one(A, "select balance_base from v_cash_balances where id=$1", [bank.id])).balance_base);
  assert.equal(Math.round((bankBefore - bankAfter) * 100) / 100, 3800);
  const loss = await one(A, "select coalesce(sum(debit-credit),0) s from v_posted_lines where account_id=$1", [acc["5210"]]);
  assert.equal(num(loss.s), 50);
  const v = await one(A, "select status from v_debts where id=$1", [d.id]);
  assert.equal(v.status, "settled");
});

test("إبراء دين وتحويله لهبة، وإعادة الجدولة", async () => {
  const d = await rpc(A, "create_debt", { book_id: book.id, direction: "receivable", party_id: party.id, principal: 600, start_date: today });
  await rpc(A, "pay_debt", { debt_id: d.id, amount: 100, cash_account_id: cash.id });
  await one(A, "select reschedule_debt($1, $2::jsonb)", [d.id, JSON.stringify([{ due_date: "2099-01-01", amount: 250 }, { due_date: "2099-02-01", amount: 250 }])]);
  const ins = await as(A, "select amount, state from v_installments where debt_id=$1 order by seq", [d.id]);
  assert.equal(ins.length, 3);
  await assert.rejects(one(A, "select reschedule_debt($1, $2::jsonb)", [d.id, JSON.stringify([{ due_date: "2099-01-01", amount: 10 }])]), /يجب أن يساوي/);
  await rpc(A, "forgive_debt", { debt_id: d.id, mode: "gift" });
  const v = await one(A, "select status, remaining from v_debts where id=$1", [d.id]);
  assert.equal(v.status, "forgiven");
  const g = await one(A, "select coalesce(sum(debit-credit),0) s from v_posted_lines where account_id=$1", [acc["6203"]]);
  assert.equal(num(g.s), 500);
});

test("تحويل بين صندوق بالريال ومحفظة بالريال اليمني بسعر فعلي", async () => {
  const yer = await rpc(A, "create_cash_account", { book_id: book.id, name: "محفظة عدن", kind: "wallet", currency: "YER_ADN" });
  // 500 ريال سعودي = 210,000 ريال يمني ⇒ السعر الفعلي 500/210000
  const e = await rpc(A, "create_entry", entry({ doc_type: "transfer", currency: "SAR",
    lines: [{ account_id: yer.account_id, debit: 210000, currency: "YER_ADN", fx_rate: 500 / 210000 },
            { account_id: cash.account_id, credit: 500 }] }));
  assert.equal(e.status, "posted");
  const w = await one(A, "select balance_fc, balance_base from v_cash_balances where id=$1", [yer.id]);
  assert.equal(num(w.balance_fc), 210000);
  assert.equal(num(w.balance_base), 500);
  // سطر بعملة لا تطابق عملة الصندوق يُرفض
  await assert.rejects(rpc(A, "create_entry", entry({ doc_type: "transfer",
    lines: [{ account_id: yer.account_id, debit: 100 }, { account_id: cash.account_id, credit: 100 }] })), /عملة/);
});

test("التقارير: ميزان المراجعة متوازن، وكشف الحساب برصيد جارٍ، ولوحة التحكم", async () => {
  const tb = await as(A, "select * from report_trial_balance($1)", [book.id]);
  const sum = tb.reduce((s, r) => s + num(r.closing), 0);
  assert.equal(Math.round(sum * 100), 0, "مجموع الأرصدة صفر");
  const st = await as(A, "select * from report_statement($1, $2, null, null, $3::date, null)", [book.id, bank.account_id, today]);
  assert.equal(st[0].is_opening, true);
  const last = st[st.length - 1];
  const bal = await one(A, "select balance_base from v_cash_balances where id=$1", [bank.id]);
  assert.equal(num(last.balance), num(bal.balance_base));
  // كشف حساب أب يشمل الفروع
  const grp = await as(A, "select * from report_statement($1, $2)", [book.id, acc["1101"]]);
  assert.ok(grp.length > 2);
  const dash = await one(A, "select dashboard($1) d", [book.id]);
  assert.ok(Array.isArray(dash.d.cash) && dash.d.cash.length >= 3);
  assert.ok(num(dash.d.totals.month_revenue) >= 9999.99);
  assert.ok(Array.isArray(dash.d.upcoming));
  const m = await as(A, "select * from report_monthly($1, 3)", [book.id]);
  assert.ok(m.length > 0);
});

test("الأعضاء والصلاحيات: المطّلع يقرأ ولا يكتب، ولا يُزال آخر مالك", async () => {
  await one(A, "select add_member($1, 'b@test.com', 'viewer')", [book.id]);
  const rows = await as(B, "select id from accounts where book_id=$1", [book.id]);
  assert.ok(rows.length > 0);
  await assert.rejects(rpc(B, "create_entry", entry({ doc_type: "journal",
    lines: [{ account_id: acc["6103"], debit: 1 }, { account_id: bank.account_id, credit: 1 }] })), /صلاحية/);
  await assert.rejects(as(B, "insert into parties (book_id, name) values ($1,'x')", [book.id]));
  await assert.rejects(one(B, "select export_book($1)", [book.id]), /لمدير/);
  await assert.rejects(as(A, "delete from book_members where book_id=$1 and user_id=$2", [book.id, A]), /آخر مالك/);
  const audit = await as(A, "select count(*) c from audit_log where book_id=$1", [book.id]);
  assert.ok(num(audit[0].c) > 10);
  assert.equal((await as(B, "select * from audit_log where book_id=$1", [book.id])).length, 0, "سجل التدقيق للمدير فقط");
  const members = await as(A, "select * from list_members($1)", [book.id]);
  assert.equal(members.length, 2);
});

test("حماية البيانات الأساسية: لا حذف لطرف عليه حركات، ولا تعديل مالي مباشر للدين", async () => {
  await assert.rejects(as(A, "delete from parties where id=$1", [party.id]), /عليه حركات/);
  const d = await one(A, "select id from debts where book_id=$1 limit 1", [book.id]);
  await assert.rejects(as(A, "update debts set principal=1 where id=$1", [d.id]), /الحقول المالية/);
  await as(A, "update debts set notes='ملاحظة' where id=$1", [d.id]);
  await assert.rejects(as(A, "delete from accounts where id=$1", [acc["6103"]]));
});

test("ثغرات المراجعة المستقلة مغلقة", async () => {
  // غريب لا يحذف دفتراً ليس عضواً فيه
  await assert.rejects(one(B, "select delete_book($1, $2)", [book.id, "دفتر عمرو"]), /للمالك فقط/);
  // لا تعديل مباشر لمسودة (منعاً لتغيير doc_type/debt_id)
  const d = await rpc(A, "create_entry", entry({ doc_type: "journal", post: false,
    lines: [{ account_id: acc["6104"], debit: 5 }, { account_id: bank.account_id, credit: 5 }] }));
  const debt = await one(A, "select id from debts where book_id=$1 limit 1", [book.id]);
  const upd = await as(A, "update journal_entries set doc_type='debt', debt_id=$2 where id=$1 returning id", [d.id, debt.id]);
  assert.equal(upd.length, 0);
  await one(A, "select delete_draft($1)", [d.id]);
  // لا يُعكس قيد دين عليه دفعات مرحّلة
  const dd = await rpc(A, "create_debt", { book_id: book.id, direction: "receivable", party_id: party.id, principal: 50, start_date: today, cash_account_id: bank.id });
  await rpc(A, "pay_debt", { debt_id: dd.id, amount: 20, cash_account_id: bank.id });
  await assert.rejects(one(A, "select reverse_entry($1)", [dd.entry_id]), /اعكس الدفعات أولاً/);
  // العملة الأساسية محمية
  await assert.rejects(as(A, "update currencies set default_rate=2 where book_id=$1 and code='SAR'", [book.id]), /العملة الأساسية/);
  await assert.rejects(as(A, "update currencies set is_base=true where book_id=$1 and code='USD'", [book.id]), /أساسية/);
  await assert.rejects(as(A, "delete from currencies where book_id=$1 and code='USD'", [book.id]), /مستخدمة/);
  await assert.rejects(as(A, "update books set base_currency='USD' where id=$1", [book.id]), /العملة الأساسية/);
  // الدوال الداخلية غير متاحة للعميل، ودوال القراءة لا تكشف دفاتر الآخرين
  const D = "44444444-4444-4444-4444-444444444444";
  await pool.query("insert into auth.users (id, email) values ($1,'d@test.com') on conflict do nothing", [D]);
  await assert.rejects(one(D, "select public._account_id($1, 'rounding')", [book.id]), /permission denied/);
  const r = await one(D, "select rate_on($1, 'USD', current_date) r", [book.id]);
  assert.equal(r.r, null);
  const rem = await one(D, "select debt_remaining($1) r", [dd.id]);
  assert.equal(rem.r, null);
  // عكس قيد على حساب معطّل مسموح
  const e = await rpc(A, "create_entry", entry({ doc_type: "expense", lines: [{ account_id: acc["6109"], debit: 7 }, { account_id: bank.account_id, credit: 7 }] }));
  await as(A, "update accounts set is_active=false where id=$1", [acc["6109"]]);
  const rv = await one(A, "select * from reverse_entry($1)", [e.id]);
  assert.equal(rv.status, "posted");
});

test("مدير لا يعدّل صلاحية مالك", async () => {
  const C = "33333333-3333-3333-3333-333333333333";
  await pool.query("insert into auth.users (id, email) values ($1,'c@test.com') on conflict do nothing", [C]);
  await one(A, "select add_member($1, 'c@test.com', 'admin')", [book.id]);
  await assert.rejects(as(C, "update book_members set role='viewer' where book_id=$1 and user_id=$2", [book.id, A]), /مالك/);
});

test("النسخة الاحتياطية والتصدير", async () => {
  const x = await one(A, "select export_book($1) j", [book.id]);
  assert.equal(x.j.format, "mahasi-backup");
  assert.ok(x.j.journal_lines.length > 10);
});

test("حذف الدفتر بالكامل للمالك مع تأكيد الاسم", async () => {
  const b2 = await rpc(A, "create_book", { name: "تجربة" });
  await rpc(A, "create_entry", { book_id: b2.id, doc_type: "journal",
    lines: [{ account_id: (await one(A, "select account_id from cash_accounts where book_id=$1 limit 1", [b2.id])).account_id, debit: 10 },
            { account_id: (await one(A, "select id from accounts where book_id=$1 and code='3101'", [b2.id])).id, credit: 10 }] });
  await assert.rejects(one(A, "select delete_book($1, 'خطأ')", [b2.id]), /اكتب اسم/);
  await one(A, "select delete_book($1, 'تجربة')", [b2.id]);
  assert.equal((await as(A, "select id from books where id=$1", [b2.id])).length, 0);
});
