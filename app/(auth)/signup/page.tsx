"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import AuthFrame from "@/components/AuthFrame";
import { Field, ErrorBox, Spinner } from "@/components/ui";
import { supabase } from "@/lib/supabase/client";
import { errorText } from "@/lib/format";

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) return setError("كلمة المرور قصيرة؛ استخدم 8 أحرف على الأقل.");
    setBusy(true);
    setError(null);
    const { data, error } = await supabase().auth.signUp({
      email: email.trim(), password,
      options: { data: { full_name: name.trim() }, emailRedirectTo: `${location.origin}/auth/callback?next=/onboarding` },
    });
    setBusy(false);
    if (error) return setError(errorText(error));
    if (data.session) { router.replace("/onboarding"); router.refresh(); }
    else setSent(true);
  }

  if (sent) {
    return (
      <AuthFrame title="تحقق من بريدك" subtitle={`أرسلنا رابط التأكيد إلى ${email}. افتحه لتفعيل حسابك ثم ابدأ إعداد دفترك.`}>
        <Link href="/login" className="btn-ghost w-full">العودة لتسجيل الدخول</Link>
      </AuthFrame>
    );
  }

  return (
    <AuthFrame title="أنشئ حسابك" subtitle="دقيقة واحدة، ثم يجهز دفترك بدليل حسابات كامل.">
      <form onSubmit={submit} className="space-y-4">
        {error && <ErrorBox error={error} />}
        <Field label="الاسم" htmlFor="name"><input id="name" className="field" required value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></Field>
        <Field label="البريد الإلكتروني" htmlFor="email"><input id="email" type="email" dir="ltr" className="field text-left" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></Field>
        <Field label="كلمة المرور" htmlFor="pw" hint="8 أحرف على الأقل."><input id="pw" type="password" dir="ltr" className="field text-left" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" /></Field>
        <button className="btn-primary w-full !py-2.5" disabled={busy}>{busy && <Spinner />} إنشاء الحساب</button>
        <p className="text-center text-[14px] text-muted">لديك حساب؟ <Link href="/login" className="font-medium text-brand hover:underline">سجّل الدخول</Link></p>
      </form>
    </AuthFrame>
  );
}
