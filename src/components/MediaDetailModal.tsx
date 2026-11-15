"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Calendar,
  Check,
  ChevronRight,
  LayoutGrid,
  Link2,
  List,
  ListVideo,
  RefreshCw,
  Search,
  Trash2,
  Tv,
  X,
} from "lucide-react";
import type {
  CatalogEpisode,
  MediaItem,
  MediaPatchAction,
  SearchResult,
  WatchStatus,
} from "@/lib/types";
import {
  formatAbsoluteTimePt,
  formatReleaseDatePt,
  formatTimecode,
  getAppMeta,
  getMediaTypeLabelPt,
  getProviderLabel,
  getStatusLabelPt,
  stripHtml,
} from "./formatters";
import { useDialogAccessibility } from "./useFocusTrap";

export type DetailModalTab = "episodes" | "rematch";

interface MediaDetailModalProps {
  media: MediaItem | null;
  initialTab: DetailModalTab;
  onClose: () => void;
  onPatchMedia: (
    mediaId: string,
    payload: MediaPatchAction
  ) => Promise<MediaItem | null>;
  onDeleteMedia: (mediaId: string) => Promise<boolean>;
  onEpisodesUpdated?: (mediaId: string, episodes: CatalogEpisode[]) => void;
}

const STATUS_OPTIONS: WatchStatus[] = [
  "watching",
  "completed",
  "on_hold",
  "plan_to_watch",
];

export function MediaDetailModal(props: MediaDetailModalProps) {
  if (!props.media) return null;
  return (
    <MediaDetailModalInner
      key={`${props.media.id}-${props.initialTab}`}
      {...props}
      media={props.media}
    />
  );
}

interface MediaDetailModalInnerProps extends MediaDetailModalProps {
  media: MediaItem;
}

