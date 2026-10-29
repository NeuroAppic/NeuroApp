import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/** Botões com área de toque mínima de 44px (WCAG 2.5.8) e estados claros. */
export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors select-none disabled:pointer-events-none disabled:opacity-55 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-foreground hover:bg-primary-hover",
        secondary: "bg-surface text-foreground border border-border hover:bg-surface-muted",
        soft: "bg-primary-soft text-foreground hover:bg-surface-muted",
        lavender: "bg-lavender-soft text-foreground hover:bg-surface-muted",
        ghost: "text-foreground hover:bg-surface-muted",
        danger: "bg-danger-soft text-danger border border-danger/30 hover:bg-surface-muted",
        link: "text-primary underline underline-offset-4 hover:text-primary-hover px-0 min-h-0",
      },
      size: {
        sm: "min-h-11 px-3 text-sm [&_svg]:size-4",
        md: "min-h-12 px-5 text-base [&_svg]:size-5",
        lg: "min-h-14 px-6 text-lg [&_svg]:size-6",
        xl: "min-h-16 px-8 text-xl [&_svg]:size-6",
        icon: "size-11 [&_svg]:size-5",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps extends ComponentProps<"button">, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export function Button({ className, variant, size, asChild = false, type, ...props }: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      className={cn(buttonVariants({ variant, size }), className)}
      {...(asChild ? {} : { type: type ?? "button" })}
      {...props}
    />
  );
}
