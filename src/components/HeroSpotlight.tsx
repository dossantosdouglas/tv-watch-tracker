"use client";

import { useEffect, useState } from "react";
import {
  Calendar,
  ListVideo,
  Plus,
  Radio,
  RefreshCw,
  Trash2,
  Tv,
} from "lucide-react";
import type { MediaItem } from "@/lib/types";
import {
  formatRelativeTimePt,
  formatReleaseDatePt,
  formatTimecode,
  getAppMeta,
  getMediaTypeLabelPt,
  getProgressPercent,
  getStatusLabelPt,
} from "./formatters";

interface HeroSpotlightProps {
  item: MediaItem | null;
  loading: boolean;
  isIncrementing: boolean;
  isDeleting: boolean;
  onIncrement: (item: MediaItem) => void;
  onDelete: (item: MediaItem) => void;
  onOpenEpisodes: (item: MediaItem) => void;
  onOpenRematch: (item: MediaItem) => void;
  onOpenAddModal: () => void;
  onOpenSignalDrawer: () => void;
}

export function HeroSpotlight({
  item,
  loading,
  isIncrementing,
  isDeleting,
  onIncrement,
  onDelete,
  onOpenEpisodes,
  onOpenRematch,
  onOpenAddModal,
  onOpenSignalDrawer,
}: HeroSpotlightProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!confirmDelete) return;
    const timer = window.setTimeout(() => setConfirmDelete(false), 4500);
    return () => window.clearTimeout(timer);
  }, [confirmDelete]);
  if (loading && !item) {
    return (
      <section
        aria-labelledby="hero-loading-title"
        className="rounded-2xl border border-[#262A38] bg-[#13151C] p-5 sm:p-7"
      >
        <p
          id="hero-loading-title"
          className="text-sm font-semibold text-[#A8B0C2]"
        >
          Carregando o último episódio assistido na TV...
        </p>
        <div className="mt-4 flex flex-col gap-4 sm:flex-row">
          <div className="h-44 w-32 shrink-0 rounded-xl bg-[#1B1E28]" />
          <div className="flex flex-1 flex-col gap-3">
            <div className="h-6 w-40 rounded bg-[#1B1E28]" />
            <div className="h-9 w-3/4 rounded bg-[#1B1E28]" />
            <div className="h-5 w-1/2 rounded bg-[#1B1E28]" />
          </div>
        </div>
      </section>
    );
  }

  if (!item) {
    return (
      <section
        aria-labelledby="hero-empty-title"
        className="rounded-2xl border border-[#262A38] bg-[#13151C] p-6 sm:p-8"
      >
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-xl space-y-2">
            <p className="text-xs font-bold uppercase tracking-wider text-[#FF9248]">
              Onde Parei na TV
            </p>
            <h1
              id="hero-empty-title"
              className="text-2xl font-extrabold tracking-tight text-[#F4F5F7] sm:text-3xl"
            >
              Nenhuma obra registrada ainda
            </h1>
            <p className="text-sm leading-relaxed text-[#A8B0C2] sm:text-base">
              Assim que você assistir a um episódio no Crunchyroll pela Smart
              TV, ele aparece aqui automaticamente. Se preferir, adicione seu
              primeiro anime manualmente.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={onOpenAddModal}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#F47521] px-4 py-2.5 text-sm font-bold text-[#0B0C10] transition-colors hover:bg-[#FF8B3D]"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              <span>Adicionar primeira obra</span>
            </button>
            <button
              type="button"
              onClick={onOpenSignalDrawer}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-[#262A38] bg-[#1B1E28] px-4 py-2.5 text-sm font-semibold text-[#F4F5F7] transition-colors hover:border-[#373D52] hover:bg-[#262A38]"
            >
              <Radio className="h-4 w-4 text-[#A8B0C2]" aria-hidden="true" />
              <span>Ver Sinal da TV</span>
            </button>
          </div>
        </div>
      </section>
    );
  }

  const appMeta = getAppMeta(item.last_app);
  const seriesProgress = getProgressPercent(
    item.current_episode,
    item.total_episodes
  );
  const hasPlaybackProgress =
    item.last_position_sec != null &&
    item.last_duration_sec != null &&
    item.last_duration_sec > 0;
  const playbackPercent = hasPlaybackProgress
    ? Math.max(
        0,
        Math.min(
          100,
          Math.round((item.last_position_sec! / item.last_duration_sec!) * 100)
        )
      )
    : null;
  const backdropSrc = item.banner_image || item.cover_image;
  const relativeTime = formatRelativeTimePt(item.last_watched_at);
  const isFromTv = item.last_app === "crunchyroll" || item.last_app === "youcine";

  return (
    <section
      aria-labelledby="hero-spotlight-title"
      className="relative overflow-hidden rounded-2xl border border-[#262A38] bg-[#13151C] shadow-lg"
    >
      {backdropSrc && (
        <div
          className="pointer-events-none absolute inset-0"
          aria-hidden="true"
        >
          <img
            src={backdropSrc}
            alt=""
            width={1280}
            height={720}
            fetchPriority="high"
            className="h-full w-full object-cover object-center opacity-35"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0B0C10] via-[#0B0C10]/85 to-[#0B0C10]/65 sm:bg-gradient-to-r sm:from-[#0B0C10] sm:via-[#0B0C10]/90 sm:to-[#0B0C10]/55" />
        </div>
      )}

      <div className="relative z-10 flex flex-col gap-5 p-4 sm:flex-row sm:items-stretch sm:gap-6 sm:p-6 lg:p-7">
        <div className="flex items-start gap-4 sm:block">
          <div className="aspect-[2/3] w-24 shrink-0 overflow-hidden rounded-xl border border-[#373D52] bg-[#1B1E28] sm:w-36 lg:w-40">
            {item.cover_image ? (
              <img
                src={item.cover_image}
                alt={`Capa de ${item.title}`}
                width={320}
                height={480}
                fetchPriority="high"
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center p-2 text-center text-xs font-semibold text-[#A8B0C2]">
                {item.title}
              </div>
            )}
          </div>

          <div className="flex flex-1 flex-col gap-2 sm:hidden">
            <div className="flex flex-wrap items-center gap-1.5">
              <span
                className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs ${appMeta.badgeClass}`}
              >
                <Tv className="h-3 w-3" aria-hidden="true" />
                {appMeta.label}
              </span>
              <span className="rounded-md border border-[#373D52] bg-[#1B1E28] px-2 py-0.5 text-xs font-medium text-[#F4F5F7]">
                {getMediaTypeLabelPt(item.media_type)}
              </span>
            </div>
            <p className="text-xs font-medium text-[#A8B0C2]">
              {isFromTv
                ? `Visto ${relativeTime} na Smart TV`
                : `Atualizado ${relativeTime}`}
            </p>
            <h1
              id="hero-spotlight-title-mobile"
              className="text-xl font-extrabold leading-snug text-[#F4F5F7]"
            >
              {item.title}
            </h1>
          </div>
        </div>

        <div className="flex flex-1 flex-col justify-between gap-4">
          <div className="space-y-3">
            <div className="hidden flex-wrap items-center gap-2 sm:flex">
              <span className="text-xs font-bold uppercase tracking-wider text-[#FF9248]">
                Onde Parei na TV
              </span>
              <span className="text-[#373D52]" aria-hidden="true">
                ·
              </span>
              <span
                className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-0.5 text-xs ${appMeta.badgeClass}`}
              >
                <Tv className="h-3.5 w-3.5" aria-hidden="true" />
                {appMeta.label}
              </span>
              <span className="rounded-md border border-[#373D52] bg-[#1B1E28] px-2 py-0.5 text-xs font-medium text-[#F4F5F7]">
                {getMediaTypeLabelPt(item.media_type)}
              </span>
              <span className="rounded-md border border-[#373D52] bg-[#1B1E28] px-2 py-0.5 text-xs font-medium text-[#A8B0C2]">
                {getStatusLabelPt(item.status)}
              </span>
              <span className="text-xs font-medium text-[#A8B0C2]">
                {isFromTv
                  ? `Visto ${relativeTime} na Smart TV`
                  : `Atualizado ${relativeTime}`}
              </span>
            </div>

            <h1
              id="hero-spotlight-title"
              className="hidden text-2xl font-extrabold tracking-tight text-[#F4F5F7] sm:block lg:text-3xl"
            >
              {item.title}
            </h1>

            <div className="flex flex-wrap items-baseline gap-2.5 rounded-xl border border-[#262A38] bg-[#13151C]/90 px-3.5 py-2.5">
              <span className="rounded bg-[#1B1E28] px-2 py-0.5 font-mono text-sm font-bold text-[#FF9248]">
                {item.media_type === "anime" || item.current_season <= 1
                  ? `EP ${item.current_episode}`
                  : `T${item.current_season} · EP ${item.current_episode}`}
              </span>
              <span className="text-sm font-medium text-[#F4F5F7] sm:text-base">
                {item.last_episode_title ||
                  `Episódio ${item.current_episode} em andamento`}
              </span>
            </div>

            {item.next_airing && (
              <div className="inline-flex flex-wrap items-center gap-2 rounded-lg border border-[#FCD34D]/35 bg-[#13151C]/90 px-3 py-1.5 text-xs font-semibold text-[#FCD34D]">
                <Calendar className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>
                  Próx. Ep {item.next_airing.episode}:{" "}
                  {formatReleaseDatePt(item.next_airing.airing_at, true)}
                </span>
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              {hasPlaybackProgress && playbackPercent !== null && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-[#A8B0C2]">
                      Minuto do episódio
                    </span>
                    <span className="font-mono font-semibold text-[#F4F5F7]">
                      {formatTimecode(item.last_position_sec)} /{" "}
                      {formatTimecode(item.last_duration_sec)}
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-[#262A38]">
                    <div
                      className={`h-full rounded-full ${appMeta.barClass}`}
                      style={{ width: `${playbackPercent}%` }}
                    />
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-[#A8B0C2]">
                    Progresso na obra
                  </span>
                  <span className="font-mono font-semibold text-[#F4F5F7]">
                    {item.total_episodes
                      ? `Ep ${item.current_episode} de ${item.total_episodes}`
                      : `Ep ${item.current_episode} assistido`}
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-[#262A38]">
                  <div
                    className="h-full rounded-full bg-[#F47521]"
                    style={{
                      width: `${
                        seriesProgress !== null
                          ? seriesProgress
                          : item.current_episode > 0
                            ? 35
                            : 0
                      }%`,
                    }}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 pt-1">
            <button
              type="button"
              disabled={isIncrementing}
              onClick={() => onIncrement(item)}
              className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-[#F47521] px-4 py-2.5 text-sm font-bold text-[#0B0C10] transition-colors hover:bg-[#FF8B3D] active:bg-[#E06514] disabled:opacity-60"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              <span>
                {isIncrementing ? "Salvando..." : "+1 Episódio"}
              </span>
            </button>

            <button
              type="button"
              onClick={() => onOpenEpisodes(item)}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-[#373D52] bg-[#1B1E28] px-4 py-2.5 text-sm font-semibold text-[#F4F5F7] transition-colors hover:border-[#4B536E] hover:bg-[#262A38]"
            >
              <ListVideo className="h-4 w-4 text-[#A8B0C2]" aria-hidden="true" />
              <span>Lista de Episódios</span>
            </button>

            <button
              type="button"
              onClick={() => onOpenRematch(item)}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-[#262A38] bg-[#13151C] px-3.5 py-2.5 text-sm font-medium text-[#A8B0C2] transition-colors hover:border-[#373D52] hover:bg-[#1B1E28] hover:text-[#F4F5F7]"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              <span>Corrigir Obra</span>
            </button>

            {confirmDelete ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={() => {
                    setConfirmDelete(false);
                    onDelete(item);
                  }}
                  className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-[#BE123C] px-3.5 py-2.5 text-sm font-bold text-[#FFFFFF] transition-colors hover:bg-[#E11D48] disabled:opacity-60"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                  <span>{isDeleting ? "Excluindo..." : "Confirmar?"}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-[#373D52] bg-[#1B1E28] px-3 py-2.5 text-sm font-semibold text-[#F4F5F7] hover:bg-[#262A38]"
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setConfirmDelete(true)}
                aria-label={`Excluir ${item.title}`}
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-[#262A38] bg-[#13151C] px-3.5 py-2.5 text-sm font-medium text-[#FDA4AF] transition-colors hover:border-[#BE123C] hover:bg-[#BE123C]/15 disabled:opacity-60"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                <span>Excluir</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
