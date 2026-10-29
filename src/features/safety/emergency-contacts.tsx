"use client";

import { ExternalLink, Phone } from "lucide-react";
import { useEffect, useState } from "react";
import { DEFAULT_EMERGENCY_CONTACTS } from "@/lib/safety/emergency";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { EmergencyContacts } from "@/types/domain";

/** Lê os contatos configurados (chave pública em app_settings); usa o padrão se falhar. */
export function useEmergencyContacts(initial?: EmergencyContacts): EmergencyContacts {
  const [contacts, setContacts] = useState<EmergencyContacts>(initial ?? DEFAULT_EMERGENCY_CONTACTS);
  useEffect(() => {
    if (initial) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await getBrowserSupabase()
          .from("app_settings")
          .select("value")
          .eq("key", "public.emergency_contacts")
          .maybeSingle();
        const value = data?.value as EmergencyContacts | undefined;
        if (!cancelled && value?.contacts?.length) setContacts(value);
      } catch {
        // mantém o padrão
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initial]);
  return contacts;
}

export function EmergencyContactList({
  contacts,
  compact = false,
  className,
}: {
  contacts: EmergencyContacts;
  compact?: boolean;
  className?: string;
}) {
  return (
    <ul className={cn("grid gap-3", !compact && "sm:grid-cols-2", className)}>
      {contacts.contacts.map((contact) => (
        <li key={contact.id} className="rounded-xl border border-border bg-surface p-4">
          <a
            href={`tel:${contact.phone.replace(/\D/g, "")}`}
            className="flex min-h-12 items-center gap-3 rounded-xl font-semibold"
          >
            <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Phone className="size-5" aria-hidden />
            </span>
            <span>
              <span className="block text-2xl leading-none">{contact.phone}</span>
              <span className="mt-1 block text-base">{contact.name}</span>
            </span>
          </a>
          {!compact && <p className="mt-2 text-sm text-foreground-muted">{contact.description}</p>}
          {!compact && contact.url && (
            <a
              href={contact.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-primary underline underline-offset-4"
            >
              Site oficial <ExternalLink className="size-4" aria-hidden />
              <span className="sr-only">(abre em nova aba)</span>
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}
