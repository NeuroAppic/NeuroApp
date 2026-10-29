import type { Metadata } from "next";
import { SettingsForm } from "@/features/preferences/settings-form";

export const metadata: Metadata = { title: "Configurações" };

export default function ConfiguracoesPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
      <h1 className="text-3xl font-bold">Configurações</h1>
      <p className="mt-2 text-foreground-muted">
        Ajuste o portal ao que é confortável para você. As mudanças valem na hora e ficam salvas.
      </p>
      <SettingsForm />
    </div>
  );
}
