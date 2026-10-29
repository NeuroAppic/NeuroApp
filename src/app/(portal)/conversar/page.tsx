import type { Metadata } from "next";
import { ChatScreen } from "@/features/chat/components/chat-screen";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { Notice } from "@/components/ui/notice";

export const metadata: Metadata = { title: "Conversar" };

export default function ConversarPage() {
  if (!isSupabaseConfigured()) {
    return (
      <div className="mx-auto max-w-xl p-4 py-10">
        <Notice tone="sky">
          <p className="font-semibold">Conversa indisponível neste ambiente.</p>
          <p className="mt-1">
            O Supabase ainda não foi configurado (variáveis NEXT_PUBLIC_SUPABASE_*). Veja o README.
          </p>
        </Notice>
      </div>
    );
  }
  return <ChatScreen />;
}
