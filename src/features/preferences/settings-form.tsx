"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useId, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { TEXT_SCALES } from "@/lib/preferences/preferences";
import { usePreferences } from "@/lib/preferences/preferences-provider";
import { cn } from "@/lib/utils";

const SCALE_LABELS: Record<number, string> = {
  0.95: "Menor",
  1: "Padrão",
  1.125: "Grande",
  1.25: "Maior",
  1.5: "Muito grande",
};

export function SettingsForm() {
  const { preferences, update, reset } = usePreferences();

  return (
    <div className="mt-8 space-y-6">
      <Section title="Visual">
        <fieldset>
          <legend className="font-semibold">Tema</legend>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {(
              [
                { value: "system", label: "Automático", icon: Monitor },
                { value: "light", label: "Claro", icon: Sun },
                { value: "dark", label: "Escuro", icon: Moon },
              ] as const
            ).map(({ value, label, icon: Icon }) => (
              <label
                key={value}
                className={cn(
                  "flex min-h-14 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border px-2 text-sm font-semibold has-focus-visible:outline-3 has-focus-visible:outline-focus",
                  preferences.theme === value ? "border-primary bg-primary-soft" : "border-border",
                )}
              >
                <input
                  type="radio"
                  name="tema"
                  value={value}
                  checked={preferences.theme === value}
                  onChange={() => update({ theme: value })}
                  className="sr-only"
                />
                <Icon className="size-5" aria-hidden />
                {label}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="mt-6">
          <legend className="font-semibold">Tamanho do texto</legend>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
            {TEXT_SCALES.map((scale) => (
              <label
                key={scale}
                className={cn(
                  "flex min-h-12 cursor-pointer items-center justify-center rounded-xl border px-2 text-sm font-semibold has-focus-visible:outline-3 has-focus-visible:outline-focus",
                  preferences.textScale === scale ? "border-primary bg-primary-soft" : "border-border",
                )}
              >
                <input
                  type="radio"
                  name="texto"
                  checked={preferences.textScale === scale}
                  onChange={() => update({ textScale: scale })}
                  className="sr-only"
                />
                {SCALE_LABELS[scale]}
              </label>
            ))}
          </div>
        </fieldset>

        <Toggle
          label="Modo de baixo estímulo"
          description="Cores mais neutras, sem animações e sem elementos decorativos."
          checked={preferences.lowStimulus}
          onChange={(v) => update({ lowStimulus: v })}
        />
        <Toggle
          label="Desativar animações"
          description="Remove movimentos e transições."
          checked={preferences.reduceMotion}
          onChange={(v) => update({ reduceMotion: v })}
        />
        <Toggle
          label="Reduzir elementos decorativos"
          description="Esconde formas e enfeites visuais."
          checked={preferences.reduceDecor}
          onChange={(v) => update({ reduceDecor: v })}
        />
      </Section>

      <Section title="Comunicação com o assistente">
        <Toggle
          label="Prefiro respostas curtas"
          description="O assistente responde com no máximo duas frases."
          checked={preferences.shortAnswers}
          onChange={(v) => update({ shortAnswers: v })}
        />
        <Toggle
          label="Prefiro comunicação objetiva e literal"
          description="Frases diretas, sem expressões figuradas."
          checked={preferences.literalCommunication}
          onChange={(v) => update({ literalCommunication: v })}
        />
        <Toggle
          label="Mostrar estas preferências aos profissionais"
          description="Ajuda a equipe a se comunicar do jeito que você prefere."
          checked={preferences.shareWithProfessionals}
          onChange={(v) => update({ shareWithProfessionals: v })}
        />
      </Section>

      <Section title="Sons e avisos">
        <Toggle
          label="Permitir sons"
          description="Desligado: nenhum som toca no portal, nem nos jogos."
          checked={preferences.soundsEnabled}
          onChange={(v) => update({ soundsEnabled: v })}
        />
        <Toggle
          label="Reduzir avisos"
          description="Mostra apenas avisos essenciais (segurança e mudanças na conversa)."
          checked={preferences.reduceNotifications}
          onChange={(v) => update({ reduceNotifications: v })}
        />
      </Section>

      <div className="flex justify-end">
        <Button variant="ghost" onClick={reset}>
          Voltar ao padrão
        </Button>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="p-5 sm:p-6">
      <h2 className="mb-4 text-xl font-semibold">{title}</h2>
      <div className="divide-y divide-border [&>*]:py-4 [&>*:first-child]:pt-0 [&>*:last-child]:pb-0">
        {children}
      </div>
    </Card>
  );
}

function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <label htmlFor={id} className="font-semibold">
          {label}
        </label>
        <p id={`${id}-d`} className="text-sm text-foreground-muted">
          {description}
        </p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} aria-describedby={`${id}-d`} />
    </div>
  );
}
