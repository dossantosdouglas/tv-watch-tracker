"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createClient } from "@supabase/supabase-js";
import { RefreshCw, Search, X } from "lucide-react";
import type {
  CatalogEpisode,
  MediaItem,
  MediaPatchAction,
  MediaType,
  ScrobbleLog,
  SearchResult,
  WatchStatus,
} from "@/lib/types";
import { AddMediaModal } from "./AddMediaModal";
import { HeaderBar } from "./HeaderBar";
import { HeroSpotlight } from "./HeroSpotlight";
import { MediaCard } from "./MediaCard";
import { type DetailModalTab, MediaDetailModal } from "./MediaDetailModal";
import { NotificationsModal } from "./NotificationsModal";
import { PinModal } from "./PinModal";
import { TvSignalDrawer } from "./TvSignalDrawer";

type StatusFilter = "watching" | "all" | "completed" | "on_hold";
type TypeFilter = "all" | "anime" | "series_movie";

interface MediaStats {
  total: number;
  watching: number;
  completed: number;
  episodesWatched: number;
}

const PIN_STORAGE_KEY = "tv_tracker_pin";
const VISIBILITY_THROTTLE_MS = 30000;

const pinListeners = new Set<() => void>();

function subscribePinStore(callback: () => void) {
  pinListeners.add(callback);
  const onStorage = (e: StorageEvent) => {
    if (e.key === PIN_STORAGE_KEY) callback();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    pinListeners.delete(callback);
    window.removeEventListener("storage", onStorage);
  };
}

