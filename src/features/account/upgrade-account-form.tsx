"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/field";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { accountSchema } from "@/lib/validation/schemas";

type Values = z.infer<typeof accountSchema>;

/**
 * Transforma a sessão de visitante (anônima) em conta com e-mail, mantendo
 * as conversas. O Supabase envia um e-mail de confirmação.
 */
export function UpgradeAccountForm({ onDone }: { onDone: () => void }) {
  const [status, setStatus] = useState<"idle" | "sent" | "error">("idle");
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(accountSchema) });

  async function onSubmit(values: Values) {
    const supabase = getBrowserSupabase();
    const { error } = await supabase.auth.updateUser(
      { email: values.email, password: values.password },
      { emailRedirectTo: `${window.location.origin}/auth/confirm?next=/conta` },
    );
    setStatus(error ? "error" : "sent");
    if (!error) onDone();
  }

  if (status === "sent") {
    return (
      <p role="status" className="mt-4 rounded-xl bg-primary-soft p-3">
        Enviamos um e-mail de confirmação. Depois de confirmar, você poderá entrar com este e-mail em qualquer aparelho.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="mt-4 grid gap-3 sm:grid-cols-2" noValidate>
      <div>
        <Label htmlFor="conta-email">E-mail</Label>
        <Input id="conta-email" type="email" autoComplete="email" aria-invalid={!!errors.email} {...register("email")} />
        <FieldError message={errors.email?.message} />
      </div>
      <div>
        <Label htmlFor="conta-senha">Senha</Label>
        <Input id="conta-senha" type="password" autoComplete="new-password" aria-invalid={!!errors.password} {...register("password")} />
        <FieldError message={errors.password?.message} />
      </div>
      {status === "error" && (
        <p role="alert" className="text-sm font-medium text-danger sm:col-span-2">
          Não foi possível criar a conta. Este e-mail pode já estar em uso.
        </p>
      )}
      <Button type="submit" variant="secondary" disabled={isSubmitting} className="sm:col-span-2 sm:justify-self-start">
        Criar conta com e-mail
      </Button>
    </form>
  );
}
