"use client";

import { useEffect, useState } from "react";
import {
  Calendar,
  ListVideo,
  Plus,
  Radio,
  RefreshCw,
  Star,
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
  showcaseItems?: MediaItem[];
  onSelectHero?: (mediaId: string) => void;
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

const LED_SEGMENT_COUNT = 20;

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

export function HeroSpotlight({
  item,
  showcaseItems = [],
  onSelectHero,
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
        className="hud-deck-shadow relative min-h-[380px] overflow-hidden rounded-2xl border border-[#262A38] bg-[#13151C]/90 p-5 sm:min-h-[420px] sm:p-8"
      >
        <div className="space-y-4">
          <p
            id="hero-loading-title"
            className="font-mono text-xs font-bold uppercase tracking-widest text-[#FF9248]"
          >
            Sintonizando deck da Smart TV...
          </p>
          <div className="flex flex-col gap-6 sm:flex-row">
            <div className="h-56 w-40 shrink-0 rounded-xl bg-[#1B1E28]" />
            <div className="flex flex-1 flex-col gap-3">
              <div className="h-6 w-44 rounded bg-[#1B1E28]" />
              <div className="h-10 w-3/4 rounded bg-[#1B1E28]" />
              <div className="h-12 w-1/2 rounded bg-[#1B1E28]" />
              <div className="h-4 w-full max-w-md rounded bg-[#1B1E28]" />
            </div>
          </div>
        </div>
      </section>
    );
  }

  if (!item) {
    return (
      <section
        aria-labelledby="hero-empty-title"
        className="hud-deck-shadow relative overflow-hidden rounded-2xl border border-[#262A38] bg-[#13151C]/95 p-6 sm:p-10"
      >
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-xl space-y-3">
            <p className="font-mono text-xs font-bold uppercase tracking-widest text-[#FF9248]">
              Cinema Broadcast Deck · Onde Parei
            </p>
            <h1
              id="hero-empty-title"
              className="text-2xl font-extrabold tracking-tight text-[#F4F5F7] sm:text-4xl"
            >
              Nenhuma obra registrada ainda
            </h1>
            <p className="text-sm leading-relaxed text-[#A8B0C2] sm:text-base">
              Assim que você assistir a um episódio no Crunchyroll pela Smart
              TV, o deck sincroniza automaticamente. Você também pode adicionar
              seu primeiro anime manualmente agora.
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
              <span>Ver Sinal Ao Vivo</span>
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
  const effectiveProgress =
    seriesProgress !== null
      ? seriesProgress
      : item.current_episode > 0
        ? 35
        : 0;
  const litSegments = Math.max(
    item.current_episode > 0 ? 1 : 0,
    Math.round((effectiveProgress / 100) * LED_SEGMENT_COUNT)
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
  const isUnifiedSeason =
    item.media_type === "anime" || item.current_season <= 1;
  const scoreFormatted = formatScoreValue(item.score);
  const airingNow = isCurrentlyAiring(item);
  const episodeNumberPadded = String(item.current_episode).padStart(2, "0");

  return (
    <section
      aria-labelledby="hero-spotlight-title"
      className="hud-deck-shadow relative flex min-h-[380px] flex-col justify-between overflow-hidden rounded-2xl border border-[#262A38] bg-[#13151C] sm:min-h-[440px]"
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
            className="h-full w-full scale-105 object-cover object-center opacity-40 transition-opacity duration-500"
          />
          <div className="cinema-scanlines absolute inset-0 opacity-60" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0B0C10] via-[#0B0C10]/85 to-[#0B0C10]/55 sm:bg-gradient-to-r sm:from-[#0B0C10] sm:via-[#0B0C10]/88 sm:to-[#0B0C10]/40" />
          <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[#F47521]/15 blur-3xl" />
        </div>
      )}

      <div className="relative z-10 flex flex-1 flex-col gap-5 p-4 sm:p-6 lg:p-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-stretch sm:gap-7">
          <div className="flex items-start gap-4 sm:block">
            <div className="relative aspect-[2/3] w-28 shrink-0 overflow-hidden rounded-xl border border-[#373D52] bg-[#1B1E28] shadow-[0_20px_50px_-15px_rgba(244,117,33,0.35)] sm:w-44 lg:w-48">
              {item.cover_image ? (
                <img
                  src={item.cover_image}
                  alt={`Capa de ${item.title}`}
                  width={360}
                  height={540}
                  fetchPriority="high"
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center p-3 text-center text-xs font-semibold text-[#A8B0C2]">
                  {item.title}
                </div>
              )}

              {scoreFormatted && (
                <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-md border border-[#373D52] bg-[#0B0C10]/90 px-2 py-0.5 font-mono text-xs font-bold text-[#FCD34D] backdrop-blur-sm">
                  <Star
                    className="h-3 w-3 fill-[#FCD34D] text-[#FCD34D]"
                    aria-hidden="true"
                  />
                  <span>{scoreFormatted}</span>
                </span>
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
                {airingNow && (
                  <span className="rounded-md border border-[#22C55E]/40 bg-[#0B0C10]/90 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-[#4ADE80]">
                    Em Exibição
                  </span>
                )}
              </div>
              <p className="font-mono text-[11px] font-medium text-[#A8B0C2]">
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

          <div className="flex min-w-0 flex-1 flex-col justify-between gap-4">
            <div className="space-y-3">
              <div className="hidden flex-wrap items-center gap-2 sm:flex">
                <span className="inline-flex items-center gap-1.5 rounded-md border border-[#F47521]/40 bg-[#F47521]/10 px-2.5 py-0.5 font-mono text-[11px] font-bold uppercase tracking-wider text-[#FF9248]">
                  <span
                    className="h-1.5 w-1.5 rounded-full bg-[#F47521]"
                    aria-hidden="true"
                  />
                  Onde Parei na TV
                </span>
                <span
                  className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-0.5 text-xs ${appMeta.badgeClass}`}
                >
                  <Tv className="h-3.5 w-3.5" aria-hidden="true" />
                  {appMeta.label}
                </span>
                <span className="rounded-md border border-[#373D52] bg-[#1B1E28]/90 px-2 py-0.5 text-xs font-medium text-[#F4F5F7]">
                  {getMediaTypeLabelPt(item.media_type)}
                </span>
                <span className="rounded-md border border-[#373D52] bg-[#1B1E28]/90 px-2 py-0.5 text-xs font-medium text-[#A8B0C2]">
                  {getStatusLabelPt(item.status)}
                </span>
                {airingNow && (
                  <span className="rounded-md border border-[#22C55E]/40 bg-[#0B0C10]/85 px-2 py-0.5 font-mono text-[11px] font-bold uppercase tracking-wider text-[#4ADE80]">
                    Em Exibição
                  </span>
                )}
                <span className="font-mono text-xs font-medium text-[#A8B0C2]">
                  {isFromTv
                    ? `Visto ${relativeTime} na Smart TV`
                    : `Atualizado ${relativeTime}`}
                </span>
              </div>

              <h1
                id="hero-spotlight-title"
                className="hidden text-2xl font-extrabold tracking-tight text-[#F4F5F7] sm:block lg:text-4xl"
              >
                {item.title}
              </h1>

              <div className="flex flex-col gap-3 rounded-xl border border-[#262A38]/90 bg-[#0B0C10]/80 p-3.5 backdrop-blur-md sm:flex-row sm:items-center sm:justify-between sm:p-4">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-baseline gap-2.5">
                    {!isUnifiedSeason && (
                      <span className="rounded border border-[#373D52] bg-[#1B1E28] px-2 py-0.5 font-mono text-xs font-bold text-[#A8B0C2]">
                        T{item.current_season}
                      </span>
                    )}
                    <span className="font-mono text-2xl font-extrabold tracking-tight text-[#FF9248] sm:text-3xl">
                      EP. {episodeNumberPadded}
                    </span>
                    {item.total_episodes ? (
                      <span className="font-mono text-base font-semibold text-[#A8B0C2] sm:text-lg">
                        / {item.total_episodes}
                      </span>
                    ) : null}
                  </div>
                  <p className="truncate text-sm font-medium text-[#F4F5F7] sm:text-base">
                    {item.last_episode_title ||
                      `Episódio ${item.current_episode} em andamento`}
                  </p>
                </div>

                {item.next_airing && (
                  <div className="inline-flex shrink-0 items-center gap-2 self-start rounded-lg border border-[#FCD34D]/35 bg-[#13151C] px-3 py-2 text-xs font-semibold text-[#FCD34D] sm:self-center">
                    <Calendar
                      className="h-3.5 w-3.5 shrink-0"
                      aria-hidden="true"
                    />
                    <span>
                      Próx. Ep {item.next_airing.episode}:{" "}
                      {formatReleaseDatePt(item.next_airing.airing_at, true)}
                    </span>
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-mono font-semibold uppercase tracking-wider text-[#A8B0C2]">
                      Telemetria da Série
                    </span>
                    <span className="font-mono font-bold text-[#F4F5F7]">
                      {item.total_episodes
                        ? `${item.current_episode} de ${item.total_episodes} eps (${seriesProgress ?? 0}%)`
                        : `${item.current_episode} eps assistidos`}
                    </span>
                  </div>
                  <div
                    role="progressbar"
                    aria-label="Progresso na obra"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={effectiveProgress}
                    className="grid grid-cols-[repeat(20,minmax(0,1fr))] gap-1"
                  >
                    {Array.from({ length: LED_SEGMENT_COUNT }).map((_, idx) => {
                      const isLit = idx < litSegments;
                      return (
                        <span
                          key={idx}
                          className={`h-2.5 rounded-[3px] transition-colors ${
                            isLit
                              ? "bg-gradient-to-t from-[#F47521] to-[#FF9248] shadow-[0_0_8px_rgba(244,117,33,0.45)]"
                              : "bg-[#1B1E28] ring-1 ring-inset ring-[#262A38]"
                          }`}
                        />
                      );
                    })}
                  </div>
                </div>

                {hasPlaybackProgress && playbackPercent !== null && (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-[#A8B0C2]">
                        Minuto na TV
                      </span>
                      <span className="font-mono font-semibold text-[#F4F5F7]">
                        {formatTimecode(item.last_position_sec)} /{" "}
                        {formatTimecode(item.last_duration_sec)}
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#262A38]">
                      <div
                        className={`h-full rounded-full ${appMeta.barClass}`}
                        style={{ width: `${playbackPercent}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                disabled={isIncrementing}
                onClick={() => onIncrement(item)}
                className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-[#F47521] to-[#FF8B3D] px-4 py-2.5 text-sm font-bold text-[#0B0C10] shadow-[0_10px_24px_-8px_rgba(244,117,33,0.75)] transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-60"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                <span>
                  {isIncrementing ? "Salvando..." : "+1 Episódio"}
                </span>
              </button>

              <button
                type="button"
                onClick={() => onOpenEpisodes(item)}
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-[#373D52] bg-[#1B1E28]/90 px-4 py-2.5 text-sm font-semibold text-[#F4F5F7] backdrop-blur-sm transition-colors hover:border-[#4B536E] hover:bg-[#262A38]"
              >
                <ListVideo
                  className="h-4 w-4 text-[#A8B0C2]"
                  aria-hidden="true"
                />
                <span>Lista de Episódios</span>
              </button>

              <button
                type="button"
                onClick={() => onOpenRematch(item)}
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-[#262A38] bg-[#13151C]/90 px-3.5 py-2.5 text-sm font-medium text-[#A8B0C2] transition-colors hover:border-[#373D52] hover:bg-[#1B1E28] hover:text-[#F4F5F7]"
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
                  className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-[#262A38] bg-[#13151C]/90 px-3.5 py-2.5 text-sm font-medium text-[#FDA4AF] transition-colors hover:border-[#BE123C] hover:bg-[#BE123C]/15 disabled:opacity-60"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                  <span>Excluir</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {showcaseItems.length > 1 && onSelectHero && (
        <div className="relative z-10 border-t border-[#262A38]/80 bg-[#0B0C10]/75 px-4 py-3 backdrop-blur-md sm:px-6 lg:px-8">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <span className="font-mono text-[11px] font-bold uppercase tracking-widest text-[#A8B0C2]">
              Alternar Destaque ({showcaseItems.length})
            </span>
            <div
              role="group"
              aria-label="Selecionar obra em destaque"
              className="flex gap-2 overflow-x-auto pb-1 lg:pb-0"
            >
              {showcaseItems.map((candidate) => {
                const isSelected = candidate.id === item.id;
                const candLabel =
                  candidate.media_type === "anime" ||
                  candidate.current_season <= 1
                    ? `EP ${candidate.current_episode}`
                    : `T${candidate.current_season}·E${candidate.current_episode}`;
                return (
                  <button
                    key={candidate.id}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => onSelectHero(candidate.id)}
                    className={`inline-flex min-h-[44px] max-w-[200px] shrink-0 items-center gap-2.5 rounded-xl border px-2.5 py-1.5 text-left transition-all ${
                      isSelected
                        ? "border-[#F47521] bg-[#1B1E28] text-[#F4F5F7] shadow-[0_0_16px_-4px_rgba(244,117,33,0.45)]"
                        : "border-[#262A38] bg-[#13151C]/90 text-[#A8B0C2] hover:border-[#373D52] hover:text-[#F4F5F7]"
                    }`}
                  >
                    <div className="h-8 w-6 shrink-0 overflow-hidden rounded bg-[#1B1E28]">
                      {candidate.cover_image ? (
                        <img
                          src={candidate.cover_image}
                          alt=""
                          width={48}
                          height={64}
                          className="h-full w-full object-cover"
                        />
                      ) : null}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-bold leading-tight">
                        {candidate.title}
                      </p>
                      <p
                        className={`font-mono text-[11px] font-semibold ${
                          isSelected ? "text-[#FF9248]" : "text-[#A8B0C2]"
                        }`}
                      >
                        {candLabel}
                        {candidate.total_episodes
                          ? ` / ${candidate.total_episodes}`
                          : ""}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
