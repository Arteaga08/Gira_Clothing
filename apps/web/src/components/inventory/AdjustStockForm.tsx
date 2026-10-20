"use client";

import { STOCK_REASON_MAX } from "@gira/shared";
import { useId, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Segmented } from "@/components/ui/Segmented";
import { T_LABEL } from "@/components/ui/typography";
import type { AdjustOutcome } from "@/hooks/useStockActions";
import { validateAdjustment, type AdjustMode, type StockAdjustmentBody } from "@/lib/inventory/adjust";
import type { PanelVariant } from "@/lib/inventory/panelVariant";
import { formatInteger } from "@/lib/format";

interface AdjustStockFormProps {
  variant: Pick<PanelVariant, "id" | "sku" | "onHand" | "reserved">;
  busy: boolean;
  onSubmit: (body: StockAdjustmentBody) => Promise<AdjustOutcome>;
}

const MODE_COPY: Record<AdjustMode, { label: string; field: string; placeholder: string; helper: string }> = {
  count: {
    label: "Recuento",
    field: "Hay en total",
    placeholder: "Ej. 40",
    helper: "Cuántas unidades hay físicamente ahora.",
  },
  move: {
    label: "Movimiento",
    field: "Suma o resta",
    placeholder: "Ej. +24 o -2",
    helper: "Entrada (+) o salida (−) respecto a lo que hay.",
  },
};

const projectedOnHand = (body: StockAdjustmentBody, onHand: number): number =>
  "onHand" in body ? body.onHand : onHand + body.delta;

/**
 * The one place stock is edited. Two modes: Recuento ("hay en total") and
 * Movimiento ("+24 o −2"), plus an optional reason. The form pre-checks the
 * same limits as the API; a refusal from the API (stock held by an order that
 * arrived meanwhile) is shown beside the field. Mount it with `key={variant.id}`
 * so switching variants never carries typed text over.
 */
const AdjustStockForm = ({ variant, busy, onSubmit }: AdjustStockFormProps) => {
  const [mode, setMode] = useState<AdjustMode>("count");
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const modeId = useId();
  const copy = MODE_COPY[mode];

  const checked = validateAdjustment(mode, value, reason, variant);
  const projected = checked.ok ? projectedOnHand(checked.body, variant.onHand) : null;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    if (!checked.ok) {
      setError(checked.error);
      return;
    }
    setError(null);
    const outcome = await onSubmit(checked.body);
    if (outcome.ok) {
      setValue("");
      setReason("");
    } else {
      setError(outcome.message);
    }
  };

  const changeMode = (next: AdjustMode) => {
    setMode(next);
    setValue("");
    setError(null);
  };

  return (
    <form onSubmit={(event) => void handleSubmit(event)} noValidate className="flex flex-col gap-3" aria-label={`Ajustar stock de ${variant.sku}`}>
      <div role="group" aria-labelledby={modeId} className="flex flex-col gap-1.5">
        <span id={modeId} className={`${T_LABEL} text-text-secondary`}>
          Tipo de ajuste
        </span>
        <div className="flex gap-2">
          {(Object.keys(MODE_COPY) as AdjustMode[]).map((key) => (
            <Segmented key={key} selected={mode === key} disabled={busy} onClick={() => changeMode(key)}>
              {MODE_COPY[key].label}
            </Segmented>
          ))}
        </div>
      </div>

      <Field
        label={copy.field}
        placeholder={copy.placeholder}
        inputMode={mode === "count" ? "numeric" : "text"}
        autoComplete="off"
        value={value}
        disabled={busy}
        onChange={(event) => {
          setValue(event.target.value);
          setError(null);
        }}
        className="font-mono"
        helper={
          projected !== null
            ? `${copy.helper} Quedará en ${formatInteger(projected)} en mano, ${formatInteger(projected - variant.reserved)} disponibles.`
            : copy.helper
        }
        {...(error ? { error } : {})}
      />

      <Field
        label="Motivo (opcional)"
        placeholder="Ej. Llegó producción, merma, corrección"
        maxLength={STOCK_REASON_MAX}
        autoComplete="off"
        value={reason}
        disabled={busy}
        onChange={(event) => setReason(event.target.value)}
      />

      <Button type="submit" variant="primary" loading={busy} className="self-start">
        Guardar ajuste
      </Button>
    </form>
  );
};

export type { AdjustStockFormProps };
export { AdjustStockForm };
