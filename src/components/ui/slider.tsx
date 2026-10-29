"use client";

import { Slider as SliderPrimitive } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function Slider({
  className,
  thumbLabel,
  ...props
}: ComponentProps<typeof SliderPrimitive.Root> & { thumbLabel: string }) {
  return (
    <SliderPrimitive.Root
      className={cn("relative flex h-11 w-full touch-none items-center select-none", className)}
      {...props}
    >
      <SliderPrimitive.Track className="relative h-2 grow overflow-hidden rounded-full bg-surface-muted">
        <SliderPrimitive.Range className="absolute h-full bg-primary" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb
        aria-label={thumbLabel}
        className="block size-7 rounded-full border-2 border-primary bg-surface shadow-sm"
      />
    </SliderPrimitive.Root>
  );
}
