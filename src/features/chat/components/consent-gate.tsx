"use client";

import { Bot, Eye, LifeBuoy, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

/**
 * Aviso transparente antes da primeira mensagem. Sem cadastro: o aceite
 * cria uma sessão anônima e registra o consentimento no banco.
 */
export function ConsentGate({ onAccept, busy, failed }: { onAccept: () => void; busy: boolean; failed: boolean }) {
  return (
    <Card className="animate-gentle-in mx-auto max-w-xl p-6 sm:p-8">
      <h1 className="text-2xl font-bold">Antes de começar</h1>
      <p className="mt-2 text-foreground-muted">Leva poucos segundos. Não é preciso criar conta.</p>

      <ul className="mt-6 space-y-4">
        <Item icon={<Bot aria-hidden />}>
          A conversa começa com um <strong>assistente virtual (inteligência artificial)</strong>. Ele
          não é uma pessoa e não substitui profissionais de saúde.
        </Item>
        <Item icon={<Eye aria-hidden />}>
          As mensagens ficam guardadas. <strong>Profissionais autorizados</strong> da plataforma
          podem ler a conversa para oferecer apoio. Você pode apagar seu histórico quando quiser.
        </Item>
        <Item icon={<ShieldCheck aria-hidden />}>
          Você sempre vai saber se está falando com a IA ou com uma pessoa.
        </Item>
        <Item icon={<LifeBuoy aria-hidden />}>
          Este não é um serviço de emergência. Em perigo imediato, ligue <strong>192</strong> (SAMU)
          ou <strong>188</strong> (CVV).
        </Item>
      </ul>

      {failed && (
        <p role="alert" className="mt-5 rounded-xl bg-danger-soft p-3 font-medium text-danger">
          Não foi possível começar agora. Verifique a conexão e tente de novo.
        </p>
      )}

      <div className="mt-7 flex flex-col gap-3">
        <Button size="lg" onClick={onAccept} disabled={busy}>
          {busy ? "Preparando…" : "Entendi, quero começar"}
        </Button>
        <Link
          href="/privacidade"
          className="inline-flex min-h-11 items-center justify-center font-semibold text-primary underline underline-offset-4"
        >
          Ler a política de privacidade
        </Link>
      </div>
    </Card>
  );
}

function Item({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft [&_svg]:size-5">
        {icon}
      </span>
      <p>{children}</p>
    </li>
  );
}
