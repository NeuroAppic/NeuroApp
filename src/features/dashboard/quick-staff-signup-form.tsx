"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/field";
import { getBrowserSupabase } from "@/lib/supabase/client";

const schema = z.object({
  email: z.email("Informe um e-mail válido (ex.: seunome@gmail.com)."),
  password: z.string().min(8, "Use pelo menos 8 caracteres.").max(72, "Use até 72 caracteres."),
});
type Values = z.infer<typeof schema>;

/** Cadastro simplificado (modo de teste): só e-mail e senha, acesso na hora. */
export function QuickStaffSignupForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  async function onSubmit(values: Values) {
    setError(null);
    const response = await fetch("/api/dashboard/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
      setError(body?.error?.message ?? "Não foi possível criar o cadastro agora.");
      return;
    }
    const supabase = getBrowserSupabase();
    // Se este navegador tinha uma sessão de visitante, ela é encerrada antes.
    await supabase.auth.signOut();
    const { error: signInError } = await supabase.auth.signInWithPassword(values);
    if (signInError) {
      setError("Cadastro criado. Entre com seu e-mail e senha na tela de login.");
      return;
    }
    router.replace("/dashboard/atendimentos");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4" noValidate>
      <div>
        <Label htmlFor="rapido-email">E-mail</Label>
        <Input id="rapido-email" type="email" autoComplete="email" placeholder="seunome@gmail.com" aria-invalid={!!errors.email} {...register("email")} />
        <FieldError message={errors.email?.message} />
      </div>
      <div>
        <Label htmlFor="rapido-senha">Senha</Label>
        <Input id="rapido-senha" type="password" autoComplete="new-password" aria-invalid={!!errors.password} {...register("password")} />
        <FieldError message={errors.password?.message} />
      </div>
      {error && (
        <p role="alert" className="rounded-xl bg-danger-soft p-3 text-sm font-medium text-danger">
          {error}
        </p>
      )}
      <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? "Criando…" : "Criar conta e entrar"}
      </Button>
    </form>
  );
}
