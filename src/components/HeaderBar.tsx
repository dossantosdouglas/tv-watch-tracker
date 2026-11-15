"use client";

import { Bell, Lock, Plus, Radio, Tv, Unlock } from "lucide-react";

interface HeaderBarProps {
  hasPin: boolean;
  pinRequired: boolean;
  hasLiveSignal: boolean;
  pushSubscribed: boolean;
  logsCount: number;
  watchingCount?: number;
  episodesWatched?: number;
  onOpenSignalDrawer: () => void;
  onOpenNotificationsModal: () => void;
  onOpenPinModal: () => void;
  onOpenAddModal: () => void;
}

export function HeaderBar({
  hasPin,
  pinRequired,
  hasLiveSignal,
  pushSubscribed,
  logsCount,
  watchingCount = 0,
  episodesWatched = 0,
  onOpenSignalDrawer,
  onOpenNotificationsModal,
  onOpenPinModal,
  onOpenAddModal,
}: HeaderBarProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-[#262A38]/90 bg-[#0B0C10]/85 backdrop-blur-xl">
      <div
        aria-hidden="true"
        className="h-[2px] w-full bg-gradient-to-r from-[#F47521] via-[#F47521]/45 to-transparent"
      />
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2.5 px-4 py-2.5 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <a
            href="#main-content"
            className="inline-flex min-h-[44px] items-center gap-2.5 rounded-xl pr-2 text-[#F4F5F7] transition-colors hover:text-[#FF9248]"
          >
            <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#FF8B3D] to-[#F47521] text-[#0B0C10] shadow-[0_0_24px_-4px_rgba(244,117,33,0.65)]">
              <Tv className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="flex flex-col leading-tight">
              <span className="flex items-center gap-2 text-base font-extrabold tracking-tight">
                <span>ONDE PAREI</span>
                <span className="hidden rounded border border-[#F47521]/40 bg-[#F47521]/10 px-1.5 py-0.5 font-mono text-[10px] font-bold tracking-wider text-[#FF9248] sm:inline">
                  HUD
                </span>
              </span>
              <span className="flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-[#A8B0C2]">
                <span
                  className={`inline-block h-1.5 w-1.5 rounded-full ${
                    hasLiveSignal
                      ? "animate-pulse bg-[#22C55E]"
                      : "bg-[#F47521]"
                  }`}
                  aria-hidden="true"
                />
                <span>SMART TV 4K · CRUNCHYROLL SYNC</span>
              </span>
            </span>
          </a>

          {watchingCount > 0 && (
            <div className="hidden items-center gap-2 rounded-full border border-[#262A38] bg-[#13151C]/90 px-3 py-1.5 font-mono text-xs text-[#A8B0C2] xl:inline-flex">
              <span className="font-bold text-[#F4F5F7]">
                {watchingCount} {watchingCount === 1 ? "anime" : "animes"}
              </span>
              <span className="text-[#373D52]" aria-hidden="true">
                /
              </span>
              <span>{episodesWatched} eps assistidos</span>
            </div>
          )}
        </div>

        <nav
          aria-label="Ações principais"
          className="flex flex-wrap items-center gap-1.5 sm:gap-2"
        >
          <button
            type="button"
            onClick={onOpenSignalDrawer}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-[#262A38] bg-[#13151C]/90 px-3 py-2 text-sm font-medium text-[#F4F5F7] transition-all hover:border-[#373D52] hover:bg-[#1B1E28] active:scale-[0.98]"
            aria-label={`Sinal da TV ao vivo (${logsCount} registros)`}
          >
            <span className="relative flex h-2.5 w-2.5 shrink-0" aria-hidden="true">
              {hasLiveSignal && (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#22C55E] opacity-75" />
              )}
              <span
                className={`relative inline-flex h-2.5 w-2.5 rounded-full ${
                  hasLiveSignal ? "bg-[#22C55E]" : "bg-[#64748B]"
                }`}
              />
            </span>
            <Radio
              className={`h-4 w-4 shrink-0 ${
                hasLiveSignal ? "text-[#4ADE80]" : "text-[#A8B0C2]"
              }`}
              aria-hidden="true"
            />
            <span className="hidden sm:inline">Sinal Ao Vivo</span>
            {logsCount > 0 && (
              <span className="rounded-md bg-[#1B1E28] px-1.5 py-0.5 font-mono text-xs font-bold text-[#F4F5F7]">
                {logsCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={onOpenNotificationsModal}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-[#262A38] bg-[#13151C]/90 px-3 py-2 text-sm font-medium text-[#F4F5F7] transition-all hover:border-[#373D52] hover:bg-[#1B1E28] active:scale-[0.98]"
            aria-label={
              pushSubscribed
                ? "Notificações de lançamento ativas"
                : "Configurar notificações de lançamento"
            }
          >
            <Bell
              className={`h-4 w-4 shrink-0 ${
                pushSubscribed ? "text-[#FF9248]" : "text-[#A8B0C2]"
              }`}
              aria-hidden="true"
            />
            <span className="hidden lg:inline">Notificações</span>
          </button>

          <button
            type="button"
            onClick={onOpenPinModal}
            className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-medium transition-all active:scale-[0.98] ${
              hasPin || !pinRequired
                ? "border-[#22C55E]/40 bg-[#13151C]/90 text-[#4ADE80] hover:bg-[#1B1E28]"
                : "border-[#F47521]/50 bg-[#13151C]/90 text-[#FF9248] hover:bg-[#1B1E28]"
            }`}
            aria-label={
              hasPin
                ? "PIN salvo: gerenciar acesso"
                : "Desbloquear edição com PIN"
            }
          >
            {hasPin || !pinRequired ? (
              <Unlock className="h-4 w-4 shrink-0" aria-hidden="true" />
            ) : (
              <Lock className="h-4 w-4 shrink-0" aria-hidden="true" />
            )}
            <span className="hidden md:inline font-mono text-xs font-semibold">
              {hasPin ? "PIN OK" : pinRequired ? "PIN" : "Livre"}
            </span>
          </button>

          <button
            type="button"
            onClick={onOpenAddModal}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#F47521] to-[#FF8B3D] px-3.5 py-2 text-sm font-bold text-[#0B0C10] shadow-[0_8px_20px_-6px_rgba(244,117,33,0.65)] transition-all hover:brightness-110 active:scale-[0.98]"
          >
            <Plus className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Nova Obra</span>
          </button>
        </nav>
      </div>
    </header>
  );
}
