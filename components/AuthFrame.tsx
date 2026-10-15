import { BookOpen } from "lucide-react";

/** إطار صفحات الدخول: لوحة تعريف بالحبر الأخضر وورقة النموذج */
export default function AuthFrame({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen bg-paper lg:grid-cols-[1fr_1.1fr]">
      <section className="relative hidden overflow-hidden bg-brand-deep px-14 py-14 text-white lg:flex lg:flex-col">
        <div className="flex items-center gap-2.5">
          <span className="grid h-10 w-10 place-items-center rounded-[9px] bg-white/10"><BookOpen className="h-5 w-5" /></span>
          <span className="font-display text-[22px] font-bold">محاسبي</span>
        </div>
        <div className="mt-auto max-w-md">
          <p className="font-display text-[30px] font-bold leading-[1.5]">كل ريال له مكان في دفترك، وكل دين له موعد.</p>
          <div className="mt-10 rounded-panel bg-white/[0.06] p-6 text-[14px]">
            <div className="flex justify-between border-b border-white/15 py-2"><span className="text-white/75">النقد والبنوك</span><span className="num">48,250.00</span></div>
            <div className="flex justify-between border-b border-white/15 py-2"><span className="text-white/75">ديون لي عند الناس</span><span className="num">12,600.00</span></div>
            <div className="flex justify-between py-2"><span className="text-white/75">ديون عليّ</span><span className="num">(7,400.00)</span></div>
            <div className="mt-1 flex justify-between pt-2 font-semibold" style={{ borderTop: "1px solid rgba(255,255,255,.7)", borderBottom: "3px double rgba(255,255,255,.7)", paddingBottom: ".5rem" }}>
              <span>صافي الثروة</span><span className="num">53,450.00</span>
            </div>
          </div>
          <p className="mt-6 text-[13px] text-white/55">مثال توضيحي. أرقامك تبقى في قاعدة بياناتك وحدك.</p>
        </div>
      </section>
      <section className="flex items-center justify-center px-5 py-12">
        <div className="w-full max-w-[400px]">
          <div className="mb-8 flex items-center gap-2 lg:hidden">
            <span className="grid h-9 w-9 place-items-center rounded-[8px] bg-brand text-white"><BookOpen className="h-5 w-5" /></span>
            <span className="font-display text-[20px] font-bold">محاسبي</span>
          </div>
          <h1 className="text-[24px] font-bold">{title}</h1>
          {subtitle && <p className="mt-1.5 text-[14.5px] text-muted">{subtitle}</p>}
          <div className="mt-7">{children}</div>
        </div>
      </section>
    </div>
  );
}
