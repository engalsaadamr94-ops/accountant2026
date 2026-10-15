"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useBook } from "@/lib/book";
import { AccountSelect, CostCenterSelect, PartySelect } from "@/components/pickers";
import Statement, { PeriodBar, yearStart } from "@/components/Statement";
import { PrintHeader, periodText } from "@/components/ReportKit";
import { EmptyState, Field, Loading, PageHeader } from "@/components/ui";

function StatementReport() {
  const router = useRouter();
  const params = useSearchParams();
  const { accountById, partyById, costCenters } = useBook();
  const [account, setAccount] = useState(params.get("account") || "");
  const [party, setParty] = useState(params.get("party") || "");
  const [cc, setCc] = useState(params.get("cc") || "");
  const [from, setFrom] = useState(params.has("from") ? params.get("from") || "" : yearStart());
  const [to, setTo] = useState(params.get("to") || "");
  const [children, setChildren] = useState(params.get("children") !== "0");

  useEffect(() => {
    const sp = new URLSearchParams();
    if (account) sp.set("account", account);
    if (party) sp.set("party", party);
    if (cc) sp.set("cc", cc);
    sp.set("from", from);
    if (to) sp.set("to", to);
    if (!children) sp.set("children", "0");
    router.replace(`/reports/statement?${sp}`, { scroll: false });
  }, [account, party, cc, from, to, children, router]);

  const acc = account ? accountById[account] : undefined;
  const subject = [acc && `${acc.code} ${acc.name}`, party && partyById[party]?.name, cc && costCenters.find((c) => c.id === cc)?.name].filter(Boolean).join(" · ");
  const any = account || party || cc;

  return (
    <div>
      <PageHeader title="كشف حساب" subtitle="اختر حساباً أو شخصاً أو مركز تكلفة، أو أكثر من واحد معاً." />
      <div className="panel mb-5 grid gap-4 p-4 no-print sm:grid-cols-3">
        <Field label="الحساب" htmlFor="s-acc">
          <AccountSelect id="s-acc" value={account} onChange={setAccount} includeGroups allowClear placeholder="كل الحسابات" />
          {acc && !acc.is_postable && <label className="mt-1.5 flex items-center gap-2 text-[13px]"><input type="checkbox" checked={children} onChange={(e) => setChildren(e.target.checked)} /> شامل الحسابات الفرعية</label>}
        </Field>
        <Field label="الشخص أو الجهة" htmlFor="s-party"><PartySelect id="s-party" value={party} onChange={setParty} placeholder="الكل" /></Field>
        <Field label="مركز التكلفة" htmlFor="s-cc"><CostCenterSelect id="s-cc" value={cc} onChange={setCc} /></Field>
        <div className="sm:col-span-3"><PeriodBar from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} /></div>
      </div>
      {!any ? (
        <div className="panel"><EmptyState title="اختر ما تريد كشفه" text="مثلاً: حساب البنك، أو عميل، أو مشروع، لعرض حركته برصيد جارٍ." /></div>
      ) : (
        <>
          <PrintHeader title={`كشف حساب: ${subject}`} period={periodText(from, to)} />
          <Statement accountId={account || null} partyId={party || null} costCenterId={cc || null} from={from} to={to}
            includeChildren={children} showAccount={!account || (acc && !acc.is_postable)} fileName={`كشف ${subject}`} />
        </>
      )}
    </div>
  );
}

export default function StatementReportPage() {
  return <Suspense fallback={<Loading />}><StatementReport /></Suspense>;
}
