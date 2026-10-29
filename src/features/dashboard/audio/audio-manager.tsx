"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowDown, ArrowUp, Pencil, Trash2, Upload } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FieldError, Input, Label, Select } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { CATEGORY_LABEL } from "@/features/sounds/catalog";
import { TRACK_ICON_NAMES, TrackIcon } from "@/features/sounds/track-icon";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { audioTrackSchema, validateAudioFile, type AudioTrackInput } from "@/lib/validation/schemas";
import type { AudioCategory, AudioTrack } from "@/types/domain";

const BUCKET = "audio-tracks";
const COLUMNS = "id, title, description, category, storage_path, mime_type, size_bytes, is_demo, demo_generator, color, icon, is_published, sort_order";

export function AudioManager() {
  const [tracks, setTracks] = useState<AudioTrack[]>([]);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const load = useCallback(async () => {
    const { data } = await getBrowserSupabase().from("audio_tracks").select(COLUMNS).order("sort_order");
    setTracks((data ?? []) as AudioTrack[]);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial
    void load();
  }, [load]);

  async function update(id: string, patch: Partial<AudioTrack>, success: string) {
    const { error } = await getBrowserSupabase().from("audio_tracks").update(patch).eq("id", id);
    setMessage(error ? { tone: "error", text: "Não foi possível salvar." } : { tone: "ok", text: success });
    await load();
  }

  async function move(index: number, direction: -1 | 1) {
    const other = tracks[index + direction];
    const current = tracks[index];
    if (!other || !current) return;
    const supabase = getBrowserSupabase();
    // Troca as posições; se as duas tiverem a mesma ordem, desempata.
    const a = current.sort_order === other.sort_order ? other.sort_order + direction : other.sort_order;
    await Promise.all([
      supabase.from("audio_tracks").update({ sort_order: a }).eq("id", current.id),
      supabase.from("audio_tracks").update({ sort_order: current.sort_order }).eq("id", other.id),
    ]);
    await load();
  }

  async function remove(track: AudioTrack) {
    const supabase = getBrowserSupabase();
    const { error } = await supabase.from("audio_tracks").delete().eq("id", track.id);
    if (error) {
      setMessage({ tone: "error", text: "Não foi possível excluir." });
      return;
    }
    if (track.storage_path) await supabase.storage.from(BUCKET).remove([track.storage_path]);
    setMessage({ tone: "ok", text: "Áudio excluído (registro e arquivo)." });
    await load();
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Áudios</h1>
          <p className="text-foreground-muted">Arquivos ficam em um bucket privado; o portal usa links temporários só para áudios publicados.</p>
        </div>
        <UploadDialog nextOrder={(tracks.at(-1)?.sort_order ?? 0) + 10} onDone={(text) => { setMessage({ tone: "ok", text }); void load(); }} />
      </header>

      {message && (
        <p role={message.tone === "error" ? "alert" : "status"} className={message.tone === "error" ? "rounded-xl bg-danger-soft p-3 font-medium text-danger" : "rounded-xl bg-primary-soft p-3"}>
          {message.text}
        </p>
      )}

      <ul className="grid gap-3">
        {tracks.map((track, i) => (
          <li key={track.id}>
            <Card className="flex flex-wrap items-center gap-4 p-4">
              <span className="inline-flex size-12 items-center justify-center rounded-xl" style={{ backgroundColor: `${track.color}66` }}>
                <TrackIcon name={track.icon} className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{track.title}</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  <Badge tone="neutral">{CATEGORY_LABEL[track.category]}</Badge>
                  {track.is_demo && <Badge tone="sky">Demonstração (sem arquivo)</Badge>}
                  {track.size_bytes && <Badge tone="neutral">{(track.size_bytes / 1_048_576).toFixed(1)} MB</Badge>}
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm font-semibold">
                <Switch
                  checked={track.is_published}
                  onCheckedChange={(v) => void update(track.id, { is_published: v }, v ? "Publicado no portal." : "Removido do portal.")}
                  aria-label={`Publicar ${track.title}`}
                />
                {track.is_published ? "Publicado" : "Oculto"}
              </label>
              <div className="flex gap-1">
                <Button size="icon" variant="ghost" onClick={() => void move(i, -1)} disabled={i === 0} aria-label="Mover para cima"><ArrowUp aria-hidden /></Button>
                <Button size="icon" variant="ghost" onClick={() => void move(i, 1)} disabled={i === tracks.length - 1} aria-label="Mover para baixo"><ArrowDown aria-hidden /></Button>
                <EditDialog track={track} onSave={(patch) => update(track.id, patch, "Alterações salvas.")} />
                <DeleteDialog track={track} onConfirm={() => remove(track)} />
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MetadataFields({ form }: { form: ReturnType<typeof useForm<AudioTrackInput>> }) {
  const { register, formState: { errors } } = form;
  return (
    <>
      <div>
        <Label htmlFor="audio-titulo">Nome</Label>
        <Input id="audio-titulo" {...register("title")} aria-invalid={!!errors.title} />
        <FieldError message={errors.title?.message} />
      </div>
      <div>
        <Label htmlFor="audio-descricao">Descrição curta (opcional)</Label>
        <Input id="audio-descricao" {...register("description")} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="audio-categoria">Categoria</Label>
          <Select id="audio-categoria" {...register("category")}>
            {(Object.keys(CATEGORY_LABEL) as AudioCategory[]).map((c) => (
              <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="audio-icone">Ícone</Label>
          <Select id="audio-icone" {...register("icon")}>
            {TRACK_ICON_NAMES.map((n) => <option key={n} value={n}>{n}</option>)}
          </Select>
        </div>
      </div>
      <div>
        <Label htmlFor="audio-cor">Cor de identificação</Label>
        <input id="audio-cor" type="color" className="mt-1 h-12 w-24 rounded-xl border border-border bg-surface" {...register("color")} />
        <FieldError message={errors.color?.message} />
      </div>
    </>
  );
}

function UploadDialog({ nextOrder, onDone }: { nextOrder: number; onDone: (text: string) => void }) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const form = useForm<AudioTrackInput>({
    resolver: zodResolver(audioTrackSchema),
    defaultValues: { category: "rain", color: "#8FA4B8", icon: "waves", description: "" },
  });

  async function onSubmit(values: AudioTrackInput) {
    setError(null);
    if (!file) return setError("Escolha um arquivo de áudio.");
    const fileError = validateAudioFile(file);
    if (fileError) return setError(fileError);

    const supabase = getBrowserSupabase();
    const ext = (file.name.split(".").pop() ?? "audio").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5);
    const path = `tracks/${crypto.randomUUID()}.${ext}`;
    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
    if (uploadError) return setError("Falha no envio. Verifique tipo e tamanho do arquivo.");

    const parsed = audioTrackSchema.parse(values);
    const { error: insertError } = await supabase.from("audio_tracks").insert({
      ...parsed,
      description: parsed.description || null,
      storage_path: path,
      mime_type: file.type,
      size_bytes: file.size,
      is_demo: false,
      is_published: false,
      sort_order: nextOrder,
    });
    if (insertError) {
      await supabase.storage.from(BUCKET).remove([path]);
      return setError("Não foi possível registrar o áudio.");
    }
    form.reset();
    setFile(null);
    setOpen(false);
    onDone("Áudio enviado. Ele fica oculto até você publicar.");
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Upload aria-hidden /> Enviar áudio</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Enviar áudio</DialogTitle>
        <DialogDescription>MP3, OGG, WAV, WEBM, M4A, AAC ou FLAC, até 50 MB.</DialogDescription>
        <form onSubmit={form.handleSubmit(onSubmit)} className="mt-5 space-y-4" noValidate>
          <div>
            <Label htmlFor="audio-arquivo">Arquivo</Label>
            <input
              id="audio-arquivo"
              type="file"
              accept="audio/*"
              className="mt-1 block w-full text-sm file:mr-3 file:min-h-11 file:rounded-xl file:border-0 file:bg-primary-soft file:px-4 file:font-semibold"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>
          <MetadataFields form={form} />
          {error && <p role="alert" className="rounded-xl bg-danger-soft p-3 text-sm font-medium text-danger">{error}</p>}
          <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? "Enviando…" : "Enviar"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditDialog({ track, onSave }: { track: AudioTrack; onSave: (patch: Partial<AudioTrack>) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const form = useForm<AudioTrackInput>({
    resolver: zodResolver(audioTrackSchema),
    defaultValues: {
      title: track.title,
      description: track.description ?? "",
      category: track.category,
      color: track.color,
      icon: track.icon as AudioTrackInput["icon"],
    },
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="icon" variant="ghost" aria-label={`Editar ${track.title}`}><Pencil aria-hidden /></Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Editar áudio</DialogTitle>
        <form
          onSubmit={form.handleSubmit(async (values) => {
            const parsed = audioTrackSchema.parse(values);
            await onSave({ ...parsed, description: parsed.description || null });
            setOpen(false);
          })}
          className="mt-5 space-y-4"
          noValidate
        >
          <MetadataFields form={form} />
          <Button type="submit" className="w-full">Salvar</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteDialog({ track, onConfirm }: { track: AudioTrack; onConfirm: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="icon" variant="ghost" aria-label={`Excluir ${track.title}`}><Trash2 aria-hidden /></Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Excluir “{track.title}”?</DialogTitle>
        <DialogDescription>O registro e o arquivo são apagados. Isso não pode ser desfeito.</DialogDescription>
        <div className="mt-5 flex gap-2">
          <Button variant="danger" onClick={async () => { await onConfirm(); setOpen(false); }}>Excluir</Button>
          <Button variant="secondary" onClick={() => setOpen(false)}>Cancelar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
