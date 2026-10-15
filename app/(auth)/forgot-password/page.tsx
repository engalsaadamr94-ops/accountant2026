"use client";
import Link from "next/link";
import { useState } from "react";
import AuthFrame from "@/components/AuthFrame";
import { Field, ErrorBox, Spinner } from "@/components/ui";
import { supabase } from "@/lib/supabase/client";
import { errorText } from "@/lib/format";

export default function ForgotPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase().auth.resetPasswordForEmail(email.trim(), { redirectTo: `${location.origin}/auth/callback?next=/reset-password` });
    setBusy(false);
    if (error) return setError(errorText(error));
    setSent(true);
  }
  return (
    <AuthFrame title="استعادة كلمة المرور" subtitle={sent ? "إن كان البريد مسجلاً فستصلك رسالة فيها رابط لتعيين كلمة مرور جديدة." : "أدخل بريدك وسنرسل لك رابط التعيين."}>
      {sent ? <Link href="/login" className="btn-ghost w-full">العودة لتسجيل الدخول</Link> : (
        <form onSubmit={submit} className="space-y-4">
          {error && <ErrorBox error={error} />}
          <Field label="البريد الإلكتروني" htmlFor="email"><input id="email" type="email" dir="ltr" className="field text-left" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          <button className="btn-primary w-full !py-2.5" disabled={busy}>{busy && <Spinner />} إرسال الرابط</button>
          <p className="text-center text-[14px]"><Link href="/login" className="text-brand hover:underline">العودة لتسجيل الدخول</Link></p>
        </form>
      )}
    </AuthFrame>
  );
}
