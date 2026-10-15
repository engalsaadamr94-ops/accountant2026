"use client";

import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from "react";
import { X, Loader2, ChevronDown, Check } from "lucide-react";
import { useBook } from "@/lib/book";
import { cur as curLabel, money, n, side } from "@/lib/format";
import type { Num } from "@/lib/types";

// ───────────── المبالغ ─────────────
export function Money({ v, cur, className = "", signed, tone }: { v: Num | null | undefined; cur?: string | null; className?: string; signed?: boolean; tone?: "auto" | "none" }) {
  const { privacy } = useBook();
  const x = n(v);
  const color = tone === "auto" ? (x < 0 ? "text-loss" : x > 0 ? "text-gain" : "") : "";
  return (
    <span className={`num ${color} ${className}`}>
      {privacy ? "••••" : money(x, { signed })}
      {cur && <span className="ms-1 text-[0.8em] font-normal text-muted">{curLabel(cur)}</span>}
    </span>
  );
}

/** رصيد بقيمة مطلقة مع وسم مدين/دائن */
export function Balance({ v, cur, className = "", invert }: { v: Num | null | undefined; cur?: string | null; className?: string; invert?: boolean }) {
  const x = n(v) * (invert ? -1 : 1);
  const s = side(n(v));
  return (
    <span className={`whitespace-nowrap ${className}`}>
      <Money v={x} cur={cur} />
      {s && <span className={`ms-1.5 text-[11.5px] font-medium ${s === "مدين" ? "text-brand" : "text-amber"}`}>{s}</span>}
    </span>
  );
}

