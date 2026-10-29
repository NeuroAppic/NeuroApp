import type { Metadata } from "next";
import { PrivacyCenter } from "@/features/account/privacy-center";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const metadata: Metadata = { title: "Minha conta e privacidade" };

export default function ContaPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <h1 className="text-3xl font-bold">Minha conta e privacidade</h1>
      <p className="mt-2 text-foreground-muted">
        Veja o que está guardado, quem pode acessar e apague o que quiser.
      </p>
      {isSupabaseConfigured() ? (
        <PrivacyCenter />
      ) : (
        <p className="mt-6 rounded-xl bg-sky-soft p-4">Contas indisponíveis neste ambiente (Supabase não configurado).</p>
      )}
    </div>
  );
}
