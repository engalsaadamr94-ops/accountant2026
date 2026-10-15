import { test } from "node:test";
import assert from "node:assert/strict";
import { tafqit } from "../../lib/tafqit";
import { buildVoucherLines, generateInstallments, whatsappLink } from "../../lib/vouchers";
import { money, add, addMonths, relativeDue, side, natural, hijri } from "../../lib/format";

test("التفقيط", () => {
  assert.equal(tafqit(1250.25), "فقط ألف ومائتان وخمسون ريالاً وخمس وعشرون هللة لا غير");
  assert.equal(tafqit(1), "فقط ريال واحد لا غير");
  assert.equal(tafqit(2), "فقط ريالان لا غير");
  assert.equal(tafqit(5), "فقط خمسة ريالات لا غير");
  assert.equal(tafqit(11), "فقط أحد عشر ريالاً لا غير");
  assert.equal(tafqit(100), "فقط مائة ريال لا غير");
  assert.equal(tafqit(3000), "فقط ثلاثة آلاف ريال لا غير");
  assert.equal(tafqit(21000), "فقط واحد وعشرون ألف ريال لا غير");
  assert.equal(tafqit(2500000), "فقط مليونان وخمسمائة ألف ريال لا غير");
  assert.equal(tafqit(0.5), "فقط خمسون هللة لا غير");
  assert.equal(tafqit(10, "USD"), "فقط عشرة دولارات لا غير");
});

test("التنسيق والحساب بالهللات", () => {
  assert.equal(add(0.1, 0.2), 0.3);
  assert.equal(money(-1234.5), "1,234.50");
  assert.equal(money(-1234.5, { signed: true }), "(1,234.50)");
  assert.equal(side(-3), "دائن");
  assert.equal(natural(-500, "liability"), 500);
  assert.equal(addMonths("2026-01-31", 1), "2026-02-28");
  assert.equal(relativeDue("2026-01-05", "2026-01-01"), "بعد 4 أيام");
  assert.equal(relativeDue("2025-12-20", "2026-01-01"), "متأخر 12 يوماً");
  assert.ok(hijri("2026-03-20").length > 5);
});

const cash = { id: "c1", account_id: "A-cash", currency: "SAR" };

test("سند مصروف بعدة بنود", () => {
  const r = buildVoucherLines({ kind: "expense", cash, rows: [{ account_id: "X1", amount: "100.10" }, { account_id: "X2", amount: 0.2 }] });
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.total, 100.3);
  assert.deepEqual(r.lines.map((l) => [l.account_id, l.debit ?? 0, l.credit ?? 0]), [["X1", 100.1, 0], ["X2", 0.2, 0], ["A-cash", 0, 100.3]]);
});

test("سند قبض: الصندوق مدين أولاً", () => {
  const r = buildVoucherLines({ kind: "receipt", cash, party_id: "P", rows: [{ account_id: "AR", amount: 500 }] });
  assert.ok(r.ok && r.lines[0].account_id === "A-cash" && r.lines[0].debit === 500 && r.lines[1].party_id === "P");
});

test("أخطاء التحقق", () => {
  assert.equal((buildVoucherLines({ kind: "expense", rows: [] }) as { error: string }).error, "اختر الصندوق أو البنك");
  assert.match((buildVoucherLines({ kind: "expense", cash, rows: [{ account_id: "", amount: 5 }] }) as { error: string }).error, /اختر الحساب/);
  assert.match((buildVoucherLines({ kind: "expense", cash, rows: [{ account_id: "A-cash", amount: 5 }] }) as { error: string }).error, /الصندوق نفسه/);
  assert.match((buildVoucherLines({ kind: "journal", journalRows: [{ account_id: "a", debit: 10, credit: 0 }, { account_id: "b", debit: 0, credit: 9 }] }) as { error: string }).error, /غير متوازن/);
});

test("تحويل بعملتين مع رسوم", () => {
  const r = buildVoucherLines({ kind: "transfer", cash, toCash: { id: "w", account_id: "A-yer", currency: "YER_ADN" }, amount: 500, received: 210000, fromRate: 1, fee: 15, feeAccountId: "FEE" });
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.lines.length, 4);
  const base = r.lines[0].debit! * r.lines[0].fx_rate!;
  assert.ok(Math.abs(base - 500) < 1e-9);
  assert.match((buildVoucherLines({ kind: "transfer", cash, toCash: cash, amount: 5 }) as { error: string }).error, /متماثلان/);
});

test("توليد الأقساط بالتساوي والباقي على الأخير", () => {
  const ins = generateInstallments(1000, 3, "2026-01-31");
  assert.deepEqual(ins, [{ due_date: "2026-01-31", amount: 333.33 }, { due_date: "2026-02-28", amount: 333.33 }, { due_date: "2026-03-31", amount: 333.34 }]);
  assert.equal(generateInstallments(100, 2, "2026-01-01", "weekly")[1].due_date, "2026-01-08");
});

test("رابط واتساب", () => {
  assert.match(whatsappLink("0501234567", "مرحبا"), /^https:\/\/wa\.me\/966501234567\?text=/);
});
