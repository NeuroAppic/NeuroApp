import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

const tones = {
  neutral: "bg-surface-muted",
  primary: "bg-primary-soft",
  lavender: "bg-lavender-soft",
  sky: "bg-sky-soft",
  danger: "bg-danger-soft text-danger",
} as const;

/** Aviso discreto embutido na página (nunca pop-up). */
export function Notice({
  tone = "neutral",
  icon,
  className,
  children,
  ...props
}: ComponentProps<"div"> & { tone?: keyof typeof tones; icon?: ReactNode }) {
  return (
    <div
      className={cn(
        "flex gap-3 rounded-xl p-4 [&_svg]:mt-0.5 [&_svg]:size-5 [&_svg]:shrink-0",
        tones[tone],
        className,
      )}
      {...props}
    >
      {icon}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
