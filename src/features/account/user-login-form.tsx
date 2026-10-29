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

export function UserLoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(staffLoginSchema) });

  async function onSubmit(values: Values) {
    setError(null);
    const { error: signInError } = await getBrowserSupabase().auth.signInWithPassword(values);
    if (signInError) {
      setError("E-mail ou senha incorretos.");
      return;
    }
    router.replace("/conta");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4" noValidate>
      <div>
        <Label htmlFor="login-email">E-mail</Label>
        <Input id="login-email" type="email" autoComplete="username" aria-invalid={!!errors.email} {...register("email")} />
        <FieldError message={errors.email?.message} />
      </div>
      <div>
        <Label htmlFor="login-senha">Senha</Label>
        <Input id="login-senha" type="password" autoComplete="current-password" aria-invalid={!!errors.password} {...register("password")} />
        <FieldError message={errors.password?.message} />
      </div>
      {error && <p role="alert" className="rounded-xl bg-danger-soft p-3 text-sm font-medium text-danger">{error}</p>}
      <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? "Entrando…" : "Entrar"}
      </Button>
    </form>
  );
}
