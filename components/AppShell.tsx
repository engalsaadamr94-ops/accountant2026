"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard, ReceiptText, Wallet, HandCoins, Users, ListTree, BarChart3, Settings, Plus, Eye, EyeOff,
  Moon, Sun, LogOut, ChevronDown, BookOpen, Menu, ArrowDownLeft, ArrowUpRight, ArrowLeftRight, FileText, Landmark, Banknote,
} from "lucide-react";
import { useBook } from "@/lib/book";
import { supabase } from "@/lib/supabase/client";
import { ROLE_LABEL } from "@/lib/format";
import { Loading, Modal } from "@/components/ui";
import type { Template } from "@/lib/types";

const NAV = [
  { href: "/", label: "الرئيسية", icon: LayoutDashboard },
  { href: "/vouchers", label: "السندات والقيود", icon: ReceiptText },
  { href: "/cash", label: "الصناديق والبنوك", icon: Wallet },
  { href: "/debts", label: "الديون والأقساط", icon: HandCoins },
  { href: "/parties", label: "الأشخاص والجهات", icon: Users },
  { href: "/accounts", label: "دليل الحسابات", icon: ListTree },
  { href: "/reports", label: "التقارير", icon: BarChart3 },
  { href: "/admin", label: "إدارة النظام", icon: Settings },
];
const MOBILE_NAV = [NAV[0], NAV[1], NAV[3], NAV[6]];

