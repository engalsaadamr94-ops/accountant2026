"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, FileSpreadsheet, Search } from "lucide-react";
import { useBook } from "@/lib/book";
import { supabase } from "@/lib/supabase/client";
import { fetchAll } from "@/lib/api";
import { exportExcel } from "@/lib/export";
import { DOC_LABEL, dateLong, errorText, n } from "@/lib/format";
import { PartySelect } from "@/components/pickers";
import { Chip, EmptyState, ErrorBox, Loading, Money, PageHeader } from "@/components/ui";
import type { DocType, Entry } from "@/lib/types";

const PAGE = 50;
type Row = Entry & { parties: { name: string } | null };

function VouchersList() {
  const router = useRouter();
  const params = useSearchParams();
  const { book, canWrite } = useBook();
  const [type, setType] = useState(params.get("type") || "");
  const [status, setStatus] = useState(params.get("status") || "");
  const [from, setFrom] = useState(params.get("from") || "");
  const [to, setTo] = useState(params.get("to") || "");
  const [q, setQ] = useState(params.get("q") || "");
  const [party, setParty] = useState(params.get("party") || "");
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [count, setCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const query = useCallback(() => {
    let x = supabase().from("journal_entries").select("*, parties(name)", { count: "exact" }).eq("book_id", book!.id);
    if (type) x = x.eq("doc_type", type);
    if (status) x = x.eq("status", status);
    if (from) x = x.gte("entry_date", from);
    if (to) x = x.lte("entry_date", to);
    if (party) x = x.eq("party_id", party);
    if (q.trim()) {
      const s = q.trim().replace(/[%,()]/g, " ");
      x = x.or(`memo.ilike.%${s}%,number_text.ilike.%${s}%,reference.ilike.%${s}%`);
    }
    return x.order("entry_date", { ascending: false }).order("created_at", { ascending: false });
  }, [book, type, status, from, to, party, q]);

  const load = useCallback(async () => {
    if (!book) return;
    setError(null);
    const { data, error, count } = await query().range(page * PAGE, page * PAGE + PAGE - 1);
    if (error) return setError(errorText(error));
    setRows(data as Row[]);
    setCount(count || 0);
  }, [book, query, page]);

  useEffect(() => {
    const t = setTimeout(load, q ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, q]);
  useEffect(() => {
    setPage(0);
    const sp = new URLSearchParams();
    Object.entries({ type, status, from, to, q, party }).forEach(([k, v]) => v && sp.set(k, v));
    router.replace(`/vouchers${sp.toString() ? `?${sp}` : ""}`, { scroll: false });
  }, [type, status, from, to, q, party, router]);

  async function doExport() {
    const all = await fetchAll<Row>((a, b) => query().range(a, b));
    await exportExcel("السندات", "السندات", all.map((r) => ({
      "الرقم": r.number_text || "مسودة", "التاريخ": r.entry_date, "النوع": DOC_LABEL[r.doc_type], "البيان": r.memo || "",
      "الطرف": r.parties?.name || "", "المرجع": r.reference || "", "المبلغ": n(r.total),
      "الحالة": r.status === "draft" ? "مسودة" : r.status === "reversed" ? "معكوس" : "مرحّل",
    })));
  }

  const filtered = !!(type || status || from || to || q || party);

  return (
    <div>
      <PageHeader title="السندات والقيود" subtitle={rows ? `${count.toLocaleString("en-US")} سند${filtered ? " مطابق" : ""}` : undefined}
        actions={<>
          <button className="btn-ghost" onClick={doExport} disabled={!count}><FileSpreadsheet className="h-4 w-4" /> Excel</button>
          {canWrite && <Link href="/vouchers/new" className="btn-primary"><Plus className="h-4 w-4" /> سند جديد</Link>}
        </>} />

      <div className="panel mb-4 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-6">
        <div className="relative lg:col-span-2">
          <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input className="field pr-9" placeholder="بحث في البيان أو الرقم أو المرجع" value={q} onChange={(e) => setQ(e.target.value)} aria-label="بحث" />
        </div>
        <select className="field" value={type} onChange={(e) => setType(e.target.value)} aria-label="النوع">
          <option value="">كل الأنواع</option>
          {(Object.keys(DOC_LABEL) as DocType[]).map((k) => <option key={k} value={k}>{DOC_LABEL[k]}</option>)}
        </select>
        <select className="field" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="الحالة">
          <option value="">كل الحالات</option><option value="posted">مرحّل</option><option value="draft">مسودة</option><option value="reversed">معكوس</option>
        </select>
        <input type="date" className="field" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="من تاريخ" title="من تاريخ" />
        <input type="date" className="field" value={to} onChange={(e) => setTo(e.target.value)} aria-label="إلى تاريخ" title="إلى تاريخ" />
        <div className="sm:col-span-2 lg:col-span-3"><PartySelect value={party} onChange={setParty} placeholder="كل الأشخاص والجهات" /></div>
        {filtered && <button className="btn-quiet justify-self-start" onClick={() => { setType(""); setStatus(""); setFrom(""); setTo(""); setQ(""); setParty(""); }}>مسح عوامل التصفية</button>}
      </div>

      {error && <ErrorBox error={error} onRetry={load} />}
      {!rows && !error && <Loading />}
      {rows && rows.length === 0 && (
        <div className="panel"><EmptyState title={filtered ? "لا سندات مطابقة" : "لا سندات بعد"} text={filtered ? "جرّب توسيع الفترة أو مسح عوامل التصفية." : "كل عملية تسجلها تظهر هنا بقيدها المحاسبي ورقمها التسلسلي."}
          action={canWrite && !filtered ? <Link href="/vouchers/new" className="btn-primary"><Plus className="h-4 w-4" /> أول سند</Link> : undefined} /></div>
      )}
      {rows && rows.length > 0 && (
        <div className="panel overflow-x-auto">
          <table className="ledger min-w-[680px]">
            <thead><tr><th>الرقم</th><th>التاريخ</th><th>البيان</th><th>الطرف</th><th className="amt">المبلغ</th><th>الحالة</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="cursor-pointer" onClick={() => router.push(`/vouchers/${r.id}`)}>
                  <td className="whitespace-nowrap"><Link href={`/vouchers/${r.id}`} className="num font-medium text-brand" onClick={(e) => e.stopPropagation()}>{r.number_text || "—"}</Link></td>
                  <td className="whitespace-nowrap text-ink-soft">{dateLong(r.entry_date)}</td>
                  <td><div>{r.memo || DOC_LABEL[r.doc_type]}</div><div className="text-[12px] text-muted">{DOC_LABEL[r.doc_type]}</div></td>
                  <td className="text-ink-soft">{r.parties?.name || ""}</td>
                  <td className="amt"><Money v={r.total} className={r.status === "reversed" ? "text-muted line-through" : "font-medium"} /></td>
                  <td>{r.status === "draft" ? <Chip tone="amber">مسودة</Chip> : r.status === "reversed" ? <Chip tone="loss">معكوس</Chip> : r.doc_type === "reversal" ? <Chip>عكسي</Chip> : <Chip tone="brand">مرحّل</Chip>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {count > PAGE && (
            <div className="flex items-center justify-between border-t border-rule px-4 py-3 text-[13.5px]">
              <span className="text-muted">{page * PAGE + 1}–{Math.min(count, page * PAGE + PAGE)} من {count}</span>
              <div className="flex gap-2">
                <button className="btn-ghost !py-1.5" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>السابق</button>
                <button className="btn-ghost !py-1.5" disabled={(page + 1) * PAGE >= count} onClick={() => setPage((p) => p + 1)}>التالي</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function VouchersPage() {
  return <Suspense fallback={<Loading />}><VouchersList /></Suspense>;
}
