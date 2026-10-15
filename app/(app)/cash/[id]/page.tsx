"use client";

import Link from "next/link";
import { useState } from "react";
import { useParams } from "next/navigation";
import { ArrowRight, ArrowDownLeft, ArrowUpRight, ArrowLeftRight } from "lucide-react";
import { useBook } from "@/lib/book";
import { CASH_KIND_LABEL, n } from "@/lib/format";
import Statement, { PeriodBar, yearStart } from "@/components/Statement";
import { Loading, Money, PageHeader } from "@/components/ui";

export default function CashDetail() {
  const { id } = useParams<{ id: string }>();
  const { cash, canWrite, book } = useBook();
  const c = cash.find((x) => x.id === id);
  const [from, setFrom] = useState(yearStart());
  const [to, setTo] = useState("");
  if (!book || !c) return <Loading />;
  const bal = c.kind === "card" ? -n(c.balance_fc) : n(c.balance_fc);
  return (
    <div>
      <PageHeader
        back={<Link href="/cash" className="mb-2 inline-flex items-center gap-1 text-[13px] text-muted hover:text-brand"><ArrowRight className="h-3.5 w-3.5" /> الصناديق والبنوك</Link>}
        title={c.name}
        subtitle={<>{CASH_KIND_LABEL[c.kind]}{c.bank_name ? ` · ${c.bank_name}` : ""}{c.iban ? <> · <span className="num">{c.iban}</span></> : ""}</>}
        actions={canWrite && c.is_active && <>
          <Link href={`/vouchers/new?type=income&cash=${c.id}`} className="btn-ghost"><ArrowDownLeft className="h-4 w-4" /> إيداع</Link>
          <Link href={`/vouchers/new?type=expense&cash=${c.id}`} className="btn-ghost"><ArrowUpRight className="h-4 w-4" /> صرف</Link>
          <Link href={`/vouchers/new?type=transfer&cash=${c.id}`} className="btn-ghost"><ArrowLeftRight className="h-4 w-4" /> تحويل</Link>
        </>}
      />
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-[13px] text-muted">{c.kind === "card" ? "المستحق على البطاقة الآن" : "الرصيد الآن"}</div>
          <Money v={bal} cur={c.currency} signed className={`font-display text-[30px] font-bold ${bal < 0 && c.kind !== "card" ? "text-loss" : ""}`} />
        </div>
        <PeriodBar from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />
      </div>
      <Statement accountId={c.account_id} from={from} to={to} fcCurrency={c.currency} fileName={`كشف ${c.name}`} />
    </div>
  );
}
