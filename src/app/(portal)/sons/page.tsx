import type { Metadata } from "next";
import { loadPublishedTracks } from "@/features/sounds/load-tracks";
import { SoundLibrary } from "@/features/sounds/sound-library";

export const metadata: Metadata = { title: "Sons relaxantes" };
// URLs assinadas expiram: a lista é montada a cada visita.
export const dynamic = "force-dynamic";

export default async function SonsPage() {
  const { tracks, source } = await loadPublishedTracks();
  const hasDemo = source === "demo" || tracks.some((t) => t.is_demo);
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      <h1 className="text-3xl font-bold">Sons relaxantes</h1>
      <p className="mt-2 max-w-2xl text-foreground-muted">
        Sons contínuos para ajudar a se acalmar ou a abafar ruídos. Você controla tudo: nada começa
        sozinho e o botão de parar funciona na hora.
      </p>
      <div className="mt-8">
        <SoundLibrary tracks={tracks} demo={hasDemo} />
      </div>
    </div>
  );
}
