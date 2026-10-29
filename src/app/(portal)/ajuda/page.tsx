import { HandHeart, Info } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { EmergencyContactList } from "@/features/safety/emergency-contacts";
import { DEFAULT_EMERGENCY_CONTACTS, SAFETY_COPY } from "@/lib/safety/emergency";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getServerSupabase } from "@/lib/supabase/server";
import type { EmergencyContacts } from "@/types/domain";

// Os contatos vêm da configuração atual do banco a cada requisição.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Ajuda agora" };

async function loadContacts(): Promise<EmergencyContacts> {
  if (!isSupabaseConfigured()) return DEFAULT_EMERGENCY_CONTACTS;
  try {
    const supabase = await getServerSupabase();
    const { data } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "public.emergency_contacts")
      .maybeSingle();
    const value = data?.value as EmergencyContacts | undefined;
    return value?.contacts?.length ? value : DEFAULT_EMERGENCY_CONTACTS;
  } catch {
    return DEFAULT_EMERGENCY_CONTACTS;
  }
}

export default async function AjudaPage() {
  const contacts = await loadContacts();
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <h1 className="text-3xl font-bold">Ajuda agora</h1>
      <p className="mt-3 text-lg">
        Se você está em perigo ou pode se machucar, ligue agora. Do outro lado há pessoas
        preparadas para ajudar.
      </p>

      <EmergencyContactList contacts={contacts} className="mt-6" />

      <Notice tone="neutral" icon={<Info aria-hidden />} className="mt-6">
        <p>
          {SAFETY_COPY.disclaimer} Se possível, fique perto de alguém de confiança ou procure o
          pronto-socorro mais próximo.
        </p>
      </Notice>

      <h2 className="mt-10 text-xl font-semibold">Se você prefere conversar aqui</h2>
      <p className="mt-2 text-foreground-muted">
        O assistente virtual pode acolher você agora. Você também pode pedir para falar com uma
        pessoa da equipe — a tela mostra se há alguém disponível.
      </p>
      <Link href="/conversar" className={`${buttonVariants({ size: "lg" })} mt-4`}>
        <HandHeart aria-hidden /> Ir para a conversa
      </Link>
    </div>
  );
}
