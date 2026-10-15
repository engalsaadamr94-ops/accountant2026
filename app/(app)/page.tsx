"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { MessageCircle, ArrowLeft } from "lucide-react";
import { useBook } from "@/lib/book";
import { supabase } from "@/lib/supabase/client";
import { CASH_KIND_LABEL, DOC_LABEL, add, cur, dateLong, errorText, hijri, n, relativeDue, todayISO } from "@/lib/format";
import { whatsappLink } from "@/lib/vouchers";
import { Chip, EmptyState, ErrorBox, Loading, Money } from "@/components/ui";
import { HBars, MonthlyBars } from "@/components/charts";
import { QUICK_ACTIONS } from "@/components/AppShell";
import type { DocType } from "@/lib/types";

type Dash = {
  cash: { id: string; name: string; kind: keyof typeof CASH_KIND_LABEL; currency: string; balance_fc: number; balance_base: number }[];
  totals: { assets: number; liabilities: number; cash: number; cards: number; receivable: number; payable: number; month_revenue: number; month_expense: number; month_personal_expense: number; month_business_revenue: number };
  top_expenses: { id: string; name: string; amount: number }[];
  monthly: { month: string; revenue: number; expense: number }[];
  upcoming: { id: string; debt_id: string; due_date: string; amount: number; state: string; direction: "receivable" | "payable"; currency: string; party_name: string; party_phone: string | null }[];
  recent: { id: string; number_text: string | null; doc_type: DocType; entry_date: string; memo: string | null; total: number; status: string; party_name: string | null }[];
  top_parties: { party_id: string; name: string; net: number }[];
};

