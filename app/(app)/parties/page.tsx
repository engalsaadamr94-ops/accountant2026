"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Search, FileSpreadsheet, Phone } from "lucide-react";
import { useBook } from "@/lib/book";
import { supabase } from "@/lib/supabase/client";
import { exportExcel } from "@/lib/export";
import { PARTY_KIND_LABEL, add, dateLong, errorText, n } from "@/lib/format";
import PartyForm, { type PartyDraft } from "@/components/PartyForm";
import { EmptyState, ErrorBox, Loading, Money, PageHeader, Tabs, normalizeArabic } from "@/components/ui";
import type { PartyBalance } from "@/lib/types";

type Filter = "all" | "owes_me" | "i_owe" | "customer" | "supplier" | "person";

export default function PartiesPage() {
  const { book, canWrite, parties } = useBook();
  const [rows, setRows] = useState<PartyBalance[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [form, setForm] = useState<PartyDraft | null>(null);

  const load = useCallback(async () => {
    if (!book) return;
    const { data, error } = await supabase().from("v_party_balances").select("*").eq("book_id", book.id).order("name");
    if (error) return setError(errorText(error));
    setRows(data as PartyBalance[]);
  }, [book]);
  useEffect(() => { load(); }, [load, parties.length]);

  const list = useMemo(() => {
    if (!rows) return [];
    const s = normalizeArabic(q);
    return rows.filter((r) => {
      if (s && !normalizeArabic(`${r.name} ${r.phone || ""} ${r.relation || ""}`).includes(s)) return false;
      if (filter === "owes_me") return n(r.net) > 0;
      if (filter === "i_owe") return n(r.net) < 0;
      if (filter === "customer") return r.kind === "customer" || r.kind === "both";
      if (filter === "supplier") return r.kind === "supplier" || r.kind === "both";
      if (filter === "person") return r.kind === "person";
      return r.is_active || n(r.net) !== 0;
    });
  }, [rows, q, filter]);

  if (error) return <ErrorBox error={error} onRetry={load} />;
  if (!rows || !book) return <Loading />;
  const owed = add(...rows.filter((r) => n(r.net) > 0).map((r) => r.net));
  const owe = add(...rows.filter((r) => n(r.net) < 0).map((r) => -n(r.net)));

  return (
    <div>
      <PageHeader title="الأشخاص والجهات" subtitle="العملاء والموردون والأقارب والأصدقاء، مع رصيد صافٍ واحد لكل منهم."
        actions={<>
          <button className="btn-ghost" disabled={!rows.length} onClick={() => exportExcel("الأشخاص والجهات", "الأرصدة", rows.map((r) => ({ "الاسم": r.name, "الصفة": PARTY_KIND_LABEL[r.kind], "الجوال": r.phone || "", "له عندي/عليه لي": n(r.net), "الحالة": n(r.net) > 0 ? "لي عنده" : n(r.net) < 0 ? "عليّ له" : "متوازن" })))}><FileSpreadsheet className="h-4 w-4" /> Excel</button>
          {canWrite && <button className="btn-primary" onClick={() => setForm({ name: "", kind: "person" })}><Plus className="h-4 w-4" /> إضافة</button>}
        </>} />

      <div className="mb-5 grid gap-4 sm:grid-cols-2">
        <button className="panel px-5 py-4 text-start hover:border-brand" onClick={() => setFilter("owes_me")}>
          <div className="text-[13px] text-muted">لك عند الناس</div>
          <Money v={owed} cur={book.base_currency} className="mt-1 font-display text-[24px] font-bold text-gain" />
        </button>
        <button className="panel px-5 py-4 text-start hover:border-brand" onClick={() => setFilter("i_owe")}>
          <div className="text-[13px] text-muted">عليك للناس</div>
          <Money v={owe} cur={book.base_currency} className="mt-1 font-display text-[24px] font-bold text-amber" />
        </button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input className="field pr-9" placeholder="ابحث بالاسم أو الجوال" value={q} onChange={(e) => setQ(e.target.value)} aria-label="بحث" />
        </div>
        <Tabs value={filter} onChange={setFilter} className="flex-wrap" items={[
          { value: "all", label: "الكل" }, { value: "owes_me", label: "لي عندهم" }, { value: "i_owe", label: "عليّ لهم" },
          { value: "person", label: "أشخاص" }, { value: "customer", label: "عملاء" }, { value: "supplier", label: "موردون" },
        ]} />
      </div>

      {list.length === 0 ? (
        <div className="panel"><EmptyState title={rows.length ? "لا نتائج مطابقة" : "لم تضف أحداً بعد"} text={rows.length ? undefined : "أضف من تتعامل معهم مالياً: عميل، مورد، قريب أقرضته، صديق اقترضت منه."}
          action={canWrite && !rows.length ? <button className="btn-primary" onClick={() => setForm({ name: "", kind: "person" })}><Plus className="h-4 w-4" /> إضافة أول شخص</button> : undefined} /></div>
      ) : (
        <div className="panel overflow-x-auto">
          <table className="ledger min-w-[560px]">
            <thead><tr><th>الاسم</th><th>الصفة</th><th>آخر حركة</th><th className="amt">الرصيد</th></tr></thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.party_id} className={r.is_active ? "" : "opacity-50"}>
                  <td>
                    <Link href={`/parties/${r.party_id}`} className="font-medium hover:text-brand">{r.name}</Link>
                    {r.phone && <div className="flex items-center gap-1 text-[12px] text-muted"><Phone className="h-3 w-3" /><span className="num">{r.phone}</span></div>}
                  </td>
                  <td className="text-ink-soft">{PARTY_KIND_LABEL[r.kind]}{r.relation ? ` · ${r.relation}` : ""}</td>
                  <td className="text-ink-soft">{r.last_date ? dateLong(r.last_date) : "—"}</td>
                  <td className="amt">
                    {n(r.net) === 0 ? <span className="text-muted">—</span> : <>
                      <Money v={Math.abs(n(r.net))} className="font-semibold" />
                      <div className={`text-[11.5px] ${n(r.net) > 0 ? "text-gain" : "text-amber"}`}>{n(r.net) > 0 ? "لك عنده" : "عليك له"}</div>
                    </>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <PartyForm value={form} onClose={() => setForm(null)} onSaved={() => load()} />
    </div>
  );
}
