import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { CHAT_POLICY_VERSION } from "@/lib/legal";
import { assertSameOrigin, jsonError, mapDbError } from "@/lib/http";
import { getServerSupabase } from "@/lib/supabase/server";

const bodySchema = z.object({ acceptedPolicyVersion: z.literal(CHAT_POLICY_VERSION) });

/**
 * Inicia (ou retoma) a conversa da pessoa. Exige sessão (anônima ou conta)
 * e o aceite do aviso de privacidade vigente, registrado em consent_records.
 */
export async function POST(request: NextRequest) {
  const blocked = assertSameOrigin(request);
  if (blocked) return blocked;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return jsonError(400, "consent_required", "É preciso confirmar o aviso antes de começar.");
  }

  const supabase = await getServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return jsonError(401, "unauthenticated", "Sessão não encontrada.");

  const { data, error } = await supabase.rpc("start_conversation", {
    p_policy_version: parsed.data.acceptedPolicyVersion,
  });
  if (error) return mapDbError(error);
  return NextResponse.json({ conversationId: data as string });
}
