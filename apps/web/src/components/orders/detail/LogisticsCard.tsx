"use client";

import { OrderStatus, ShipmentTrackingStatus, ShippingLabelStatus } from "@gira/shared";
import { ArrowSquareOutIcon, CheckIcon, TruckIcon, ArrowClockwiseIcon } from "@phosphor-icons/react/dist/ssr";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Icon } from "@/components/ui/Icon";
import { Notice } from "@/components/ui/Notice";
import { useToast } from "@/components/ui/Toast";
import { NB_CONTROL, NB_PRESSABLE } from "@/components/ui/styles";
import { T_LABEL, T_PANEL_TITLE } from "@/components/ui/typography";
import { cn } from "@/lib/cn";
import { logisticsStateOf } from "@/lib/orders/logistics";
import { carrierServiceLabel } from "@/lib/orders/shipping";
import { LabelStatusChip } from "../LabelStatusChip";
import { TrackingStatusChip } from "../TrackingStatusChip";
import { TrackingTimeline } from "./TrackingTimeline";
import type { PanelOrder } from "@/lib/orders/panelOrder";

interface LogisticsCardProps {
  order: PanelOrder;
  busy: boolean;
  version: number;
  onPrepare: () => void;
  onShip: () => void;
  /** Resolves true when the API accepted the retry. */
  onRetryLabel: () => Promise<boolean>;
}

const RETRY_WARNING =
  "Si la primera guía sí se creó, Envía puede cobrar una segunda. Revisa en el portal de Envía antes de continuar.";

const SETTLING_LABEL_STATUSES: readonly ShippingLabelStatus[] = [
  ShippingLabelStatus.PENDING,
  ShippingLabelStatus.REQUESTED,
  ShippingLabelStatus.CANCEL_PENDING,
];

const TRACKING_PROBLEMS: readonly ShipmentTrackingStatus[] = [
  ShipmentTrackingStatus.EXCEPTION,
  ShipmentTrackingStatus.RETURNED,
  ShipmentTrackingStatus.LOST,
];

/** Only https links are rendered: a carrier URL is third-party data and must never be `javascript:`. */
const safeHttpsUrl = (url: string | undefined): string | null => {
  if (!url) return null;
  try {
    return new URL(url).protocol === "https:" ? url : null;
  } catch {
    return null;
  }
};

const LinkButton = ({ href, children }: { href: string; children: string }) => (
  <a
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    className={cn("inline-flex items-center gap-2 px-4 py-1.5 text-xs font-bold", NB_CONTROL, NB_PRESSABLE)}
  >
    {children}
    <Icon icon={ArrowSquareOutIcon} />
  </a>
);

/**
 * The logistics card: label state, carrier and guide, tracking, and the three
 * actions an operator can take. What is enabled comes from `logisticsStateOf`
 * (pure, tested): this component never decides a business rule itself.
 */