function MediaDetailModalInner({
  media,
  initialTab,
  onClose,
  onPatchMedia,
  onDeleteMedia,
  onEpisodesUpdated,
}: MediaDetailModalInnerProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  const [activeTab, setActiveTab] = useState<DetailModalTab>(initialTab);
  const [localEpisodes, setLocalEpisodes] = useState<CatalogEpisode[] | null>(
    null
  );
  const hasCachedOnMount =
    Array.isArray(media.catalog_episodes) && media.catalog_episodes.length > 0;
  const [epLoading, setEpLoading] = useState(!hasCachedOnMount);
  const [epRefreshing, setEpRefreshing] = useState(false);
  const [epError, setEpError] = useState<string | null>(null);
  const [selectedSeason, setSelectedSeason] = useState<number | "all">("all");
  const [episodeViewMode, setEpisodeViewMode] = useState<"list" | "matrix">(
    "list"
  );
  const [matrixClickMode, setMatrixClickMode] = useState<"up_to" | "toggle">(
    "up_to"
  );
  const [togglingKey, setTogglingKey] = useState<string | null>(null);
  const [markingUpToKey, setMarkingUpToKey] = useState<string | null>(null);

  const episodes = useMemo(() => {
    if (localEpisodes !== null) return localEpisodes;
    return Array.isArray(media.catalog_episodes) ? media.catalog_episodes : [];
  }, [localEpisodes, media.catalog_episodes]);

  const [draftSeason, setDraftSeason] = useState<string | null>(null);
  const [draftEpisode, setDraftEpisode] = useState<string | null>(null);
  const [savingProgress, setSavingProgress] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [rematchQuery, setRematchQuery] = useState(media.title);
  const [rematchType, setRematchType] = useState<"all" | "anime" | "series">(
    media.media_type === "anime" ? "anime" : "series"
  );
  const [rematchResults, setRematchResults] = useState<SearchResult[]>([]);
  const [rematchLoading, setRematchLoading] = useState(
    initialTab === "rematch"
  );
  const [rematchError, setRematchError] = useState<string | null>(null);
  const [rematchingId, setRematchingId] = useState<string | null>(null);

  const manualSeason = draftSeason ?? String(media.current_season || 1);
  const manualEpisode = draftEpisode ?? String(media.current_episode || 0);

  useDialogAccessibility(true, dialogRef, onClose);

  const loadEpisodes = useCallback(
    async (mediaId: string, forceRefresh = false) => {
      if (forceRefresh) {
        setEpRefreshing(true);
      } else {
        setEpLoading(true);
      }
      setEpError(null);
      try {
        const url = forceRefresh
          ? `/api/media/${mediaId}/episodes?refresh=1`
          : `/api/media/${mediaId}/episodes`;
        const res = await fetch(url, {
          cache: "no-store",
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Não foi possível carregar episódios.");
        }
        const nextList = Array.isArray(data.episodes) ? data.episodes : [];
        setLocalEpisodes(nextList);
        onEpisodesUpdated?.(mediaId, nextList);
      } catch (err) {
        setEpError(
          err instanceof Error
            ? err.message
            : "Erro ao buscar lista de episódios."
        );
      } finally {
        setEpLoading(false);
        setEpRefreshing(false);
      }
    },
    [onEpisodesUpdated]
  );

  const runRematchSearch = useCallback(
    async (query: string, type: "all" | "anime" | "series") => {
      const trimmed = query.trim();
      if (!trimmed) {
        setRematchResults([]);
        return;
      }
      setRematchLoading(true);
      setRematchError(null);
      try {
        const params = new URLSearchParams({ q: trimmed, type });
        const res = await fetch(`/api/search?${params.toString()}`);
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Falha ao buscar obras.");
        }
        setRematchResults(Array.isArray(data.results) ? data.results : []);
      } catch (err) {
        setRematchError(
          err instanceof Error ? err.message : "Erro ao buscar catálogos."
        );
      } finally {
        setRematchLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    let active = true;
    const hasCached =
      Array.isArray(media.catalog_episodes) &&
      media.catalog_episodes.length > 0;

    if (!hasCached) {
      fetch(`/api/media/${media.id}/episodes`, { cache: "no-store" })
        .then(async (res) => {
          const data = await res.json();
          if (!res.ok) {
            throw new Error(
              data.error || "Não foi possível carregar episódios."
            );
          }
          if (active) {
            const nextList = Array.isArray(data.episodes) ? data.episodes : [];
            setLocalEpisodes(nextList);
            setEpError(null);
            onEpisodesUpdated?.(media.id, nextList);
          }
        })
        .catch((err) => {
          if (active) {
            setEpError(
              err instanceof Error
                ? err.message
                : "Erro ao buscar lista de episódios."
            );
          }
        })
        .finally(() => {
          if (active) setEpLoading(false);
        });
    }

    if (initialTab === "rematch") {
      const typeParam = media.media_type === "anime" ? "anime" : "series";
      const params = new URLSearchParams({ q: media.title, type: typeParam });
      fetch(`/api/search?${params.toString()}`)
        .then(async (res) => {
          const data = await res.json();
          if (!res.ok) {
            throw new Error(data.error || "Falha ao buscar obras.");
          }
          if (active) {
            setRematchResults(Array.isArray(data.results) ? data.results : []);
            setRematchError(null);
          }
        })
        .catch((err) => {
          if (active) {
            setRematchError(
              err instanceof Error ? err.message : "Erro ao buscar catálogos."
            );
          }
        })
        .finally(() => {
          if (active) setRematchLoading(false);
        });
    }

    return () => {
      active = false;
    };
  }, [
    media.id,
    media.title,
    media.media_type,
    media.catalog_episodes,
    initialTab,
    onEpisodesUpdated,
  ]);

  const seasons = useMemo(() => {
    const set = new Set<number>();
    episodes.forEach((ep) => set.add(ep.season));
    return Array.from(set).sort((a, b) => a - b);
  }, [episodes]);

  const showSeasonControls = media.media_type !== "anime" && seasons.length > 1;

  const watchedCount = useMemo(
    () => episodes.filter((ep) => ep.watched).length,
    [episodes]
  );

  const totalCatalogCount =
    media.total_episodes && media.total_episodes > episodes.length
      ? media.total_episodes
      : episodes.length;

  const formatEpBadge = (season: number, episode: number) => {
    const epPadded = String(episode).padStart(2, "0");
    return showSeasonControls ? `T${season} · EP ${epPadded}` : `EP ${epPadded}`;
  };

  const filteredEpisodes = useMemo(() => {
    if (!showSeasonControls || selectedSeason === "all") return episodes;
    return episodes.filter((ep) => ep.season === selectedSeason);
  }, [episodes, selectedSeason, showSeasonControls]);

  const nextEpisode = useMemo(() => {
    const releasedUnwatchedAfterCurrent = episodes.find(
      (ep) =>
        !ep.watched && !ep.is_upcoming && ep.episode > media.current_episode
    );
    if (releasedUnwatchedAfterCurrent) return releasedUnwatchedAfterCurrent;
    const anyReleasedUnwatched = episodes.find(
      (ep) => !ep.watched && !ep.is_upcoming
    );
    if (anyReleasedUnwatched) return anyReleasedUnwatched;
    return null;
  }, [episodes, media.current_episode]);

  if (!media) return null;

  const appMeta = getAppMeta(media.last_app);
  const cleanSynopsis = stripHtml(media.synopsis);

  const applyProgressToCatalog = (
    list: CatalogEpisode[],
    targetSeason: number,
    targetEpisode: number
  ): CatalogEpisode[] => {
    const nowIso = new Date().toISOString();
    return list.map((item) => {
      const isWatchedUpToHere =
        media.media_type === "anime"
          ? item.episode <= targetEpisode
          : item.season < targetSeason ||
            (item.season === targetSeason && item.episode <= targetEpisode);
      return {
        ...item,
        watched: isWatchedUpToHere,
        watched_at: isWatchedUpToHere ? item.watched_at || nowIso : null,
        source_app: isWatchedUpToHere ? item.source_app || "manual" : null,
      };
    });
  };

  const handleToggleEpisode = async (ep: CatalogEpisode) => {
    const key = `${ep.season}-${ep.episode}`;
    setTogglingKey(key);
    const nextWatched = !ep.watched;
    const updated = await onPatchMedia(media.id, {
      action: "toggle_episode",
      season: ep.season,
      episode: ep.episode,
      watched: nextWatched,
      episode_title: ep.title,
    });
    if (updated) {
      const nextList = episodes.map((item) =>
        item.season === ep.season && item.episode === ep.episode
          ? {
              ...item,
              watched: nextWatched,
              watched_at: nextWatched ? new Date().toISOString() : null,
              source_app: nextWatched ? ("manual" as const) : null,
            }
          : item
      );
      setLocalEpisodes(nextList);
      onEpisodesUpdated?.(media.id, nextList);
    }
    setTogglingKey(null);
  };

  const handleMarkUpToEpisode = async (ep: CatalogEpisode) => {
    const key = `${ep.season}-${ep.episode}`;
    setMarkingUpToKey(key);
    const updated = await onPatchMedia(media.id, {
      action: "set_progress",
      season: ep.season,
      episode: ep.episode,
    });
    if (updated) {
      const nextList = applyProgressToCatalog(episodes, ep.season, ep.episode);
      setLocalEpisodes(nextList);
      onEpisodesUpdated?.(media.id, nextList);
      await loadEpisodes(media.id);
    }
    setMarkingUpToKey(null);
  };

  const handleStatusChange = async (newStatus: WatchStatus) => {
    setSavingProgress(true);
    await onPatchMedia(media.id, {
      action: "set_progress",
      status: newStatus,
    });
    setSavingProgress(false);
  };

  const handleManualProgressSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const s =
      media.media_type === "anime"
        ? media.current_season || 1
        : Math.max(1, Number.parseInt(manualSeason, 10) || 1);
    const ep = Math.max(0, Number.parseInt(manualEpisode, 10) || 0);
    setSavingProgress(true);
    const updated = await onPatchMedia(media.id, {
      action: "set_progress",
      season: s,
      episode: ep,
    });
    if (updated) {
      setDraftSeason(null);
      setDraftEpisode(null);
      const nextList = applyProgressToCatalog(episodes, s, ep);
      setLocalEpisodes(nextList);
      onEpisodesUpdated?.(media.id, nextList);
      await loadEpisodes(media.id);
    }
    setSavingProgress(false);
  };

  const handleRematchSelect = async (result: SearchResult) => {
    setRematchingId(`${result.provider}:${result.external_id}`);
    const updated = await onPatchMedia(media.id, {
      action: "rematch",
      searchResult: result,
    });
    setRematchingId(null);
    if (updated) {
      setActiveTab("episodes");
      await loadEpisodes(media.id, true);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    const ok = await onDeleteMedia(media.id);
    setDeleting(false);
    if (ok) onClose();
  };

  const handleTabKeyDown = (e: React.KeyboardEvent, current: DetailModalTab) => {
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const next: DetailModalTab =
        current === "episodes" ? "rematch" : "episodes";
      setActiveTab(next);
      if (next === "rematch" && rematchResults.length === 0) {
        void runRematchSearch(rematchQuery, rematchType);
      }
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[#0B0C10]/85 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="detail-modal-title"
        tabIndex={-1}
        className="flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl border border-[#262A38] bg-[#13151C] shadow-2xl sm:rounded-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-[#262A38] p-4 sm:p-5">
          <div className="flex min-w-0 gap-3.5">
            <div className="aspect-[2/3] w-16 shrink-0 overflow-hidden rounded-lg border border-[#373D52] bg-[#1B1E28] sm:w-20">
              {media.cover_image ? (
                <img
                  src={media.cover_image}
                  alt={`Capa de ${media.title}`}
                  width={160}
                  height={240}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center p-1 text-center text-[10px] text-[#A8B0C2]">
                  {media.title}
                </div>
              )}
            </div>

            <div className="min-w-0 space-y-1.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <span
                  className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] ${appMeta.badgeClass}`}
                >
                  <Tv className="h-3 w-3" aria-hidden="true" />
                  {appMeta.label}
                </span>
                <span className="rounded border border-[#373D52] bg-[#1B1E28] px-2 py-0.5 text-[11px] font-medium text-[#F4F5F7]">
                  {getMediaTypeLabelPt(media.media_type)}
                </span>
                <span className="rounded border border-[#262A38] bg-[#0B0C10] px-2 py-0.5 text-[11px] text-[#A8B0C2]">
                  {getProviderLabel(media.provider)}
                </span>
              </div>

              <h2
                id="detail-modal-title"
                className="line-clamp-2 text-lg font-extrabold text-[#F4F5F7] sm:text-xl"
              >
                {media.title}
              </h2>

              <p className="text-xs text-[#A8B0C2]">
                {media.release_year ? `${media.release_year}` : "Ano n/d"}
                {media.score ? ` · Nota ${media.score}` : ""}
                {media.genres.length > 0
                  ? ` · ${media.genres.slice(0, 3).join(", ")}`
                  : ""}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              disabled={deleting}
              onClick={() => setConfirmDelete((prev) => !prev)}
              aria-label={`Excluir ${media.title}`}
              title="Excluir obra"
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-[#262A38] bg-[#0B0C10] px-2.5 py-2 text-xs font-semibold text-[#FDA4AF] transition-colors hover:border-[#BE123C] hover:bg-[#BE123C]/15 disabled:opacity-60"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Excluir</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar detalhes da obra"
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-[#A8B0C2] hover:bg-[#1B1E28] hover:text-[#F4F5F7]"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        </div>

        {confirmDelete && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#BE123C]/60 bg-[#BE123C]/15 px-4 py-3 sm:px-5">
            <p className="text-xs font-semibold text-[#FDA4AF]">
              Remover &quot;{media.title}&quot; da sua lista?
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="min-h-[44px] rounded-lg border border-[#373D52] bg-[#1B1E28] px-3 py-1.5 text-xs font-semibold text-[#F4F5F7]"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={handleDelete}
                className="min-h-[44px] rounded-lg bg-[#BE123C] px-3.5 py-1.5 text-xs font-bold text-[#FFFFFF] hover:bg-[#E11D48] disabled:opacity-60"
              >
                {deleting ? "Excluindo..." : "Confirmar exclusão"}
              </button>
            </div>
          </div>
        )}

        <div
          role="tablist"
          aria-label="Seções da obra"
          className="flex border-b border-[#262A38] bg-[#0B0C10]/60 px-4 sm:px-5"
        >
          <button
            type="button"
            role="tab"
            id="tab-episodes"
            aria-selected={activeTab === "episodes"}
            aria-controls="panel-episodes"
            tabIndex={activeTab === "episodes" ? 0 : -1}
            onClick={() => setActiveTab("episodes")}
            onKeyDown={(e) => handleTabKeyDown(e, "episodes")}
            className={`inline-flex min-h-[44px] items-center gap-2 border-b-2 px-3 py-2 text-sm font-semibold transition-colors ${
              activeTab === "episodes"
                ? "border-[#F47521] text-[#F4F5F7]"
                : "border-transparent text-[#A8B0C2] hover:text-[#F4F5F7]"
            }`}
          >
            <ListVideo className="h-4 w-4" aria-hidden="true" />
            <span>Episódios</span>
            {episodes.length > 0 && (
              <span className="rounded bg-[#1B1E28] px-1.5 py-0.5 font-mono text-xs text-[#A8B0C2]">
                {episodes.length}
              </span>
            )}
          </button>

          <button
            type="button"
            role="tab"
            id="tab-rematch"
            aria-selected={activeTab === "rematch"}
            aria-controls="panel-rematch"
            tabIndex={activeTab === "rematch" ? 0 : -1}
            onClick={() => {
              setActiveTab("rematch");
              if (rematchResults.length === 0) {
                void runRematchSearch(rematchQuery, rematchType);
              }
            }}
            onKeyDown={(e) => handleTabKeyDown(e, "rematch")}
            className={`inline-flex min-h-[44px] items-center gap-2 border-b-2 px-3 py-2 text-sm font-semibold transition-colors ${
              activeTab === "rematch"
                ? "border-[#F47521] text-[#F4F5F7]"
                : "border-transparent text-[#A8B0C2] hover:text-[#F4F5F7]"
            }`}
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            <span>Trocar / Re-vincular Obra</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-5">
          {activeTab === "episodes" && (
            <div
              role="tabpanel"
              id="panel-episodes"
              aria-labelledby="tab-episodes"
              className="space-y-5"
            >
              {cleanSynopsis && (
                <p className="line-clamp-3 text-xs leading-relaxed text-[#A8B0C2] sm:text-sm">
                  {cleanSynopsis}
                </p>
              )}

              <div className="grid gap-3 rounded-xl border border-[#262A38] bg-[#0B0C10]/70 p-3.5 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label
                    htmlFor="detail-status-select"
                    className="block text-xs font-semibold text-[#A8B0C2]"
                  >
                    Status na lista
                  </label>
                  <select
                    id="detail-status-select"
                    disabled={savingProgress}
                    value={media.status}
                    onChange={(e) =>
                      handleStatusChange(e.target.value as WatchStatus)
                    }
                    className="min-h-[44px] w-full rounded-lg border border-[#373D52] bg-[#13151C] px-3 py-2 text-sm font-medium text-[#F4F5F7]"
                  >
                    {STATUS_OPTIONS.map((status) => (
                      <option key={status} value={status}>
                        {getStatusLabelPt(status)}
                      </option>
                    ))}
                  </select>
                </div>

                <form
                  onSubmit={handleManualProgressSubmit}
                  className="space-y-1.5"
                >
                  <span className="block text-xs font-semibold text-[#A8B0C2]">
                    Ajustar episódio manualmente
                  </span>
                  <div className="flex items-center gap-2">
                    {media.media_type !== "anime" && (
                      <>
                        <label htmlFor="manual-season-input" className="sr-only">
                          Temporada
                        </label>
                        <input
                          id="manual-season-input"
                          type="number"
                          min={1}
                          value={manualSeason}
                          onChange={(e) => setDraftSeason(e.target.value)}
                          className="min-h-[44px] w-16 rounded-lg border border-[#373D52] bg-[#13151C] px-2.5 py-2 text-center font-mono text-sm text-[#F4F5F7]"
                          title="Temporada"
                        />
                      </>
                    )}
                    <span className="text-xs font-semibold text-[#A8B0C2]">
                      EP
                    </span>
                    <label htmlFor="manual-episode-input" className="sr-only">
                      Episódio
                    </label>
                    <input
                      id="manual-episode-input"
                      type="number"
                      min={0}
                      value={manualEpisode}
                      onChange={(e) => setDraftEpisode(e.target.value)}
                      className="min-h-[44px] w-20 rounded-lg border border-[#373D52] bg-[#13151C] px-2.5 py-2 text-center font-mono text-sm text-[#F4F5F7]"
                      title="Episódio"
                    />
                    <button
                      type="submit"
                      disabled={savingProgress}
                      className="min-h-[44px] flex-1 rounded-lg bg-[#1B1E28] px-3 py-2 text-xs font-bold text-[#F4F5F7] border border-[#373D52] hover:bg-[#262A38] disabled:opacity-60"
                    >
                      {savingProgress ? "Salvando..." : "Salvar"}
                    </button>
                  </div>
                </form>
              </div>

              {nextEpisode && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#F47521]/45 bg-[#F47521]/10 p-3.5">
                  <div className="min-w-0 space-y-0.5">
                    <p className="font-mono text-xs font-bold text-[#FF9248]">
                      Próximo:{" "}
                      {formatEpBadge(nextEpisode.season, nextEpisode.episode)}
                    </p>
                    <p className="truncate text-sm font-semibold text-[#F4F5F7]">
                      {nextEpisode.title || `Episódio ${nextEpisode.episode}`}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={
                      togglingKey ===
                      `${nextEpisode.season}-${nextEpisode.episode}`
                    }
                    onClick={() => handleToggleEpisode(nextEpisode)}
                    className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-[#F47521] px-3.5 py-2 text-xs font-bold text-[#0B0C10] hover:bg-[#FF8B3D] disabled:opacity-60"
                  >
                    <Check className="h-4 w-4" aria-hidden="true" />
                    <span>Marcar Ep {nextEpisode.episode} visto</span>
                  </button>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-lg border border-[#262A38] bg-[#0B0C10]/80 px-2.5 py-1.5 font-mono text-xs font-semibold text-[#F4F5F7]">
                    {totalCatalogCount > 0
                      ? `Assistidos: ${watchedCount} / ${totalCatalogCount}`
                      : `Assistidos: ${watchedCount}`}
                  </span>

                  <div
                    role="group"
                    aria-label="Modo de visualização dos episódios"
                    className="inline-flex rounded-xl border border-[#262A38] bg-[#0B0C10]/80 p-1"
                  >
                    <button
                      type="button"
                      aria-pressed={episodeViewMode === "list"}
                      onClick={() => setEpisodeViewMode("list")}
                      className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
                        episodeViewMode === "list"
                          ? "bg-[#F47521] text-[#0B0C10]"
                          : "text-[#A8B0C2] hover:text-[#F4F5F7]"
                      }`}
                    >
                      <List className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Lista Detalhada</span>
                    </button>
                    <button
                      type="button"
                      aria-pressed={episodeViewMode === "matrix"}
                      onClick={() => setEpisodeViewMode("matrix")}
                      className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
                        episodeViewMode === "matrix"
                          ? "bg-[#F47521] text-[#0B0C10]"
                          : "text-[#A8B0C2] hover:text-[#F4F5F7]"
                      }`}
                    >
                      <LayoutGrid className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Matriz 1..N</span>
                    </button>
                  </div>

                  {showSeasonControls && (
                    <div
                      className="flex flex-wrap gap-2"
                      aria-label="Filtrar por temporada"
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedSeason("all")}
                        className={`min-h-[44px] rounded-lg px-3 py-1.5 text-xs font-semibold ${
                          selectedSeason === "all"
                            ? "bg-[#F47521] text-[#0B0C10]"
                            : "border border-[#262A38] bg-[#1B1E28] text-[#A8B0C2] hover:text-[#F4F5F7]"
                        }`}
                      >
                        Todas ({episodes.length})
                      </button>
                      {seasons.map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setSelectedSeason(s)}
                          className={`min-h-[44px] rounded-lg px-3 py-1.5 font-mono text-xs font-semibold ${
                            selectedSeason === s
                              ? "bg-[#F47521] text-[#0B0C10]"
                              : "border border-[#262A38] bg-[#1B1E28] text-[#A8B0C2] hover:text-[#F4F5F7]"
                          }`}
                        >
                          Temp {s}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  disabled={epRefreshing || epLoading}
                  onClick={() => void loadEpisodes(media.id, true)}
                  className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-[#373D52] bg-[#1B1E28] px-3 py-1.5 text-xs font-semibold text-[#F4F5F7] hover:bg-[#262A38] disabled:opacity-60"
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 ${epRefreshing ? "animate-spin" : ""}`}
                    aria-hidden="true"
                  />
                  <span>
                    {epRefreshing ? "Atualizando..." : "Atualizar Catálogo"}
                  </span>
                </button>
              </div>

              {media.next_airing && (
                <div className="flex items-center gap-2 rounded-xl border border-[#FCD34D]/35 bg-[#0B0C10]/70 px-3.5 py-2.5 text-xs font-semibold text-[#FCD34D]">
                  <Calendar className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>
                    Próximo lançamento: Episódio {media.next_airing.episode} em{" "}
                    {formatReleaseDatePt(media.next_airing.airing_at, true)}
                  </span>
                </div>
              )}

              {epLoading && (
                <div className="space-y-2 py-4">
                  <p className="text-sm font-medium text-[#A8B0C2]">
                    Carregando lista de episódios...
                  </p>
                  <div className="h-12 w-full rounded-xl bg-[#1B1E28]" />
                  <div className="h-12 w-full rounded-xl bg-[#1B1E28]" />
                  <div className="h-12 w-full rounded-xl bg-[#1B1E28]" />
                </div>
              )}

              {!epLoading && epError && (
                <div
                  role="alert"
                  className="space-y-3 rounded-xl border border-[#BE123C]/50 bg-[#BE123C]/10 p-4"
                >
                  <p className="text-sm font-medium text-[#FDA4AF]">
                    {epError}
                  </p>
                  <button
                    type="button"
                    onClick={() => loadEpisodes(media.id)}
                    className="min-h-[44px] rounded-lg border border-[#373D52] bg-[#1B1E28] px-3.5 py-2 text-xs font-semibold text-[#F4F5F7] hover:bg-[#262A38]"
                  >
                    Tentar novamente
                  </button>
                </div>
              )}

              {!epLoading && !epError && filteredEpisodes.length === 0 && (
                <div className="rounded-xl border border-[#262A38] bg-[#0B0C10]/60 p-5 text-center">
                  <p className="text-sm font-medium text-[#F4F5F7]">
                    Nenhum catálogo detalhado de episódios encontrado para esta
                    obra.
                  </p>
                  <p className="mt-1 text-xs text-[#A8B0C2]">
                    Você ainda pode usar o ajuste manual acima ou clicar em
                    &quot;Trocar / Re-vincular Obra&quot; para buscar outra fonte.
                  </p>
                </div>
              )}

              {!epLoading &&
                !epError &&
                filteredEpisodes.length > 0 &&
                episodeViewMode === "matrix" && (
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#262A38] bg-[#0B0C10]/70 px-3 py-2">
                      <div className="flex flex-wrap items-center gap-3 text-[11px] font-medium text-[#A8B0C2]">
                        <span className="inline-flex items-center gap-1.5">
                          <span className="h-2.5 w-2.5 rounded-sm bg-[#22C55E]" />
                          Assistido
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <span className="h-2.5 w-2.5 rounded-sm bg-[#F47521]" />
                          Atual / Próximo
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <span className="h-2.5 w-2.5 rounded-full bg-[#FCD34D]" />
                          Em breve
                        </span>
                      </div>

                      <div
                        role="group"
                        aria-label="Ação ao tocar no episódio da matriz"
                        className="flex items-center gap-1.5"
                      >
                        <span className="text-[11px] font-semibold text-[#A8B0C2]">
                          Ao tocar:
                        </span>
                        <button
                          type="button"
                          aria-pressed={matrixClickMode === "up_to"}
                          onClick={() => setMatrixClickMode("up_to")}
                          className={`min-h-[36px] rounded-lg px-2.5 py-1 text-[11px] font-bold transition-colors ${
                            matrixClickMode === "up_to"
                              ? "bg-[#F47521] text-[#0B0C10]"
                              : "border border-[#262A38] bg-[#13151C] text-[#A8B0C2] hover:text-[#F4F5F7]"
                          }`}
                        >
                          Até aqui (1..X)
                        </button>
                        <button
                          type="button"
                          aria-pressed={matrixClickMode === "toggle"}
                          onClick={() => setMatrixClickMode("toggle")}
                          className={`min-h-[36px] rounded-lg px-2.5 py-1 text-[11px] font-bold transition-colors ${
                            matrixClickMode === "toggle"
                              ? "bg-[#F47521] text-[#0B0C10]"
                              : "border border-[#262A38] bg-[#13151C] text-[#A8B0C2] hover:text-[#F4F5F7]"
                          }`}
                        >
                          Individual
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-5 gap-2 sm:grid-cols-8 md:grid-cols-10">
                      {filteredEpisodes.map((ep) => {
                        const key = `${ep.season}-${ep.episode}`;
                        const isBusy =
                          togglingKey === key || markingUpToKey === key;
                        const isCurrent =
                          ep.episode === media.current_episode &&
                          (media.media_type === "anime" ||
                            ep.season === media.current_season);
                        const isNext =
                          nextEpisode &&
                          nextEpisode.season === ep.season &&
                          nextEpisode.episode === ep.episode;

                        const tileTitle = `${formatEpBadge(ep.season, ep.episode)}${
                          ep.title ? ` · ${ep.title}` : ""
                        }${
                          ep.is_upcoming && (ep.air_date || ep.aired_at)
                            ? ` (Lança em ${formatReleaseDatePt(ep.air_date || ep.aired_at)})`
                            : ""
                        }`;

                        return (
                          <button
                            key={key}
                            type="button"
                            disabled={isBusy}
                            title={tileTitle}
                            aria-label={tileTitle}
                            aria-pressed={ep.watched}
                            onClick={() => {
                              if (matrixClickMode === "up_to") {
                                void handleMarkUpToEpisode(ep);
                              } else {
                                void handleToggleEpisode(ep);
                              }
                            }}
                            className={`relative flex min-h-[48px] flex-col items-center justify-center rounded-xl border font-mono text-xs font-bold transition-all active:scale-95 disabled:opacity-60 ${
                              isCurrent
                                ? "border-[#F47521] bg-[#F47521] text-[#0B0C10] shadow-[0_0_16px_-4px_rgba(244,117,33,0.85)]"
                                : ep.watched
                                  ? "border-[#22C55E]/50 bg-[#22C55E]/15 text-[#4ADE80] hover:bg-[#22C55E]/25"
                                  : isNext
                                    ? "border-[#F47521]/70 bg-[#1B1E28] text-[#FF9248] hover:bg-[#262A38]"
                                    : ep.is_upcoming
                                      ? "border-[#262A38] bg-[#0B0C10]/60 text-[#A8B0C2] hover:border-[#373D52]"
                                      : "border-[#262A38] bg-[#13151C] text-[#F4F5F7] hover:border-[#373D52] hover:bg-[#1B1E28]"
                            }`}
                          >
                            {isBusy ? (
                              <span>...</span>
                            ) : (
                              <>
                                <span>
                                  {String(ep.episode).padStart(2, "0")}
                                </span>
                                {showSeasonControls && (
                                  <span className="text-[9px] opacity-80">
                                    T{ep.season}
                                  </span>
                                )}
                              </>
                            )}
                            {ep.is_upcoming && (
                              <span
                                aria-hidden="true"
                                className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-[#FCD34D]"
                              />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

              {!epLoading &&
                !epError &&
                filteredEpisodes.length > 0 &&
                episodeViewMode === "list" && (
                <ul className="space-y-2">
                  {filteredEpisodes.map((ep) => {
                    const key = `${ep.season}-${ep.episode}`;
                    const isNext =
                      nextEpisode &&
                      nextEpisode.season === ep.season &&
                      nextEpisode.episode === ep.episode;
                    const isBusy = togglingKey === key;
                    const isMarkingUpTo = markingUpToKey === key;
                    const epAppMeta = ep.source_app
                      ? getAppMeta(ep.source_app)
                      : null;

                    return (
                      <li key={key} className="flex items-stretch gap-2">
                        <button
                          type="button"
                          disabled={isBusy || isMarkingUpTo}
                          onClick={() => handleToggleEpisode(ep)}
                          aria-pressed={ep.watched}
                          className={`flex min-h-[52px] min-w-0 flex-1 items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 text-left transition-colors ${
                            ep.watched
                              ? "border-[#22C55E]/35 bg-[#22C55E]/10 hover:bg-[#22C55E]/15"
                              : isNext
                                ? "border-[#F47521]/50 bg-[#1B1E28] hover:bg-[#262A38]"
                                : "border-[#262A38] bg-[#0B0C10]/60 hover:border-[#373D52] hover:bg-[#1B1E28]"
                          }`}
                        >
                          <div className="flex min-w-0 items-center gap-3">
                            <span
                              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md border text-xs font-bold ${
                                ep.watched
                                  ? "border-[#22C55E] bg-[#22C55E] text-[#0B0C10]"
                                  : "border-[#373D52] bg-[#13151C] text-[#A8B0C2]"
                              }`}
                              aria-hidden="true"
                            >
                              {ep.watched ? (
                                <Check className="h-4 w-4" />
                              ) : (
                                ep.episode
                              )}
                            </span>

                            {ep.thumbnail && (
                              <img
                                src={ep.thumbnail}
                                alt=""
                                width={96}
                                height={54}
                                loading="lazy"
                                className="hidden h-10 w-16 shrink-0 rounded-md border border-[#262A38] object-cover sm:block"
                              />
                            )}

                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-mono text-xs font-bold text-[#F4F5F7]">
                                  {formatEpBadge(ep.season, ep.episode)}
                                </span>
                                {isNext && !ep.watched && (
                                  <span className="rounded bg-[#F47521] px-1.5 py-0.5 text-[10px] font-bold text-[#0B0C10]">
                                    Próximo
                                  </span>
                                )}
                                {ep.is_upcoming && (
                                  <span className="rounded border border-[#FCD34D]/40 bg-[#0B0C10] px-1.5 py-0.5 text-[10px] font-bold text-[#FCD34D]">
                                    Em breve
                                    {ep.air_date || ep.aired_at
                                      ? ` · Lança em ${formatReleaseDatePt(ep.air_date || ep.aired_at)}`
                                      : ""}
                                  </span>
                                )}
                                {ep.watched && epAppMeta && (
                                  <span
                                    className={`rounded px-1.5 py-0.5 text-[10px] ${epAppMeta.badgeClass}`}
                                  >
                                    {epAppMeta.label}
                                  </span>
                                )}
                              </div>
                              <p className="truncate text-sm font-medium text-[#F4F5F7]">
                                {ep.title || `Episódio ${ep.episode}`}
                              </p>
                              {(ep.watched_at ||
                                ep.air_date ||
                                ep.aired_at ||
                                (ep.position_sec != null &&
                                  ep.duration_sec != null &&
                                  ep.duration_sec > 0)) && (
                                <p className="text-[11px] text-[#A8B0C2]">
                                  {ep.watched_at
                                    ? `Assistido em ${formatAbsoluteTimePt(ep.watched_at)}`
                                    : (ep.air_date || ep.aired_at) && !ep.is_upcoming
                                      ? `Lançado em ${formatReleaseDatePt(ep.air_date || ep.aired_at)}`
                                      : ep.is_upcoming && (ep.air_date || ep.aired_at)
                                        ? `Previsão: ${formatReleaseDatePt(ep.air_date || ep.aired_at, true)}`
                                        : ""}
                                  {ep.position_sec != null &&
                                  ep.duration_sec != null &&
                                  ep.duration_sec > 0
                                    ? ` · ${formatTimecode(ep.position_sec)} / ${formatTimecode(ep.duration_sec)}`
                                    : ""}
                                </p>
                              )}
                            </div>
                          </div>

                          <span className="shrink-0 text-xs font-semibold text-[#A8B0C2]">
                            {isBusy
                              ? "..."
                              : ep.watched
                                ? "Visto"
                                : "Marcar"}
                          </span>
                        </button>

                        {!ep.watched && !ep.is_upcoming && (
                          <button
                            type="button"
                            disabled={isBusy || isMarkingUpTo}
                            onClick={() => handleMarkUpToEpisode(ep)}
                            aria-label={`Marcar episódios 1 até ${ep.episode} como assistidos`}
                            title={`Marcar até aqui (1..Ep ${ep.episode})`}
                            className="inline-flex min-h-[52px] shrink-0 items-center justify-center rounded-xl border border-[#373D52] bg-[#13151C] px-2.5 text-xs font-semibold text-[#A8B0C2] transition-colors hover:border-[#F47521]/60 hover:bg-[#1B1E28] hover:text-[#F4F5F7] disabled:opacity-60"
                          >
                            {isMarkingUpTo ? "..." : "Até aqui"}
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}

              <div className="border-t border-[#262A38] pt-4">
                {!confirmDelete ? (
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(true)}
                    className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-[#262A38] bg-[#13151C] px-3.5 py-2 text-xs font-semibold text-[#FDA4AF] hover:border-[#BE123C] hover:bg-[#BE123C]/10"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                    <span>Remover obra da lista</span>
                  </button>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#BE123C]/60 bg-[#BE123C]/15 p-3">
                    <p className="text-xs font-semibold text-[#FDA4AF]">
                      Tem certeza? Isso remove o histórico desta obra.
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(false)}
                        className="min-h-[44px] rounded-lg border border-[#373D52] bg-[#1B1E28] px-3 py-2 text-xs font-semibold text-[#F4F5F7]"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        disabled={deleting}
                        onClick={handleDelete}
                        className="min-h-[44px] rounded-lg bg-[#BE123C] px-3.5 py-2 text-xs font-bold text-[#FFFFFF] hover:bg-[#E11D48] disabled:opacity-60"
                      >
                        {deleting ? "Excluindo..." : "Confirmar exclusão"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === "rematch" && (
            <div
              role="tabpanel"
              id="panel-rematch"
              aria-labelledby="tab-rematch"
              className="space-y-4"
            >
              <p className="text-sm text-[#A8B0C2]">
                A Smart TV enviou um título que vinculou à obra errada? Busque a
                obra correta abaixo para atualizar capa, sinopse e lista de
                episódios mantendo seu progresso.
              </p>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void runRematchSearch(rematchQuery, rematchType);
                }}
                className="flex flex-col gap-2 sm:flex-row"
              >
                <div className="flex-1">
                  <label htmlFor="rematch-search-input" className="sr-only">
                    Buscar obra correta
                  </label>
                  <input
                    id="rematch-search-input"
                    type="text"
                    value={rematchQuery}
                    onChange={(e) => setRematchQuery(e.target.value)}
                    placeholder="Digite o nome do anime ou série..."
                    className="min-h-[44px] w-full rounded-xl border border-[#373D52] bg-[#0B0C10] px-3.5 py-2 text-sm text-[#F4F5F7] placeholder:text-[#64748B]"
                  />
                </div>
                <label htmlFor="rematch-type-select" className="sr-only">
                  Tipo de catálogo
                </label>
                <select
                  id="rematch-type-select"
                  value={rematchType}
                  onChange={(e) =>
                    setRematchType(
                      e.target.value as "all" | "anime" | "series"
                    )
                  }
                  className="min-h-[44px] rounded-xl border border-[#373D52] bg-[#0B0C10] px-3 py-2 text-sm text-[#F4F5F7]"
                >
                  <option value="all">Todos os catálogos</option>
                  <option value="anime">Animes (AniList / Jikan)</option>
                  <option value="series">Séries (TVMaze)</option>
                </select>
                <button
                  type="submit"
                  disabled={rematchLoading}
                  className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-[#F47521] px-4 py-2 text-sm font-bold text-[#0B0C10] hover:bg-[#FF8B3D] disabled:opacity-60"
                >
                  <Search className="h-4 w-4" aria-hidden="true" />
                  <span>{rematchLoading ? "Buscando..." : "Buscar"}</span>
                </button>
              </form>

              {rematchError && (
                <p
                  role="alert"
                  className="rounded-xl border border-[#BE123C]/50 bg-[#BE123C]/10 p-3 text-sm text-[#FDA4AF]"
                >
                  {rematchError}
                </p>
              )}

              {rematchLoading && (
                <p className="py-4 text-sm text-[#A8B0C2]">
                  Consultando AniList, Jikan e TVMaze...
                </p>
              )}

              {!rematchLoading &&
                !rematchError &&
                rematchResults.length === 0 && (
                  <p className="rounded-xl border border-[#262A38] bg-[#0B0C10]/60 p-4 text-sm text-[#A8B0C2]">
                    Nenhum resultado encontrado. Tente buscar usando o nome em
                    inglês ou romaji.
                  </p>
                )}

              <ul className="space-y-2.5">
                {rematchResults.map((res) => {
                  const key = `${res.provider}:${res.external_id}`;
                  const isBusy = rematchingId === key;
                  return (
                    <li
                      key={key}
                      className="flex flex-col justify-between gap-3 rounded-xl border border-[#262A38] bg-[#0B0C10]/70 p-3 sm:flex-row sm:items-center"
                    >
                      <div className="flex min-w-0 gap-3">
                        <div className="aspect-[2/3] w-12 shrink-0 overflow-hidden rounded-lg bg-[#1B1E28]">
                          {res.cover_image ? (
                            <img
                              src={res.cover_image}
                              alt={`Capa de ${res.title}`}
                              width={96}
                              height={144}
                              className="h-full w-full object-cover"
                            />
                          ) : null}
                        </div>
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="rounded bg-[#1B1E28] px-1.5 py-0.5 text-[11px] font-semibold text-[#FF9248]">
                              {getProviderLabel(res.provider)}
                            </span>
                            <span className="text-[11px] text-[#A8B0C2]">
                              {getMediaTypeLabelPt(res.media_type)}
                              {res.release_year ? ` · ${res.release_year}` : ""}
                              {res.total_episodes
                                ? ` · ${res.total_episodes} eps`
                                : ""}
                            </span>
                          </div>
                          <p className="truncate text-sm font-bold text-[#F4F5F7]">
                            {res.title}
                          </p>
                          {res.title_native && res.title_native !== res.title && (
                            <p className="truncate text-xs text-[#A8B0C2]">
                              {res.title_native}
                            </p>
                          )}
                        </div>
                      </div>

                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleRematchSelect(res)}
                        className="inline-flex min-h-[44px] shrink-0 items-center justify-center gap-1.5 rounded-lg bg-[#F47521] px-3.5 py-2 text-xs font-bold text-[#0B0C10] hover:bg-[#FF8B3D] disabled:opacity-60"
                      >
                        <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>
                          {isBusy ? "Vinculando..." : "Vincular esta obra"}
                        </span>
                        <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
