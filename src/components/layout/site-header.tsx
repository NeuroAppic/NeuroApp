"use client";

import { Gamepad2, LifeBuoy, MessageCircle, Settings2, UserRound, Waves } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Logo } from "./logo";

const NAV = [
  { href: "/", label: "Conversa", icon: MessageCircle },
  { href: "/sons", label: "Sons", icon: Waves },
  { href: "/jogos", label: "Jogos", icon: Gamepad2 },
] as const;

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

const iconLink =
  "inline-flex size-11 items-center justify-center rounded-lg text-foreground-muted hover:bg-surface-muted hover:text-foreground aria-[current=page]:bg-surface-muted aria-[current=page]:text-foreground";

export function SiteHeader() {
  const pathname = usePathname();
  return (
    <>
      <header className="sticky top-0 z-40 h-14 shrink-0 border-b border-border bg-background/90 backdrop-blur-sm">
        <div className="mx-auto flex h-full max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <Logo />
          <nav aria-label="Principal" className="hidden items-center gap-1 md:flex">
            {NAV.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                aria-current={isActive(pathname, href) ? "page" : undefined}
                className="inline-flex min-h-11 items-center rounded-lg px-3 font-medium text-foreground-muted hover:text-foreground aria-[current=page]:font-semibold aria-[current=page]:text-foreground"
              >
                {label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-0.5">
            {/* Acesso rápido e discreto aos contatos de emergência (CVV, SAMU). */}
            <Link
              href="/ajuda"
              aria-current={isActive(pathname, "/ajuda") ? "page" : undefined}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2.5 text-sm font-semibold text-accent hover:bg-surface-muted aria-[current=page]:bg-surface-muted"
            >
              <LifeBuoy className="size-4" aria-hidden />
              Ajuda
            </Link>
            <Link
              href="/configuracoes"
              aria-label="Configurações de acessibilidade"
              aria-current={isActive(pathname, "/configuracoes") ? "page" : undefined}
              className={iconLink}
            >
              <Settings2 className="size-5" aria-hidden />
            </Link>
            <Link
              href="/conta"
              aria-label="Minha conta e privacidade"
              aria-current={isActive(pathname, "/conta") ? "page" : undefined}
              className={cn(iconLink, "hidden md:inline-flex")}
            >
              <UserRound className="size-5" aria-hidden />
            </Link>
          </div>
        </div>
      </header>

      {/* Navegação inferior no celular: alcance fácil com o polegar. */}
      <nav
        aria-label="Principal (celular)"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm md:hidden"
      >
        <ul className="grid grid-cols-4">
          {[...NAV, { href: "/conta", label: "Conta", icon: UserRound }].map(({ href, label, icon: Icon }) => (
            <li key={href}>
              <Link
                href={href}
                aria-current={isActive(pathname, href) ? "page" : undefined}
                className="flex min-h-16 flex-col items-center justify-center gap-0.5 text-xs font-medium text-foreground-muted aria-[current=page]:font-semibold aria-[current=page]:text-foreground"
              >
                <span className="inline-flex h-7 w-12 items-center justify-center rounded-full in-aria-[current=page]:bg-primary-soft">
                  <Icon className="size-5" aria-hidden />
                </span>
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}
