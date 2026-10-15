"use client";

import { useMemo } from "react";
import { useBook } from "@/lib/book";
import { supabase } from "@/lib/supabase/client";
import { CASH_KIND_LABEL, cur, errorText, money } from "@/lib/format";
import type { Account, AccountType, Party } from "@/lib/types";
import { SearchSelect, useToast, type Option } from "@/components/ui";

/** شجرة الحسابات مرتبة مع العمق */
export function accountTree(accounts: Account[]): (Account & { depth: number; hasChildren: boolean })[] {
  const by: Record<string, Account[]> = {};
  const ids = new Set(accounts.map((a) => a.id));
  accounts.forEach((a) => { const k = a.parent_id && ids.has(a.parent_id) ? a.parent_id : "root"; (by[k] ||= []).push(a); });
  Object.values(by).forEach((l) => l.sort((a, b) => a.code.localeCompare(b.code)));
  const out: (Account & { depth: number; hasChildren: boolean })[] = [];
  const walk = (k: string, d: number) => (by[k] || []).forEach((a) => { out.push({ ...a, depth: d, hasChildren: !!by[a.id]?.length }); walk(a.id, d + 1); });
  walk("root", 0);
  return out;
}

export function AccountSelect({ value, onChange, types, scope, excludeCash, includeGroups, placeholder, id, allowClear, className }: {
  value: string; onChange: (v: string) => void; types?: AccountType[]; scope?: "personal" | "business";
  excludeCash?: boolean; includeGroups?: boolean; placeholder?: string; id?: string; allowClear?: boolean; className?: string;
}) {
  const { accounts, cash } = useBook();
  const options = useMemo<Option[]>(() => {
    const cashIds = new Set(cash.map((c) => c.account_id));
    const tree = accountTree(accounts.filter((a) => a.is_active || a.id === value));
    const keep = new Set<string>();
    // نُبقي الحساب التفصيلي المطابق وكل آبائه كعناوين
    const byId = Object.fromEntries(tree.map((a) => [a.id, a]));
    tree.forEach((a) => {
      if (types && !types.includes(a.type)) return;
      if (scope && a.scope !== scope && a.scope !== "both" && !a.hasChildren) return;
      if (excludeCash && cashIds.has(a.id)) return;
      if (!includeGroups && !a.is_postable) return;
      keep.add(a.id);
      let p = a.parent_id;
      while (p && byId[p]) { keep.add(p); p = byId[p].parent_id; }
    });
    return tree.filter((a) => keep.has(a.id)).map((a) => ({
      value: a.id,
      label: `${a.code} — ${a.name}`,
      search: a.code,
      depth: a.depth,
      disabled: !includeGroups && !a.is_postable,
    }));
  }, [accounts, cash, types, scope, excludeCash, includeGroups, value]);
  return <SearchSelect id={id} options={options} value={value} onChange={onChange} placeholder={placeholder || "ابحث بالاسم أو الرقم…"} allowClear={allowClear} className={className} />;
}

export function CashSelect({ value, onChange, exclude, id, placeholder, currency }: { value: string; onChange: (v: string) => void; exclude?: string; id?: string; placeholder?: string; currency?: string }) {
  const { cash, privacy } = useBook();
  const options = cash
    .filter((c) => (c.is_active || c.id === value) && c.id !== exclude && (!currency || c.currency === currency))
    .map((c) => ({ value: c.id, label: c.name, hint: `${CASH_KIND_LABEL[c.kind]} · ${privacy ? "••••" : money(c.balance_fc)} ${cur(c.currency)}` }));
  return <SearchSelect id={id} options={options} value={value} onChange={onChange} placeholder={placeholder || "اختر الصندوق أو البنك…"} />;
}

export function PartySelect({ value, onChange, id, placeholder, allowClear = true, kind }: { value: string; onChange: (v: string) => void; id?: string; placeholder?: string; allowClear?: boolean; kind?: Party["kind"] }) {
  const { parties, book, refresh, canWrite } = useBook();
  const toast = useToast();
  const options = parties
    .filter((p) => p.is_active || p.id === value)
    .map((p) => ({ value: p.id, label: p.name, hint: p.relation || undefined, search: p.phone || "" }));
  async function create(name: string) {
    if (!book) return;
    const { data, error } = await supabase().from("parties").insert({ book_id: book.id, name, kind: kind || "person" }).select().single();
    if (error) return toast(errorText(error), "error");
    await refresh(["parties"]);
    onChange((data as Party).id);
    toast(`أُضيف «${name}»`);
  }
  return <SearchSelect id={id} options={options} value={value} onChange={onChange} placeholder={placeholder || "ابحث عن شخص أو جهة…"} allowClear={allowClear}
    onCreate={canWrite ? create : undefined} createLabel="إضافة جديد:" />;
}

export function CostCenterSelect({ value, onChange, id }: { value: string; onChange: (v: string) => void; id?: string }) {
  const { costCenters } = useBook();
  return (
    <select id={id} className="field" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">— بدون —</option>
      {costCenters.filter((c) => c.is_active || c.id === value).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
    </select>
  );
}

export function CurrencySelect({ value, onChange, id }: { value: string; onChange: (v: string) => void; id?: string }) {
  const { currencies } = useBook();
  return (
    <select id={id} className="field" value={value} onChange={(e) => onChange(e.target.value)}>
      {currencies.filter((c) => c.is_active || c.code === value).map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
    </select>
  );
}

/** مركز التكلفة المقترح حسب نطاق الحساب */
export function suggestCostCenter(account: Account | undefined, costCenters: { id: string; kind: string }[]): string {
  if (!account) return "";
  if (account.scope === "personal") return costCenters.find((c) => c.kind === "personal")?.id || "";
  if (account.scope === "business") return costCenters.find((c) => c.kind === "business")?.id || "";
  return "";
}
