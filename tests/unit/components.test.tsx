import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { initialChatState, type ChatState } from "@/features/chat/chat-state";
import { GuidedFlow } from "@/features/chat/components/guided-flow";
import { MessageList } from "@/features/chat/components/message-list";
import { QuickMessages } from "@/features/chat/components/quick-messages";
import { HumanSupportPanel, SafetyPanel } from "@/features/chat/components/support-panels";
import { ColorSort } from "@/features/games/color-sort";
import { Garden } from "@/features/games/garden";
import { PreferencesProvider } from "@/lib/preferences/preferences-provider";

function wrap(ui: ReactNode) {
  return render(<PreferencesProvider>{ui}</PreferencesProvider>);
}

const base: ChatState = { ...initialChatState, phase: "ready", conversationId: "c" };

describe("mensagens rápidas", () => {
  it("enviam a mensagem escolhida com um toque e permitem trocar de categoria", async () => {
    const onSelect = vi.fn();
    wrap(<QuickMessages onSelect={onSelect} disabled={false} />);
    await userEvent.click(screen.getByRole("button", { name: "Estou em crise" }));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ message: "Estou em crise." }));

    await userEvent.click(screen.getByRole("tab", { name: "Como me sinto" }));
    await userEvent.click(screen.getByRole("button", { name: "Estou com medo" }));
    expect(onSelect).toHaveBeenLastCalledWith(expect.objectContaining({ message: "Estou com medo." }));
  });
});

describe("comunicação alternativa", () => {
  it("monta a mensagem com poucas escolhas de um toque", async () => {
    const onSend = vi.fn();
    wrap(<GuidedFlow onSend={onSend} onRequestHuman={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText("Você prefere conversar ou fazer uma pausa?")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Conversar" }));
    await userEvent.click(screen.getByRole("button", { name: "Triste" }));
    await userEvent.click(screen.getByRole("button", { name: "Só me escute" }));
    expect(onSend).toHaveBeenCalledWith("Quero conversar. Estou triste. Prefiro que você apenas me escute.");
  });

  it("pedir uma pessoa dispara o pedido de atendimento humano", async () => {
    const onRequestHuman = vi.fn();
    wrap(<GuidedFlow onSend={vi.fn()} onRequestHuman={onRequestHuman} onClose={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Falar com uma pessoa" }));
    expect(onRequestHuman).toHaveBeenCalled();
  });
});

describe("identificação de quem fala", () => {
  it("rotula a IA e o profissional de forma explícita", () => {
    const state: ChatState = {
      ...base,
      messages: [
        { id: "1", conversation_id: "c", sender: "ai", sender_label: null, content: "Oi", client_message_id: null, input_source: null, reply_to_id: "0", created_at: "2026-01-01T10:00:00Z" },
        { id: "2", conversation_id: "c", sender: "staff", sender_label: "Ana · Psicóloga", content: "Olá", client_message_id: null, input_source: null, reply_to_id: null, created_at: "2026-01-01T10:01:00Z" },
      ],
    };
    wrap(<MessageList state={state} revealWhole={false} onRetryMessage={vi.fn()} />);
    expect(screen.getByText("Assistente virtual (IA)")).toBeInTheDocument();
    expect(screen.getByText("Ana · Psicóloga — pessoa da equipe")).toBeInTheDocument();
  });

  it("mensagem não enviada oferece reenvio", async () => {
    const onRetry = vi.fn();
    const state: ChatState = { ...base, pending: [{ clientId: "x", content: "Oi", source: "typed", state: "failed", error: "Sem conexão." }] };
    wrap(<MessageList state={state} revealWhole={false} onRetryMessage={onRetry} />);
    await userEvent.click(screen.getByRole("button", { name: /Reenviar/ }));
    expect(onRetry).toHaveBeenCalledWith("x");
  });
});

describe("protocolo de segurança na interface", () => {
  it("mostra CVV e SAMU com links de ligação em situação de risco", () => {
    const state: ChatState = { ...base, safety: { level: "critical", escalated: false, visible: true }, availableProfessionals: 0 };
    wrap(<SafetyPanel state={state} onHide={vi.fn()} />);
    const region = screen.getByRole("region", { name: /não precisa passar por isso sozinho/i });
    expect(within(region).getByRole("link", { name: /188/ })).toHaveAttribute("href", "tel:188");
    expect(within(region).getByRole("link", { name: /192/ })).toHaveAttribute("href", "tel:192");
    expect(region).toHaveTextContent("não há profissionais da plataforma disponíveis");
  });

  it("sem profissionais disponíveis, não inventa fila nem tempo de espera", () => {
    wrap(<HumanSupportPanel state={{ ...base, status: "waiting_human", availableProfessionals: 0 }} onCancel={vi.fn()} />);
    expect(screen.getByText(/não há profissionais disponíveis/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/minutos|posição na fila/);
  });

  it("deixa claro quando uma pessoa assumiu", () => {
    wrap(<HumanSupportPanel state={{ ...base, status: "human_active", assignedLabel: "Ana · Psicóloga" }} onCancel={vi.fn()} />);
    expect(screen.getByText(/Você está conversando com uma pessoa: Ana · Psicóloga/)).toBeInTheDocument();
  });
});

describe("jogos", () => {
  it("jardim funciona só com toques/teclado", async () => {
    wrap(<Garden />);
    await userEvent.click(screen.getByRole("button", { name: "Canteiro 1: vazio" }));
    expect(screen.getByRole("button", { name: "Canteiro 1: Lavanda, semente" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: "Regar" }));
    await userEvent.click(screen.getByRole("button", { name: "Canteiro 1: Lavanda, semente" }));
    expect(screen.getByRole("button", { name: "Canteiro 1: Lavanda, broto" })).toBeInTheDocument();
  });

  it("organizar cores troca peças com dois toques (alternativa a arrastar)", async () => {
    wrap(<ColorSort />);
    const first = screen.getByRole("button", { name: "Peça 1" });
    const color1 = first.style.backgroundColor;
    const color2 = screen.getByRole("button", { name: "Peça 2" }).style.backgroundColor;
    await userEvent.click(first);
    await userEvent.click(screen.getByRole("button", { name: "Peça 2" }));
    expect(screen.getByRole("button", { name: "Peça 1" }).style.backgroundColor).toBe(color2);
    expect(screen.getByRole("button", { name: "Peça 2" }).style.backgroundColor).toBe(color1);
  });
});
