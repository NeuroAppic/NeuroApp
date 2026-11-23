import Image from "next/image";
import Link from "next/link";
import completo from "@/assets/brand/neuro-app-completo.png";
import comNome from "@/assets/brand/neuro-app-nome.png";
import simbolo from "@/assets/brand/neuro-app-simbolo.png";
import { cn } from "@/lib/utils";

/** Símbolo do Neuro App (peças de quebra-cabeça com a margarida). Decorativo: o nome vem ao lado. */
export function LogoMark({ className, size = 32 }: { className?: string; size?: number }) {
  return (
    <Image
      src={simbolo}
      alt=""
      width={size}
      height={size}
      className={cn("shrink-0 rounded-lg", className)}
      priority
    />
  );
}

/** Logo grande para telas de entrada: com o nome e, opcionalmente, "Respeito e inclusão". */
export function LogoBadge({
  withTagline = true,
  size = 144,
  className,
}: {
  withTagline?: boolean;
  size?: number;
  className?: string;
}) {
  return (
    <Image
      src={withTagline ? completo : comNome}
      alt={withTagline ? "Neuro App — respeito e inclusão" : "Neuro App"}
      width={size}
      height={size}
      className={cn("rounded-3xl", className)}
      priority
    />
  );
}

export function Logo({ className, href = "/" }: { className?: string; href?: string }) {
  return (
    <Link href={href} className={cn("inline-flex min-h-11 items-center gap-2.5 rounded-lg", className)}>
      <LogoMark />
      <span className="text-lg font-semibold tracking-tight">
        Neuro <span className="font-normal text-foreground-muted">App</span>
      </span>
    </Link>
  );
}
