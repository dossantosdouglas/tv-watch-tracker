"use client";

import { useEffect, useState } from "react";
import { Calendar, ListVideo, Plus, Radio, RefreshCw, Trash2 } from "lucide-react";
import type { MediaItem } from "@/lib/types";
import {
  formatRelativeTimePt,
  formatReleaseDatePt,
  formatSeasonEpisodeLabel,
  formatTimecode,
  getAppMeta,
  getProgressPercent,
  resolveCurrentEpisodePosition,
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
        className="rounded-xl border border-[#22252D] bg-[#131519] p-5 sm:p-6"
      >
        <p id="hero-loading-title" className="text-sm text-[#9CA3AF]">
          Carregando última obra assistida...
        </p>
        <div className="mt-4 flex gap-5">
          <div className="aspect-[2/3] w-28 shrink-0 rounded-lg bg-[#1A1D24] sm:w-36" />
          <div className="flex flex-1 flex-col gap-3">
            <div className="h-4 w-36 rounded bg-[#1A1D24]" />
            <div className="h-7 w-2/3 rounded bg-[#1A1D24]" />
            <div className="h-16 w-full rounded bg-[#1A1D24]" />
          </div>
        </div>
      </section>
    );
  }

  if (!item) {
    return (
      <section
        aria-labelledby="hero-empty-title"
        className="rounded-xl border border-[#22252D] bg-[#131519] p-6 sm:p-8"
      >
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-xl space-y-2">
            <h1
              id="hero-empty-title"
              className="text-2xl font-bold tracking-tight text-[#F3F4F6]"
            >
              Nenhuma obra registrada ainda
            </h1>
            <p className="text-sm leading-relaxed text-[#9CA3AF]">
              Assim que você assistir a um episódio no Crunchyroll pela Smart
              TV, ele aparece aqui automaticamente. Você também pode adicionar
              sua primeira obra manualmente.
            </p>
          </div>
          <div className="flex flex-wrap gap-2.5">
            <button
              type="button"
              onClick={onOpenAddModal}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-[#F47521] px-4 py-2.5 text-sm font-semibold text-[#0B0C0E] transition-colors hover:bg-[#FF8533]"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              <span>Adicionar obra</span>
            </button>
            <button
              type="button"
              onClick={onOpenSignalDrawer}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-[#22252D] bg-[#1A1D24] px-4 py-2.5 text-sm font-medium text-[#F3F4F6] transition-colors hover:border-[#2E323D]"
            >
              <Radio className="h-4 w-4 text-[#9CA3AF]" aria-hidden="true" />
              <span>Sinal da TV</span>
            </button>
          </div>
        </div>
      </section>
    );
  }

  const appMeta = getAppMeta(item.last_app);
  const pos = resolveCurrentEpisodePosition(item);
  const seriesProgress = getProgressPercent(pos.absEpisode, pos.totalEpisodes);
  const progressBarWidth =
    seriesProgress !== null ? seriesProgress : pos.absEpisode > 0 ? 30 : 0;

  const hasPlaybackProgress =
    item.last_position_sec != null &&
    item.last_duration_sec != null &&
    item.last_duration_sec > 0;

  const relativeTime = formatRelativeTimePt(item.last_watched_at);
  const isFromTv = item.last_app === "crunchyroll" || item.last_app === "youcine";
  const seasonEpisodeText = formatSeasonEpisodeLabel(pos.season, pos.episode);

  return (
    <section
      aria-labelledby="hero-spotlight-title"
      className="rounded-xl border border-[#22252D] bg-[#131519] p-5 sm:p-6"
    >
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:gap-6">
        <div className="aspect-[2/3] w-28 shrink-0 overflow-hidden rounded-lg border border-[#22252D] bg-[#0B0C0E] sm:w-36">
          {item.cover_image ? (
            <img
              src={item.cover_image}
              alt={`Capa de ${item.title}`}
              width={288}
              height={432}
              fetchPriority="high"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center p-2 text-center text-xs font-medium text-[#9CA3AF]">
              {item.title}
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-[#9CA3AF]">
              {appMeta.label} ·{" "}
              {isFromTv
                ? `Visto ${relativeTime} na TV`
                : `Atualizado ${relativeTime}`}
            </p>
            <h1
              id="hero-spotlight-title"
              className="text-2xl font-bold tracking-tight text-[#F3F4F6] sm:text-3xl"
            >
              {item.title}
            </h1>
          </div>

          <div className="space-y-3 rounded-lg border border-[#22252D] bg-[#0B0C0E] p-3.5 sm:p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div className="min-w-0 space-y-1">
                <p className="text-sm font-semibold text-[#F3F4F6] sm:text-base">
                  {seasonEpisodeText}
                </p>
                {item.last_episode_title && (
                  <p className="truncate text-xs text-[#9CA3AF] sm:text-sm">
                    {item.last_episode_title}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2 font-mono text-xs text-[#9CA3AF]">
                <span>
                  {pos.totalEpisodes
                    ? `#${pos.absEpisode} de ${pos.totalEpisodes}`
                    : `#${pos.absEpisode}`}
                </span>
                {hasPlaybackProgress && (
                  <span>
                    · {formatTimecode(item.last_position_sec)} /{" "}
                    {formatTimecode(item.last_duration_sec)}
                  </span>
                )}
              </div>
            </div>

            <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#22252D]">
              <div
                className="h-full rounded-full bg-[#F47521] transition-all"
                style={{ width: `${progressBarWidth}%` }}
              />
            </div>
          </div>

          {item.next_airing && (
            <p className="inline-flex items-center gap-1.5 text-xs text-[#9CA3AF]">
              <Calendar className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>
                Próximo episódio ({item.next_airing.episode}):{" "}
                {formatReleaseDatePt(item.next_airing.airing_at, true)}
              </span>
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2 pt-0.5">
            <button
              type="button"
              disabled={isIncrementing}
              onClick={() => onIncrement(item)}
              className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg bg-[#F47521] px-4 py-2 text-sm font-semibold text-[#0B0C0E] transition-colors hover:bg-[#FF8533] disabled:opacity-60"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              <span>{isIncrementing ? "Salvando..." : "+1 Episódio"}</span>
            </button>

            <button
              type="button"
              onClick={() => onOpenEpisodes(item)}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-[#22252D] bg-[#1A1D24] px-4 py-2 text-sm font-medium text-[#F3F4F6] transition-colors hover:border-[#2E323D]"
            >
              <ListVideo className="h-4 w-4 text-[#9CA3AF]" aria-hidden="true" />
              <span>Episódios</span>
            </button>

            <button
              type="button"
              onClick={() => onOpenRematch(item)}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-[#22252D] bg-[#131519] px-3.5 py-2 text-sm font-medium text-[#9CA3AF] transition-colors hover:border-[#2E323D] hover:text-[#F3F4F6]"
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
                  className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg bg-[#BE123C] px-3.5 py-2 text-sm font-semibold text-[#F3F4F6] transition-colors hover:bg-[#E11D48] disabled:opacity-60"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                  <span>{isDeleting ? "Excluindo..." : "Confirmar"}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-[#22252D] bg-[#1A1D24] px-3 py-2 text-sm font-medium text-[#F3F4F6]"
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
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-[#22252D] bg-[#131519] px-3.5 py-2 text-sm font-medium text-[#9CA3AF] transition-colors hover:border-[#BE123C] hover:text-[#FDA4AF] disabled:opacity-60"
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
