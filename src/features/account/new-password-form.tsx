"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/field";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { accountSchema } from "@/lib/validation/schemas";

export function NewPasswordForm({ next }: { next: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const parsed = accountSchema.shape.password.safeParse(password);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Senha inválida.");
      return;
    }
    setBusy(true);
    const { error: updateError } = await getBrowserSupabase().auth.updateUser({ password });
    setBusy(false);
    if (updateError) {
      setError("Não foi possível salvar. O link pode ter expirado.");
      return;
    }
    router.replace(next);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
      <div>
        <Label htmlFor="nova-senha">Nova senha</Label>
        <Input id="nova-senha" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} aria-invalid={!!error} />
        <FieldError message={error ?? undefined} />
      </div>
      <Button type="submit" size="lg" className="w-full" disabled={busy}>
        {busy ? "Salvando…" : "Salvar senha"}
      </Button>
    </form>
  );
}