const LogisticsCard = ({ order, busy, version, onPrepare, onShip, onRetryLabel }: LogisticsCardProps) => {
  const { toast } = useToast();
  const [confirmingRetry, setConfirmingRetry] = useState(false);
  const logistics = logisticsStateOf(order);
  const { label, tracking, shippingSelection } = order;

  const carrierDisplay = label?.carrier ? carrierServiceLabel(label.carrier, shippingSelection?.serviceName) : null;
  const trackUrl = safeHttpsUrl(label?.trackUrl);
  const labelUrl = safeHttpsUrl(label?.labelUrl);
  const showShip = (order.status === OrderStatus.PAID || order.status === OrderStatus.PROCESSING) && !logistics.emptyCopy;
  const showTimeline = Boolean(order.shippedAt) || label?.trackingNumber !== undefined;

  const copyGuide = async () => {
    if (!label?.trackingNumber) return;
    try {
      await navigator.clipboard.writeText(label.trackingNumber);
      toast({ variant: "success", title: "Guía copiada" });
    } catch {
      toast({ variant: "warning", title: "No se pudo copiar", description: "Selecciónala y cópiala a mano." });
    }
  };

  const retry = async () => {
    if (logistics.retryNeedsWarning) {
      setConfirmingRetry(true);
      return;
    }
    await onRetryLabel();
  };

  return (
    <section aria-labelledby="logistics-title" className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h3 id="logistics-title" className={T_PANEL_TITLE}>
          Logística
        </h3>
        {label ? <LabelStatusChip status={label.status} /> : null}
      </div>

      {logistics.emptyCopy ? <p className="text-sm text-text-secondary">{logistics.emptyCopy}</p> : null}
      {label && SETTLING_LABEL_STATUSES.includes(label.status) ? (
        <p role="status" className="text-sm text-text-secondary">
          La guía se está procesando. Esta pantalla se actualiza sola.
        </p>
      ) : null}

      {label && !logistics.emptyCopy ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className={`${T_LABEL} text-text-muted`}>Paquetería</p>
              <p className="text-sm font-bold">
                {carrierDisplay ?? "Sin asignar"}
              </p>
              {shippingSelection ? (
                <p className="text-xs text-text-muted">
                  {shippingSelection.estimatedDays === 1 ? "1 día" : `${shippingSelection.estimatedDays} días`} estimados
                </p>
              ) : null}
            </div>
            {label.trackingNumber ? (
              <div>
                <p className={`${T_LABEL} text-text-muted`}>Número de guía</p>
                <p className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-base font-bold tracking-wide">{label.trackingNumber}</span>
                  <Button size="sm" onClick={() => void copyGuide()}>
                    Copiar
                  </Button>
                </p>
              </div>
            ) : null}
          </div>

          {trackUrl || labelUrl ? (
            <div className="flex flex-wrap gap-2">
              {trackUrl ? <LinkButton href={trackUrl}>Rastrear paquete</LinkButton> : null}
              {labelUrl ? <LinkButton href={labelUrl}>Ver etiqueta</LinkButton> : null}
            </div>
          ) : null}

          {tracking ? (
            <p className="flex items-center gap-2 text-sm">
              <TrackingStatusChip status={tracking.status} />
            </p>
          ) : null}
          {tracking && TRACKING_PROBLEMS.includes(tracking.status) ? (
            <Notice variant="warning" title="Hay un problema con el envío">
              El equipo ya recibió el aviso. Revisa el detalle con la paquetería.
            </Notice>
          ) : null}
          {label.lastError && (label.status === ShippingLabelStatus.FAILED || label.status === ShippingLabelStatus.NEEDS_REVIEW) ? (
            <Notice variant="danger" title="Último error de la guía">
              {label.lastError}
            </Notice>
          ) : null}
          {showTimeline ? <TrackingTimeline orderId={order.id} version={version} /> : null}
        </>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {logistics.canPrepare ? (
          <Button variant="primary" loading={busy} onClick={onPrepare}>
            <Icon icon={CheckIcon} />
            Pasar a en proceso
          </Button>
        ) : null}
        {showShip ? (
          <Button variant={logistics.canPrepare ? "secondary" : "primary"} disabled={!logistics.canShip} loading={busy} onClick={onShip}>
            <Icon icon={TruckIcon} />
            Marcar enviado
          </Button>
        ) : null}
        {logistics.canRetryLabel ? (
          <Button disabled={busy} onClick={() => void retry()}>
            <Icon icon={ArrowClockwiseIcon} />
            Reintentar guía
          </Button>
        ) : null}
      </div>
      {showShip && logistics.shipBlockedReason ? (
        <p className="-mt-2 text-xs text-text-secondary">{logistics.shipBlockedReason}</p>
      ) : null}

      <ConfirmDialog
        open={confirmingRetry}
        tone="danger"
        title="¿Reintentar la guía?"
        description={RETRY_WARNING}
        confirmLabel="Sí, reintentar"
        onCancel={() => setConfirmingRetry(false)}
        onConfirm={async () => {
          if (await onRetryLabel()) setConfirmingRetry(false);
        }}
      />
    </section>
  );
};

export type { LogisticsCardProps };
export { LogisticsCard };