export const QUICK_ACTIONS = [
  { type: "expense", label: "مصروف", text: "دفعت مبلغاً على شيء", icon: ArrowUpRight },
  { type: "income", label: "دخل", text: "راتب، أتعاب، إيجار…", icon: ArrowDownLeft },
  { type: "transfer", label: "تحويل", text: "بين صندوق وبنك أو محفظة", icon: ArrowLeftRight },
  { type: "receipt", label: "سند قبض", text: "استلمت مبلغاً من شخص أو عميل", icon: Banknote },
  { type: "payment", label: "سند صرف", text: "دفعت مبلغاً لشخص أو مورد", icon: Landmark },
  { type: "journal", label: "قيد يومية", text: "قيد حر بالمدين والدائن", icon: FileText },
] as const;

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { user, loading, books, book, role, switchBook, privacy, togglePrivacy, dark, toggleDark, canWrite } = useBook();
  const pathname = usePathname();
  const router = useRouter();
  const [quick, setQuick] = useState(false);
  const [menu, setMenu] = useState(false);
  const [bookMenu, setBookMenu] = useState(false);
  const [templates, setTemplates] = useState<Template[]>([]);

  useEffect(() => {
    if (!loading && user && books.length === 0) router.replace("/onboarding");
  }, [loading, user, books.length, router]);
  useEffect(() => { setMenu(false); setBookMenu(false); }, [pathname]);
  useEffect(() => {
    if (!quick || !book) return;
    supabase().from("entry_templates").select("*").eq("book_id", book.id).order("sort_order").then((r) => setTemplates((r.data as Template[]) || []));
  }, [quick, book]);
  // اختصار لوحة المفاتيح: N لعملية جديدة
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "n" || e.key === "ى") { e.preventDefault(); setQuick(true); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  if (loading || !book) return <div className="min-h-screen bg-paper"><Loading /></div>;

  const active = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  async function logout() {
    await supabase().auth.signOut();
    router.replace("/login");
  }

  const sidebar = (
    <nav className="flex h-full flex-col bg-brand-deep text-white/90 dark:bg-[rgb(10_32_29)]">
      <div className="px-5 pb-4 pt-6">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-[8px] bg-white/10"><BookOpen className="h-5 w-5" /></span>
          <span className="font-display text-[20px] font-bold text-white">محاسبي</span>
        </Link>
      </div>
      <div className="relative px-3">
        <button className="flex w-full items-center justify-between rounded-field bg-white/[0.07] px-3 py-2.5 text-start hover:bg-white/[0.12]" onClick={() => setBookMenu((x) => !x)} aria-expanded={bookMenu}>
          <span className="min-w-0">
            <span className="block truncate text-[14px] font-semibold text-white">{book.name}</span>
            <span className="block text-[12px] text-white/60">{role ? ROLE_LABEL[role] : ""} · {book.base_currency}</span>
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-white/60" />
        </button>
        {bookMenu && (
          <div className="absolute inset-x-3 z-30 mt-1 rounded-field border border-rule bg-sheet py-1 text-ink shadow-xl">
            {books.map((b) => (
              <button key={b.id} className={`block w-full px-3 py-2 text-start text-[14px] hover:bg-brand-tint ${b.id === book.id ? "font-semibold text-brand" : ""}`} onClick={() => { switchBook(b.id); setBookMenu(false); router.push("/"); }}>
                {b.name} <span className="text-[12px] text-muted">({ROLE_LABEL[b.role]})</span>
              </button>
            ))}
            <Link href="/onboarding?new=1" className="block border-t border-rule px-3 py-2 text-[14px] text-brand hover:bg-brand-tint">إنشاء دفتر جديد</Link>
          </div>
        )}
      </div>
      <ul className="mt-4 flex-1 space-y-0.5 overflow-auto px-3">
        {NAV.map((it) => (
          <li key={it.href}>
            <Link href={it.href} aria-current={active(it.href) ? "page" : undefined}
              className={`flex items-center gap-3 rounded-field px-3 py-2.5 text-[14.5px] transition-colors ${active(it.href) ? "bg-white text-brand-deep font-semibold dark:bg-brand dark:text-brand-deep" : "text-white/80 hover:bg-white/[0.08] hover:text-white"}`}>
              <it.icon className="h-[18px] w-[18px]" /> {it.label}
            </Link>
          </li>
        ))}
      </ul>
      <div className="border-t border-white/10 px-3 py-3">
        <div className="truncate px-3 pb-2 text-[12.5px] text-white/55" dir="ltr">{user?.email}</div>
        <button className="flex w-full items-center gap-3 rounded-field px-3 py-2 text-[14px] text-white/75 hover:bg-white/[0.08]" onClick={logout}>
          <LogOut className="h-4 w-4" /> تسجيل الخروج
        </button>
      </div>
    </nav>
  );

  return (
    <div className="min-h-screen bg-paper">
      <aside className="fixed inset-y-0 right-0 z-30 hidden w-64 lg:block no-print">{sidebar}</aside>
      {menu && (
        <div className="fixed inset-0 z-40 lg:hidden no-print">
          <div className="absolute inset-0 bg-ink/40" onClick={() => setMenu(false)} />
          <aside className="absolute inset-y-0 right-0 w-72">{sidebar}</aside>
        </div>
      )}

      <div className="lg:pr-64">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-2 border-b border-rule bg-paper/90 px-4 backdrop-blur sm:px-6 no-print">
          <div className="flex items-center gap-2">
            <button className="btn-quiet !px-2 lg:hidden" onClick={() => setMenu(true)} aria-label="القائمة"><Menu className="h-5 w-5" /></button>
            <span className="font-display text-[15px] font-semibold lg:hidden">{book.name}</span>
          </div>
          <div className="flex items-center gap-1">
            <button className="btn-quiet !px-2.5" onClick={togglePrivacy} aria-pressed={privacy} title={privacy ? "إظهار المبالغ" : "إخفاء المبالغ"}>
              {privacy ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
            </button>
            <button className="btn-quiet !px-2.5" onClick={toggleDark} title={dark ? "الوضع النهاري" : "الوضع الليلي"}>
              {dark ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
            </button>
            {canWrite && (
              <button className="btn-primary ms-1 hidden sm:inline-flex" onClick={() => setQuick(true)} title="اختصار: N">
                <Plus className="h-4 w-4" /> عملية جديدة
              </button>
            )}
          </div>
        </header>

        <main className="mx-auto max-w-[1180px] px-4 pb-28 pt-6 sm:px-6 lg:pb-12">{children}</main>
      </div>

      {/* شريط الجوال السفلي */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex h-16 items-stretch border-t border-rule bg-sheet lg:hidden no-print">
        {MOBILE_NAV.slice(0, 2).map((it) => <MobileLink key={it.href} {...it} active={active(it.href)} />)}
        <div className="flex flex-1 items-center justify-center">
          {canWrite && (
            <button className="-mt-6 grid h-14 w-14 place-items-center rounded-full bg-brand text-white shadow-lg dark:text-brand-deep" onClick={() => setQuick(true)} aria-label="عملية جديدة">
              <Plus className="h-6 w-6" />
            </button>
          )}
        </div>
        {MOBILE_NAV.slice(2).map((it) => <MobileLink key={it.href} {...it} active={active(it.href)} />)}
      </nav>

      <Modal open={quick} onClose={() => setQuick(false)} title="عملية جديدة">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {QUICK_ACTIONS.map((a) => (
            <Link key={a.type} href={`/vouchers/new?type=${a.type}`} onClick={() => setQuick(false)}
              className="group rounded-field border border-rule p-3 hover:border-brand hover:bg-brand-tint">
              <a.icon className="mb-1.5 h-5 w-5 text-brand" />
              <div className="font-semibold">{a.label}</div>
              <div className="text-[12.5px] leading-5 text-muted">{a.text}</div>
            </Link>
          ))}
        </div>
        <Link href="/debts/new" onClick={() => setQuick(false)} className="mt-2 flex items-center gap-3 rounded-field border border-rule p-3 hover:border-brand hover:bg-brand-tint">
          <HandCoins className="h-5 w-5 text-brand" />
          <div><div className="font-semibold">دين جديد</div><div className="text-[12.5px] text-muted">أقرضت أحداً أو اقترضت منه، بأقساط أو دفعة واحدة</div></div>
        </Link>
        {templates.length > 0 && (
          <div className="mt-5">
            <h3 className="mb-2 text-[13px] font-semibold text-ink-soft">قوالبك المحفوظة</h3>
            <div className="flex flex-wrap gap-2">
              {templates.map((t) => (
                <Link key={t.id} href={`/vouchers/new?template=${t.id}`} onClick={() => setQuick(false)} className="rounded-full border border-rule-strong px-3 py-1.5 text-[13.5px] hover:border-brand hover:bg-brand-tint">{t.name}</Link>
              ))}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function MobileLink({ href, label, icon: Icon, active }: { href: string; label: string; icon: typeof LayoutDashboard; active: boolean }) {
  return (
    <Link href={href} className={`flex flex-1 flex-col items-center justify-center gap-0.5 text-[11px] ${active ? "text-brand font-semibold" : "text-muted"}`}>
      <Icon className="h-5 w-5" />
      {label.split(" ")[0]}
    </Link>
  );
}

