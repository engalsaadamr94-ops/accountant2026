import Link from "next/link";
import { Scale, ScrollText, TrendingUp, Landmark, PieChart, HandCoins, Wallet, FolderKanban } from "lucide-react";

const GROUPS = [
  {
    title: "القوائم المالية",
    items: [
      { href: "/reports/income", icon: TrendingUp, title: "قائمة الدخل", text: "ربح العمل الحر، ودخلك ومصروفك الشخصي، وما ادّخرته في الفترة." },
      { href: "/reports/balance-sheet", icon: Landmark, title: "المركز المالي وصافي الثروة", text: "ما تملك وما عليك في تاريخ محدد، وصافي ثروتك." },
      { href: "/reports/trial-balance", icon: Scale, title: "ميزان المراجعة", text: "أرصدة كل الحسابات بالمدين والدائن، للتحقق من توازن الدفتر." },
    ],
  },
  {
    title: "التحليل والمتابعة",
    items: [
      { href: "/reports/expenses", icon: PieChart, title: "تحليل المصروفات", text: "أين يذهب مالك: حسب البند والشهر، شخصي مقابل عمل." },
      { href: "/reports/cost-centers", icon: FolderKanban, title: "ربحية المشاريع ومراكز التكلفة", text: "إيراد ومصروف وصافي كل مشروع أو مركز تكلفة." },
      { href: "/reports/cash-flow", icon: Wallet, title: "حركة الصناديق والبنوك", text: "الداخل والخارج لكل صندوق في الفترة." },
      { href: "/reports/debts", icon: HandCoins, title: "أعمار الديون", text: "الديون لك وعليك موزعة حسب التأخر والاستحقاق." },
      { href: "/reports/statement", icon: ScrollText, title: "كشف حساب", text: "حركة أي حساب أو شخص أو مركز تكلفة برصيد جارٍ." },
    ],
  },
];

export default function ReportsIndex() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-[26px] font-bold">التقارير</h1>
        <p className="mt-1 text-[14px] text-muted">كل تقرير يُطبع ويُصدَّر إلى Excel، ويُحسب مباشرة من القيود المرحّلة.</p>
      </div>
      <div className="space-y-8">
        {GROUPS.map((g) => (
          <section key={g.title}>
            <h2 className="mb-3 text-[15px] font-bold text-ink-soft">{g.title}</h2>
            <div className="grid overflow-hidden rounded-panel border border-rule bg-sheet sm:grid-cols-2 lg:grid-cols-3">
              {g.items.map((r) => (
                <Link key={r.href} href={r.href} className="group -mb-px flex gap-3 border-b border-rule p-5 hover:bg-brand-tint/50 sm:border-s">
                  <r.icon className="mt-0.5 h-5 w-5 shrink-0 text-brand" />
                  <span><span className="block font-semibold group-hover:text-brand">{r.title}</span><span className="mt-0.5 block text-[13.5px] leading-6 text-muted">{r.text}</span></span>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
