"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/field";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { MfaSetup } from "./mfa-setup";

export function MfaChallenge() {
  const router = useRouter();
  const [factorId, setFactorId] = useState<string | null | undefined>(undefined);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void getBrowserSupabase()
      .auth.mfa.listFactors()
      .then(({ data }) => setFactorId(data?.totp[0]?.id ?? null));
  }, []);

  async function verify() {
    if (!factorId) return;
    const { error: verifyError } = await getBrowserSupabase().auth.mfa.challengeAndVerify({ factorId, code: code.trim() });
    if (verifyError) return setError("Código inválido.");
    router.replace("/dashboard");
    router.refresh();
  }

  if (factorId === undefined) return <p className="mt-3 text-foreground-muted">Carregando…</p>;
  if (factorId === null) {
    return (
      <div className="mt-3">
        <p>O acesso ao painel exige verificação em duas etapas. Cadastre um aplicativo autenticador para continuar.</p>
        <MfaSetup currentLevel="aal1" />
      </div>
    );
  }
  return (
    <div className="mt-4 space-y-3">
      <Label htmlFor="codigo">Código do aplicativo autenticador</Label>
      <Input id="codigo" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} />
      {error && <p role="alert" className="text-sm font-medium text-danger">{error}</p>}
      <Button className="w-full" onClick={verify} disabled={code.trim().length !== 6}>Verificar</Button>
    </div>
  );
}
