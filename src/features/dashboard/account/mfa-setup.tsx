"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/field";
import { getBrowserSupabase } from "@/lib/supabase/client";

/** Cadastro de autenticador TOTP (Supabase Auth MFA). */
export function MfaSetup({ currentLevel }: { currentLevel: "aal1" | "aal2" | null }) {
  const router = useRouter();
  const [verifiedFactors, setVerifiedFactors] = useState<number | null>(null);
  const [enrollment, setEnrollment] = useState<{ id: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void getBrowserSupabase()
      .auth.mfa.listFactors()
      .then(({ data }) => setVerifiedFactors(data?.totp.length ?? 0));
  }, []);

  async function start() {
    setError(null);
    const { data, error: enrollError } = await getBrowserSupabase().auth.mfa.enroll({ factorType: "totp" });
    if (enrollError || !data) return setError("Não foi possível iniciar o cadastro.");
    setEnrollment({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
  }

  async function verify() {
    if (!enrollment) return;
    setError(null);
    const { error: verifyError } = await getBrowserSupabase().auth.mfa.challengeAndVerify({
      factorId: enrollment.id,
      code: code.trim(),
    });
    if (verifyError) return setError("Código inválido. Confira o horário do aparelho e tente de novo.");
    setEnrollment(null);
    setVerifiedFactors((n) => (n ?? 0) + 1);
    router.refresh();
  }

  if (verifiedFactors === null) return <p className="mt-2 text-foreground-muted">Carregando…</p>;

  if (verifiedFactors > 0 && !enrollment) {
    return (
      <p className="mt-2 text-foreground-muted">
        Ativada. Nível da sessão atual: {currentLevel === "aal2" ? "verificada" : "senha apenas (verifique ao entrar)"}.
      </p>
    );
  }

  return (
    <div className="mt-2 space-y-3">
      {!enrollment ? (
        <>
          <p className="text-foreground-muted">Recomendado para todos os acessos profissionais e administrativos.</p>
          <Button variant="secondary" onClick={start}>Ativar com aplicativo autenticador</Button>
        </>
      ) : (
        <>
          <p>Escaneie o código com o aplicativo autenticador ou digite a chave.</p>
          {/* eslint-disable-next-line @next/next/no-img-element -- QR em data URI gerado pelo Supabase */}
          <img src={enrollment.qr} alt="Código QR para o aplicativo autenticador" className="size-44 rounded-xl bg-white p-2" />
          <p className="font-mono text-sm break-all">{enrollment.secret}</p>
          <Label htmlFor="codigo-mfa">Código de 6 dígitos</Label>
          <div className="flex gap-2">
            <Input id="codigo-mfa" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} />
            <Button onClick={verify} disabled={code.trim().length !== 6}>Confirmar</Button>
          </div>
        </>
      )}
      {error && <p role="alert" className="text-sm font-medium text-danger">{error}</p>}
    </div>
  );
}
