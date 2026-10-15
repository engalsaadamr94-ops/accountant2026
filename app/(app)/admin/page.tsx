"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Settings, Users, Coins, FolderKanban, Lock, Bookmark, History, DatabaseBackup } from "lucide-react";
import { useBook } from "@/lib/book";
import { Loading, PageHeader } from "@/components/ui";
import SettingsPanel from "@/components/admin/SettingsPanel";
import MembersPanel from "@/components/admin/MembersPanel";
import CurrenciesPanel from "@/components/admin/CurrenciesPanel";
import CostCentersPanel from "@/components/admin/CostCentersPanel";
import LockPanel from "@/components/admin/LockPanel";
import TemplatesPanel from "@/components/admin/TemplatesPanel";
import AuditPanel from "@/components/admin/AuditPanel";
import BackupPanel from "@/components/admin/BackupPanel";

const SECTIONS = [
  { key: "settings", label: "إعدادات الدفتر", icon: Settings, C: SettingsPanel, admin: false },
  { key: "members", label: "المستخدمون والصلاحيات", icon: Users, C: MembersPanel, admin: false },
  { key: "currencies", label: "العملات وأسعار الصرف", icon: Coins, C: CurrenciesPanel, admin: false },
  { key: "cost-centers", label: "مراكز التكلفة والمشاريع", icon: FolderKanban, C: CostCentersPanel, admin: false },
  { key: "lock", label: "إقفال الفترات", icon: Lock, C: LockPanel, admin: false },
  { key: "templates", label: "قوالب العمليات", icon: Bookmark, C: TemplatesPanel, admin: false },
  { key: "audit", label: "سجل التدقيق", icon: History, C: AuditPanel, admin: true },
  { key: "backup", label: "النسخ الاحتياطي والتصدير", icon: DatabaseBackup, C: BackupPanel, admin: true },
] as const;

function Admin() {
  const params = useSearchParams();
  const router = useRouter();
  const { book, canAdmin } = useBook();
  const key = params.get("s") || "settings";
  const sec = SECTIONS.find((s) => s.key === key) || SECTIONS[0];
  if (!book) return <Loading />;
  return (
    <div>
      <PageHeader title="إدارة النظام" subtitle={canAdmin ? "تحكم كامل في إعدادات الدفتر ومستخدميه وبياناته." : "بعض الإعدادات متاحة لمدير الدفتر فقط."} />
      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        <nav className="no-print">
          <ul className="flex gap-1 overflow-x-auto lg:flex-col">
            {SECTIONS.filter((s) => !s.admin || canAdmin).map((s) => (
              <li key={s.key}>
                <button onClick={() => router.replace(`/admin?s=${s.key}`, { scroll: false })} aria-current={s.key === sec.key ? "page" : undefined}
                  className={`flex w-full items-center gap-2.5 whitespace-nowrap rounded-field px-3 py-2 text-start text-[14px] ${s.key === sec.key ? "bg-brand-tint font-semibold text-brand" : "text-ink-soft hover:bg-brand-tint/50"}`}>
                  <s.icon className="h-4 w-4" />{s.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>
        <div className="min-w-0"><sec.C /></div>
      </div>
    </div>
  );
}

export default function AdminPage() {
  return <Suspense fallback={<Loading />}><Admin /></Suspense>;
}
