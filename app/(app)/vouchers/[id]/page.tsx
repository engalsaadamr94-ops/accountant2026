"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Printer, Copy, Undo2, Trash2, Send, ArrowRight, MessageCircle } from "lucide-react";
import { useBook } from "@/lib/book";
import { supabase } from "@/lib/supabase/client";
import { rpc } from "@/lib/api";
import { DOC_LABEL, cur, dateLong, errorText, hijri, money, n, todayISO } from "@/lib/format";
import { tafqit } from "@/lib/tafqit";
import { whatsappLink } from "@/lib/vouchers";
import { Chip, ErrorBox, Field, Loading, Modal, Money, Spinner, useConfirm, useToast } from "@/components/ui";
import type { Entry, Line, Party } from "@/lib/types";

export default function VoucherView() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const { book, accountById, costCenters, cash, canWrite, refresh } = useBook();
  const [e, setE] = useState<Entry | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [party, setParty] = useState<Party | null>(null);
  const [related, setRelated] = useState<Entry | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revOpen, setRevOpen] = useState(false);
  const [revDate, setRevDate] = useState(todayISO());
  const [revReason, setRevReason] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const sb = supabase();
    const { data, error } = await sb.from("journal_entries").select("*").eq("id", id).single();
    if (error) return setError(errorText(error));
    const entry = data as Entry;
    setE(entry);
    const [{ data: ls }, p, r] = await Promise.all([
      sb.from("journal_lines").select("*").eq("entry_id", id).order("line_no"),
      entry.party_id ? sb.from("parties").select("*").eq("id", entry.party_id).single() : Promise.resolve({ data: null }),
      entry.reverses_id || entry.reversed_by_id ? sb.from("journal_entries").select("*").eq("id", (entry.reverses_id || entry.reversed_by_id)!).single() : Promise.resolve({ data: null }),
    ]);
    setLines((ls as Line[]) || []);
    setParty(p.data as Party | null);
    setRelated(r.data as Entry | null);
  }, [id]);
  useEffect(() => { load(); }, [load]);

  if (error) return <ErrorBox error={error} />;
  if (!e || !book) return <Loading />;

  const cashAcc = cash.find((c) => c.id === e.cash_account_id);
  const foreign = lines.some((l) => l.currency !== book.base_currency);
  const totalDr = lines.reduce((s, l) => s + n(l.debit), 0);
  const totalCr = lines.reduce((s, l) => s + n(l.credit), 0);
  // مبلغ السند بعملة الصندوق (للسندات النقدية)
  const cashLines = cashAcc ? lines.filter((l) => l.account_id === cashAcc.account_id) : [];
  const voucherAmount = cashLines.length ? cashLines.reduce((s, l) => s + n(l.debit_fc) + n(l.credit_fc), 0) : n(e.total);
  const voucherCur = cashAcc?.currency || book.base_currency;
  const ccName = (cid: string | null) => costCenters.find((c) => c.id === cid)?.name;
  const title = e.doc_type === "receipt" || e.doc_type === "income" ? "سند قبض" : e.doc_type === "payment" || e.doc_type === "expense" ? "سند صرف" : DOC_LABEL[e.doc_type];

  async function reverse() {
    if (!e) return;
    setBusy(true);
    try {
      const r = await rpc<Entry>("reverse_entry", { p_id: e.id, p_date: revDate, p_reason: revReason || null });
      await refresh(["cash"]);
      toast(`عُكس القيد بالقيد ${r.number_text}`);
      setRevOpen(false);
      load();
    } catch (err) { toast((err as Error).message, "error"); }
    setBusy(false);
  }
  async function post() {
    if (!e) return;
    setBusy(true);
    try { await rpc("post_entry", { p_id: e.id }); await refresh(["cash"]); toast("رُحِّل القيد"); load(); }
    catch (err) { toast((err as Error).message, "error"); }
    setBusy(false);
  }
  async function del() {
    if (!e || !(await confirm("حذف المسودة", "ستُحذف المسودة نهائياً. القيود المرحّلة لا تُحذف بل تُعكس.", { danger: true, ok: "حذف" }))) return;
    try { await rpc("delete_draft", { p_id: e.id }); toast("حُذفت المسودة"); router.replace("/vouchers"); }
    catch (err) { toast((err as Error).message, "error"); }
  }

  const waText = party ? `${title} رقم ${e.number_text || "—"} بتاريخ ${dateLong(e.entry_date)}: ${money(voucherAmount)} ${cur(voucherCur)}${e.memo ? ` — ${e.memo}` : ""}.` : "";

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 no-print">
        <Link href="/vouchers" className="inline-flex items-center gap-1 text-[13px] text-muted hover:text-brand"><ArrowRight className="h-3.5 w-3.5" /> السندات</Link>
        <div className="flex flex-wrap gap-2">
          {e.status === "draft" && canWrite && <>
            <button className="btn-danger" onClick={del}><Trash2 className="h-4 w-4" /> حذف</button>
            <button className="btn-primary" disabled={busy} onClick={post}>{busy ? <Spinner /> : <Send className="h-4 w-4" />} ترحيل</button>
          </>}
          {e.status === "posted" && e.doc_type !== "reversal" && canWrite && (
            <button className="btn-ghost" onClick={() => setRevOpen(true)}><Undo2 className="h-4 w-4" /> عكس القيد</button>
          )}
          {canWrite && <Link href={`/vouchers/new?copy=${e.id}`} className="btn-ghost"><Copy className="h-4 w-4" /> نسخ كسند جديد</Link>}
          {party?.phone && <a className="btn-ghost" target="_blank" rel="noreferrer" href={whatsappLink(party.phone, waText)}><MessageCircle className="h-4 w-4" /> إرسال</a>}
          <button className="btn-ghost" onClick={() => window.print()}><Printer className="h-4 w-4" /> طباعة</button>
        </div>
      </div>

      {e.status === "reversed" && related && (
        <div className="mb-4 rounded-field border border-amber/40 bg-amber-tint px-4 py-3 text-[14px] no-print">
          هذا القيد معكوس بالقيد <Link className="font-semibold underline" href={`/vouchers/${related.id}`}>{related.number_text}</Link> بتاريخ {dateLong(related.entry_date)}، وأثرهما معاً صفر.
        </div>
      )}
      {e.reverses_id && related && (
        <div className="mb-4 rounded-field border border-rule bg-brand-tint px-4 py-3 text-[14px] no-print">
          هذا قيد عكسي للقيد <Link className="font-semibold underline" href={`/vouchers/${related.id}`}>{related.number_text}</Link>.
        </div>
      )}

      <article className="panel print-sheet p-6 sm:p-10">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-ink/70 pb-5">
          <div>
            <div className="font-display text-[17px] font-bold">{book.name}</div>
            {book.owner_name && <div className="text-[13px] text-muted">{book.owner_name}{book.phone ? ` · ${book.phone}` : ""}</div>}
          </div>
          <div className="text-center">
            <h1 className="font-display text-[24px] font-bold">{title}</h1>
            <div className="mt-1 flex items-center justify-center gap-2">
              {e.status === "draft" ? <Chip tone="amber">مسودة غير مرحّلة</Chip> : e.status === "reversed" ? <Chip tone="loss">معكوس</Chip> : <Chip tone="brand">مرحّل</Chip>}
            </div>
          </div>
          <div className="text-[14px] text-start sm:text-end">
            <div>الرقم: <span className="num font-semibold">{e.number_text || "—"}</span></div>
            <div>التاريخ: {dateLong(e.entry_date)}</div>
            <div className="text-[12.5px] text-muted">{hijri(e.entry_date)}</div>
          </div>
        </header>

        {e.doc_type !== "journal" && e.doc_type !== "reversal" && (
          <section className="mt-6 grid gap-4 sm:grid-cols-[auto_1fr] sm:items-center">
            <div className="rounded-field border-2 border-ink/70 px-5 py-3 text-center">
              <div className="text-[12px] text-muted">المبلغ</div>
              <div className="num font-display text-[26px] font-bold">{money(voucherAmount)}</div>
              <div className="text-[12.5px]">{cur(voucherCur)}</div>
            </div>
            <div className="space-y-2 text-[15px]">
              <p className="font-medium">{tafqit(voucherAmount, voucherCur)}</p>
              {party && <p><span className="text-muted">{e.doc_type === "receipt" || e.doc_type === "income" ? "استلمنا من: " : "صُرف إلى: "}</span><Link href={`/parties/${party.id}`} className="font-semibold hover:text-brand">{party.name}</Link></p>}
              {cashAcc && <p><span className="text-muted">{e.doc_type === "receipt" || e.doc_type === "income" ? "أُودع في: " : "من: "}</span>{cashAcc.name}</p>}
            </div>
          </section>
        )}

        {(e.memo || e.reference) && (
          <section className="mt-5 grid gap-2 text-[14.5px] sm:grid-cols-2">
            {e.memo && <p><span className="text-muted">البيان: </span>{e.memo}</p>}
            {e.reference && <p><span className="text-muted">المرجع: </span>{e.reference}</p>}
          </section>
        )}

        <section className="mt-6 overflow-x-auto">
          <h2 className="mb-2 text-[13px] font-semibold text-ink-soft">القيد المحاسبي</h2>
          <table className="ledger">
            <thead>
              <tr>
                <th>الحساب</th><th>التفاصيل</th>
                {foreign && <th className="amt">بالعملة</th>}
                <th className="amt">مدين</th><th className="amt">دائن</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => {
                const a = accountById[l.account_id];
                return (
                  <tr key={l.id}>
                    <td><span className="num text-muted">{a?.code}</span> {a?.name}</td>
                    <td className="text-[13px] text-ink-soft">{[l.description, l.party_id === party?.id ? party?.name : null, ccName(l.cost_center_id)].filter(Boolean).join(" · ") || "—"}</td>
                    {foreign && <td className="amt text-[13px] text-muted">{l.currency !== book.base_currency ? <><span className="num">{money(n(l.debit_fc) || n(l.credit_fc))}</span> {cur(l.currency)} <span className="text-[11px]">@<span className="num">{Number(l.fx_rate).toFixed(4)}</span></span></> : ""}</td>}
                    <td className="amt">{n(l.debit) ? <Money v={l.debit} /> : ""}</td>
                    <td className="amt">{n(l.credit) ? <Money v={l.credit} /> : ""}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={foreign ? 3 : 2}>الإجمالي ({cur(book.base_currency)})</td>
                <td className="amt"><span className="total-rule inline-block px-1"><Money v={totalDr} /></span></td>
                <td className="amt"><span className="total-rule inline-block px-1"><Money v={totalCr} /></span></td>
              </tr>
            </tfoot>
          </table>
        </section>

        <footer className="mt-12 hidden grid-cols-3 gap-6 text-center text-[13px] print:grid">
          <div className="border-t border-ink/60 pt-2">المستلم</div>
          <div className="border-t border-ink/60 pt-2">المحاسب</div>
          <div className="border-t border-ink/60 pt-2">المعتمد</div>
        </footer>
        <p className="mt-6 text-[12px] text-muted no-print">
          أُنشئ {new Date(e.created_at).toLocaleString("en-GB")}{e.posted_at ? ` · رُحِّل ${new Date(e.posted_at).toLocaleString("en-GB")}` : ""}
        </p>
      </article>

      <Modal open={revOpen} onClose={() => setRevOpen(false)} title="عكس القيد"
        footer={<><button className="btn-ghost" onClick={() => setRevOpen(false)}>تراجع</button><button className="btn-primary" disabled={busy} onClick={reverse}>{busy && <Spinner />} عكس القيد</button></>}>
        <p className="mb-4 text-[14px] text-ink-soft">يُنشأ قيد معاكس بنفس المبالغ فيُلغي أثر هذا القيد، ويبقى الأصل محفوظاً في السجل. بعدها يمكنك نسخه وتصحيحه كسند جديد.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="تاريخ العكس" htmlFor="rd"><input id="rd" type="date" className="field" value={revDate} onChange={(x) => setRevDate(x.target.value)} /></Field>
          <Field label="السبب (اختياري)" htmlFor="rr"><input id="rr" className="field" value={revReason} onChange={(x) => setRevReason(x.target.value)} placeholder="خطأ في المبلغ" /></Field>
        </div>
      </Modal>
      {dialog}
    </div>
  );
}
