"use client";

import { Bell, Lock, Plus, Radio, Tv, Unlock } from "lucide-react";

interface HeaderBarProps {
  hasPin: boolean;
  pinRequired: boolean;
  hasLiveSignal: boolean;
  pushSubscribed: boolean;
  logsCount: number;
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
  onOpenSignalDrawer,
  onOpenNotificationsModal,
  onOpenPinModal,
  onOpenAddModal,
}: HeaderBarProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-[#262A38] bg-[#0B0C10]/95 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-2.5 sm:px-6">
        <a
          href="#main-content"
          className="inline-flex min-h-[44px] items-center gap-2.5 rounded-lg pr-2 text-[#F4F5F7] transition-colors hover:text-[#FF9248]"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#F47521] text-[#0B0C10]">
            <Tv className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="flex flex-col leading-tight">
            <span className="text-base font-extrabold tracking-tight">
              Onde Parei
            </span>
            <span className="text-xs text-[#A8B0C2]">
              Smart TV e Animes
            </span>
          </span>
        </a>

        <nav
          aria-label="Ações principais"
          className="flex items-center gap-2"
        >
          <button
            type="button"
            onClick={onOpenSignalDrawer}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-[#262A38] bg-[#13151C] px-3 py-2 text-sm font-medium text-[#F4F5F7] transition-colors hover:border-[#373D52] hover:bg-[#1B1E28] active:bg-[#262A38]"
            aria-label={`Sinal da TV ao vivo (${logsCount} registros)`}
          >
            <span
              className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                hasLiveSignal ? "bg-[#22C55E]" : "bg-[#64748B]"
              }`}
              aria-hidden="true"
            />
            <Radio className="h-4 w-4 shrink-0 text-[#A8B0C2]" aria-hidden="true" />
            <span className="hidden sm:inline">Sinal da TV</span>
            {logsCount > 0 && (
              <span className="rounded bg-[#1B1E28] px-1.5 py-0.5 font-mono text-xs text-[#A8B0C2]">
                {logsCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={onOpenNotificationsModal}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-[#262A38] bg-[#13151C] px-3 py-2 text-sm font-medium text-[#F4F5F7] transition-colors hover:border-[#373D52] hover:bg-[#1B1E28] active:bg-[#262A38]"
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
            className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
              hasPin || !pinRequired
                ? "border-[#22C55E]/40 bg-[#13151C] text-[#4ADE80] hover:bg-[#1B1E28]"
                : "border-[#F47521]/50 bg-[#13151C] text-[#FF9248] hover:bg-[#1B1E28]"
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
            <span className="hidden md:inline">
              {hasPin ? "PIN ativo" : pinRequired ? "Inserir PIN" : "Livre"}
            </span>
          </button>

          <button
            type="button"
            onClick={onOpenAddModal}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-[#F47521] px-3.5 py-2 text-sm font-bold text-[#0B0C10] transition-colors hover:bg-[#FF8B3D] active:bg-[#E06514]"
          >
            <Plus className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Adicionar Obra</span>
          </button>
        </nav>
      </div>
    </header>
  );
}