export default function Dashboard() {
  const { book, user } = useBook();
  const [d, setD] = useState<Dash | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!book) return;
    setError(null);
    const { data, error } = await supabase().rpc("dashboard", { p_book: book.id, p_today: todayISO() });
    if (error) return setError(errorText(error));
    setD(data as Dash);
  }, [book]);
  useEffect(() => { load(); }, [load]);

  if (error) return <ErrorBox error={error} onRetry={load} />;
  if (!d || !book) return <Loading />;

  const t = d.totals;
  const netWorth = add(t.assets, -t.liabilities);
  const savings = add(t.month_revenue, -t.month_expense);
  const today = todayISO();
  const name = (user?.user_metadata?.full_name as string) || book.owner_name || "";
  const isEmpty = d.recent.length === 0;

  return (
    <div className="space-y-8">
      {/* ── السطر الأول: صافي الثروة كما في دفتر الأستاذ ── */}
      <section className="grid gap-6 lg:grid-cols-[1.25fr_1fr]">
        <div className="panel px-6 py-6 sm:px-8">
          <div className="flex items-baseline justify-between gap-3">
            <h1 className="text-[19px] font-bold">{name ? `أهلاً ${name.split(" ")[0]}` : "دفترك اليوم"}</h1>
            <span className="text-[13px] text-muted">{dateLong(today)} · {hijri(today)}</span>
          </div>
          <dl className="mt-5 text-[15px]">
            <Row label="النقد في الصناديق والبنوك" v={t.cash} href="/cash" />
            <Row label="ما لي عند الناس والعملاء" v={t.receivable} href="/debts?tab=receivable" />
            <Row label="الأصول الأخرى" v={add(t.assets, -t.cash, -t.receivable)} href="/reports/balance-sheet" />
            <Row label="ما عليّ للناس والبطاقات والتمويل" v={-t.payable} href="/debts?tab=payable" />
            {n(add(t.liabilities, -t.payable)) !== 0 && <Row label="التزامات أخرى" v={-add(t.liabilities, -t.payable)} href="/reports/balance-sheet" />}
          </dl>
          <div className="total-rule mt-2 flex items-baseline justify-between py-3">
            <span className="font-display text-[16px] font-bold">صافي الثروة</span>
            <Money v={netWorth} signed className={`font-display text-[28px] font-bold sm:text-[32px] ${netWorth < 0 ? "text-loss" : "text-ink"}`} />
          </div>
        </div>

        <div className="panel px-6 py-6">
          <h2 className="text-[15px] font-bold">هذا الشهر</h2>
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-5">
            <Stat label="الدخل" v={t.month_revenue} />
            <Stat label="المصروف" v={t.month_expense} />
            <Stat label={savings >= 0 ? "الفائض" : "العجز"} v={savings} tone={savings < 0 ? "loss" : "gain"} />
            <Stat label="المصروف الشخصي" v={t.month_personal_expense} />
            {book.has_business && <Stat label="إيراد العمل الحر" v={t.month_business_revenue} />}
            {n(t.month_revenue) > 0 && (
              <div>
                <dt className="text-[12.5px] text-muted">معدل الادخار</dt>
                <dd className="num mt-0.5 text-[18px] font-semibold">{Math.round((savings / n(t.month_revenue)) * 100)}%</dd>
              </div>
            )}
          </dl>
        </div>
      </section>

      {isEmpty && (
        <section className="panel">
          <EmptyState title="دفترك جاهز، سجّل أول عملية" text="ابدأ بمصروف اليوم أو راتبك. كل عملية تُرحَّل تلقائياً بقيد مزدوج صحيح دون أن تختار مديناً ودائناً."
            action={<div className="flex flex-wrap justify-center gap-2">{QUICK_ACTIONS.slice(0, 3).map((a) => <Link key={a.type} href={`/vouchers/new?type=${a.type}`} className="btn-ghost"><a.icon className="h-4 w-4" />{a.label}</Link>)}</div>} />
        </section>
      )}

      {/* ── المستحقات القادمة ── */}
      {d.upcoming.length > 0 && (
        <section>
          <SectionHead title="مستحقات الأسبوعين القادمين" href="/debts" />
          <div className="panel divide-y divide-rule">
            {d.upcoming.map((u) => {
              const late = u.due_date < today;
              return (
                <div key={u.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <Link href={`/debts/${u.debt_id}`} className="font-medium hover:text-brand">{u.party_name}</Link>
                    <div className="text-[13px] text-muted">{u.direction === "receivable" ? "يستحق لك" : "تستحق عليك"} · {dateLong(u.due_date)}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Chip tone={late ? "loss" : "amber"}>{relativeDue(u.due_date, today)}</Chip>
                    <Money v={u.amount} cur={u.currency} className={`font-semibold ${u.direction === "receivable" ? "text-gain" : "text-ink"}`} />
                    {u.direction === "receivable" && u.party_phone && (
                      <a className="btn-quiet !px-2" target="_blank" rel="noreferrer" title="تذكير عبر واتساب"
                        href={whatsappLink(u.party_phone, `السلام عليكم ${u.party_name}، تذكير لطيف بالقسط المستحق بتاريخ ${dateLong(u.due_date)} بمبلغ ${n(u.amount).toLocaleString("en-US")} ${cur(u.currency)}. شاكر لك.`)}>
                        <MessageCircle className="h-4 w-4" />
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="panel p-5">
          <h2 className="mb-3 text-[15px] font-bold">الدخل والمصروف خلال ستة أشهر</h2>
          {d.monthly.length ? <MonthlyBars data={d.monthly.map((m) => ({ month: m.month, revenue: n(m.revenue), expense: n(m.expense) }))} /> : <p className="py-10 text-center text-[14px] text-muted">لا توجد حركات دخل أو مصروف بعد.</p>}
        </div>
        <div className="panel p-5">
          <h2 className="mb-4 text-[15px] font-bold">أين ذهب مالك هذا الشهر</h2>
          {d.top_expenses.length ? <HBars items={d.top_expenses.map((e) => ({ label: e.name, value: n(e.amount) }))} /> : <p className="py-10 text-center text-[14px] text-muted">لا مصروفات هذا الشهر.</p>}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div>
          <SectionHead title="الصناديق والبنوك" href="/cash" />
          <div className="panel overflow-hidden">
            <table className="ledger">
              <tbody>
                {d.cash.map((c) => (
                  <tr key={c.id}>
                    <td><Link href={`/cash/${c.id}`} className="font-medium hover:text-brand">{c.name}</Link><div className="text-[12px] text-muted">{CASH_KIND_LABEL[c.kind]}</div></td>
                    <td className="amt"><Money v={c.kind === "card" ? -c.balance_fc : c.balance_fc} cur={c.currency} signed className={n(c.balance_fc) < 0 && c.kind !== "card" ? "text-loss" : ""} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div>
          <SectionHead title="آخر العمليات" href="/vouchers" />
          <div className="panel overflow-hidden">
            {d.recent.length === 0 ? <p className="px-5 py-8 text-center text-[14px] text-muted">لا عمليات بعد.</p> : (
              <table className="ledger">
                <tbody>
                  {d.recent.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <Link href={`/vouchers/${r.id}`} className="font-medium hover:text-brand">{r.memo || DOC_LABEL[r.doc_type]}</Link>
                        <div className="text-[12px] text-muted">{DOC_LABEL[r.doc_type]}{r.party_name ? ` · ${r.party_name}` : ""} · {dateLong(r.entry_date)}</div>
                      </td>
                      <td className="amt">
                        <Money v={r.total} className={r.status === "reversed" ? "text-muted line-through" : ""} />
                        {r.status === "draft" && <div><Chip tone="amber">مسودة</Chip></div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </section>

      {d.top_parties.length > 0 && (
        <section>
          <SectionHead title="أرصدة الأشخاص والجهات" href="/parties" />
          <div className="grid overflow-hidden rounded-panel border border-rule bg-sheet sm:grid-cols-2 lg:grid-cols-3">
            {d.top_parties.map((p) => (
              <Link key={p.party_id} href={`/parties/${p.party_id}`} className="-mb-px flex items-center justify-between border-b border-rule px-5 py-3.5 hover:bg-brand-tint/50 sm:border-s">
                <span className="truncate font-medium">{p.name}</span>
                <span className="text-end">
                  <Money v={Math.abs(n(p.net))} className="font-semibold" />
                  <span className={`block text-[12px] ${n(p.net) > 0 ? "text-gain" : "text-amber"}`}>{n(p.net) > 0 ? "لك عنده" : "عليك له"}</span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Row({ label, v, href }: { label: string; v: number; href: string }) {
  return (
    <div className="flex items-baseline justify-between border-b border-rule py-2.5">
      <dt><Link href={href} className="text-ink-soft hover:text-brand">{label}</Link></dt>
      <dd><Money v={v} signed className={n(v) < 0 ? "text-ink-soft" : ""} /></dd>
    </div>
  );
}

function Stat({ label, v, tone }: { label: string; v: number; tone?: "loss" | "gain" }) {
  return (
    <div>
      <dt className="text-[12.5px] text-muted">{label}</dt>
      <dd className={`mt-0.5 text-[18px] font-semibold ${tone === "loss" ? "text-loss" : tone === "gain" ? "text-gain" : ""}`}><Money v={Math.abs(n(v))} /></dd>
    </div>
  );
}

function SectionHead({ title, href }: { title: string; href?: string }) {
  return (
    <div className="mb-2.5 flex items-center justify-between">
      <h2 className="text-[15px] font-bold">{title}</h2>
      {href && <Link href={href} className="flex items-center gap-1 text-[13px] text-brand hover:underline">عرض الكل <ArrowLeft className="h-3.5 w-3.5" /></Link>}
    </div>
  );
}

