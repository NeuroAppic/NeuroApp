import { Notice } from "@/components/ui/notice";
import { ChatScreen } from "@/features/chat/components/chat-screen";
import { isSupabaseConfigured } from "@/lib/supabase/config";

/** Tela inicial: a conversa já aberta, pronta para escrever. */
export default function HomePage() {
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
