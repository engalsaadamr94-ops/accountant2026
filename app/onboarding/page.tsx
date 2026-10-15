"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AuthFrame from "@/components/AuthFrame";
import { AmountInput, Field, ErrorBox, Spinner } from "@/components/ui";
import { supabase } from "@/lib/supabase/client";
import { useBook } from "@/lib/book";
import { errorText, todayISO, toCents } from "@/lib/format";
import type { Book, CashAccount } from "@/lib/types";

const MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];

function Onboarding() {
  const router = useRouter();
  const params = useSearchParams();
  const { user, books, loading, reloadBooks, switchBook } = useBook();
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState("دفتري الشخصي");
  const [owner, setOwner] = useState("");
  const [base, setBase] = useState("SAR");
  const [month, setMonth] = useState(1);
  const [hasBusiness, setHasBusiness] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [book, setBook] = useState<Book | null>(null);
  const [cash, setCash] = useState<CashAccount[]>([]);
  const [opening, setOpening] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!loading && user && books.length > 0 && !params.get("new") && step === 1) router.replace("/");
    if (user && !owner) setOwner((user.user_metadata?.full_name as string) || "");
  }, [loading, user, books.length, params, router, step, owner]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { data, error } = await supabase().rpc("create_book", { p: { name, owner_name: owner, base_currency: base, fiscal_year_start_month: month, has_business: hasBusiness } });
    if (error) { setBusy(false); return setError(errorText(error)); }
    const b = data as Book;
    setBook(b);
    const { data: cs } = await supabase().from("cash_accounts").select("*").eq("book_id", b.id).order("sort_order");
    setCash((cs as CashAccount[]) || []);
    setBusy(false);
    setStep(2);
  }

  async function finish(skip = false) {
    if (!book) return;
    setBusy(true);
    setError(null);
    const rows = cash.filter((c) => toCents(opening[c.id]) > 0);
    if (!skip && rows.length) {
      const { data: eq } = await supabase().from("accounts").select("id").eq("book_id", book.id).eq("system_key", "opening_equity").single();
      const total = rows.reduce((s, c) => s + toCents(opening[c.id]), 0) / 100;
      const { error } = await supabase().rpc("create_entry", { p: {
        book_id: book.id, doc_type: "opening", entry_date: todayISO(), memo: "الأرصدة الافتتاحية للصناديق والبنوك",
        lines: [...rows.map((c) => ({ account_id: c.account_id, debit: Number(opening[c.id]) })), { account_id: (eq as { id: string }).id, credit: total }],
      } });
      if (error) { setBusy(false); return setError(errorText(error)); }
    }
    await reloadBooks();
    switchBook(book.id);
    router.replace("/");
  }

  if (step === 2) {
    return (
      <AuthFrame title="كم معك الآن؟" subtitle="أدخل الرصيد الحالي لكل صندوق وحساب بنكي ليبدأ دفترك من أرقام حقيقية. يمكنك تخطي هذه الخطوة وإضافة الأرصدة لاحقاً.">
        <div className="space-y-4">
          {error && <ErrorBox error={error} />}
          {cash.map((c) => (
            <Field key={c.id} label={c.name} htmlFor={`o-${c.id}`}>
              <AmountInput id={`o-${c.id}`} placeholder="0.00" value={opening[c.id] || ""} onChange={(v) => setOpening((o) => ({ ...o, [c.id]: v }))} />
            </Field>
          ))}
          <p className="text-[13px] text-muted">الديون التي لك أو عليك تضيفها من صفحة «الديون والأقساط» كديون سابقة.</p>
          <button className="btn-primary w-full !py-2.5" disabled={busy} onClick={() => finish()}>{busy && <Spinner />} حفظ والدخول إلى الدفتر</button>
          <button className="btn-quiet w-full" disabled={busy} onClick={() => finish(true)}>تخطي الآن</button>
        </div>
      </AuthFrame>
    );
  }

  return (
    <AuthFrame title={params.get("new") ? "دفتر جديد" : "لنجهّز دفترك"} subtitle="سننشئ لك دليل حسابات من نحو مئة حساب يفصل بين مالك الشخصي وعملك الحر، وصناديق جاهزة.">
      <form onSubmit={create} className="space-y-4">
        {error && <ErrorBox error={error} />}
        <Field label="اسم الدفتر" htmlFor="bn"><input id="bn" className="field" required value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="اسمك (يظهر على السندات)" htmlFor="on"><input id="on" className="field" value={owner} onChange={(e) => setOwner(e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="العملة الأساسية" htmlFor="bc">
            <select id="bc" className="field" value={base} onChange={(e) => setBase(e.target.value)}>
              <option value="SAR">ريال سعودي</option><option value="USD">دولار أمريكي</option><option value="AED">درهم إماراتي</option>
            </select>
          </Field>
          <Field label="بداية السنة المالية" htmlFor="fm">
            <select id="fm" className="field" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
              {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
          </Field>
        </div>
        <label className="flex cursor-pointer items-start gap-3 rounded-field border border-rule p-3">
          <input type="checkbox" className="mt-1" checked={hasBusiness} onChange={(e) => setHasBusiness(e.target.checked)} />
          <span><span className="font-medium">لدي عمل حر أو نشاط تجاري</span><span className="block text-[13px] text-muted">يفصل إيرادات ومصروفات العمل عن الشخصية، ويضيف تقرير ربح لكل مشروع.</span></span>
        </label>
        <button className="btn-primary w-full !py-2.5" disabled={busy}>{busy && <Spinner />} إنشاء الدفتر</button>
      </form>
    </AuthFrame>
  );
}

export default function OnboardingPage() {
  return <Suspense><Onboarding /></Suspense>;
}
