import "server-only";

import { getAdminSupabase } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type { AudioTrack, PlayableTrack } from "@/types/domain";
import { DEMO_TRACKS } from "./catalog";

const SIGNED_URL_TTL_SECONDS = 60 * 60 * 3;

/**
 * Faixas publicadas, com URL assinada (bucket privado) para as que têm arquivo.
 * Faixas cujo arquivo não existe mais são omitidas — nunca exibimos links quebrados.
 */
export async function loadPublishedTracks(): Promise<{ tracks: PlayableTrack[]; source: "database" | "demo" }> {
  if (!isSupabaseConfigured() || !(process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY)) {
    return { tracks: DEMO_TRACKS, source: "demo" };
  }
  try {
    const admin = getAdminSupabase();
    const { data, error } = await admin
      .from("audio_tracks")
      .select("id, title, description, category, storage_path, mime_type, size_bytes, is_demo, demo_generator, color, icon, is_published, sort_order")
      .eq("is_published", true)
      .order("sort_order");
    if (error) throw error;
    const rows = (data ?? []) as AudioTrack[];

    const paths = rows.filter((r) => r.storage_path).map((r) => r.storage_path!);
    const signed = new Map<string, string>();
    if (paths.length > 0) {
      const { data: urls } = await admin.storage.from("audio-tracks").createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);
      for (const u of urls ?? []) if (u.path && u.signedUrl && !u.error) signed.set(u.path, u.signedUrl);
    }

    const tracks = rows
      .map((r) => ({ ...r, url: r.storage_path ? (signed.get(r.storage_path) ?? null) : null }))
      .filter((t) => t.url || (t.is_demo && t.demo_generator));
    return { tracks, source: "database" };
  } catch {
    return { tracks: DEMO_TRACKS, source: "demo" };
  }
}
