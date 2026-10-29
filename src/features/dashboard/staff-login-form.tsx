"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/field";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { staffLoginSchema } from "@/lib/validation/schemas";

type Values = z.infer<typeof staffLoginSchema>;

export function StaffLoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);
  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(staffLoginSchema) });

  async function onSubmit(values: Values) {
    setError(null);
    const supabase = getBrowserSupabase();
    // Se havia sessão de visitante neste navegador, ela é encerrada antes.
    await supabase.auth.signOut();
    const { error: signInError } = await supabase.auth.signInWithPassword(values);
    if (signInError) {
      setError("E-mail ou senha incorretos.");
      return;
    }
    router.replace("/dashboard");
    router.refresh();
  }

  async function sendReset() {
    const email = getValues("email");
    if (!email) {
      setError("Informe o e-mail para recuperar a senha.");
      return;
    }
    await getBrowserSupabase().auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/confirm?next=/dashboard`,
    });
    // Mensagem neutra: não revela se o e-mail existe.
    setResetSent(true);
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4" noValidate>
      <div>
        <Label htmlFor="email">E-mail</Label>
        <Input id="email" type="email" autoComplete="username" aria-invalid={!!errors.email} aria-describedby="email-erro" {...register("email")} />
        <FieldError id="email-erro" message={errors.email?.message} />
      </div>
      <div>
        <Label htmlFor="senha">Senha</Label>
        <Input id="senha" type="password" autoComplete="current-password" aria-invalid={!!errors.password} aria-describedby="senha-erro" {...register("password")} />
        <FieldError id="senha-erro" message={errors.password?.message} />
      </div>
      {error && (
        <p role="alert" className="rounded-xl bg-danger-soft p-3 text-sm font-medium text-danger">
          {error}
        </p>
      )}
      {resetSent && (
        <p role="status" className="rounded-xl bg-primary-soft p-3 text-sm">
          Se o e-mail estiver cadastrado, você receberá um link para criar uma nova senha.
        </p>
      )}
      <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? "Entrando…" : "Entrar"}
      </Button>
      <Button variant="link" className="w-full" onClick={sendReset}>
        Esqueci minha senha
      </Button>
    </form>
  );
}
