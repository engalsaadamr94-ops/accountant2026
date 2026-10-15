"use client";

import { useCallback, useEffect, useState } from "react";
import { UserPlus, Trash2 } from "lucide-react";
import { useBook } from "@/lib/book";
import { supabase } from "@/lib/supabase/client";
import { rpc } from "@/lib/api";
import { ROLE_LABEL, dateLong, errorText } from "@/lib/format";
import { ErrorBox, Field, Loading, Spinner, useConfirm, useToast } from "@/components/ui";
import type { Role } from "@/lib/types";

type Member = { user_id: string; email: string; full_name: string | null; role: Role; created_at: string };
const ROLE_TEXT: Record<Role, string> = {
  owner: "تحكم كامل، ومنح الملكية، وحذف الدفتر.",
  admin: "كل شيء عدا حذف الدفتر: الإعدادات، المستخدمون، الإقفال، التدقيق، النسخ الاحتياطي.",
  accountant: "تسجيل السندات وترحيلها وعكسها، وإدارة الحسابات والأشخاص.",
  viewer: "الاطلاع على الأرقام والتقارير فقط.",
};

export default function MembersPanel() {
  const { book, canAdmin, user, role } = useBook();
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const [list, setList] = useState<Member[] | null>(null);
  const [email, setEmail] = useState("");
  const [newRole, setNewRole] = useState<Role>("accountant");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!book) return;
    setList(await rpc<Member[]>("list_members", { p_book: book.id }).catch((e) => { setError(e.message); return []; }));
  }, [book]);
  useEffect(() => { load(); }, [load]);

  async function add() {
    if (!book || !email.trim()) return;
    setBusy(true);
    setError(null);
    try { await rpc("add_member", { p_book: book.id, p_email: email.trim(), p_role: newRole }); setEmail(""); toast("أُضيف المستخدم"); load(); }
    catch (e) { setError((e as Error).message); }
    setBusy(false);
  }
  async function changeRole(m: Member, r: Role) {
    const { error } = await supabase().from("book_members").update({ role: r }).eq("book_id", book!.id).eq("user_id", m.user_id);
    if (error) return toast(errorText(error), "error");
    toast("تغيّرت الصلاحية");
    load();
  }
  async function remove(m: Member) {
    if (!(await confirm("إزالة مستخدم", `سيفقد ${m.email} الوصول إلى هذا الدفتر. بياناته وقيوده تبقى كما هي.`, { danger: true, ok: "إزالة" }))) return;
    const { error } = await supabase().from("book_members").delete().eq("book_id", book!.id).eq("user_id", m.user_id);
    if (error) return toast(errorText(error), "error");
    toast("أُزيل المستخدم");
    load();
  }

  if (!list) return <Loading />;
  return (
    <div className="space-y-6">
      {canAdmin && (
        <section className="panel space-y-4 p-5">
          <h2 className="text-[16px] font-bold">إضافة مستخدم</h2>
          <p className="text-[13.5px] text-muted">يجب أن ينشئ الشخص حساباً في البرنامج أولاً بنفس البريد، ثم تضيفه هنا. مثلاً محاسبك أو شريكك.</p>
          {error && <ErrorBox error={error} />}
          <div className="grid gap-3 sm:grid-cols-[1fr_180px_auto] sm:items-end">
            <Field label="البريد الإلكتروني" htmlFor="m-email"><input id="m-email" dir="ltr" type="email" className="field text-left" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
            <Field label="الصلاحية" htmlFor="m-role">
              <select id="m-role" className="field" value={newRole} onChange={(e) => setNewRole(e.target.value as Role)}>
                {(["admin", "accountant", "viewer"] as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
              </select>
            </Field>
            <button className="btn-primary" disabled={busy || !email.trim()} onClick={add}>{busy ? <Spinner /> : <UserPlus className="h-4 w-4" />} إضافة</button>
          </div>
          <p className="text-[12.5px] text-muted">{ROLE_LABEL[newRole]}: {ROLE_TEXT[newRole]}</p>
        </section>
      )}
      <section className="panel overflow-x-auto">
        <table className="ledger min-w-[560px]">
          <thead><tr><th>المستخدم</th><th>الصلاحية</th><th>منذ</th><th className="w-10" /></tr></thead>
          <tbody>
            {list.map((m) => {
              const self = m.user_id === user?.id;
              const editable = canAdmin && !self && (m.role !== "owner" || role === "owner");
              return (
                <tr key={m.user_id}>
                  <td>{m.full_name || "—"}{self && <span className="ms-1 text-[12px] text-muted">(أنت)</span>}<div className="text-[12.5px] text-muted" dir="ltr">{m.email}</div></td>
                  <td>
                    {editable ? (
                      <select className="field !w-auto !py-1" value={m.role} onChange={(e) => changeRole(m, e.target.value as Role)} aria-label={`صلاحية ${m.email}`}>
                        {(role === "owner" ? ["owner", "admin", "accountant", "viewer"] : ["admin", "accountant", "viewer"]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r as Role]}</option>)}
                      </select>
                    ) : ROLE_LABEL[m.role]}
                  </td>
                  <td className="text-ink-soft">{dateLong(m.created_at.slice(0, 10))}</td>
                  <td>{(editable || (self && m.role !== "owner")) && <button className="btn-quiet !px-2" aria-label="إزالة" onClick={() => remove(m)}><Trash2 className="h-4 w-4" /></button>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
      <section className="text-[13px] text-muted">
        <h3 className="mb-1 font-semibold text-ink-soft">الصلاحيات</h3>
        <ul className="space-y-1">{(Object.keys(ROLE_TEXT) as Role[]).map((r) => <li key={r}><b className="text-ink-soft">{ROLE_LABEL[r]}:</b> {ROLE_TEXT[r]}</li>)}</ul>
      </section>
      {dialog}
    </div>
  );
}