// ───────────── التخطيط ─────────────
export function PageHeader({ title, subtitle, actions, back }: { title: string; subtitle?: React.ReactNode; actions?: React.ReactNode; back?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3 no-print">
      <div className="min-w-0">
        {back}
        <h1 className="text-[22px] font-bold text-ink sm:text-[26px]">{title}</h1>
        {subtitle && <p className="mt-1 text-[14px] text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Field({ label, hint, error, children, className = "", htmlFor }: { label?: string; hint?: React.ReactNode; error?: string | null; children: React.ReactNode; className?: string; htmlFor?: string }) {
  return (
    <div className={className}>
      {label && <label className="label" htmlFor={htmlFor}>{label}</label>}
      {children}
      {error ? <p className="mt-1 text-[12.5px] text-loss" role="alert">{error}</p> : hint ? <p className="mt-1 text-[12.5px] text-muted">{hint}</p> : null}
    </div>
  );
}

export function Chip({ children, tone = "neutral", className = "" }: { children: React.ReactNode; tone?: "neutral" | "brand" | "amber" | "loss" | "gain"; className?: string }) {
  const t = {
    neutral: "bg-rule/60 text-ink-soft",
    brand: "bg-brand-tint text-brand",
    amber: "bg-amber-tint text-amber",
    loss: "bg-loss-tint text-loss",
    gain: "bg-brand-tint text-gain",
  }[tone];
  return <span className={`chip ${t} ${className}`}>{children}</span>;
}

export function Spinner({ className = "" }: { className?: string }) {
  return <Loader2 className={`h-4 w-4 animate-spin ${className}`} aria-hidden />;
}

export function Loading({ label = "جارِ التحميل…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-muted" aria-busy="true">
      <Spinner /> {label}
    </div>
  );
}

export function EmptyState({ title, text, action, icon }: { title: string; text?: string; action?: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      {icon && <div className="mb-3 text-muted">{icon}</div>}
      <p className="font-display text-[16px] font-semibold text-ink">{title}</p>
      {text && <p className="mt-1 max-w-md text-[14px] text-muted">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorBox({ error, onRetry }: { error: string; onRetry?: () => void }) {
  return (
    <div className="rounded-field border border-loss/30 bg-loss-tint px-4 py-3 text-[14px] text-loss" role="alert">
      {error}
      {onRetry && <button className="ms-3 underline" onClick={onRetry}>إعادة المحاولة</button>}
    </div>
  );
}

export function Tabs<T extends string>({ items, value, onChange, className = "" }: { items: { value: T; label: React.ReactNode }[]; value: T; onChange: (v: T) => void; className?: string }) {
  return (
    <div className={`inline-flex rounded-field border border-rule bg-sheet p-0.5 ${className}`} role="tablist">
      {items.map((it) => (
        <button
          key={it.value}
          role="tab"
          aria-selected={value === it.value}
          onClick={() => onChange(it.value)}
          className={`rounded-[5px] px-3.5 py-1.5 text-[13.5px] transition-colors ${value === it.value ? "bg-brand text-white dark:text-brand-deep font-medium" : "text-ink-soft hover:text-ink"}`}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

// ───────────── نافذة منبثقة ─────────────
export function Modal({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; footer?: React.ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.activeElement as HTMLElement | null;
    setTimeout(() => ref.current?.querySelector<HTMLElement>("input,select,textarea,button")?.focus(), 30);
    return () => {
      window.removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center no-print" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-ink/40" onClick={onClose} />
      <div ref={ref} className={`relative max-h-[92vh] w-full overflow-auto rounded-t-panel bg-sheet shadow-xl sm:rounded-panel ${wide ? "sm:max-w-3xl" : "sm:max-w-lg"}`}>
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-rule bg-sheet px-5 py-3.5">
          <h2 className="text-[17px] font-bold">{title}</h2>
          <button className="btn-quiet !px-2" onClick={onClose} aria-label="إغلاق"><X className="h-5 w-5" /></button>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer && <div className="sticky bottom-0 flex flex-wrap justify-end gap-2 border-t border-rule bg-sheet px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

// ───────────── التنبيهات ─────────────
type Toast = { id: number; text: string; tone: "ok" | "error" };
const ToastCtx = createContext<(text: string, tone?: "ok" | "error") => void>(() => {});
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((text: string, tone: "ok" | "error" = "ok") => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x, { id, text, tone }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), tone === "error" ? 7000 : 3500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 sm:bottom-6" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`pointer-events-auto max-w-md rounded-field px-4 py-2.5 text-[14px] shadow-lg ${t.tone === "error" ? "bg-loss text-white" : "bg-ink text-paper"}`}>
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

// ───────────── إدخال المبلغ (يقبل الأرقام العربية الهندية) ─────────────
export function normalizeDigits(s: string): string {
  return s
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٫,]/g, (c) => (c === "٫" ? "." : ""))
    .replace(/[^\d.]/g, "")
    .replace(/(\..*)\./g, "$1");
}
export function AmountInput({ value, onChange, className = "", ...rest }: { value: string | number; onChange: (v: string) => void } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  return (
    <input
      {...rest}
      inputMode="decimal"
      dir="ltr"
      className={`field num text-left ${className}`}
      value={value}
      onChange={(e) => onChange(normalizeDigits(e.target.value))}
    />
  );
}

// ───────────── قائمة اختيار قابلة للبحث ─────────────
export type Option = { value: string; label: string; hint?: string; search?: string; depth?: number; disabled?: boolean; group?: string };

export function normalizeArabic(s: string): string {
  return s.toLowerCase().replace(/[ً-ْـ]/g, "").replace(/[أإآٱ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي")
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).trim();
}

export function SearchSelect({ options, value, onChange, placeholder = "اختر…", id, allowClear, onCreate, createLabel, className = "", disabled }: {
  options: Option[]; value: string; onChange: (v: string) => void; placeholder?: string; id?: string; allowClear?: boolean;
  onCreate?: (text: string) => void; createLabel?: string; className?: string; disabled?: boolean;
}) {
  const auto = useId();
  const inputId = id || auto;
  const listId = `${inputId}-l`;
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(-1);
  const wrap = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const selected = options.find((o) => o.value === value);
  const filtered = useMemo(() => {
    const t = normalizeArabic(q).split(/\s+/).filter(Boolean);
    const res = t.length ? options.filter((o) => { const h = normalizeArabic(`${o.label} ${o.search || ""} ${o.hint || ""}`); return t.every((x) => h.includes(x)); }) : options;
    return res.slice(0, 150);
  }, [options, q]);
  useEffect(() => setActive(q ? filtered.findIndex((o) => !o.disabled) : -1), [q, open, filtered]);
  useEffect(() => {
    const h = (e: MouseEvent) => wrap.current && !wrap.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  useEffect(() => {
    if (open && active >= 0) (list.current?.children[active] as HTMLElement | undefined)?.scrollIntoView({ block: "nearest" });
  }, [active, open]);
  const choose = (o: Option) => { if (o.disabled) return; onChange(o.value); setQ(""); setOpen(false); };
  const move = (dir: 1 | -1) => {
    setOpen(true);
    setActive((a) => {
      let i = a;
      for (let k = 0; k < filtered.length; k++) {
        i = Math.min(Math.max(i + dir, 0), filtered.length - 1);
        if (!filtered[i]?.disabled) return i;
      }
      return a;
    });
  };
  return (
    <div ref={wrap} className={`relative ${className}`}>
      <div className="relative">
        <input
          id={inputId}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          disabled={disabled}
          className="field pe-3 ps-8"
          placeholder={selected ? selected.label : placeholder}
          value={open ? q : selected?.label || ""}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => { setOpen(false); setQ(""); }, 120)}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); move(1); }
            else if (e.key === "ArrowUp") { e.preventDefault(); move(-1); }
            else if (e.key === "Enter" && open && active >= 0 && filtered[active]) { e.preventDefault(); choose(filtered[active]); }
            else if (e.key === "Escape") { setOpen(false); setQ(""); }
          }}
        />
        {allowClear && value && !disabled ? (
          <button type="button" aria-label="مسح" className="absolute left-2 top-1/2 -translate-y-1/2 text-muted hover:text-ink" onMouseDown={(e) => { e.preventDefault(); onChange(""); }}>
            <X className="h-4 w-4" />
          </button>
        ) : (
          <ChevronDown className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        )}
      </div>
      {open && (
        <ul ref={list} id={listId} role="listbox" className="absolute z-40 mt-1 max-h-72 w-full overflow-auto rounded-field border border-rule-strong bg-sheet py-1 text-[14px] shadow-lg">
          {filtered.length === 0 && !onCreate && <li className="px-3 py-2 text-muted">لا نتائج مطابقة</li>}
          {filtered.map((o, i) => (
            <li
              key={o.value}
              role="option"
              aria-selected={o.value === value}
              aria-disabled={o.disabled}
              onMouseDown={(e) => { e.preventDefault(); choose(o); }}
              onMouseEnter={() => !o.disabled && setActive(i)}
              className={`flex items-center justify-between gap-2 px-3 py-1.5 ${o.disabled ? "cursor-default text-muted" : "cursor-pointer"} ${i === active ? "bg-brand-tint" : ""}`}
              style={{ paddingInlineStart: `${0.75 + (q ? 0 : (o.depth || 0) * 0.9)}rem` }}
            >
              <span className={o.disabled ? "font-semibold text-[13px]" : ""}>{o.label}</span>
              <span className="flex items-center gap-1.5 text-[12px] text-muted">
                {o.hint}
                {o.value === value && <Check className="h-3.5 w-3.5 text-brand" />}
              </span>
            </li>
          ))}
          {onCreate && q.trim() && (
            <li onMouseDown={(e) => { e.preventDefault(); onCreate(q.trim()); setQ(""); setOpen(false); }} className="cursor-pointer border-t border-rule px-3 py-2 text-brand hover:bg-brand-tint">
              {createLabel || "إضافة"} «{q.trim()}»
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

// ───────────── نافذة تأكيد ─────────────
export function useConfirm() {
  const [state, setState] = useState<{ title: string; text: string; danger?: boolean; ok?: string; resolve: (v: boolean) => void } | null>(null);
  const confirm = useCallback((title: string, text: string, opts: { danger?: boolean; ok?: string } = {}) =>
    new Promise<boolean>((resolve) => setState({ title, text, ...opts, resolve })), []);
  const dialog = state ? (
    <Modal open title={state.title} onClose={() => { state.resolve(false); setState(null); }}
      footer={<>
        <button className="btn-ghost" onClick={() => { state.resolve(false); setState(null); }}>تراجع</button>
        <button className={state.danger ? "btn-danger" : "btn-primary"} onClick={() => { state.resolve(true); setState(null); }}>{state.ok || "تأكيد"}</button>
      </>}>
      <p className="text-[14.5px] text-ink-soft">{state.text}</p>
    </Modal>
  ) : null;
  return { confirm, dialog };
}
