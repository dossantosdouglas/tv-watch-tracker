"use client";

import { Bell, Lock, Plus, Radio, Unlock } from "lucide-react";

interface HeaderBarProps {
  hasPin: boolean;
  pinRequired: boolean;
  hasLiveSignal: boolean;
  pushSubscribed: boolean;
  logsCount: number;
  totalCount?: number;
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
  totalCount = 0,
  onOpenSignalDrawer,
  onOpenNotificationsModal,
  onOpenPinModal,
  onOpenAddModal,
}: HeaderBarProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-[#22252D] bg-[#0B0C0E]/95 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <a
          href="#main-content"
          className="inline-flex min-h-[44px] flex-col justify-center rounded-lg pr-2 text-[#F3F4F6] transition-colors hover:text-[#F47521]"
        >
          <span className="text-lg font-bold tracking-tight">Onde Parei</span>
          <span className="text-xs text-[#9CA3AF]">
            {totalCount === 1
              ? "1 obra acompanhada"
              : `${totalCount} obras acompanhadas`}
          </span>
        </a>

        <nav
          aria-label="Ações principais"
          className="flex flex-wrap items-center gap-2"
        >
          <button
            type="button"
            onClick={onOpenSignalDrawer}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-[#22252D] bg-[#131519] px-3 py-2 text-sm font-medium text-[#F3F4F6] transition-colors hover:border-[#2E323D] hover:bg-[#1A1D24]"
            aria-label={`Sinal da TV (${logsCount} registros)`}
          >
            <Radio
              className={`h-4 w-4 shrink-0 ${
                hasLiveSignal ? "text-[#F47521]" : "text-[#9CA3AF]"
              }`}
              aria-hidden="true"
            />
            <span className="hidden sm:inline">Sinal da TV</span>
            {logsCount > 0 && (
              <span className="rounded bg-[#1A1D24] px-1.5 py-0.5 font-mono text-xs text-[#9CA3AF]">
                {logsCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={onOpenNotificationsModal}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-[#22252D] bg-[#131519] px-3 py-2 text-sm font-medium text-[#F3F4F6] transition-colors hover:border-[#2E323D] hover:bg-[#1A1D24]"
            aria-label={
              pushSubscribed
                ? "Notificações de lançamento ativas"
                : "Configurar notificações de lançamento"
            }
          >
            <Bell
              className={`h-4 w-4 shrink-0 ${
                pushSubscribed ? "text-[#F47521]" : "text-[#9CA3AF]"
              }`}
              aria-hidden="true"
            />
            <span className="hidden md:inline">Notificações</span>
          </button>

          <button
            type="button"
            onClick={onOpenPinModal}
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-[#22252D] bg-[#131519] px-2.5 py-2 text-sm font-medium text-[#9CA3AF] transition-colors hover:border-[#2E323D] hover:bg-[#1A1D24] hover:text-[#F3F4F6]"
            aria-label={
              hasPin
                ? "PIN salvo: gerenciar acesso"
                : "Desbloquear edição com PIN"
            }
            title={hasPin ? "PIN ativo" : pinRequired ? "Inserir PIN" : "Livre"}
          >
            {hasPin || !pinRequired ? (
              <Unlock className="h-4 w-4 shrink-0" aria-hidden="true" />
            ) : (
              <Lock className="h-4 w-4 shrink-0" aria-hidden="true" />
            )}
          </button>

          <button
            type="button"
            onClick={onOpenAddModal}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-[#F47521] px-3.5 py-2 text-sm font-semibold text-[#0B0C0E] transition-colors hover:bg-[#FF8533]"
          >
            <Plus className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Adicionar</span>
          </button>
        </nav>
      </div>
    </header>
  );
}
