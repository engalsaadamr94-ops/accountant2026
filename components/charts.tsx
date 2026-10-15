"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { money, monthShort, monthLabel } from "@/lib/format";
import { useBook } from "@/lib/book";

export type MonthPoint = { month: string; revenue: number; expense: number };

/** الدخل مقابل المصروف شهرياً — عمودان لكل شهر، محور واحد، مفتاح + تلميح عند المرور */
export function MonthlyBars({ data, height = 240 }: { data: MonthPoint[]; height?: number }) {
  const { privacy } = useBook();
  return (
    <div>
      <div className="mb-2 flex items-center gap-4 text-[12.5px] text-ink-soft" aria-hidden>
        <span className="flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-[3px]" style={{ background: "var(--chart-in)" }} />الدخل</span>
        <span className="flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-[3px]" style={{ background: "var(--chart-out)" }} />المصروف</span>
      </div>
      <div style={{ height }} dir="ltr">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 6, right: 4, left: 4, bottom: 0 }} barGap={2} barCategoryGap="28%">
            <CartesianGrid vertical={false} stroke="var(--chart-grid)" strokeWidth={1} />
            <XAxis dataKey="month" tickFormatter={monthShort} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "rgb(var(--muted))" }} reversed />
            <YAxis orientation="right" width={56} tickLine={false} axisLine={false} tick={{ fontSize: 11.5, fill: "rgb(var(--muted))" }}
              tickFormatter={(v: number) => (privacy ? "" : Math.abs(v) >= 1_000_000 ? `${+(v / 1_000_000).toFixed(1)}M` : Math.abs(v) >= 1000 ? `${+(v / 1000).toFixed(1)}k` : String(v))} />
            <Tooltip
              cursor={{ fill: "rgb(var(--brand-tint))", opacity: 0.6 }}
              content={({ active, payload, label }) =>
                active && payload?.length ? (
                  <div dir="rtl" className="rounded-field border border-rule bg-sheet px-3 py-2 text-[13px] shadow-lg">
                    <div className="mb-1 font-semibold">{monthLabel(String(label))}</div>
                    {payload.map((p) => (
                      <div key={String(p.dataKey)} className="flex items-center justify-between gap-6">
                        <span className="flex items-center gap-1.5 text-ink-soft"><i className="inline-block h-2 w-2 rounded-[2px]" style={{ background: String(p.color) }} />{p.dataKey === "revenue" ? "الدخل" : "المصروف"}</span>
                        <span className="num">{privacy ? "••••" : money(Number(p.value))}</span>
                      </div>
                    ))}
                  </div>
                ) : null
              }
            />
            <Bar dataKey="revenue" fill="var(--chart-in)" radius={[4, 4, 0, 0]} maxBarSize={24} />
            <Bar dataKey="expense" fill="var(--chart-out)" radius={[4, 4, 0, 0]} maxBarSize={24} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** أشرطة أفقية بسيطة (لون واحد = سلسلة واحدة، القيمة مكتوبة بجانبها) */
export function HBars({ items, color = "var(--chart-out)" }: { items: { label: string; value: number; href?: string }[]; color?: string }) {
  const { privacy } = useBook();
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className="space-y-2.5">
      {items.map((it) => (
        <li key={it.label} className="text-[13.5px]">
          <div className="mb-1 flex justify-between gap-3"><span className="truncate">{it.label}</span><span className="num text-ink-soft">{privacy ? "••••" : money(it.value)}</span></div>
          <div className="h-2 rounded-full bg-rule/60">
            <div className="h-2 rounded-full" style={{ width: `${Math.max(2, (it.value / max) * 100)}%`, background: color }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
