"use client";

import { Gamepad2, HeartHandshake, Home, LifeBuoy, MessageCircle, Settings2, UserRound, Waves } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Logo } from "./logo";

const NAV = [
  { href: "/", label: "Início", icon: Home },
  { href: "/conversar", label: "Conversar", icon: MessageCircle },
  { href: "/sons", label: "Sons", icon: Waves },
  { href: "/jogos", label: "Jogos", icon: Gamepad2 },
] as const;

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function SiteHeader() {
  const pathname = usePathname();
  return (
    <>
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2 sm:px-6">
          <Logo />
          <nav aria-label="Principal" className="hidden items-center gap-1 md:flex">
            {NAV.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                aria-current={isActive(pathname, href) ? "page" : undefined}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 font-medium text-foreground-muted hover:bg-surface-muted hover:text-foreground aria-[current=page]:bg-primary-soft aria-[current=page]:text-foreground"
              >
                <Icon className="size-5" aria-hidden />
                {label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-1">
            <Link
              href="/ajuda"
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-lavender-soft px-3 font-semibold hover:bg-surface-muted"
            >
              <LifeBuoy className="size-5" aria-hidden />
              <span>Ajuda agora</span>
            </Link>
            <Link
              href="/configuracoes"
              aria-label="Configurações de acessibilidade"
              aria-current={isActive(pathname, "/configuracoes") ? "page" : undefined}
              className="inline-flex size-11 items-center justify-center rounded-xl text-foreground-muted hover:bg-surface-muted aria-[current=page]:bg-primary-soft"
            >
              <Settings2 className="size-5" aria-hidden />
            </Link>
            <Link
              href="/conta"
              aria-label="Minha conta e privacidade"
              aria-current={isActive(pathname, "/conta") ? "page" : undefined}
              className="hidden size-11 items-center justify-center rounded-xl text-foreground-muted hover:bg-surface-muted aria-[current=page]:bg-primary-soft sm:inline-flex"
            >
              <UserRound className="size-5" aria-hidden />
            </Link>
          </div>
        </div>
      </header>

      {/* Navegação inferior no celular: alcance fácil com o polegar. */}
      <nav
        aria-label="Principal (celular)"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm md:hidden"
      >
        <ul className="grid grid-cols-5">
          {[...NAV, { href: "/conta", label: "Conta", icon: HeartHandshake }].map(({ href, label, icon: Icon }) => (
            <li key={href}>
              <Link
                href={href}
                aria-current={isActive(pathname, href) ? "page" : undefined}
                className={cn(
                  "flex min-h-16 flex-col items-center justify-center gap-1 text-xs font-semibold text-foreground-muted",
                  "aria-[current=page]:text-foreground",
                )}
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
