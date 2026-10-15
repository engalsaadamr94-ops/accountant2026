"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase/client";
import type { Account, Book, CashBalance, CostCenter, Currency, Party, Role } from "@/lib/types";

type BookWithRole = Book & { role: Role };

type Ctx = {
  user: User | null;
  loading: boolean;
  books: BookWithRole[];
  book: BookWithRole | null;
  role: Role | null;
  canWrite: boolean;
  canAdmin: boolean;
  switchBook: (id: string) => void;
  reloadBooks: () => Promise<void>;
  accounts: Account[];
  parties: Party[];
  cash: CashBalance[];
  costCenters: CostCenter[];
  currencies: Currency[];
  accountById: Record<string, Account>;
  partyById: Record<string, Party>;
  refresh: (what?: ("accounts" | "parties" | "cash" | "costCenters" | "currencies")[]) => Promise<void>;
  privacy: boolean;
  togglePrivacy: () => void;
  dark: boolean;
  toggleDark: () => void;
};

const BookCtx = createContext<Ctx | null>(null);

const LS_BOOK = "mahasi.book";
const LS_PRIV = "mahasi.privacy";
const LS_DARK = "mahasi.dark";
const ls = {
  get: (k: string) => {
    try { return localStorage.getItem(k); } catch { return null; }
  },
  set: (k: string, v: string) => {
    try { localStorage.setItem(k, v); } catch { /* وضع خاص */ }
  },
};

export function BookProvider({ children }: { children: React.ReactNode }) {
  const sb = supabase();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [books, setBooks] = useState<BookWithRole[]>([]);
  const [bookId, setBookId] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [cash, setCash] = useState<CashBalance[]>([]);
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [privacy, setPrivacy] = useState(false);
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setPrivacy(ls.get(LS_PRIV) === "1");
    const d = ls.get(LS_DARK);
    const isDark = d ? d === "1" : window.matchMedia?.("(prefers-color-scheme: dark)").matches;
    setDark(!!isDark);
  }, []);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  const reloadBooks = useCallback(async () => {
    const { data: { user: u } } = await sb.auth.getUser();
    setUser(u);
    if (!u) {
      setBooks([]);
      setLoading(false);
      return;
    }
    const { data } = await sb.from("book_members").select("role, books(*)").eq("user_id", u.id);
    const list = ((data || []) as unknown as { role: Role; books: Book }[])
      .filter((r) => r.books)
      .map((r) => ({ ...r.books, role: r.role }))
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
    setBooks(list);
    const saved = ls.get(LS_BOOK);
    setBookId((cur) => (cur && list.some((b) => b.id === cur) ? cur : saved && list.some((b) => b.id === saved) ? saved : list[0]?.id || null));
    setLoading(false);
  }, [sb]);

  useEffect(() => {
    reloadBooks();
    const { data: sub } = sb.auth.onAuthStateChange((evt) => {
      if (evt === "SIGNED_IN" || evt === "SIGNED_OUT") reloadBooks();
    });
    return () => sub.subscription.unsubscribe();
  }, [sb, reloadBooks]);

  const book = books.find((b) => b.id === bookId) || null;

  const refresh = useCallback(
    async (what?: ("accounts" | "parties" | "cash" | "costCenters" | "currencies")[]) => {
      if (!bookId) return;
      const all = !what;
      const jobs: PromiseLike<unknown>[] = [];
      if (all || what!.includes("accounts"))
        jobs.push(sb.from("accounts").select("*").eq("book_id", bookId).order("code").then((r) => setAccounts((r.data as Account[]) || [])));
      if (all || what!.includes("parties"))
        jobs.push(sb.from("parties").select("*").eq("book_id", bookId).order("name").then((r) => setParties((r.data as Party[]) || [])));
      if (all || what!.includes("cash"))
        jobs.push(sb.from("v_cash_balances").select("*").eq("book_id", bookId).order("sort_order").then((r) => setCash((r.data as CashBalance[]) || [])));
      if (all || what!.includes("costCenters"))
        jobs.push(sb.from("cost_centers").select("*").eq("book_id", bookId).order("code").then((r) => setCostCenters((r.data as CostCenter[]) || [])));
      if (all || what!.includes("currencies"))
        jobs.push(sb.from("currencies").select("*").eq("book_id", bookId).order("is_base", { ascending: false }).then((r) => setCurrencies((r.data as Currency[]) || [])));
      await Promise.all(jobs);
    },
    [sb, bookId]
  );

  useEffect(() => {
    setAccounts([]); setParties([]); setCash([]); setCostCenters([]); setCurrencies([]);
    if (bookId) {
      ls.set(LS_BOOK, bookId);
      refresh();
    }
  }, [bookId, refresh]);

  const value = useMemo<Ctx>(() => {
    const role = book?.role || null;
    return {
      user, loading, books, book, role,
      canWrite: role === "owner" || role === "admin" || role === "accountant",
      canAdmin: role === "owner" || role === "admin",
      switchBook: (id) => setBookId(id),
      reloadBooks,
      accounts, parties, cash, costCenters, currencies,
      accountById: Object.fromEntries(accounts.map((a) => [a.id, a])),
      partyById: Object.fromEntries(parties.map((p) => [p.id, p])),
      refresh,
      privacy,
      togglePrivacy: () => setPrivacy((p) => { ls.set(LS_PRIV, p ? "0" : "1"); return !p; }),
      dark,
      toggleDark: () => setDark((d) => { ls.set(LS_DARK, d ? "0" : "1"); return !d; }),
    };
  }, [user, loading, books, book, reloadBooks, accounts, parties, cash, costCenters, currencies, refresh, privacy, dark]);

  return <BookCtx.Provider value={value}>{children}</BookCtx.Provider>;
}

export function useBook() {
  const c = useContext(BookCtx);
  if (!c) throw new Error("useBook خارج BookProvider");
  return c;
}
