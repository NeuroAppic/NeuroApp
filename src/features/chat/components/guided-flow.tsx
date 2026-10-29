"use client";

import { ArrowLeft, Send, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { GUIDED_STEPS, type GuidedOption, type GuidedStepId } from "../content";

/**
 * Comunicação alternativa: no máximo 3 perguntas, cada uma com poucas
 * respostas de um toque. A pessoa pode enviar ou sair a qualquer momento.
 */
export function GuidedFlow({
  onSend,
  onRequestHuman,
  onClose,
}: {
  onSend: (text: string) => void;
  onRequestHuman: () => void;
  onClose: () => void;
}) {
  const [stepId, setStepId] = useState<GuidedStepId>("start");
  const [answers, setAnswers] = useState<{ step: GuidedStepId; sentence: string }[]>([]);
  const [paused, setPaused] = useState(false);
  const step = GUIDED_STEPS[stepId];

  function choose(option: GuidedOption) {
    const nextAnswers = [...answers, { step: stepId, sentence: option.sentence }];
    if (option.next === "human") {
      onRequestHuman();
      onSend(option.sentence);
      onClose();
      return;
    }
    if (option.next === "pause") {
      onSend(option.sentence);
      setPaused(true);
      return;
    }
    if (option.next === "send") {
      onSend(nextAnswers.map((a) => a.sentence).join(" "));
      onClose();
      return;
    }
    setAnswers(nextAnswers);
    setStepId(option.next);
  }

  function back() {
    const previous = answers.at(-1);
    if (!previous) return;
    setAnswers(answers.slice(0, -1));
    setStepId(previous.step);
  }

  return (
    <section
      aria-labelledby="pergunta-guiada"
      className="animate-gentle-in border-t border-border bg-lavender-soft/70 px-3 py-4 sm:px-5"
    >
      <div className="mx-auto max-w-2xl">
        <div className="flex items-start justify-between gap-3">
          <h2 id="pergunta-guiada" className="text-lg font-semibold" aria-live="polite">
            {paused ? "Tudo bem. Faça sua pausa no seu tempo." : step.question}
          </h2>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Fechar perguntas">
            <X aria-hidden />
          </Button>
        </div>

        {paused ? (
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <Link href="/sons" className="flex min-h-13 items-center justify-center rounded-xl bg-surface px-4 font-semibold">
              Ouvir sons tranquilos
            </Link>
            <Link href="/jogos/respiracao" className="flex min-h-13 items-center justify-center rounded-xl bg-surface px-4 font-semibold">
              Acompanhar a respiração
            </Link>
          </div>
        ) : (
          <div className="mt-3 grid gap-2 min-[400px]:grid-cols-2">
            {step.options.map((option) => (
              <button
                key={option.label}
                type="button"
                onClick={() => choose(option)}
                className="min-h-14 rounded-xl border border-border bg-surface px-4 text-lg font-semibold hover:bg-primary-soft"
              >
                {option.label}
              </button>
            ))}
          </div>
        )}

        {!paused && answers.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="ghost" size="sm" onClick={back}>
              <ArrowLeft aria-hidden /> Voltar
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                onSend(answers.map((a) => a.sentence).join(" "));
                onClose();
              }}
            >
              <Send aria-hidden /> Enviar o que escolhi
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
