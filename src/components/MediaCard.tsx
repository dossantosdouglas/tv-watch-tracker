"use client";

import { useEffect, useState } from "react";
import { Calendar, ListVideo, Plus, Trash2, X } from "lucide-react";
import type { MediaItem } from "@/lib/types";
import {
  formatRelativeTimePt,
  formatReleaseDatePt,
  getAppMeta,
  getMediaTypeLabelPt,
  getProgressPercent,
  getStatusLabelPt,
} from "./formatters";

interface MediaCardProps {
  item: MediaItem;
  isIncrementing: boolean;
  isDeleting: boolean;
  onIncrement: (item: MediaItem) => void;
  onDelete: (item: MediaItem) => void;
  onOpenDetail: (item: MediaItem) => void;
}

export function MediaCard({
  item,
  isIncrementing,
  isDeleting,
  onIncrement,
  onDelete,
  onOpenDetail,
}: MediaCardProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const appMeta = getAppMeta(item.last_app);
  const progress = getProgressPercent(item.current_episode, item.total_episodes);

  useEffect(() => {
    if (!confirmDelete) return;
    const timer = window.setTimeout(() => setConfirmDelete(false), 4500);
    return () => window.clearTimeout(timer);
  }, [confirmDelete]);

  return (
    <article className="flex flex-col overflow-hidden rounded-xl border border-[#262A38] bg-[#13151C] transition-colors hover:border-[#373D52]">
      <div className="flex gap-3.5 p-3.5 sm:flex-col sm:gap-0 sm:p-0">
        <div className="relative aspect-[2/3] w-24 shrink-0 overflow-hidden rounded-lg bg-[#1B1E28] sm:w-full sm:rounded-none">
          {item.cover_image ? (
            <img
              src={item.cover_image}
              alt={`Capa de ${item.title}`}
              width={300}
              height={450}
              loading="lazy"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center p-3 text-center text-xs font-semibold text-[#A8B0C2]">
              {item.title}
            </div>
          )}

          <div className="pointer-events-none absolute inset-x-0 top-0 hidden justify-between gap-1.5 bg-gradient-to-b from-[#0B0C10]/85 to-transparent p-2.5 sm:flex">
            <span
              className={`rounded-md px-2 py-0.5 text-[11px] ${appMeta.badgeClass}`}
            >
              {appMeta.label}
            </span>
            {item.status !== "watching" && (
              <span className="rounded-md border border-[#373D52] bg-[#0B0C10]/90 px-2 py-0.5 text-[11px] font-medium text-[#F4F5F7]">
                {getStatusLabelPt(item.status)}
              </span>
            )}
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col justify-between gap-2.5 sm:p-3.5">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-1.5 sm:hidden">
              <span
                className={`rounded px-1.5 py-0.5 text-[11px] ${appMeta.badgeClass}`}
              >
                {appMeta.label}
              </span>
              {item.status !== "watching" && (
                <span className="rounded border border-[#373D52] bg-[#1B1E28] px-1.5 py-0.5 text-[11px] text-[#A8B0C2]">
                  {getStatusLabelPt(item.status)}
                </span>
              )}
            </div>

            <h3 className="line-clamp-2 text-base font-bold leading-snug text-[#F4F5F7]">
              {item.title}
            </h3>

            <p className="text-xs text-[#A8B0C2]">
              {getMediaTypeLabelPt(item.media_type)}
              {item.release_year ? ` · ${item.release_year}` : ""} ·{" "}
              {formatRelativeTimePt(item.last_watched_at)}
            </p>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-mono text-sm font-bold text-[#F4F5F7]">
                {item.media_type === "anime" || item.current_season <= 1
                  ? `EP ${item.current_episode}`
                  : `T${item.current_season} · EP ${item.current_episode}`}
                {item.total_episodes ? (
                  <span className="font-normal text-[#A8B0C2]">
                    {" "}
                    / {item.total_episodes}
                  </span>
                ) : null}
              </span>
              {progress !== null && (
                <span className="font-mono text-xs text-[#A8B0C2]">
                  {progress}%
                </span>
              )}
            </div>

            {item.last_episode_title && (
              <p className="truncate text-xs text-[#A8B0C2]">
                {item.last_episode_title}
              </p>
            )}

            {item.next_airing && (
              <p className="inline-flex max-w-full items-center gap-1.5 truncate rounded-md border border-[#FCD34D]/30 bg-[#0B0C10]/80 px-2 py-1 font-mono text-[11px] font-semibold text-[#FCD34D]">
                <Calendar className="h-3 w-3 shrink-0" aria-hidden="true" />
                <span className="truncate">
                  Próx. Ep {item.next_airing.episode}:{" "}
                  {formatReleaseDatePt(item.next_airing.airing_at, true)}
                </span>
              </p>
            )}

            <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#262A38]">
              <div
                className={`h-full rounded-full ${appMeta.barClass}`}
                style={{
                  width: `${
                    progress !== null
                      ? progress
                      : item.current_episode > 0
                        ? 30
                        : 0
                  }%`,
                }}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="mt-auto border-t border-[#262A38] p-2.5 sm:px-3.5 sm:py-3">
        {confirmDelete ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isDeleting}
              onClick={() => {
                setConfirmDelete(false);
                onDelete(item);
              }}
              className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#BE123C] px-3 py-2 text-xs font-bold text-[#FFFFFF] transition-colors hover:bg-[#E11D48] disabled:opacity-60"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{isDeleting ? "Excluindo..." : "Confirmar?"}</span>
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              aria-label={`Cancelar exclusão de ${item.title}`}
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-[#373D52] bg-[#1B1E28] px-2.5 py-2 text-xs font-semibold text-[#F4F5F7] hover:bg-[#262A38]"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-[1fr_auto_auto] gap-2">
            <button
              type="button"
              onClick={() => onOpenDetail(item)}
              className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg border border-[#262A38] bg-[#1B1E28] px-3 py-2 text-xs font-semibold text-[#F4F5F7] transition-colors hover:border-[#373D52] hover:bg-[#262A38]"
            >
              <ListVideo className="h-4 w-4 text-[#A8B0C2]" aria-hidden="true" />
              <span>Episódios</span>
            </button>

            <button
              type="button"
              disabled={isIncrementing}
              onClick={() => onIncrement(item)}
              aria-label={`Marcar próximo episódio de ${item.title} (+1)`}
              className="inline-flex min-h-[44px] min-w-[54px] items-center justify-center gap-1 rounded-lg bg-[#F47521] px-2.5 py-2 font-mono text-xs font-bold text-[#0B0C10] transition-colors hover:bg-[#FF8B3D] active:bg-[#E06514] disabled:opacity-60"
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
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-[#262A38] bg-[#13151C] text-[#FDA4AF] transition-colors hover:border-[#BE123C] hover:bg-[#BE123C]/15 disabled:opacity-60"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
    </article>
  );
}
