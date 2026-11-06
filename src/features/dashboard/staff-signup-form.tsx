"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { MailCheck } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { staffSignupSchema, type StaffSignupInput } from "@/lib/validation/schemas";

/**
 * Autocadastro de psicólogo(a). Os dados profissionais vão nos metadados da
 * conta e o banco cria o perfil SEMPRE pendente e sem acesso a conversas
 * (ver migração 20261106000100_staff_self_signup.sql).
 */
export function StaffSignupForm() {
  const [status, setStatus] = useState<"idle" | "check_email" | "ready" | "error">("idle");
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<StaffSignupInput>({
    resolver: zodResolver(staffSignupSchema),
    defaultValues: { professionalTitle: "Psicóloga(o)" },
  });

  async function onSubmit(raw: StaffSignupInput) {
    setServerError(null);
    const values = staffSignupSchema.parse(raw);
    const supabase = getBrowserSupabase();
    // Se este navegador tinha uma sessão de visitante, ela é encerrada antes.
    await supabase.auth.signOut();
    const { data, error } = await supabase.auth.signUp({
      email: values.email,
      password: values.password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/confirm?next=/dashboard`,
        data: {
          staff_signup: {
            full_name: values.fullName,
            display_name: values.displayName,
            professional_title: values.professionalTitle,
            professional_registry: values.professionalRegistry,
          },
        },
      },
    });
    if (error) {
      setStatus("error");
      setServerError(
        error.message.toLowerCase().includes("already")
          ? "Este e-mail já tem cadastro. Use “Entrar” ou “Esqueci minha senha”."
          : "Não foi possível concluir o cadastro agora. Tente novamente.",
      );
      return;
    }
    // Com confirmação de e-mail ativa (padrão), não há sessão até confirmar.
    setStatus(data.session ? "ready" : "check_email");
  }

  if (status === "check_email" || status === "ready") {
    return (
      <Notice tone="primary" icon={<MailCheck aria-hidden />} className="mt-6" role="status">
        {status === "check_email" ? (
          <>
            <p className="font-semibold">Cadastro recebido. Confirme seu e-mail.</p>
            <p className="mt-1">
              Enviamos um link de confirmação. Depois de confirmar, entre no painel. Seu acesso a
              atendimentos será liberado quando a administração validar o seu registro profissional.
            </p>
          </>
        ) : (
          <>
            <p className="font-semibold">Cadastro concluído.</p>
            <p className="mt-1">
              Seu acesso a atendimentos será liberado quando a administração validar o seu registro.{" "}
              <Link href="/dashboard" className="font-semibold underline">Ir para o painel</Link>
            </p>
          </>
        )}
      </Notice>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4" noValidate>
      <Field id="cad-nome" label="Nome completo" error={errors.fullName?.message}>
        <Input id="cad-nome" autoComplete="name" aria-invalid={!!errors.fullName} {...register("fullName")} />
      </Field>
      <Field id="cad-exibicao" label="Como as pessoas atendidas vão ver seu nome" hint="Ex.: Ana" error={errors.displayName?.message}>
        <Input id="cad-exibicao" aria-invalid={!!errors.displayName} {...register("displayName")} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="cad-titulo" label="Título profissional" error={errors.professionalTitle?.message}>
          <Input id="cad-titulo" {...register("professionalTitle")} />
        </Field>
        <Field id="cad-crp" label="Registro (CRP)" hint="Ex.: CRP 06/123456" error={errors.professionalRegistry?.message}>
          <Input id="cad-crp" aria-invalid={!!errors.professionalRegistry} {...register("professionalRegistry")} />
        </Field>
      </div>
      <Field id="cad-email" label="E-mail" error={errors.email?.message}>
        <Input id="cad-email" type="email" autoComplete="email" aria-invalid={!!errors.email} {...register("email")} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="cad-senha" label="Senha" hint="Pelo menos 10 caracteres" error={errors.password?.message}>
          <Input id="cad-senha" type="password" autoComplete="new-password" aria-invalid={!!errors.password} {...register("password")} />
        </Field>
        <Field id="cad-senha2" label="Repita a senha" error={errors.passwordConfirm?.message}>
          <Input id="cad-senha2" type="password" autoComplete="new-password" aria-invalid={!!errors.passwordConfirm} {...register("passwordConfirm")} />
        </Field>
      </div>
      <div>
        <label className="flex items-start gap-3">
          <input type="checkbox" className="mt-1 size-5 shrink-0 accent-[var(--primary)]" {...register("declaration")} />
          <span className="text-sm">
            Declaro que sou psicólogo(a) com registro ativo no conselho e que vou atender seguindo o Código
            de Ética Profissional e as normas para serviços mediados por tecnologia.
          </span>
        </label>
        <FieldError message={errors.declaration?.message} />
      </div>
      {serverError && (
        <p role="alert" className="rounded-xl bg-danger-soft p-3 text-sm font-medium text-danger">
          {serverError}
        </p>
      )}
      <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? "Enviando…" : "Criar cadastro"}
      </Button>
    </form>
  );
}

function Field({ id, label, hint, error, children }: { id: string; label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      {hint && <p className="text-sm text-foreground-muted">{hint}</p>}
      <div className="mt-1">{children}</div>
      <FieldError message={error} />
    </div>
  );
}
