"use client";

import { useEffect, useRef } from "react";
import { Radio, RefreshCw, Tv, X } from "lucide-react";
import type { ScrobbleLog } from "@/lib/types";
import {
  formatAbsoluteTimePt,
  formatRelativeTimePt,
  formatTimecode,
  getAppMeta,
} from "./formatters";
import { useDialogAccessibility } from "./useFocusTrap";

interface TvSignalDrawerProps {
  isOpen: boolean;
  logs: ScrobbleLog[];
  lastSyncAt: string | null;
  refreshing: boolean;
  onRefresh: () => void;
  onLogsPolled: (logs: ScrobbleLog[]) => void;
  onClose: () => void;
}

export function TvSignalDrawer({
  isOpen,
  logs,
  lastSyncAt,
  refreshing,
  onRefresh,
  onLogsPolled,
  onClose,
}: TvSignalDrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null);
  useDialogAccessibility(isOpen, drawerRef, onClose);

  useEffect(() => {
    if (!isOpen) return;
    let active = true;

    const pollLogs = () => {
      fetch("/api/scrobble", { cache: "no-store" })
        .then(async (res) => {
          if (!res.ok) return;
          const data = await res.json();
          if (active && Array.isArray(data.logs)) {
            onLogsPolled(data.logs);
          }
        })
        .catch(() => {
          // ignore transient polling errors while drawer is open
        });
    };

    pollLogs();
    const interval = window.setInterval(pollLogs, 8000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [isOpen, onLogsPolled]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-[#0B0C10]/80 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tv-signal-title"
        tabIndex={-1}
        className="flex h-full w-full max-w-md flex-col border-l border-[#262A38] bg-[#13151C] shadow-2xl"
      >
        <div className="flex items-center justify-between gap-3 border-b border-[#262A38] p-4 sm:p-5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#1B1E28] text-[#4ADE80]">
              <Radio className="h-4 w-4" aria-hidden="true" />
            </span>
            <div>
              <h2
                id="tv-signal-title"
                className="text-base font-extrabold text-[#F4F5F7]"
              >
                Sinal da TV (Ao Vivo)
              </h2>
              <p className="text-xs text-[#A8B0C2]">
                Monitoramento ativo enquanto este painel está aberto
                {lastSyncAt
                  ? ` · Sincronizado ${formatRelativeTimePt(lastSyncAt)}`
                  : ""}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar painel de sinal da TV"
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-[#A8B0C2] hover:bg-[#1B1E28] hover:text-[#F4F5F7]"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="border-b border-[#262A38] px-4 py-3 sm:px-5">
          <button
            type="button"
            disabled={refreshing}
            onClick={onRefresh}
            className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-[#373D52] bg-[#1B1E28] px-4 py-2 text-sm font-semibold text-[#F4F5F7] hover:bg-[#262A38] disabled:opacity-60"
          >
            <RefreshCw
              className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
              aria-hidden="true"
            />
            <span>{refreshing ? "Atualizando..." : "Atualizar agora"}</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-5">
          {logs.length === 0 ? (
            <div className="rounded-xl border border-[#262A38] bg-[#0B0C10]/70 p-5 text-center">
              <Tv
                className="mx-auto h-7 w-7 text-[#A8B0C2]"
                aria-hidden="true"
              />
              <p className="mt-2.5 text-sm font-semibold text-[#F4F5F7]">
                Nenhum sinal recebido da TV ainda
              </p>
              <p className="mt-1 text-xs leading-relaxed text-[#A8B0C2]">
                Quando o app na Smart TV detectar um episódio no Crunchyroll, os
                eventos e minutos assistidos aparecerão aqui.
              </p>
            </div>
          ) : (
            <ul className="space-y-3">
              {logs.map((log) => {
                const appMeta = getAppMeta(log.app);
                const title =
                  log.parsed_title || log.raw_title || "Título não identificado";
                return (
                  <li
                    key={log.id}
                    className="space-y-2 rounded-xl border border-[#262A38] bg-[#0B0C10]/75 p-3.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] ${appMeta.badgeClass}`}
                      >
                        <Tv className="h-3 w-3" aria-hidden="true" />
                        {appMeta.label}
                      </span>
                      <span className="text-xs text-[#A8B0C2]">
                        {formatRelativeTimePt(log.created_at)}
                      </span>
                    </div>

                    <div>
                      <p className="text-sm font-bold text-[#F4F5F7]">
                        {title}
                      </p>
                      {(log.parsed_season || log.parsed_episode) && (
                        <p className="font-mono text-xs font-semibold text-[#FF9248]">
                          T{log.parsed_season || 1} · EP{" "}
                          {log.parsed_episode ?? "?"}
                          {log.raw_episode_title
                            ? ` (${log.raw_episode_title})`
                            : ""}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#A8B0C2]">
                      <span>
                        {log.matched
                          ? "Vinculado à biblioteca"
                          : "Aguardando vínculo"}
                        {log.playback_state ? ` · ${log.playback_state}` : ""}
                      </span>
                      {log.position_sec != null &&
                      log.duration_sec != null &&
                      log.duration_sec > 0 ? (
                        <span className="font-mono text-[#F4F5F7]">
                          {formatTimecode(log.position_sec)} /{" "}
                          {formatTimecode(log.duration_sec)}
                        </span>
                      ) : (
                        <span>{formatAbsoluteTimePt(log.created_at)}</span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
