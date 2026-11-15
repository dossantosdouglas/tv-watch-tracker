"use client";

import { useRef, useState } from "react";
import { Plus, Search, X } from "lucide-react";
import type { MediaType, SearchResult, WatchStatus } from "@/lib/types";
import { getMediaTypeLabelPt, getProviderLabel } from "./formatters";
import { useDialogAccessibility } from "./useFocusTrap";

interface AddMediaModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddFromSearch: (payload: {
    searchResult: SearchResult;
    current_season: number;
    current_episode: number;
    status: WatchStatus;
  }) => Promise<boolean>;
  onAddManual: (payload: {
    title: string;
    media_type: MediaType;
    current_season: number;
    current_episode: number;
    total_episodes: number | null;
    status: WatchStatus;
  }) => Promise<boolean>;
}

export function AddMediaModal(props: AddMediaModalProps) {
  if (!props.isOpen) return null;
  return <AddMediaModalInner {...props} />;
}

function AddMediaModalInner({
  isOpen,
  onClose,
  onAddFromSearch,
  onAddManual,
}: AddMediaModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  const [query, setQuery] = useState("");
  const [searchType, setSearchType] = useState<"all" | "anime" | "series">(
    "all"
  );
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  const [selected, setSelected] = useState<SearchResult | null>(null);
  const [season, setSeason] = useState("1");
  const [episode, setEpisode] = useState("1");
  const [status, setStatus] = useState<WatchStatus>("watching");
  const [submitting, setSubmitting] = useState(false);

  const [manualMode, setManualMode] = useState(false);
  const [manualTitle, setManualTitle] = useState("");
  const [manualType, setManualType] = useState<MediaType>("anime");
  const [manualTotal, setManualTotal] = useState("");

  useDialogAccessibility(isOpen, dialogRef, onClose);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;
    setLoading(true);
    setError(null);
    setHasSearched(true);
    setSelected(null);
    try {
      const params = new URLSearchParams({ q: trimmed, type: searchType });
      const res = await fetch(`/api/search?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Erro ao consultar catálogos.");
      }
      setResults(Array.isArray(data.results) ? data.results : []);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Falha ao buscar obras."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmSelected = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    setSubmitting(true);
    const ok = await onAddFromSearch({
      searchResult: selected,
      current_season: Math.max(1, Number.parseInt(season, 10) || 1),
      current_episode: Math.max(0, Number.parseInt(episode, 10) || 0),
      status,
    });
    setSubmitting(false);
    if (ok) onClose();
  };

  const handleConfirmManual = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = manualTitle.trim();
    if (!trimmed) return;
    setSubmitting(true);
    const parsedTotal = Number.parseInt(manualTotal, 10);
    const ok = await onAddManual({
      title: trimmed,
      media_type: manualType,
      current_season: Math.max(1, Number.parseInt(season, 10) || 1),
      current_episode: Math.max(0, Number.parseInt(episode, 10) || 0),
      total_episodes:
        Number.isFinite(parsedTotal) && parsedTotal > 0 ? parsedTotal : null,
      status,
    });
    setSubmitting(false);
    if (ok) onClose();
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
        aria-labelledby="add-modal-title"
        tabIndex={-1}
        className="flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border border-[#262A38] bg-[#13151C] shadow-2xl sm:rounded-2xl"
      >
        <div className="flex items-center justify-between gap-3 border-b border-[#262A38] p-4 sm:p-5">
          <div>
            <h2
              id="add-modal-title"
              className="text-lg font-extrabold text-[#F4F5F7]"
            >
              Adicionar Obra
            </h2>
            <p className="text-xs text-[#A8B0C2]">
              Busca no AniList, Jikan (MAL) e TVMaze ou cadastro manual.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar adicionar obra"
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-[#A8B0C2] hover:bg-[#1B1E28] hover:text-[#F4F5F7]"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setManualMode(false)}
              className={`min-h-[44px] flex-1 rounded-xl px-3 py-2 text-xs font-bold transition-colors ${
                !manualMode
                  ? "bg-[#F47521] text-[#0B0C10]"
                  : "border border-[#262A38] bg-[#1B1E28] text-[#A8B0C2] hover:text-[#F4F5F7]"
              }`}
            >
              Buscar em Catálogos
            </button>
            <button
              type="button"
              onClick={() => setManualMode(true)}
              className={`min-h-[44px] flex-1 rounded-xl px-3 py-2 text-xs font-bold transition-colors ${
                manualMode
                  ? "bg-[#F47521] text-[#0B0C10]"
                  : "border border-[#262A38] bg-[#1B1E28] text-[#A8B0C2] hover:text-[#F4F5F7]"
              }`}
            >
              Cadastro Manual
            </button>
          </div>

          {!manualMode ? (
            <>
              <form
                onSubmit={handleSearch}
                className="flex flex-col gap-2 sm:flex-row"
              >
                <div className="flex-1">
                  <label htmlFor="add-search-input" className="sr-only">
                    Nome do anime, série ou filme
                  </label>
                  <input
                    id="add-search-input"
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Ex: Solo Leveling, One Piece, Severance..."
                    className="min-h-[44px] w-full rounded-xl border border-[#373D52] bg-[#0B0C10] px-3.5 py-2 text-sm text-[#F4F5F7] placeholder:text-[#64748B]"
                  />
                </div>
                <label htmlFor="add-search-type" className="sr-only">
                  Tipo de busca
                </label>
                <select
                  id="add-search-type"
                  value={searchType}
                  onChange={(e) =>
                    setSearchType(e.target.value as "all" | "anime" | "series")
                  }
                  className="min-h-[44px] rounded-xl border border-[#373D52] bg-[#0B0C10] px-3 py-2 text-sm text-[#F4F5F7]"
                >
                  <option value="all">Todos</option>
                  <option value="anime">Animes</option>
                  <option value="series">Séries</option>
                </select>
                <button
                  type="submit"
                  disabled={loading}
                  className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-[#F47521] px-4 py-2 text-sm font-bold text-[#0B0C10] hover:bg-[#FF8B3D] disabled:opacity-60"
                >
                  <Search className="h-4 w-4" aria-hidden="true" />
                  <span>{loading ? "Buscando..." : "Buscar"}</span>
                </button>
              </form>

              {error && (
                <p
                  role="alert"
                  className="rounded-xl border border-[#BE123C]/50 bg-[#BE123C]/10 p-3 text-sm text-[#FDA4AF]"
                >
                  {error}
                </p>
              )}

              {loading && (
                <p className="py-4 text-sm text-[#A8B0C2]">
                  Consultando catálogos de animes e séries...
                </p>
              )}

              {selected ? (
                <form
                  onSubmit={handleConfirmSelected}
                  className="space-y-4 rounded-xl border border-[#F47521]/50 bg-[#0B0C10]/80 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex gap-3">
                      {selected.cover_image && (
                        <img
                          src={selected.cover_image}
                          alt={`Capa de ${selected.title}`}
                          width={64}
                          height={96}
                          className="aspect-[2/3] w-16 rounded-lg object-cover"
                        />
                      )}
                      <div>
                        <span className="text-xs font-bold text-[#FF9248]">
                          {getProviderLabel(selected.provider)} ·{" "}
                          {getMediaTypeLabelPt(selected.media_type)}
                        </span>
                        <h3 className="text-base font-bold text-[#F4F5F7]">
                          {selected.title}
                        </h3>
                        <p className="text-xs text-[#A8B0C2]">
                          {selected.total_episodes
                            ? `${selected.total_episodes} episódios no catálogo`
                            : "Total de episódios variável"}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelected(null)}
                      className="min-h-[44px] rounded-lg px-2.5 text-xs font-semibold text-[#A8B0C2] hover:bg-[#1B1E28] hover:text-[#F4F5F7]"
                    >
                      Trocar
                    </button>
                  </div>

                  <div className="grid grid-cols-3 gap-2.5">
                    <div className="space-y-1">
                      <label
                        htmlFor="add-season"
                        className="block text-xs font-medium text-[#A8B0C2]"
                      >
                        Temporada
                      </label>
                      <input
                        id="add-season"
                        type="number"
                        min={1}
                        value={season}
                        onChange={(e) => setSeason(e.target.value)}
                        className="min-h-[44px] w-full rounded-lg border border-[#373D52] bg-[#13151C] px-3 py-2 font-mono text-sm text-[#F4F5F7]"
                      />
                    </div>
                    <div className="space-y-1">
                      <label
                        htmlFor="add-episode"
                        className="block text-xs font-medium text-[#A8B0C2]"
                      >
                        Episódio atual
                      </label>
                      <input
                        id="add-episode"
                        type="number"
                        min={0}
                        value={episode}
                        onChange={(e) => setEpisode(e.target.value)}
                        className="min-h-[44px] w-full rounded-lg border border-[#373D52] bg-[#13151C] px-3 py-2 font-mono text-sm text-[#F4F5F7]"
                      />
                    </div>
                    <div className="space-y-1">
                      <label
                        htmlFor="add-status"
                        className="block text-xs font-medium text-[#A8B0C2]"
                      >
                        Status
                      </label>
                      <select
                        id="add-status"
                        value={status}
                        onChange={(e) =>
                          setStatus(e.target.value as WatchStatus)
                        }
                        className="min-h-[44px] w-full rounded-lg border border-[#373D52] bg-[#13151C] px-2.5 py-2 text-sm text-[#F4F5F7]"
                      >
                        <option value="watching">Assistindo</option>
                        <option value="plan_to_watch">Na fila</option>
                        <option value="completed">Completo</option>
                        <option value="on_hold">Pausado</option>
                      </select>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-[#F47521] px-4 py-2.5 text-sm font-bold text-[#0B0C10] hover:bg-[#FF8B3D] disabled:opacity-60"
                  >
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    <span>
                      {submitting
                        ? "Salvando na lista..."
                        : "Adicionar à minha lista"}
                    </span>
                  </button>
                </form>
              ) : (
                <>
                  {!loading && hasSearched && results.length === 0 && !error && (
                    <div className="rounded-xl border border-[#262A38] bg-[#0B0C10]/60 p-4 text-sm text-[#A8B0C2]">
                      Nenhuma obra encontrada para &quot;{query}&quot;. Tente
                      outro nome ou use a aba Cadastro Manual.
                    </div>
                  )}

                  <ul className="space-y-2">
                    {results.map((res) => {
                      const key = `${res.provider}:${res.external_id}`;
                      return (
                        <li key={key}>
                          <button
                            type="button"
                            onClick={() => setSelected(res)}
                            className="flex min-h-[64px] w-full items-center gap-3 rounded-xl border border-[#262A38] bg-[#0B0C10]/70 p-2.5 text-left transition-colors hover:border-[#F47521]/60 hover:bg-[#1B1E28]"
                          >
                            <div className="aspect-[2/3] w-11 shrink-0 overflow-hidden rounded-lg bg-[#1B1E28]">
                              {res.cover_image ? (
                                <img
                                  src={res.cover_image}
                                  alt={`Capa de ${res.title}`}
                                  width={88}
                                  height={132}
                                  className="h-full w-full object-cover"
                                />
                              ) : null}
                            </div>
                            <div className="min-w-0 flex-1 space-y-0.5">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="rounded bg-[#1B1E28] px-1.5 py-0.5 text-[11px] font-semibold text-[#FF9248]">
                                  {getProviderLabel(res.provider)}
                                </span>
                                <span className="text-[11px] text-[#A8B0C2]">
                                  {getMediaTypeLabelPt(res.media_type)}
                                  {res.release_year
                                    ? ` · ${res.release_year}`
                                    : ""}
                                  {res.total_episodes
                                    ? ` · ${res.total_episodes} eps`
                                    : ""}
                                </span>
                              </div>
                              <p className="truncate text-sm font-bold text-[#F4F5F7]">
                                {res.title}
                              </p>
                            </div>
                            <span className="shrink-0 rounded-lg bg-[#1B1E28] px-3 py-1.5 text-xs font-semibold text-[#F4F5F7]">
                              Selecionar
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
            </>
          ) : (
            <form onSubmit={handleConfirmManual} className="space-y-4">
              <div className="space-y-1.5">
                <label
                  htmlFor="manual-title"
                  className="block text-sm font-medium text-[#F4F5F7]"
                >
                  Nome da obra
                </label>
                <input
                  id="manual-title"
                  type="text"
                  required
                  value={manualTitle}
                  onChange={(e) => setManualTitle(e.target.value)}
                  placeholder="Ex: Dragon Ball Super: Beerus"
                  className="min-h-[44px] w-full rounded-xl border border-[#373D52] bg-[#0B0C10] px-3.5 py-2 text-sm text-[#F4F5F7] placeholder:text-[#64748B]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="space-y-1">
                  <label
                    htmlFor="manual-type"
                    className="block text-xs font-medium text-[#A8B0C2]"
                  >
                    Tipo
                  </label>
                  <select
                    id="manual-type"
                    value={manualType}
                    onChange={(e) =>
                      setManualType(e.target.value as MediaType)
                    }
                    className="min-h-[44px] w-full rounded-lg border border-[#373D52] bg-[#0B0C10] px-2.5 py-2 text-sm text-[#F4F5F7]"
                  >
                    <option value="anime">Anime</option>
                    <option value="series">Série</option>
                    <option value="movie">Filme</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label
                    htmlFor="manual-add-season"
                    className="block text-xs font-medium text-[#A8B0C2]"
                  >
                    Temporada
                  </label>
                  <input
                    id="manual-add-season"
                    type="number"
                    min={1}
                    value={season}
                    onChange={(e) => setSeason(e.target.value)}
                    className="min-h-[44px] w-full rounded-lg border border-[#373D52] bg-[#0B0C10] px-3 py-2 font-mono text-sm text-[#F4F5F7]"
                  />
                </div>

                <div className="space-y-1">
                  <label
                    htmlFor="manual-add-episode"
                    className="block text-xs font-medium text-[#A8B0C2]"
                  >
                    Episódio atual
                  </label>
                  <input
                    id="manual-add-episode"
                    type="number"
                    min={0}
                    value={episode}
                    onChange={(e) => setEpisode(e.target.value)}
                    className="min-h-[44px] w-full rounded-lg border border-[#373D52] bg-[#0B0C10] px-3 py-2 font-mono text-sm text-[#F4F5F7]"
                  />
                </div>

                <div className="space-y-1">
                  <label
                    htmlFor="manual-add-total"
                    className="block text-xs font-medium text-[#A8B0C2]"
                  >
                    Total eps
                  </label>
                  <input
                    id="manual-add-total"
                    type="number"
                    min={1}
                    value={manualTotal}
                    onChange={(e) => setManualTotal(e.target.value)}
                    placeholder="Opc."
                    className="min-h-[44px] w-full rounded-lg border border-[#373D52] bg-[#0B0C10] px-3 py-2 font-mono text-sm text-[#F4F5F7]"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label
                  htmlFor="manual-add-status"
                  className="block text-xs font-medium text-[#A8B0C2]"
                >
                  Status
                </label>
                <select
                  id="manual-add-status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as WatchStatus)}
                  className="min-h-[44px] w-full rounded-lg border border-[#373D52] bg-[#0B0C10] px-3 py-2 text-sm text-[#F4F5F7]"
                >
                  <option value="watching">Assistindo</option>
                  <option value="plan_to_watch">Na fila</option>
                  <option value="completed">Completo</option>
                  <option value="on_hold">Pausado</option>
                </select>
              </div>

              <button
                type="submit"
                disabled={submitting || !manualTitle.trim()}
                className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-[#F47521] px-4 py-2.5 text-sm font-bold text-[#0B0C10] hover:bg-[#FF8B3D] disabled:opacity-60"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                <span>{submitting ? "Salvando..." : "Criar obra manual"}</span>
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
