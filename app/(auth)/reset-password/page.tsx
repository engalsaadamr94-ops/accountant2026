"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import AuthFrame from "@/components/AuthFrame";
import { Field, ErrorBox, Spinner } from "@/components/ui";
import { supabase } from "@/lib/supabase/client";
import { errorText } from "@/lib/format";

export default function ResetPage() {
  const router = useRouter();
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pw.length < 8) return setError("كلمة المرور قصيرة؛ استخدم 8 أحرف على الأقل.");
    setBusy(true);
    const { error } = await supabase().auth.updateUser({ password: pw });
    setBusy(false);
    if (error) return setError(errorText(error));
    router.replace("/");
  }
  return (
    <AuthFrame title="كلمة مرور جديدة">
      <form onSubmit={submit} className="space-y-4">
        {error && <ErrorBox error={error} />}
        <Field label="كلمة المرور الجديدة" htmlFor="pw" hint="8 أحرف على الأقل."><input id="pw" type="password" dir="ltr" className="field text-left" required value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" /></Field>
        <button className="btn-primary w-full !py-2.5" disabled={busy}>{busy && <Spinner />} حفظ كلمة المرور</button>
      </form>
    </AuthFrame>
  );
}
