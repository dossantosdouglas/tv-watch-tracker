"use client";

import { useEffect, useState } from "react";
import { Calendar, ListVideo, Plus, Trash2, X } from "lucide-react";
import type { MediaItem } from "@/lib/types";
import {
  formatReleaseDatePt,
  formatSeasonEpisodeLabel,
  getProgressPercent,
  resolveCurrentEpisodePosition,
} from "./formatters";

export type MediaViewMode = "grid" | "compact";

interface MediaCardProps {
  item: MediaItem;
  viewMode?: MediaViewMode;
  isIncrementing: boolean;
  isDeleting: boolean;
  onIncrement: (item: MediaItem) => void;
  onDelete: (item: MediaItem) => void;
  onOpenDetail: (item: MediaItem) => void;
}

function isCurrentlyAiring(item: MediaItem): boolean {
  const status = (item.airing_status || "").toLowerCase();
  return (
    status.includes("releasing") ||
    status.includes("airing") ||
    Boolean(item.next_airing)
  );
}

export function MediaCard({
  item,
  viewMode = "grid",
  isIncrementing,
  isDeleting,
  onIncrement,
  onDelete,
  onOpenDetail,
}: MediaCardProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const pos = resolveCurrentEpisodePosition(item);
  const progress = getProgressPercent(pos.absEpisode, pos.totalEpisodes);
  const barWidth =
    progress !== null ? progress : pos.absEpisode > 0 ? 30 : 0;
  const seasonEpisodeLabel = formatSeasonEpisodeLabel(pos.season, pos.episode);
  const epsCountLabel = pos.totalEpisodes
    ? `${pos.absEpisode} / ${pos.totalEpisodes} eps`
    : `${pos.absEpisode} eps`;
  const airingNow = isCurrentlyAiring(item);

  useEffect(() => {
    if (!confirmDelete) return;
    const timer = window.setTimeout(() => setConfirmDelete(false), 4500);
    return () => window.clearTimeout(timer);
  }, [confirmDelete]);

  if (viewMode === "compact") {
    return (
      <article className="flex flex-col gap-3 rounded-xl border border-[#22252D] bg-[#131519] p-3 transition-colors hover:border-[#2E323D] sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <button
            type="button"
            onClick={() => onOpenDetail(item)}
            aria-label={`Abrir episódios de ${item.title}`}
            className="aspect-[2/3] w-11 shrink-0 overflow-hidden rounded-md border border-[#22252D] bg-[#0B0C0E]"
          >
            {item.cover_image ? (
              <img
                src={item.cover_image}
                alt={`Capa de ${item.title}`}
                width={88}
                height={132}
                loading="lazy"
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center p-1 text-center text-[10px] text-[#9CA3AF]">
                {item.title}
              </div>
            )}
          </button>

          <div className="min-w-0 flex-1 space-y-1">
            <h3 className="line-clamp-1 text-sm font-semibold text-[#F3F4F6] sm:text-base">
              {item.title}
            </h3>
            <p className="text-xs text-[#9CA3AF]">
              {seasonEpisodeLabel} · {epsCountLabel}
            </p>
            {item.next_airing && (
              <p className="inline-flex items-center gap-1 text-xs text-[#9CA3AF]">
                <Calendar className="h-3 w-3 shrink-0" aria-hidden="true" />
                <span>
                  Próx. Ep: {formatReleaseDatePt(item.next_airing.airing_at, true)}
                </span>
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 sm:justify-end">
          <div className="w-28 space-y-1">
            <div className="h-1 w-full overflow-hidden rounded-full bg-[#22252D]">
              <div
                className="h-full rounded-full bg-[#F47521]"
                style={{ width: `${barWidth}%` }}
              />
            </div>
          </div>

          {confirmDelete ? (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => {
                  setConfirmDelete(false);
                  onDelete(item);
                }}
                className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg bg-[#BE123C] px-3 py-2 text-xs font-semibold text-[#F3F4F6] hover:bg-[#E11D48] disabled:opacity-60"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{isDeleting ? "..." : "Confirmar"}</span>
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                aria-label={`Cancelar exclusão de ${item.title}`}
                className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-[#22252D] bg-[#1A1D24] text-[#F3F4F6]"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => onOpenDetail(item)}
                className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg border border-[#22252D] bg-[#1A1D24] px-3 py-2 text-xs font-medium text-[#F3F4F6] hover:border-[#2E323D]"
              >
                <ListVideo className="h-4 w-4 text-[#9CA3AF]" aria-hidden="true" />
                <span>Episódios</span>
              </button>
              <button
                type="button"
                disabled={isIncrementing}
                onClick={() => onIncrement(item)}
                aria-label={`Marcar próximo episódio de ${item.title} (+1)`}
                className="inline-flex min-h-[44px] min-w-[48px] items-center justify-center gap-1 rounded-lg bg-[#F47521] px-3 py-2 font-mono text-xs font-semibold text-[#0B0C0E] hover:bg-[#FF8533] disabled:opacity-60"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{isIncrementing ? "..." : "+1"}</span>
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setConfirmDelete(true)}
                aria-label={`Excluir ${item.title}`}
                title="Excluir obra"
                className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-[#22252D] bg-[#0B0C0E] text-[#9CA3AF] hover:border-[#BE123C] hover:text-[#FDA4AF] disabled:opacity-60"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          )}
        </div>
      </article>
    );
  }

  return (
    <article className="flex flex-col overflow-hidden rounded-xl border border-[#22252D] bg-[#131519] transition-colors hover:border-[#2E323D]">
      <button
        type="button"
        onClick={() => onOpenDetail(item)}
        aria-label={`Abrir episódios de ${item.title}`}
        className="relative aspect-[2/3] w-full overflow-hidden bg-[#0B0C0E] text-left"
      >
        {item.cover_image ? (
          <img
            src={item.cover_image}
            alt={`Capa de ${item.title}`}
            width={400}
            height={600}
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center p-4 text-center text-sm font-medium text-[#9CA3AF]">
            {item.title}
          </div>
        )}

        {airingNow && (
          <span className="absolute left-2.5 top-2.5 rounded-md border border-[#22252D] bg-[#0B0C0E]/90 px-2 py-0.5 text-[11px] font-medium text-[#F3F4F6]">
            Em Exibição
          </span>
        )}
      </button>

      <div className="flex flex-1 flex-col justify-between gap-2.5 p-3.5">
        <div className="space-y-1">
          <h3 className="line-clamp-1 text-base font-semibold text-[#F3F4F6]">
            {item.title}
          </h3>
          <p className="text-xs font-medium text-[#F3F4F6]">
            {seasonEpisodeLabel}
          </p>
          <p className="font-mono text-xs text-[#9CA3AF]">{epsCountLabel}</p>
        </div>

        <div className="space-y-2">
          <div className="h-1 w-full overflow-hidden rounded-full bg-[#22252D]">
            <div
              className="h-full rounded-full bg-[#F47521]"
              style={{ width: `${barWidth}%` }}
            />
          </div>

          {item.next_airing && (
            <p className="inline-flex items-center gap-1.5 text-xs text-[#9CA3AF]">
              <Calendar className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>
                Próx. Ep: {formatReleaseDatePt(item.next_airing.airing_at)}
              </span>
            </p>
          )}
        </div>
      </div>

      <div className="mt-auto border-t border-[#22252D] p-2.5">
        {confirmDelete ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isDeleting}
              onClick={() => {
                setConfirmDelete(false);
                onDelete(item);
              }}
              className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#BE123C] px-3 py-2 text-xs font-semibold text-[#F3F4F6] hover:bg-[#E11D48] disabled:opacity-60"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{isDeleting ? "Excluindo..." : "Confirmar"}</span>
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              aria-label={`Cancelar exclusão de ${item.title}`}
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-[#22252D] bg-[#1A1D24] text-[#F3F4F6]"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-[1fr_auto_auto] gap-2">
            <button
              type="button"
              onClick={() => onOpenDetail(item)}
              className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg border border-[#22252D] bg-[#1A1D24] px-3 py-2 text-xs font-medium text-[#F3F4F6] transition-colors hover:border-[#2E323D]"
            >
              <ListVideo className="h-4 w-4 text-[#9CA3AF]" aria-hidden="true" />
              <span>Episódios</span>
            </button>

            <button
              type="button"
              disabled={isIncrementing}
              onClick={() => onIncrement(item)}
              aria-label={`Marcar próximo episódio de ${item.title} (+1)`}
              className="inline-flex min-h-[44px] min-w-[50px] items-center justify-center gap-1 rounded-lg bg-[#F47521] px-2.5 py-2 font-mono text-xs font-semibold text-[#0B0C0E] transition-colors hover:bg-[#FF8533] disabled:opacity-60"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{isIncrementing ? "..." : "+1"}</span>
            </button>

            <button
              type="button"
              disabled={isDeleting}
              onClick={() => setConfirmDelete(true)}
              aria-label={`Excluir ${item.title}`}
              title="Excluir obra"
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-[#22252D] bg-[#0B0C0E] text-[#9CA3AF] transition-colors hover:border-[#BE123C] hover:text-[#FDA4AF] disabled:opacity-60"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
    </article>
  );
}
