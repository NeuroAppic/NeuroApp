"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FieldError, Input, Label } from "@/components/ui/field";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { formatRelative } from "@/lib/utils";
import { staffCreateSchema, type StaffCreateInput } from "@/lib/validation/schemas";
import type { StaffMember, StaffRole } from "@/types/domain";

const ROLE_LABEL: Record<StaffRole, string> = {
  superadmin: "Superadministrador",
  admin: "Administrador",
  psychologist: "Psicólogo(a)",
};

export function StaffManager({
  staff,
  currentUserId,
  isSuperadmin,
}: {
  staff: StaffMember[];
  currentUserId: string;
  isSuperadmin: boolean;
}) {
  const router = useRouter();
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  async function rpc(fn: string, args: Record<string, unknown>, success: string) {
    setMessage(null);
    const { error } = await getBrowserSupabase().rpc(fn, args);
    if (error) {
      const text = error.message.includes("last_superadmin")
        ? "É preciso manter pelo menos um superadministrador."
        : error.message.includes("cannot_change_self")
          ? "Você não pode desativar a própria conta."
          : "Você não tem permissão para esta ação ou os dados são inválidos.";
      setMessage({ tone: "error", text });
      return;
    }
    setMessage({ tone: "ok", text: success });
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Equipe</h1>
          <p className="text-foreground-muted">
            Cadastre psicólogos com e-mail e senha e gerencie acessos. Toda ação fica registrada na auditoria.
          </p>
        </div>
        <CreateStaffDialog
          isSuperadmin={isSuperadmin}
          onDone={(text) => {
            setMessage({ tone: "ok", text });
            router.refresh();
          }}
        />
      </header>

      {message && (
        <p
          role={message.tone === "error" ? "alert" : "status"}
          className={message.tone === "error" ? "rounded-xl bg-danger-soft p-3 font-medium text-danger" : "rounded-xl bg-primary-soft p-3"}
        >
          {message.text}
        </p>
      )}

      {staff.length === 0 ? (
        <p className="text-foreground-muted">Ninguém cadastrado ainda.</p>
      ) : (
        <ul className="grid gap-3">
          {staff.map((member) => {
            const isSelf = member.user_id === currentUserId;
            return (
              <li key={member.user_id}>
                <Card className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">
                        {member.display_name} {isSelf && <span className="text-foreground-muted">(você)</span>}
                      </p>
                      <p className="text-sm text-foreground-muted">
                        Aparece no chat como “{member.display_name}
                        {member.professional_title ? ` · ${member.professional_title}` : ""}”
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {member.roles.map((r) => (
                          <Badge key={r} tone="lavender">{ROLE_LABEL[r]}</Badge>
                        ))}
                        {!member.is_active && <Badge tone="danger">Desativado</Badge>}
                        {member.is_active && member.availability === "available" && <Badge tone="primary">Disponível</Badge>}
                        {member.is_active && member.last_seen_at && (
                          <Badge tone="neutral">Visto {formatRelative(member.last_seen_at)}</Badge>
                        )}
                      </div>
                    </div>
                    {!isSelf && (
                      <div className="flex flex-wrap gap-2">
                        {member.is_active ? (
                          <Button
                            size="sm"
                            variant="danger"
                            onClick={() =>
                              rpc("admin_set_staff_active", { p_user_id: member.user_id, p_active: false }, "Acesso revogado. Atendimentos ativos voltaram para a fila.")
                            }
                          >
                            Desativar acesso
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => rpc("admin_set_staff_active", { p_user_id: member.user_id, p_active: true }, "Acesso reativado.")}
                          >
                            Reativar
                          </Button>
                        )}
                        {isSuperadmin && (
                          <RolesDialog
                            member={member}
                            onSave={(roles) => rpc("admin_set_roles", { p_user_id: member.user_id, p_roles: roles }, "Papéis atualizados.")}
                          />
                        )}
                      </div>
                    )}
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function RolesDialog({ member, onSave }: { member: StaffMember; onSave: (roles: StaffRole[]) => void }) {
  const [roles, setRoles] = useState<StaffRole[]>(member.roles);
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost">Papéis</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Papéis de {member.display_name}</DialogTitle>
        <DialogDescription>Papéis administrativos não dão acesso ao conteúdo das conversas.</DialogDescription>
        <fieldset className="mt-4 space-y-2">
          <legend className="sr-only">Papéis</legend>
          {(Object.keys(ROLE_LABEL) as StaffRole[]).map((role) => (
            <label key={role} className="flex min-h-11 items-center gap-3">
              <input
                type="checkbox"
                className="size-5 accent-[var(--primary)]"
                checked={roles.includes(role)}
                onChange={(e) => setRoles(e.target.checked ? [...roles, role] : roles.filter((r) => r !== role))}
              />
              {ROLE_LABEL[role]}
            </label>
          ))}
        </fieldset>
        <Button className="mt-4 w-full" disabled={roles.length === 0} onClick={() => onSave(roles)}>
          Salvar papéis
        </Button>
      </DialogContent>
    </Dialog>
  );
}

/** Cadastro direto: a conta nasce confirmada e ativa, pronta para entrar. */
function CreateStaffDialog({ isSuperadmin, onDone }: { isSuperadmin: boolean; onDone: (text: string) => void }) {
  const [open, setOpen] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<StaffCreateInput>({
    resolver: zodResolver(staffCreateSchema),
    defaultValues: { roles: ["psychologist"], displayName: "" },
  });

  async function onSubmit(values: StaffCreateInput) {
    setServerError(null);
    const response = await fetch("/api/dashboard/staff", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
      setServerError(body?.error?.message ?? "Não foi possível criar a conta.");
      return;
    }
    reset();
    setOpen(false);
    onDone(`Conta criada. ${values.email} já pode entrar em /dashboard/entrar com a senha cadastrada.`);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <UserPlus aria-hidden /> Cadastrar psicólogo(a)
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Cadastrar psicólogo(a)</DialogTitle>
        <DialogDescription>
          A conta é criada já confirmada. Passe o e-mail e a senha para a pessoa: ela entra direto no painel e
          pode assumir atendimentos.
        </DialogDescription>
        <form onSubmit={handleSubmit(onSubmit)} className="mt-5 space-y-4" noValidate>
          <Field id="novo-email" label="E-mail" error={errors.email?.message}>
            <Input id="novo-email" type="email" autoComplete="off" placeholder="nome@gmail.com" aria-invalid={!!errors.email} {...register("email")} />
          </Field>
          <Field id="novo-senha" label="Senha" hint="Pelo menos 8 caracteres" error={errors.password?.message}>
            <Input id="novo-senha" type="password" autoComplete="new-password" aria-invalid={!!errors.password} {...register("password")} />
          </Field>
          <Field
            id="novo-nome"
            label="Nome exibido no chat (opcional)"
            hint="Se ficar vazio, usamos o começo do e-mail. Ex.: ana.souza@… → Ana Souza"
            error={errors.displayName?.message}
          >
            <Input id="novo-nome" aria-invalid={!!errors.displayName} {...register("displayName")} />
          </Field>
          {isSuperadmin && (
            <fieldset>
              <legend className="font-semibold">Papéis</legend>
              {(["psychologist", "admin", "superadmin"] as const).map((role) => (
                <label key={role} className="flex min-h-11 items-center gap-3">
                  <input type="checkbox" value={role} className="size-5 accent-[var(--primary)]" {...register("roles")} />
                  {ROLE_LABEL[role]}
                </label>
              ))}
              <FieldError message={errors.roles?.message} />
            </fieldset>
          )}
          {serverError && <p role="alert" className="rounded-xl bg-danger-soft p-3 text-sm font-medium text-danger">{serverError}</p>}
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? "Criando…" : "Criar conta"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
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
