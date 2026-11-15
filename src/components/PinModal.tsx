"use client";

import { useRef, useState } from "react";
import { Lock, X } from "lucide-react";
import { useDialogAccessibility } from "./useFocusTrap";

interface PinModalProps {
  isOpen: boolean;
  currentPin: string;
  reasonMessage?: string | null;
  onSavePin: (pin: string) => void;
  onClearPin: () => void;
  onClose: () => void;
}

export function PinModal(props: PinModalProps) {
  if (!props.isOpen) return null;
  return <PinModalInner {...props} />;
}

function PinModalInner({
  isOpen,
  currentPin,
  reasonMessage,
  onSavePin,
  onClearPin,
  onClose,
}: PinModalProps) {
  const [pinInput, setPinInput] = useState(currentPin || "2026");
  const dialogRef = useRef<HTMLDivElement>(null);

  useDialogAccessibility(isOpen, dialogRef, onClose);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = pinInput.trim();
    if (!cleaned) return;
    onSavePin(cleaned);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[#0B0C10]/80 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pin-modal-title"
        tabIndex={-1}
        className="w-full max-w-md rounded-t-2xl border border-[#262A38] bg-[#13151C] p-5 shadow-2xl sm:rounded-2xl sm:p-6"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#1B1E28] text-[#FF9248]">
              <Lock className="h-4 w-4" aria-hidden="true" />
            </span>
            <div>
              <h2
                id="pin-modal-title"
                className="text-lg font-bold text-[#F4F5F7]"
              >
                PIN de Edição
              </h2>
              <p className="text-xs text-[#A8B0C2]">
                Salvo apenas neste navegador para proteger seu progresso.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar janela de PIN"
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-[#A8B0C2] hover:bg-[#1B1E28] hover:text-[#F4F5F7]"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {reasonMessage && (
          <p
            role="alert"
            className="mt-3 rounded-lg border border-[#F47521]/40 bg-[#F47521]/10 px-3 py-2 text-xs font-medium text-[#FF9248]"
          >
            {reasonMessage}
          </p>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div className="space-y-1.5">
            <label
              htmlFor="tracker-pin-input"
              className="block text-sm font-medium text-[#F4F5F7]"
            >
              Código PIN
            </label>
            <input
              id="tracker-pin-input"
              type="password"
              inputMode="numeric"
              autoComplete="current-password"
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value)}
              placeholder="Digite o PIN (padrão 2026)"
              className="min-h-[44px] w-full rounded-xl border border-[#373D52] bg-[#0B0C10] px-3.5 py-2.5 font-mono text-base text-[#F4F5F7] placeholder:text-[#64748B]"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            {currentPin ? (
              <button
                type="button"
                onClick={() => {
                  onClearPin();
                  onClose();
                }}
                className="inline-flex min-h-[44px] items-center rounded-xl border border-[#373D52] bg-[#1B1E28] px-3.5 py-2 text-sm font-medium text-[#FDA4AF] hover:bg-[#262A38]"
              >
                Bloquear novamente
              </button>
            ) : (
              <span className="text-xs text-[#A8B0C2]">
                Enviado como cabeçalho x-tracker-pin
              </span>
            )}

            <button
              type="submit"
              className="inline-flex min-h-[44px] items-center rounded-xl bg-[#F47521] px-5 py-2.5 text-sm font-bold text-[#0B0C10] hover:bg-[#FF8B3D]"
            >
              Salvar PIN
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