function getPinSnapshot(): string {
  try {
    return window.localStorage.getItem(PIN_STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

function getPinServerSnapshot(): string {
  return "";
}

function writeStoredPin(value: string) {
  try {
    if (value) {
      window.localStorage.setItem(PIN_STORAGE_KEY, value);
    } else {
      window.localStorage.removeItem(PIN_STORAGE_KEY);
    }
  } catch {
    // ignore storage errors
  }
  pinListeners.forEach((cb) => cb());
}

export function TrackerApp() {
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [logs, setLogs] = useState<ScrobbleLog[]>([]);
  const [stats, setStats] = useState<MediaStats | null>(null);
  const [pinRequired, setPinRequired] = useState<boolean>(true);
  const [hasLiveSignal, setHasLiveSignal] = useState<boolean>(false);

  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("watching");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  const pin = useSyncExternalStore(
    subscribePinStore,
    getPinSnapshot,
    getPinServerSnapshot
  );
  const [pinModalOpen, setPinModalOpen] = useState<boolean>(false);
  const [pinReason, setPinReason] = useState<string | null>(null);

  const [addModalOpen, setAddModalOpen] = useState<boolean>(false);
  const [signalDrawerOpen, setSignalDrawerOpen] = useState<boolean>(false);
  const [notificationsModalOpen, setNotificationsModalOpen] =
    useState<boolean>(false);
  const [pushSubscribed, setPushSubscribed] = useState<boolean>(false);
  const lastFetchTsRef = useRef<number>(0);

  const [detailMediaId, setDetailMediaId] = useState<string | null>(null);
  const [detailInitialTab, setDetailInitialTab] =
    useState<DetailModalTab>("episodes");

  const [incrementingIds, setIncrementingIds] = useState<Record<string, boolean>>(
    {}
  );
  const [toast, setToast] = useState<{
    message: string;
    tone: "ok" | "error";
  } | null>(null);

  const showToast = useCallback(
    (message: string, tone: "ok" | "error" = "ok") => {
      setToast({ message, tone });
    },
    []
  );

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(t);
  }, [toast]);

  const applyTrackerResponse = useCallback(
    (data: {
      media?: MediaItem[];
      logs?: ScrobbleLog[];
      stats?: MediaStats;
      pinRequired?: boolean;
    }) => {
      const nextMedia = Array.isArray(data.media) ? data.media : [];
      const nextLogs = Array.isArray(data.logs) ? data.logs : [];
      setMedia(nextMedia);
      setLogs(nextLogs);
      if (data.stats) setStats(data.stats);
      if (typeof data.pinRequired === "boolean") {
        setPinRequired(data.pinRequired);
      }
      if (nextLogs.length > 0) {
        const latest = new Date(nextLogs[0].created_at).getTime();
        setHasLiveSignal(
          Number.isFinite(latest) && Date.now() - latest < 15 * 60 * 1000
        );
      } else {
        setHasLiveSignal(false);
      }
      setError(null);
      const nowIso = new Date().toISOString();
      lastFetchTsRef.current = Date.now();
      setLastSyncAt(nowIso);
    },
    []
  );

  const fetchTrackerData = useCallback(
    async (isManual = false) => {
      if (isManual) setRefreshing(true);
      try {
        const res = await fetch("/api/media", { cache: "no-store" });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Falha ao carregar biblioteca.");
        }
        applyTrackerResponse(data);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Não foi possível conectar ao servidor."
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [applyTrackerResponse]
  );

  useEffect(() => {
    let active = true;
    let realtimeTimer: number | null = null;

    const load = () => {
      fetch("/api/media", { cache: "no-store" })
        .then(async (res) => {
          const data = await res.json();
          if (!res.ok) {
            throw new Error(data.error || "Falha ao carregar biblioteca.");
          }
          if (active) applyTrackerResponse(data);
        })
        .catch((err) => {
          if (active) {
            setError(
              err instanceof Error
                ? err.message
                : "Não foi possível conectar ao servidor."
            );
          }
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    };

    load();

    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastFetchTsRef.current >= VISIBILITY_THROTTLE_MS) {
        load();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    if (
      typeof navigator !== "undefined" &&
      "serviceWorker" in navigator &&
      "PushManager" in window
    ) {
      navigator.serviceWorker
        .getRegistration("/sw.js")
        .then((reg) => reg?.pushManager.getSubscription())
        .then((sub) => {
          if (active) setPushSubscribed(Boolean(sub));
        })
        .catch(() => {
          // ignore service worker check failures
        });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    let realtimeClient: ReturnType<typeof createClient> | null = null;
    let realtimeChannel: ReturnType<
      ReturnType<typeof createClient>["channel"]
    > | null = null;

    if (supabaseUrl && supabaseAnonKey) {
      realtimeClient = createClient(supabaseUrl, supabaseAnonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      realtimeChannel = realtimeClient
        .channel("tv-watch-media-updates")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "tv_watch_media" },
          () => {
            if (realtimeTimer !== null) window.clearTimeout(realtimeTimer);
            realtimeTimer = window.setTimeout(() => {
              if (active) load();
            }, 600);
          }
        )
        .subscribe();
    }

    return () => {
      active = false;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (realtimeTimer !== null) window.clearTimeout(realtimeTimer);
      if (realtimeClient && realtimeChannel) {
        void realtimeClient.removeChannel(realtimeChannel);
      }
    };
  }, [applyTrackerResponse]);

  const savePin = useCallback(
    (newPin: string) => {
      writeStoredPin(newPin);
      setPinReason(null);
      showToast("PIN salvo neste navegador.");
    },
    [showToast]
  );

  const clearPin = useCallback(() => {
    writeStoredPin("");
    showToast("Edição bloqueada novamente.");
  }, [showToast]);

  const buildPinHeaders = useCallback((): Record<string, string> => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (pin) headers["x-tracker-pin"] = pin;
    return headers;
  }, [pin]);

  const handleUnauthorized = useCallback(() => {
    setPinReason("PIN inválido ou ausente. Informe o código para salvar.");
    setPinModalOpen(true);
  }, []);

  const handlePatchMedia = useCallback(
    async (
      mediaId: string,
      payload: MediaPatchAction
    ): Promise<MediaItem | null> => {
      try {
        const res = await fetch(`/api/media/${mediaId}`, {
          method: "PATCH",
          headers: buildPinHeaders(),
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (res.status === 401) {
          handleUnauthorized();
          return null;
        }
        if (!res.ok) {
          throw new Error(data.error || "Erro ao atualizar obra.");
        }
        const updated: MediaItem = data.media;
        setMedia((prev) =>
          prev.map((m) => (m.id === updated.id ? updated : m))
        );

        if (payload.action === "rematch") {
          showToast(`Vinculado a "${updated.title}".`);
        } else if (payload.action === "increment_episode") {
          showToast(
            `${updated.title}: T${updated.current_season} · EP ${updated.current_episode}`
          );
        }
        return updated;
      } catch (err) {
        showToast(
          err instanceof Error ? err.message : "Erro ao salvar alteração.",
          "error"
        );
        return null;
      }
    },
    [buildPinHeaders, handleUnauthorized, showToast]
  );

  const handleIncrement = useCallback(
    async (item: MediaItem) => {
      if (incrementingIds[item.id]) return;
      const previous = item;
      const nextEp = item.current_episode + 1;
      const optimistic: MediaItem = {
        ...item,
        current_episode: nextEp,
        status:
          item.total_episodes && nextEp >= item.total_episodes
            ? "completed"
            : item.status,
        last_watched_at: new Date().toISOString(),
      };

      setIncrementingIds((prev) => ({ ...prev, [item.id]: true }));
      setMedia((prev) =>
        prev.map((m) => (m.id === item.id ? optimistic : m))
      );

      const updated = await handlePatchMedia(item.id, {
        action: "increment_episode",
      });
      if (!updated) {
        setMedia((prev) =>
          prev.map((m) => (m.id === item.id ? previous : m))
        );
      }

      setIncrementingIds((prev) => {
        const copy = { ...prev };
        delete copy[item.id];
        return copy;
      });
    },
    [handlePatchMedia, incrementingIds]
  );

  const handleDeleteMedia = useCallback(
    async (mediaId: string): Promise<boolean> => {
      try {
        const res = await fetch(`/api/media/${mediaId}`, {
          method: "DELETE",
          headers: buildPinHeaders(),
        });
        const data = await res.json();
        if (res.status === 401) {
          handleUnauthorized();
          return false;
        }
        if (!res.ok) {
          throw new Error(data.error || "Falha ao remover obra.");
        }
        setMedia((prev) => prev.filter((m) => m.id !== mediaId));
        showToast("Obra removida da biblioteca.");
        return true;
      } catch (err) {
        showToast(
          err instanceof Error ? err.message : "Erro ao remover obra.",
          "error"
        );
        return false;
      }
    },
    [buildPinHeaders, handleUnauthorized, showToast]
  );

  const handleAddFromSearch = useCallback(
    async (payload: {
      searchResult: SearchResult;
      current_season: number;
      current_episode: number;
      status: WatchStatus;
    }): Promise<boolean> => {
      try {
        const res = await fetch("/api/media", {
          method: "POST",
          headers: buildPinHeaders(),
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (res.status === 401) {
          handleUnauthorized();
          return false;
        }
        if (!res.ok) {
          throw new Error(data.error || "Não foi possível adicionar obra.");
        }
        const created: MediaItem = data.media;
        setMedia((prev) => [
          created,
          ...prev.filter((m) => m.id !== created.id),
        ]);
        showToast(`"${created.title}" adicionada à lista.`);
        return true;
      } catch (err) {
        showToast(
          err instanceof Error ? err.message : "Erro ao adicionar obra.",
          "error"
        );
        return false;
      }
    },
    [buildPinHeaders, handleUnauthorized, showToast]
  );

  const handleAddManual = useCallback(
    async (payload: {
      title: string;
      media_type: MediaType;
      current_season: number;
      current_episode: number;
      total_episodes: number | null;
      status: WatchStatus;
    }): Promise<boolean> => {
      try {
        const res = await fetch("/api/media", {
          method: "POST",
          headers: buildPinHeaders(),
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (res.status === 401) {
          handleUnauthorized();
          return false;
        }
        if (!res.ok) {
          throw new Error(data.error || "Não foi possível criar obra.");
        }
        const created: MediaItem = data.media;
        setMedia((prev) => [
          created,
          ...prev.filter((m) => m.id !== created.id),
        ]);
        showToast(`"${created.title}" adicionada manualmente.`);
        return true;
      } catch (err) {
        showToast(
          err instanceof Error ? err.message : "Erro ao salvar obra.",
          "error"
        );
        return false;
      }
    },
    [buildPinHeaders, handleUnauthorized, showToast]
  );

  const heroItem = useMemo(() => {
    if (media.length === 0) return null;
    const tvWatching = media.find(
      (m) =>
        m.status === "watching" &&
        (m.last_app === "crunchyroll" || m.last_app === "youcine")
    );
    if (tvWatching) return tvWatching;
    const anyWatching = media.find((m) => m.status === "watching");
    return anyWatching || media[0];
  }, [media]);

  const filteredMedia = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return media.filter((item) => {
      if (statusFilter !== "all" && item.status !== statusFilter) {
        return false;
      }
      if (typeFilter === "anime" && item.media_type !== "anime") {
        return false;
      }
      if (
        typeFilter === "series_movie" &&
        item.media_type !== "series" &&
        item.media_type !== "movie"
      ) {
        return false;
      }
      if (q) {
        const matchesTitle = item.title.toLowerCase().includes(q);
        const matchesAlias = item.aliases.some((a) =>
          a.toLowerCase().includes(q)
        );
        if (!matchesTitle && !matchesAlias) return false;
      }
      return true;
    });
  }, [media, statusFilter, typeFilter, searchQuery]);

  const detailMedia = useMemo(() => {
    if (!detailMediaId) return null;
    return media.find((m) => m.id === detailMediaId) || null;
  }, [media, detailMediaId]);

  const hasMixedTypes = useMemo(() => {
    return media.some((m) => m.media_type !== "anime");
  }, [media]);

  const handleEpisodesUpdated = useCallback(
    (mediaId: string, episodes: CatalogEpisode[]) => {
      setMedia((prev) =>
        prev.map((m) =>
          m.id === mediaId ? { ...m, catalog_episodes: episodes } : m
        )
      );
    },
    []
  );

  const handleLogsPolled = useCallback((nextLogs: ScrobbleLog[]) => {
    setLogs(nextLogs);
    setLastSyncAt(new Date().toISOString());
    if (nextLogs.length > 0) {
      const latest = new Date(nextLogs[0].created_at).getTime();
      setHasLiveSignal(
        Number.isFinite(latest) && Date.now() - latest < 15 * 60 * 1000
      );
    }
  }, []);

  const openDetail = (item: MediaItem, tab: DetailModalTab = "episodes") => {
    setDetailInitialTab(tab);
    setDetailMediaId(item.id);
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#0B0C10] text-[#F4F5F7]">
      <a href="#main-content" className="skip-link">
        Pular para o conteúdo principal
      </a>

      <HeaderBar
        hasPin={Boolean(pin)}
        pinRequired={pinRequired}
        hasLiveSignal={hasLiveSignal}
        pushSubscribed={pushSubscribed}
        logsCount={logs.length}
        onOpenSignalDrawer={() => setSignalDrawerOpen(true)}
        onOpenNotificationsModal={() => setNotificationsModalOpen(true)}
        onOpenPinModal={() => {
          setPinReason(null);
          setPinModalOpen(true);
        }}
        onOpenAddModal={() => setAddModalOpen(true)}
      />

      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-5 sm:gap-8 sm:px-6 sm:py-7"
      >
        {error && (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#BE123C]/60 bg-[#BE123C]/15 px-4 py-3"
          >
            <p className="text-sm font-medium text-[#FDA4AF]">{error}</p>
            <button
              type="button"
              onClick={() => void fetchTrackerData(true)}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-[#373D52] bg-[#1B1E28] px-3.5 py-2 text-xs font-bold text-[#F4F5F7] hover:bg-[#262A38]"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Tentar novamente</span>
            </button>
          </div>
        )}

        <HeroSpotlight
          item={heroItem}
          loading={loading}
          isIncrementing={Boolean(heroItem && incrementingIds[heroItem.id])}
          onIncrement={handleIncrement}
          onOpenEpisodes={(item) => openDetail(item, "episodes")}
          onOpenRematch={(item) => openDetail(item, "rematch")}
          onOpenAddModal={() => setAddModalOpen(true)}
          onOpenSignalDrawer={() => setSignalDrawerOpen(true)}
        />

        <section aria-labelledby="library-heading" className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2
                id="library-heading"
                className="text-lg font-extrabold tracking-tight text-[#F4F5F7] sm:text-xl"
              >
                Sua Lista
              </h2>
              {stats && (
                <p className="text-xs text-[#A8B0C2] sm:text-sm">
                  {stats.watching} assistindo · {stats.completed} completos ·{" "}
                  {stats.episodesWatched} episódios marcados
                </p>
              )}
            </div>

            <div className="flex items-center gap-2">
              <label
                htmlFor="library-search"
                className="text-xs font-semibold text-[#A8B0C2] sm:sr-only"
              >
                Filtrar obras
              </label>
              <div className="relative flex-1 sm:w-72">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#A8B0C2]"
                  aria-hidden="true"
                />
                <input
                  id="library-search"
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filtrar por título..."
                  className="min-h-[44px] w-full rounded-xl border border-[#262A38] bg-[#13151C] py-2 pl-9 pr-9 text-sm text-[#F4F5F7] placeholder:text-[#64748B] focus:border-[#F47521]"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    aria-label="Limpar busca"
                    className="absolute right-1 top-1/2 inline-flex min-h-[36px] min-w-[36px] -translate-y-1/2 items-center justify-center rounded-lg text-[#A8B0C2] hover:text-[#F4F5F7]"
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                )}
              </div>
              <button
                type="button"
                disabled={refreshing}
                onClick={() => void fetchTrackerData(true)}
                aria-label="Atualizar lista agora"
                className="inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl border border-[#262A38] bg-[#13151C] text-[#A8B0C2] hover:border-[#373D52] hover:bg-[#1B1E28] hover:text-[#F4F5F7] disabled:opacity-60"
              >
                <RefreshCw
                  className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
                  aria-hidden="true"
                />
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-2.5 md:flex-row md:items-center md:justify-between">
            <div
              role="group"
              aria-label="Filtrar por status"
              className="flex flex-wrap gap-2"
            >
              {(
                [
                  { id: "watching", label: "Assistindo" },
                  { id: "all", label: "Todos" },
                  { id: "completed", label: "Completos" },
                  { id: "on_hold", label: "Pausados" },
                ] as const
              ).map((tab) => {
                const active = statusFilter === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setStatusFilter(tab.id)}
                    className={`min-h-[44px] rounded-xl px-3.5 py-2 text-xs font-bold transition-colors sm:text-sm ${
                      active
                        ? "bg-[#F47521] text-[#0B0C10]"
                        : "border border-[#262A38] bg-[#13151C] text-[#A8B0C2] hover:border-[#373D52] hover:text-[#F4F5F7]"
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {hasMixedTypes && (
              <div
                role="group"
                aria-label="Filtrar por tipo de mídia"
                className="flex flex-wrap gap-2"
              >
                {(
                  [
                    { id: "all", label: "Todos" },
                    { id: "anime", label: "Animes" },
                    { id: "series_movie", label: "Séries & Filmes" },
                  ] as const
                ).map((t) => {
                  const active = typeFilter === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setTypeFilter(t.id)}
                      className={`min-h-[44px] rounded-xl border px-3 py-2 text-xs font-semibold transition-colors ${
                        active
                          ? "border-[#F47521] bg-[#1B1E28] text-[#FF9248]"
                          : "border-[#262A38] bg-[#13151C] text-[#A8B0C2] hover:border-[#373D52] hover:text-[#F4F5F7]"
                      }`}
                    >
                      {t.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {loading ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 4 }).map((_, idx) => (
                <div
                  key={idx}
                  className="h-44 rounded-xl border border-[#262A38] bg-[#13151C] sm:h-80"
                />
              ))}
            </div>
          ) : filteredMedia.length === 0 ? (
            <div className="rounded-2xl border border-[#262A38] bg-[#13151C] p-6 text-center sm:p-8">
              <p className="text-base font-bold text-[#F4F5F7]">
                {media.length === 0
                  ? "Sua lista ainda está vazia"
                  : "Nenhuma obra encontrada com esses filtros"}
              </p>
              <p className="mt-1 text-sm text-[#A8B0C2]">
                {media.length === 0
                  ? "Adicione uma obra manualmente ou comece a assistir na Smart TV."
                  : "Limpe a busca ou troque o filtro de status para ver outras obras."}
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-2.5">
                {media.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setStatusFilter("all");
                      setTypeFilter("all");
                      setSearchQuery("");
                    }}
                    className="min-h-[44px] rounded-xl border border-[#373D52] bg-[#1B1E28] px-4 py-2 text-sm font-semibold text-[#F4F5F7] hover:bg-[#262A38]"
                  >
                    Mostrar todas as obras
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setAddModalOpen(true)}
                  className="min-h-[44px] rounded-xl bg-[#F47521] px-4 py-2 text-sm font-bold text-[#0B0C10] hover:bg-[#FF8B3D]"
                >
                  Adicionar Obra
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filteredMedia.map((item) => (
                <MediaCard
                  key={item.id}
                  item={item}
                  isIncrementing={Boolean(incrementingIds[item.id])}
                  onIncrement={handleIncrement}
                  onOpenDetail={(m) => openDetail(m, "episodes")}
                />
              ))}
            </div>
          )}
        </section>
      </main>

      <footer className="border-t border-[#262A38] bg-[#0B0C10] py-5">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-2 px-4 text-xs text-[#A8B0C2] sm:flex-row sm:items-center sm:px-6">
          <p>
            Onde Parei · Sincronização em tempo real com Crunchyroll na Smart TV
          </p>
          <div className="flex flex-wrap gap-4">
            <button
              type="button"
              onClick={() => setNotificationsModalOpen(true)}
              className="min-h-[44px] font-medium text-[#A8B0C2] underline-offset-4 hover:text-[#F4F5F7] hover:underline"
            >
              Notificações
            </button>
            <button
              type="button"
              onClick={() => setSignalDrawerOpen(true)}
              className="min-h-[44px] font-medium text-[#A8B0C2] underline-offset-4 hover:text-[#F4F5F7] hover:underline"
            >
              Histórico da TV
            </button>
            <button
              type="button"
              onClick={() => setAddModalOpen(true)}
              className="min-h-[44px] font-medium text-[#A8B0C2] underline-offset-4 hover:text-[#F4F5F7] hover:underline"
            >
              Adicionar Obra
            </button>
          </div>
        </div>
      </footer>

      <MediaDetailModal
        media={detailMedia}
        initialTab={detailInitialTab}
        onClose={() => setDetailMediaId(null)}
        onPatchMedia={handlePatchMedia}
        onDeleteMedia={handleDeleteMedia}
        onEpisodesUpdated={handleEpisodesUpdated}
      />

      <AddMediaModal
        isOpen={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        onAddFromSearch={handleAddFromSearch}
        onAddManual={handleAddManual}
      />

      <TvSignalDrawer
        isOpen={signalDrawerOpen}
        logs={logs}
        lastSyncAt={lastSyncAt}
        refreshing={refreshing}
        onRefresh={() => void fetchTrackerData(true)}
        onLogsPolled={handleLogsPolled}
        onClose={() => setSignalDrawerOpen(false)}
      />

      <NotificationsModal
        isOpen={notificationsModalOpen}
        pin={pin}
        onSubscriptionChange={setPushSubscribed}
        onUnauthorized={handleUnauthorized}
        onToast={showToast}
        onClose={() => setNotificationsModalOpen(false)}
      />

      <PinModal
        isOpen={pinModalOpen}
        currentPin={pin}
        reasonMessage={pinReason}
        onSavePin={savePin}
        onClearPin={clearPin}
        onClose={() => setPinModalOpen(false)}
      />

      <div
        aria-live="polite"
        aria-atomic="true"
        className="pointer-events-none fixed bottom-4 left-4 right-4 z-50 flex justify-center sm:left-auto sm:right-6"
      >
        {toast && (
          <div
            role={toast.tone === "error" ? "alert" : "status"}
            className={`pointer-events-auto rounded-xl border px-4 py-3 text-sm font-semibold shadow-xl ${
              toast.tone === "error"
                ? "border-[#BE123C] bg-[#BE123C] text-[#FFFFFF]"
                : "border-[#373D52] bg-[#1B1E28] text-[#F4F5F7]"
            }`}
          >
            {toast.message}
          </div>
        )}
      </div>
    </div>
  );
}
