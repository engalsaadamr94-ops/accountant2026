"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { useBook } from "@/lib/book";
import { supabase } from "@/lib/supabase/client";
import { DOC_LABEL, errorText } from "@/lib/format";
import { EmptyState, Loading, useToast } from "@/components/ui";
import type { Template } from "@/lib/types";

export default function TemplatesPanel() {
  const { book, canWrite } = useBook();
  const toast = useToast();
  const [list, setList] = useState<Template[] | null>(null);
  const load = useCallback(async () => {
    if (!book) return;
    const { data } = await supabase().from("entry_templates").select("*").eq("book_id", book.id).order("sort_order").order("created_at");
    setList((data as Template[]) || []);
  }, [book]);
  useEffect(() => { load(); }, [load]);
  async function del(id: string) {
    const { error } = await supabase().from("entry_templates").delete().eq("id", id);
    if (error) return toast(errorText(error), "error");
    toast("حُذف القالب");
    load();
  }
  if (!list) return <Loading />;
  return (
    <section className="panel overflow-hidden">
      <h2 className="border-b border-rule px-5 py-3 text-[16px] font-bold">قوالب العمليات</h2>
      {list.length === 0 ? <EmptyState title="لا قوالب بعد" text="عند تسجيل عملية متكررة (إيجار، راتب، تحويل للأهل) اضغط «قالب» لحفظها، فتظهر في «عملية جديدة» لتسجيلها بنقرة." /> : (
        <table className="ledger">
          <tbody>
            {list.map((t) => (
              <tr key={t.id}>
                <td><Link href={`/vouchers/new?template=${t.id}`} className="font-medium hover:text-brand">{t.name}</Link><div className="text-[12px] text-muted">{DOC_LABEL[t.doc_type] || t.doc_type}</div></td>
                <td className="w-10">{canWrite && <button className="btn-quiet !px-2" aria-label={`حذف ${t.name}`} onClick={() => del(t.id)}><Trash2 className="h-4 w-4" /></button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
