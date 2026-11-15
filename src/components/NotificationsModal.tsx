"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, BellOff, Calendar, Send, X } from "lucide-react";
import type { NextAiringInfo } from "@/lib/types";
import { formatReleaseDatePt, urlBase64ToUint8Array } from "./formatters";
import { useDialogAccessibility } from "./useFocusTrap";

interface UpcomingItem {
  id: string;
  title: string;
  cover_image: string | null;
  next_airing: NextAiringInfo | null;
  airing_status: string | null;
}

interface NotificationsModalProps {
  isOpen: boolean;
  pin: string;
  onSubscriptionChange: (subscribed: boolean) => void;
  onUnauthorized: () => void;
  onToast: (message: string, tone?: "ok" | "error") => void;
  onClose: () => void;
}

export function NotificationsModal(props: NotificationsModalProps) {
  if (!props.isOpen) return null;
  return <NotificationsModalInner {...props} />;
}

function NotificationsModalInner({
  isOpen,
  pin,
  onSubscriptionChange,
  onUnauthorized,
  onToast,
  onClose,
}: NotificationsModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogAccessibility(isOpen, dialogRef, onClose);

  const [publicKey, setPublicKey] = useState<string | null>(
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || null
  );
  const [subscribedCount, setSubscribedCount] = useState<number>(0);
  const [upcoming, setUpcoming] = useState<UpcomingItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [isSubscribed, setIsSubscribed] = useState<boolean>(false);
  const [currentEndpoint, setCurrentEndpoint] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<
    "subscribe" | "unsubscribe" | "test" | "check" | null
  >(null);

  const supportsPush =
    typeof window !== "undefined" &&
    "Notification" in window &&
    "serviceWorker" in navigator &&
    "PushManager" in window;

  const permissionState =
    typeof window !== "undefined" && "Notification" in window
      ? Notification.permission
      : "default";

  const loadPushStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/push", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Não foi possível carregar notificações.");
      }
      if (data.publicKey) setPublicKey(data.publicKey);
      if (typeof data.subscribedCount === "number") {
        setSubscribedCount(data.subscribedCount);
      }
      setUpcoming(Array.isArray(data.upcoming) ? data.upcoming : []);

      if (supportsPush) {
        const reg = await navigator.serviceWorker.getRegistration("/sw.js");
        const sub = reg ? await reg.pushManager.getSubscription() : null;
        const active = Boolean(sub);
        setIsSubscribed(active);
        setCurrentEndpoint(sub ? sub.endpoint : null);
        onSubscriptionChange(active);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Erro ao consultar /api/push."
      );
    } finally {
      setLoading(false);
    }
  }, [onSubscriptionChange, supportsPush]);

  useEffect(() => {
    let active = true;
    fetch("/api/push", { cache: "no-store" })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          throw new Error(
            data.error || "Não foi possível carregar notificações."
          );
        }
        if (!active) return;
        if (data.publicKey) setPublicKey(data.publicKey);
        if (typeof data.subscribedCount === "number") {
          setSubscribedCount(data.subscribedCount);
        }
        setUpcoming(Array.isArray(data.upcoming) ? data.upcoming : []);
        setError(null);

        if (supportsPush) {
          const reg = await navigator.serviceWorker.getRegistration("/sw.js");
          const sub = reg ? await reg.pushManager.getSubscription() : null;
          const hasSub = Boolean(sub);
          if (!active) return;
          setIsSubscribed(hasSub);
          setCurrentEndpoint(sub ? sub.endpoint : null);
          onSubscriptionChange(hasSub);
        }
      })
      .catch((err) => {
        if (active) {
          setError(
            err instanceof Error ? err.message : "Erro ao consultar /api/push."
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [onSubscriptionChange, supportsPush]);

  const buildHeaders = () => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (pin) headers["x-tracker-pin"] = pin;
    return headers;
  };

  const handleSubscribe = async () => {
    if (!supportsPush) {
      onToast(
        "Este navegador não suporta Web Push. No iPhone, adicione à Tela de Início primeiro.",
        "error"
      );
      return;
    }
    if (!publicKey) {
      onToast("Chave pública VAPID não configurada no servidor.", "error");
      return;
    }

    setBusyAction("subscribe");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        onToast(
          "Permissão de notificações negada no navegador.",
          "error"
        );
        return;
      }

      const registration = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;

      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
      }

      const json = subscription.toJSON();
      const res = await fetch("/api/push", {
        method: "POST",
        headers: buildHeaders(),
        body: JSON.stringify({
          endpoint: subscription.endpoint,
          keys: json.keys,
        }),
      });
      const data = await res.json();
      if (res.status === 401) {
        onUnauthorized();
        return;
      }
      if (!res.ok) {
        throw new Error(data.error || "Falha ao registrar aparelho.");
      }

      setIsSubscribed(true);
      setCurrentEndpoint(subscription.endpoint);
      onSubscriptionChange(true);
      onToast("Notificações ativadas neste aparelho!");
      await loadPushStatus();
    } catch (err) {
      onToast(
        err instanceof Error ? err.message : "Erro ao ativar notificações.",
        "error"
      );
    } finally {
      setBusyAction(null);
    }
  };

  const handleUnsubscribe = async () => {
    setBusyAction("unsubscribe");
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      const endpoint = sub?.endpoint || currentEndpoint;

      if (sub) {
        await sub.unsubscribe();
      }
      if (endpoint) {
        const res = await fetch("/api/push", {
          method: "DELETE",
          headers: buildHeaders(),
          body: JSON.stringify({ endpoint }),
        });
        if (res.status === 401) {
          onUnauthorized();
          return;
        }
      }

      setIsSubscribed(false);
      setCurrentEndpoint(null);
      onSubscriptionChange(false);
      onToast("Notificações desativadas neste aparelho.");
      await loadPushStatus();
    } catch (err) {
      onToast(
        err instanceof Error ? err.message : "Erro ao desativar.",
        "error"
      );
    } finally {
      setBusyAction(null);
    }
  };

  const handleTriggerAction = async (action: "test" | "check_releases") => {
    setBusyAction(action === "test" ? "test" : "check");
    try {
      const res = await fetch("/api/push", {
        method: "POST",
        headers: buildHeaders(),
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (res.status === 401) {
        onUnauthorized();
        return;
      }
      if (!res.ok) {
        throw new Error(data.error || "Falha ao enviar notificação.");
      }
      onToast(
        action === "test"
          ? `Notificação de teste enviada (${data.sent ?? 0} aparelho(s)).`
          : `Verificação concluída (${data.sent ?? 0} aviso(s) enviado(s)).`
      );
    } catch (err) {
      onToast(
        err instanceof Error ? err.message : "Erro ao enviar notificação.",
        "error"
      );
    } finally {
      setBusyAction(null);
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
        aria-labelledby="push-modal-title"
        tabIndex={-1}
        className="flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-[#262A38] bg-[#13151C] shadow-2xl sm:rounded-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-[#262A38] p-4 sm:p-5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#1B1E28] text-[#FF9248]">
              <Bell className="h-4 w-4" aria-hidden="true" />
            </span>
            <div>
              <h2
                id="push-modal-title"
                className="text-lg font-extrabold text-[#F4F5F7]"
              >
                Notificações de Lançamento
              </h2>
              <p className="text-xs text-[#A8B0C2]">
                Receba avisos no celular ou PC quando sair novo episódio.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar notificações"
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-[#A8B0C2] hover:bg-[#1B1E28] hover:text-[#F4F5F7]"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">
          {error && (
            <p
              role="alert"
              className="rounded-xl border border-[#BE123C]/50 bg-[#BE123C]/10 p-3 text-sm text-[#FDA4AF]"
            >
              {error}
            </p>
          )}

          <div className="space-y-3 rounded-xl border border-[#262A38] bg-[#0B0C10]/70 p-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-bold text-[#F4F5F7]">
                  {isSubscribed
                    ? "Ativo neste aparelho"
                    : "Inativo neste aparelho"}
                </p>
                <p className="text-xs text-[#A8B0C2]">
                  {subscribedCount} aparelho(s) cadastrado(s) no servidor
                </p>
              </div>
              <span
                className={`rounded-md px-2.5 py-1 text-xs font-bold ${
                  isSubscribed
                    ? "bg-[#22C55E] text-[#0B0C10]"
                    : "border border-[#373D52] bg-[#1B1E28] text-[#A8B0C2]"
                }`}
              >
                {isSubscribed ? "Ativado" : "Desativado"}
              </span>
            </div>

            {!supportsPush ? (
              <p className="text-xs text-[#FCD34D]">
                Este navegador não expõe Push API. No Android use Chrome/Edge;
                no iPhone, adicione o site à Tela de Início.
              </p>
            ) : permissionState === "denied" ? (
              <p className="text-xs text-[#FDA4AF]">
                As notificações estão bloqueadas nas permissões do navegador.
                Libere o site nas configurações e tente novamente.
              </p>
            ) : null}

            <div className="flex flex-wrap gap-2 pt-1">
              {!isSubscribed ? (
                <button
                  type="button"
                  disabled={!supportsPush || busyAction !== null}
                  onClick={handleSubscribe}
                  className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl bg-[#F47521] px-4 py-2 text-sm font-bold text-[#0B0C10] hover:bg-[#FF8B3D] disabled:opacity-60"
                >
                  <Bell className="h-4 w-4" aria-hidden="true" />
                  <span>
                    {busyAction === "subscribe"
                      ? "Ativando..."
                      : "Ativar Notificações"}
                  </span>
                </button>
              ) : (
                <button
                  type="button"
                  disabled={busyAction !== null}
                  onClick={handleUnsubscribe}
                  className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-[#373D52] bg-[#1B1E28] px-3.5 py-2 text-xs font-semibold text-[#FDA4AF] hover:bg-[#262A38] disabled:opacity-60"
                >
                  <BellOff className="h-4 w-4" aria-hidden="true" />
                  <span>
                    {busyAction === "unsubscribe"
                      ? "Desativando..."
                      : "Desativar neste aparelho"}
                  </span>
                </button>
              )}

              <button
                type="button"
                disabled={busyAction !== null || subscribedCount === 0}
                onClick={() => void handleTriggerAction("test")}
                className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-[#373D52] bg-[#1B1E28] px-3.5 py-2 text-xs font-bold text-[#F4F5F7] hover:bg-[#262A38] disabled:opacity-60"
              >
                <Send className="h-3.5 w-3.5 text-[#FF9248]" aria-hidden="true" />
                <span>
                  {busyAction === "test"
                    ? "Enviando..."
                    : "Testar Notificação Agora"}
                </span>
              </button>

              <button
                type="button"
                disabled={busyAction !== null || subscribedCount === 0}
                onClick={() => void handleTriggerAction("check_releases")}
                className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-[#262A38] bg-[#13151C] px-3.5 py-2 text-xs font-semibold text-[#A8B0C2] hover:border-[#373D52] hover:text-[#F4F5F7] disabled:opacity-60"
              >
                <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
                <span>
                  {busyAction === "check"
                    ? "Verificando..."
                    : "Avisar Lançamentos"}
                </span>
              </button>
            </div>
          </div>

          <div className="space-y-2.5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#A8B0C2]">
              Próximos Lançamentos na Sua Lista
            </h3>

            {loading ? (
              <p className="text-xs text-[#A8B0C2]">
                Carregando calendário de episódios...
              </p>
            ) : upcoming.length === 0 ? (
              <div className="rounded-xl border border-[#262A38] bg-[#0B0C10]/60 p-4 text-xs text-[#A8B0C2]">
                Nenhuma obra em exibição com data de próximo episódio marcada no
                momento.
              </div>
            ) : (
              <ul className="space-y-2">
                {upcoming.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-[#262A38] bg-[#0B0C10]/70 p-3"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      {item.cover_image ? (
                        <img
                          src={item.cover_image}
                          alt={`Capa de ${item.title}`}
                          width={40}
                          height={60}
                          className="aspect-[2/3] w-10 shrink-0 rounded object-cover"
                        />
                      ) : null}
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-[#F4F5F7]">
                          {item.title}
                        </p>
                        <p className="font-mono text-xs text-[#FCD34D]">
                          {item.next_airing
                            ? `Ep ${item.next_airing.episode} · ${formatReleaseDatePt(item.next_airing.airing_at, true)}`
                            : item.airing_status || "Em exibição"}
                        </p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
