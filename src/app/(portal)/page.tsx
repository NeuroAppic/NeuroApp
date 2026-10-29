import { Gamepad2, HeartHandshake, LifeBuoy, MessageCircle, SlidersHorizontal, Sparkles, Waves } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function HomePage() {
  return (
    <>
      <section className="relative overflow-hidden">
        {/* Formas decorativas suaves — ocultadas no modo de baixo estímulo. */}
        <div aria-hidden data-decor className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute -top-24 -right-20 size-80 rounded-full bg-lavender-soft blur-2xl" />
          <div className="absolute top-40 -left-24 size-72 rounded-full bg-primary-soft blur-2xl" />
        </div>

        <div className="mx-auto flex max-w-3xl flex-col items-center px-4 pt-12 pb-10 text-center sm:px-6 sm:pt-20">
          <h1 className="text-[2rem] leading-tight font-bold text-balance sm:text-5xl sm:leading-tight">
            Você não precisa enfrentar este momento sozinho.
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-foreground-muted text-pretty sm:text-xl">
            Este é um espaço para conversar, respirar no seu ritmo e encontrar um pouco de
            tranquilidade. Você pode começar quando se sentir pronto.
          </p>

          <Link
            href="/conversar"
            className={cn(buttonVariants({ size: "xl" }), "mt-9 w-full max-w-sm rounded-2xl")}
          >
            <MessageCircle aria-hidden />
            Quero conversar
          </Link>

          <ul className="mt-4 grid w-full max-w-2xl gap-3 sm:grid-cols-3">
            <li>
              <Link href="/ajuda" className={cn(buttonVariants({ variant: "lavender", size: "lg" }), "w-full text-base")}>
                <LifeBuoy aria-hidden />
                Preciso de ajuda agora
              </Link>
            </li>
            <li>
              <Link href="/sons" className={cn(buttonVariants({ variant: "secondary", size: "lg" }), "w-full text-base")}>
                <Waves aria-hidden />
                Quero ouvir sons relaxantes
              </Link>
            </li>
            <li>
              <Link href="/jogos" className={cn(buttonVariants({ variant: "secondary", size: "lg" }), "w-full text-base")}>
                <Gamepad2 aria-hidden />
                Quero me distrair um pouco
              </Link>
            </li>
          </ul>
        </div>
      </section>

      <section aria-labelledby="como-funciona" className="mx-auto max-w-5xl px-4 pb-12 sm:px-6">
        <h2 id="como-funciona" className="sr-only">
          Como funciona
        </h2>
        <ul className="grid gap-4 md:grid-cols-3">
          <InfoCard icon={<Sparkles aria-hidden />} title="Começa com um assistente virtual" tone="bg-primary-soft">
            A conversa começa com uma inteligência artificial. Ela não é uma pessoa nem substitui
            profissionais de saúde.
          </InfoCard>
          <InfoCard icon={<HeartHandshake aria-hidden />} title="Pessoas, quando disponíveis" tone="bg-lavender-soft">
            Você pode pedir para falar com um profissional. A tela mostra com honestidade se há
            alguém disponível.
          </InfoCard>
          <InfoCard icon={<SlidersHorizontal aria-hidden />} title="Tudo no seu ritmo" tone="bg-sky-soft">
            Ajuste cores, tamanho do texto, movimento e o jeito das respostas em{" "}
            <Link href="/configuracoes" className="font-semibold underline underline-offset-4">
              Configurações
            </Link>
            .
          </InfoCard>
        </ul>
      </section>
    </>
  );
}

function InfoCard({
  icon,
  title,
  tone,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  tone: string;
  children: React.ReactNode;
}) {
  return (
    <li className="rounded-2xl border border-border bg-surface p-5 shadow-soft">
      <span className={cn("inline-flex size-11 items-center justify-center rounded-xl [&_svg]:size-5", tone)}>
        {icon}
      </span>
      <h3 className="mt-3 text-lg font-semibold">{title}</h3>
      <p className="mt-1 text-foreground-muted">{children}</p>
    </li>
  );
}
