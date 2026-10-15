"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, MessageCircle, FileSpreadsheet } from "lucide-react";
import { useBook } from "@/lib/book";
import { supabase } from "@/lib/supabase/client";
import { exportExcel } from "@/lib/export";
import { DEBT_KIND_LABEL, DEBT_STATUS_LABEL, add, addDays, cur, dateLong, errorText, monthLabel, n, relativeDue, todayISO } from "@/lib/format";
import { whatsappLink } from "@/lib/vouchers";
import { Chip, EmptyState, ErrorBox, Loading, Money, PageHeader, Tabs } from "@/components/ui";
import type { Debt, Installment } from "@/lib/types";

type Tab = "receivable" | "payable" | "calendar";
type Inst = Installment & { debt: Debt };

function DebtsList() {
  const router = useRouter();
  const params = useSearchParams();
  const { book, canWrite } = useBook();
  const [tab, setTab] = useState<Tab>((params.get("tab") as Tab) || "receivable");
  const [showClosed, setShowClosed] = useState(false);
  const [debts, setDebts] = useState<Debt[] | null>(null);
  const [inst, setInst] = useState<Installment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const today = todayISO();

  const load = useCallback(async () => {
    if (!book) return;
    const sb = supabase();
    const [d, i] = await Promise.all([
      sb.from("v_debts").select("*").eq("book_id", book.id).order("next_due_date", { ascending: true, nullsFirst: false }),
      sb.from("v_installments").select("*").eq("book_id", book.id).neq("state", "paid").lte("due_date", addDays(today, 120)).order("due_date"),
    ]);
    if (d.error) return setError(errorText(d.error));
    setDebts(d.data as Debt[]);
    setInst((i.data as Installment[]) || []);
  }, [book, today]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { router.replace(`/debts?tab=${tab}`, { scroll: false }); }, [tab, router]);

  const list = useMemo(() => (debts || []).filter((d) => tab !== "calendar" && d.direction === tab && (showClosed || d.status === "active")), [debts, tab, showClosed]);
  const calendar = useMemo(() => {
    const byId = Object.fromEntries((debts || []).map((d) => [d.id, d]));
    const items: Inst[] = inst.filter((i) => byId[i.debt_id]?.status === "active").map((i) => ({ ...i, debt: byId[i.debt_id] }));
    const groups: Record<string, Inst[]> = {};
    items.forEach((i) => { const k = i.due_date < today ? "overdue" : i.due_date.slice(0, 7); (groups[k] ||= []).push(i); });
    return groups;
  }, [inst, debts, today]);

  if (error) return <ErrorBox error={error} onRetry={load} />;
  if (!debts || !book) return <Loading />;

  const active = (dir: "receivable" | "payable") => debts.filter((d) => d.direction === dir && d.status === "active");
  const sum = (dir: "receivable" | "payable") => add(...active(dir).map((d) => d.remaining_base));
  const overdue = (dir: "receivable" | "payable") => add(...active(dir).map((d) => n(d.overdue_amount) * n(d.fx_rate)));

  async function doExport() {
    await exportExcel("الديون", "الديون", debts!.map((d) => ({
      "الاتجاه": d.direction === "receivable" ? "لي" : "عليّ", "الطرف": d.party_name, "الوصف": d.title || "", "النوع": DEBT_KIND_LABEL[d.kind] || d.kind,
      "العملة": d.currency, "أصل الدين": n(d.principal), "المسدد": n(d.paid), "المتبقي": n(d.remaining), "المتأخر": n(d.overdue_amount),
      "القسط القادم": d.next_due_date || "", "الحالة": DEBT_STATUS_LABEL[d.status],
    })));
  }

  return (
    <div>
      <PageHeader title="الديون والأقساط" subtitle="ما لك عند الناس وما عليك لهم، بجداول أقساط وتذكيرات."
        actions={<>
          <button className="btn-ghost" onClick={doExport} disabled={!debts.length}><FileSpreadsheet className="h-4 w-4" /> Excel</button>
          {canWrite && <Link href={`/debts/new?direction=${tab === "payable" ? "payable" : "receivable"}`} className="btn-primary"><Plus className="h-4 w-4" /> دين جديد</Link>}
        </>} />

      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        {(["receivable", "payable"] as const).map((dir) => (
          <button key={dir} onClick={() => setTab(dir)} className={`panel px-5 py-4 text-start transition-colors ${tab === dir ? "border-brand" : "hover:border-rule-strong"}`}>
            <div className="text-[13px] text-muted">{dir === "receivable" ? "ديون لي عند الناس" : "ديون عليّ للناس"} · {active(dir).length}</div>
            <Money v={sum(dir)} cur={book.base_currency} className={`mt-1 font-display text-[24px] font-bold ${dir === "receivable" ? "text-gain" : "text-amber"}`} />
            {overdue(dir) > 0 && <div className="mt-1 text-[13px] text-loss">منها متأخر: <Money v={overdue(dir)} /></div>}
          </button>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Tabs value={tab} onChange={setTab} items={[{ value: "receivable", label: "لي" }, { value: "payable", label: "عليّ" }, { value: "calendar", label: "تقويم الاستحقاقات" }]} />
        {tab !== "calendar" && <label className="flex items-center gap-2 text-[13.5px] text-muted"><input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} /> إظهار المسدَّدة والمُبرأة</label>}
      </div>

      {tab === "calendar" ? (
        Object.keys(calendar).length === 0 ? <div className="panel"><EmptyState title="لا استحقاقات خلال الأشهر الأربعة القادمة" /></div> : (
          <div className="space-y-5">
            {Object.entries(calendar).sort(([a], [b]) => (a === "overdue" ? -1 : b === "overdue" ? 1 : a.localeCompare(b))).map(([k, items]) => (
              <section key={k}>
                <h2 className={`mb-2 text-[14px] font-bold ${k === "overdue" ? "text-loss" : ""}`}>{k === "overdue" ? "متأخرة" : monthLabel(k + "-01")}</h2>
                <div className="panel divide-y divide-rule">
                  {items.map((i) => (
                    <div key={i.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                      <div>
                        <Link href={`/debts/${i.debt_id}`} className="font-medium hover:text-brand">{i.debt.party_name}</Link>
                        <div className="text-[12.5px] text-muted">{i.debt.direction === "receivable" ? "تحصيل" : "سداد"} · القسط {i.seq} · {dateLong(i.due_date)}</div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Chip tone={i.due_date < today ? "loss" : "amber"}>{relativeDue(i.due_date, today)}</Chip>
                        <Money v={n(i.amount) - n(i.paid)} cur={i.debt.currency} className={`font-semibold ${i.debt.direction === "receivable" ? "text-gain" : ""}`} />
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )
      ) : list.length === 0 ? (
        <div className="panel"><EmptyState title={tab === "receivable" ? "لا ديون لك عند أحد" : "لا ديون عليك"} text="سجّل أي مبلغ أقرضته أو اقترضته، حتى لو كان قديماً، ليظهر في صافي ثروتك ويذكّرك البرنامج بموعده."
          action={canWrite ? <Link href={`/debts/new?direction=${tab}`} className="btn-primary"><Plus className="h-4 w-4" /> دين جديد</Link> : undefined} /></div>
      ) : (
        <div className="panel divide-y divide-rule">
          {list.map((d) => {
            const pct = Math.min(100, Math.round((n(d.paid) / Math.max(n(d.principal), 0.01)) * 100));
            const late = n(d.overdue_amount) > 0;
            return (
              <div key={d.id} className="grid gap-3 px-5 py-4 sm:grid-cols-[1.4fr_1fr_auto] sm:items-center">
                <div className="min-w-0">
                  <Link href={`/debts/${d.id}`} className="font-semibold hover:text-brand">{d.party_name}</Link>
                  <div className="truncate text-[13px] text-muted">{d.title || DEBT_KIND_LABEL[d.kind]} · منذ {dateLong(d.start_date)}</div>
                </div>
                <div>
                  <div className="mb-1 flex justify-between text-[12px] text-muted"><span>سُدِّد {pct}%</span><span className="num">{n(d.paid).toLocaleString("en-US")} / {n(d.principal).toLocaleString("en-US")}</span></div>
                  <div className="h-1.5 rounded-full bg-rule"><div className="h-1.5 rounded-full bg-brand" style={{ width: `${pct}%` }} /></div>
                  {d.status === "active" && d.next_due_date && (
                    <div className={`mt-1.5 text-[12.5px] ${late ? "text-loss" : "text-ink-soft"}`}>
                      {late ? <>متأخر <Money v={d.overdue_amount} /> {cur(d.currency)}</> : <>القسط القادم {relativeDue(d.next_due_date, today)}: <Money v={d.next_due_amount} /></>}
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-between gap-3 sm:justify-end">
                  {d.status !== "active" ? <Chip tone={d.status === "settled" ? "brand" : "neutral"}>{DEBT_STATUS_LABEL[d.status]}</Chip> : late ? <Chip tone="loss">متأخر</Chip> : null}
                  <div className="text-end">
                    <Money v={d.remaining} cur={d.currency} className="text-[17px] font-bold" />
                    <div className="text-[11.5px] text-muted">متبقٍ</div>
                  </div>
                  {d.direction === "receivable" && d.status === "active" && d.party_phone && (
                    <a className="btn-quiet !px-2" target="_blank" rel="noreferrer" title="تذكير عبر واتساب"
                      href={whatsappLink(d.party_phone, `السلام عليكم ${d.party_name}، تذكير لطيف بالمبلغ المتبقي ${n(d.remaining).toLocaleString("en-US")} ${cur(d.currency)}${d.next_due_date ? `، والقسط القادم بتاريخ ${dateLong(d.next_due_date)}` : ""}. شاكر لك.`)}>
                      <MessageCircle className="h-4 w-4" />
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function DebtsPage() {
  return <Suspense fallback={<Loading />}><DebtsList /></Suspense>;
}
