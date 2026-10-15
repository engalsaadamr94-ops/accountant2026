"use client";
import Link from "next/link";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AuthFrame from "@/components/AuthFrame";
import { Field, ErrorBox, Spinner } from "@/components/ui";
import { supabase } from "@/lib/supabase/client";
import { errorText } from "@/lib/format";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(params.get("error") === "link" ? "الرابط منتهي أو غير صالح. سجّل الدخول أو اطلب رابطاً جديداً." : null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase().auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) return setError(errorText(error));
    const next = params.get("next");
    router.replace(next && next.startsWith("/") ? next : "/");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {error && <ErrorBox error={error} />}
      <Field label="البريد الإلكتروني" htmlFor="email">
        <input id="email" type="email" dir="ltr" className="field text-left" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <Field label="كلمة المرور" htmlFor="pw">
        <input id="pw" type="password" dir="ltr" className="field text-left" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      <div className="flex justify-end text-[13.5px]"><Link href="/forgot-password" className="text-brand hover:underline">نسيت كلمة المرور؟</Link></div>
      <button className="btn-primary w-full !py-2.5" disabled={busy}>{busy && <Spinner />} تسجيل الدخول</button>
      <p className="text-center text-[14px] text-muted">ليس لديك حساب؟ <Link href="/signup" className="font-medium text-brand hover:underline">أنشئ حساباً</Link></p>
    </form>
  );
}

export default function LoginPage() {
  return (
    <AuthFrame title="مرحباً بعودتك" subtitle="سجّل الدخول لمتابعة دفترك.">
      <Suspense><LoginForm /></Suspense>
    </AuthFrame>
  );
}
