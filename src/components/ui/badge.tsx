import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold [&_svg]:size-4",
  {
    variants: {
      tone: {
        neutral: "bg-surface-muted text-foreground",
        primary: "bg-primary-soft text-foreground",
        lavender: "bg-lavender-soft text-foreground",
        sky: "bg-sky-soft text-foreground",
        danger: "bg-danger-soft text-danger",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export function Badge({
  className,
  tone,
  ...props
}: ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
