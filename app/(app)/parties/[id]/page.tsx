"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowRight, Pencil, MessageCircle, Banknote, Landmark, HandCoins, Phone } from "lucide-react";
import { useBook } from "@/lib/book";
import { supabase } from "@/lib/supabase/client";
import { DEBT_STATUS_LABEL, PARTY_KIND_LABEL, cur, dateLong, errorText, money, n, todayISO } from "@/lib/format";
import { whatsappLink } from "@/lib/vouchers";
import Statement, { PeriodBar } from "@/components/Statement";
import PartyForm, { type PartyDraft } from "@/components/PartyForm";
import { Chip, ErrorBox, Loading, Money, PageHeader } from "@/components/ui";
import type { Debt, PartyBalance } from "@/lib/types";

export default function PartyDetail() {
  const { id } = useParams<{ id: string }>();
  const { book, partyById, canWrite } = useBook();
  const p = partyById[id];
  const [bal, setBal] = useState<PartyBalance | null>(null);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [form, setForm] = useState<PartyDraft | null>(null);

  const load = useCallback(async () => {
    const sb = supabase();
    const [b, d] = await Promise.all([
      sb.from("v_party_balances").select("*").eq("party_id", id).single(),
      sb.from("v_debts").select("*").eq("party_id", id).order("start_date", { ascending: false }),
    ]);
    if (b.error) return setError(errorText(b.error));
    setBal(b.data as PartyBalance);
    setDebts((d.data as Debt[]) || []);
  }, [id]);
  useEffect(() => { load(); }, [load]);

  if (error) return <ErrorBox error={error} />;
  if (!book || !p || !bal) return <Loading />;
  const net = n(bal.net);
  const waText = net > 0
    ? `السلام عليكم ${p.name}، أرجو أن تكون بخير. للتذكير فقط: الرصيد المستحق لدي حتى ${dateLong(todayISO())} هو ${money(net)} ${cur(book.base_currency)}. شاكر تعاونك.`
    : `السلام عليكم ${p.name}، كشف الرصيد بيننا حتى ${dateLong(todayISO())}: ${money(Math.abs(net))} ${cur(book.base_currency)} ${net < 0 ? "لصالحك" : ""}.`;

  return (
    <div>
      <PageHeader
        back={<Link href="/parties" className="mb-2 inline-flex items-center gap-1 text-[13px] text-muted hover:text-brand"><ArrowRight className="h-3.5 w-3.5" /> الأشخاص والجهات</Link>}
        title={p.name}
        subtitle={<span className="flex flex-wrap items-center gap-2">{PARTY_KIND_LABEL[p.kind]}{p.relation ? ` · ${p.relation}` : ""}{p.phone && <span className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" /><span className="num">{p.phone}</span></span>}</span>}
        actions={<>
          {canWrite && <button className="btn-quiet" onClick={() => setForm({ ...p })}><Pencil className="h-4 w-4" /> تعديل</button>}
          {p.phone && net !== 0 && <a className="btn-ghost" target="_blank" rel="noreferrer" href={whatsappLink(p.phone, waText)}><MessageCircle className="h-4 w-4" /> {net > 0 ? "تذكير" : "إرسال الرصيد"}</a>}
        </>}
      />

      <div className="mb-6 grid gap-4 lg:grid-cols-[1fr_1.4fr]">
        <div className="panel px-6 py-5">
          <div className="text-[13px] text-muted">الرصيد الصافي</div>
          <div className="mt-1 flex items-baseline gap-2">
            <Money v={Math.abs(net)} cur={book.base_currency} className={`font-display text-[30px] font-bold ${net > 0 ? "text-gain" : net < 0 ? "text-amber" : ""}`} />
          </div>
          <div className="mt-1 text-[14px] text-ink-soft">{net > 0 ? `لك عند ${p.name}` : net < 0 ? `عليك لـ ${p.name}` : "لا رصيد بينكما"}</div>
          {(n(bal.receivable) !== 0 && n(bal.payable) !== 0) && (
            <dl className="mt-4 space-y-1 border-t border-rule pt-3 text-[13.5px]">
              <div className="flex justify-between"><dt className="text-muted">له عليك (حسابات الخصوم)</dt><dd><Money v={bal.payable} /></dd></div>
              <div className="flex justify-between"><dt className="text-muted">لك عليه (حسابات الأصول)</dt><dd><Money v={bal.receivable} /></dd></div>
            </dl>
          )}
          {canWrite && (
            <div className="mt-5 flex flex-wrap gap-2">
              <Link href={`/vouchers/new?type=receipt&party=${p.id}`} className="btn-ghost !py-1.5"><Banknote className="h-4 w-4" /> قبض منه</Link>
              <Link href={`/vouchers/new?type=payment&party=${p.id}`} className="btn-ghost !py-1.5"><Landmark className="h-4 w-4" /> صرف له</Link>
              <Link href={`/debts/new?party=${p.id}`} className="btn-ghost !py-1.5"><HandCoins className="h-4 w-4" /> دين جديد</Link>
            </div>
          )}
        </div>
        <div className="panel overflow-hidden">
          <h2 className="border-b border-rule px-5 py-3 text-[15px] font-bold">الديون</h2>
          {debts.length === 0 ? <p className="px-5 py-8 text-center text-[14px] text-muted">لا ديون مسجلة مع {p.name}.</p> : (
            <table className="ledger">
              <tbody>
                {debts.map((d) => (
                  <tr key={d.id}>
                    <td><Link href={`/debts/${d.id}`} className="font-medium hover:text-brand">{d.title || (d.direction === "receivable" ? "دين لك" : "دين عليك")}</Link>
                      <div className="text-[12px] text-muted">{d.direction === "receivable" ? "لك عليه" : "عليك له"} · {dateLong(d.start_date)}</div></td>
                    <td><Chip tone={d.status === "active" ? (n(d.overdue_amount) > 0 ? "loss" : "amber") : d.status === "settled" ? "brand" : "neutral"}>{d.status === "active" && n(d.overdue_amount) > 0 ? "متأخر" : DEBT_STATUS_LABEL[d.status]}</Chip></td>
                    <td className="amt"><Money v={d.remaining} cur={d.currency} className="font-semibold" /><div className="text-[11.5px] text-muted">من <span className="num">{money(d.principal)}</span></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-[16px] font-bold">كشف الحساب</h2>
        <PeriodBar from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />
      </div>
      <Statement partyId={p.id} from={from} to={to} showAccount fileName={`كشف حساب ${p.name}`} />
      {p.notes && <p className="mt-4 text-[13.5px] text-ink-soft">ملاحظات: {p.notes}</p>}
      <PartyForm value={form} onClose={() => setForm(null)} />
    </div>
  );
}
