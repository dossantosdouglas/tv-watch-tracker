"use client";

import { useEffect, useState } from "react";
import { Calendar, ListVideo, Plus, Star, Trash2, X } from "lucide-react";
import type { MediaItem } from "@/lib/types";
import {
  formatRelativeTimePt,
  formatReleaseDatePt,
  getAppMeta,
  getMediaTypeLabelPt,
  getProgressPercent,
  getStatusLabelPt,
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

function formatScoreValue(score: number | null): string | null {
  if (score == null || score <= 0) return null;
  return score > 10 ? (score / 10).toFixed(1) : score.toFixed(1);
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
  const appMeta = getAppMeta(item.last_app);
  const progress = getProgressPercent(item.current_episode, item.total_episodes);
  const effectiveWidth =
    progress !== null ? progress : item.current_episode > 0 ? 30 : 0;
  const isUnifiedSeason =
    item.media_type === "anime" || item.current_season <= 1;
  const epDisplay = isUnifiedSeason
    ? `EP ${item.current_episode}`
    : `T${item.current_season} · EP ${item.current_episode}`;
  const scoreFormatted = formatScoreValue(item.score);
  const airingNow = isCurrentlyAiring(item);

  useEffect(() => {
    if (!confirmDelete) return;
    const timer = window.setTimeout(() => setConfirmDelete(false), 4500);
    return () => window.clearTimeout(timer);
  }, [confirmDelete]);

  if (viewMode === "compact") {
    return (
      <article className="group flex flex-col gap-3 rounded-xl border border-[#262A38] bg-[#13151C]/95 p-3 transition-colors hover:border-[#373D52] sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <button
            type="button"
            onClick={() => onOpenDetail(item)}
            aria-label={`Abrir episódios de ${item.title}`}
            className="h-16 w-11 shrink-0 overflow-hidden rounded-lg border border-[#373D52] bg-[#1B1E28]"
          >
            {item.cover_image ? (
              <img
                src={item.cover_image}
                alt={`Capa de ${item.title}`}
                width={88}
                height={128}
                loading="lazy"
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center p-1 text-center text-[10px] font-semibold text-[#A8B0C2]">
                {item.title}
              </div>
            )}
          </button>

          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] ${appMeta.badgeClass}`}
              >
                {appMeta.label}
              </span>
              {scoreFormatted && (
                <span className="inline-flex items-center gap-1 rounded border border-[#373D52] bg-[#0B0C10] px-1.5 py-0.5 font-mono text-[10px] font-bold text-[#FCD34D]">
                  <Star
                    className="h-2.5 w-2.5 fill-[#FCD34D] text-[#FCD34D]"
                    aria-hidden="true"
                  />
                  {scoreFormatted}
                </span>
              )}
              {airingNow && (
                <span className="rounded border border-[#22C55E]/40 bg-[#0B0C10] px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase text-[#4ADE80]">
                  Em Exibição
                </span>
              )}
              {item.status !== "watching" && (
                <span className="rounded border border-[#373D52] bg-[#1B1E28] px-1.5 py-0.5 text-[10px] text-[#A8B0C2]">
                  {getStatusLabelPt(item.status)}
                </span>
              )}
            </div>

            <h3 className="truncate text-sm font-bold text-[#F4F5F7] sm:text-base">
              {item.title}
            </h3>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#A8B0C2]">
              <span className="truncate">
                {item.last_episode_title ||
                  `${getMediaTypeLabelPt(item.media_type)} · ${formatRelativeTimePt(item.last_watched_at)}`}
              </span>
              {item.next_airing && (
                <span className="inline-flex items-center gap-1 font-mono text-[11px] font-semibold text-[#FCD34D]">
                  <Calendar className="h-3 w-3 shrink-0" aria-hidden="true" />
                  Próx. Ep {item.next_airing.episode}:{" "}
                  {formatReleaseDatePt(item.next_airing.airing_at, true)}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 sm:justify-end">
          <div className="min-w-[128px] space-y-1">
            <div className="flex items-baseline justify-between gap-2 font-mono">
              <span className="text-sm font-extrabold text-[#FF9248]">
                {epDisplay}
                {item.total_episodes ? (
                  <span className="font-normal text-[#A8B0C2]">
                    {" "}
                    / {item.total_episodes}
                  </span>
                ) : null}
              </span>
              {progress !== null && (
                <span className="text-xs font-semibold text-[#A8B0C2]">
                  {progress}%
                </span>
              )}
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#262A38]">
              <div
                className={`h-full rounded-full ${appMeta.barClass}`}
                style={{ width: `${effectiveWidth}%` }}
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
                className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg bg-[#BE123C] px-3 py-2 text-xs font-bold text-[#FFFFFF] hover:bg-[#E11D48] disabled:opacity-60"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{isDeleting ? "..." : "Confirmar"}</span>
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                aria-label={`Cancelar exclusão de ${item.title}`}
                className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-[#373D52] bg-[#1B1E28] text-[#F4F5F7] hover:bg-[#262A38]"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => onOpenDetail(item)}
                className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg border border-[#262A38] bg-[#1B1E28] px-3 py-2 text-xs font-semibold text-[#F4F5F7] hover:border-[#373D52] hover:bg-[#262A38]"
              >
                <ListVideo
                  className="h-4 w-4 text-[#A8B0C2]"
                  aria-hidden="true"
                />
                <span>Episódios</span>
              </button>
              <button
                type="button"
                disabled={isIncrementing}
                onClick={() => onIncrement(item)}
                aria-label={`Marcar próximo episódio de ${item.title} (+1)`}
                className="inline-flex min-h-[44px] min-w-[54px] items-center justify-center gap-1 rounded-lg bg-[#F47521] px-3 py-2 font-mono text-xs font-bold text-[#0B0C10] hover:bg-[#FF8B3D] disabled:opacity-60"
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
                className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-[#262A38] bg-[#0B0C10] text-[#FDA4AF] hover:border-[#BE123C] hover:bg-[#BE123C]/15 disabled:opacity-60"
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
    <article className="group flex flex-col overflow-hidden rounded-2xl border border-[#262A38] bg-[#13151C] shadow-md transition-all hover:border-[#373D52] hover:shadow-[0_18px_40px_-20px_rgba(244,117,33,0.3)]">
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-[#1B1E28] sm:aspect-[3/4]">
        {item.cover_image ? (
          <img
            src={item.cover_image}
            alt={`Capa de ${item.title}`}
            width={400}
            height={540}
            loading="lazy"
            className="h-full w-full object-cover object-top transition-transform duration-500 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center p-4 text-center text-sm font-semibold text-[#A8B0C2]">
            {item.title}
          </div>
        )}

        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#0B0C10]/85 via-transparent to-[#0B0C10]"
        />

        <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-wrap items-start justify-between gap-1.5 p-2.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={`rounded-md px-2 py-0.5 text-[11px] shadow-sm ${appMeta.badgeClass}`}
            >
              {appMeta.label}
            </span>
            {airingNow && (
              <span className="rounded-md border border-[#22C55E]/40 bg-[#0B0C10]/90 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-[#4ADE80] backdrop-blur-sm">
                Em Exibição
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            {scoreFormatted && (
              <span className="inline-flex items-center gap-1 rounded-md border border-[#373D52] bg-[#0B0C10]/90 px-2 py-0.5 font-mono text-[11px] font-bold text-[#FCD34D] backdrop-blur-sm">
                <Star
                  className="h-3 w-3 fill-[#FCD34D] text-[#FCD34D]"
                  aria-hidden="true"
                />
                {scoreFormatted}
              </span>
            )}
            {item.status !== "watching" && (
              <span className="rounded-md border border-[#373D52] bg-[#0B0C10]/90 px-2 py-0.5 text-[11px] font-medium text-[#F4F5F7]">
                {getStatusLabelPt(item.status)}
              </span>
            )}
          </div>
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 px-3 pb-2.5 pt-8">
          <div className="flex items-baseline gap-1.5">
            <span className="font-mono text-xl font-extrabold tracking-tight text-[#F4F5F7] drop-shadow">
              {epDisplay}
            </span>
            {item.total_episodes ? (
              <span className="font-mono text-xs font-semibold text-[#A8B0C2]">
                / {item.total_episodes}
              </span>
            ) : null}
          </div>
          {progress !== null && (
            <span className="rounded-md border border-[#F47521]/40 bg-[#0B0C10]/90 px-2 py-0.5 font-mono text-xs font-bold text-[#FF9248] backdrop-blur-sm">
              {progress}%
            </span>
          )}
        </div>
      </div>

      <div className="h-1 w-full bg-[#262A38]">
        <div
          className={`h-full transition-all ${appMeta.barClass}`}
          style={{ width: `${effectiveWidth}%` }}
        />
      </div>

      <div className="flex flex-1 flex-col justify-between gap-2.5 p-3.5">
        <div className="space-y-1.5">
          <h3 className="line-clamp-2 text-base font-bold leading-snug text-[#F4F5F7]">
            {item.title}
          </h3>

          <p className="text-xs text-[#A8B0C2]">
            {getMediaTypeLabelPt(item.media_type)}
            {item.release_year ? ` · ${item.release_year}` : ""} ·{" "}
            {formatRelativeTimePt(item.last_watched_at)}
          </p>

          {item.last_episode_title && (
            <p className="truncate text-xs font-medium text-[#F4F5F7]/90">
              {item.last_episode_title}
            </p>
          )}
        </div>

        {item.next_airing && (
          <p className="inline-flex max-w-full items-center gap-1.5 truncate rounded-lg border border-[#FCD34D]/35 bg-[#0B0C10]/85 px-2.5 py-1 font-mono text-[11px] font-semibold text-[#FCD34D]">
            <Calendar className="h-3 w-3 shrink-0" aria-hidden="true" />
            <span className="truncate">
              Próx. Ep {item.next_airing.episode}:{" "}
              {formatReleaseDatePt(item.next_airing.airing_at, true)}
            </span>
          </p>
        )}
      </div>

      <div className="mt-auto border-t border-[#262A38] bg-[#0B0C10]/45 p-2.5 sm:px-3.5 sm:py-3">
        {confirmDelete ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isDeleting}
              onClick={() => {
                setConfirmDelete(false);
                onDelete(item);
              }}
              className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#BE123C] px-3 py-2 text-xs font-bold text-[#FFFFFF] transition-colors hover:bg-[#E11D48] disabled:opacity-60"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{isDeleting ? "Excluindo..." : "Confirmar?"}</span>
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              aria-label={`Cancelar exclusão de ${item.title}`}
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-[#373D52] bg-[#1B1E28] px-2.5 py-2 text-xs font-semibold text-[#F4F5F7] hover:bg-[#262A38]"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-[1fr_auto_auto] gap-2">
            <button
              type="button"
              onClick={() => onOpenDetail(item)}
              className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-[#262A38] bg-[#1B1E28] px-3 py-2 text-xs font-semibold text-[#F4F5F7] transition-colors hover:border-[#373D52] hover:bg-[#262A38]"
            >
              <ListVideo
                className="h-4 w-4 text-[#A8B0C2]"
                aria-hidden="true"
              />
              <span>Episódios</span>
            </button>

            <button
              type="button"
              disabled={isIncrementing}
              onClick={() => onIncrement(item)}
              aria-label={`Marcar próximo episódio de ${item.title} (+1)`}
              className="inline-flex min-h-[44px] min-w-[54px] items-center justify-center gap-1 rounded-xl bg-[#F47521] px-2.5 py-2 font-mono text-xs font-bold text-[#0B0C10] transition-colors hover:bg-[#FF8B3D] active:bg-[#E06514] disabled:opacity-60"
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
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-[#262A38] bg-[#13151C] text-[#FDA4AF] transition-colors hover:border-[#BE123C] hover:bg-[#BE123C]/15 disabled:opacity-60"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
    </article>
  );
}
