import Link from "next/link";
import { cn } from "@/lib/utils";

/** Marca provisória: uma folha simples dentro de um círculo suave. */
export function Logo({ className, href = "/" }: { className?: string; href?: string }) {
  return (
    <Link
      href={href}
      className={cn("inline-flex min-h-11 items-center gap-2.5 rounded-xl font-semibold", className)}
    >
      <span className="inline-flex size-9 items-center justify-center rounded-full bg-primary-soft" aria-hidden>
        <svg viewBox="0 0 24 24" className="size-5 text-primary" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M5 19c0-8 6-13 14-14-1 8-6 14-14 14Z" />
          <path d="M5 19c3-4 6-7 10-9" />
        </svg>
      </span>
      <span className="text-xl tracking-tight">Acolher</span>
    </Link>
  );
}
