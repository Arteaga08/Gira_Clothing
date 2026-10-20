"use client";

import { useCallback, useRef, useState } from "react";
import { useToast } from "@/components/ui/Toast";
import { updateStock } from "@/lib/api/adminVariants";
import { isApiError } from "@/lib/api/ApiError";
import type { StockAdjustmentBody } from "@/lib/inventory/adjust";
import type { PanelVariant } from "@/lib/inventory/panelVariant";

type VariantRef = Pick<PanelVariant, "id" | "sku">;

type AdjustOutcome = { ok: true; variant: PanelVariant } | { ok: false; message: string };

interface UseStockActions {
  /** True while that variant's adjustment is in flight: disable its form. */
  isBusy: (id: string) => boolean;
  /** Never throws. A failure comes back as `{ ok: false, message }` so the form can show it beside the field. */
  adjust: (variant: VariantRef, body: StockAdjustmentBody) => Promise<AdjustOutcome>;
}

const GENERIC_ERROR = "Inténtalo de nuevo en un momento.";

/**
 * Wraps the stock mutation: busy flag, a success toast with the SKU (never the
 * id), and `onChanged` so the list and the tab counts refresh together. The
 * API's own Spanish message (a 409 for stock held by orders) is handed back to
 * the form instead of a toast, because that is where the operator is looking.
 */
const useStockActions = (onChanged: (variant: PanelVariant) => void): UseStockActions => {
  const { toast } = useToast();
  const [busyIds, setBusyIds] = useState<ReadonlySet<string>>(new Set());
  // Mirrors `busyIds` synchronously: two submits in the same tick must not both pass the guard.
  const inFlight = useRef(new Set<string>());

  const markBusy = (id: string, busy: boolean) => {
    if (busy) inFlight.current.add(id);
    else inFlight.current.delete(id);
    setBusyIds(new Set(inFlight.current));
  };

  const isBusy = useCallback((id: string) => busyIds.has(id), [busyIds]);

  const adjust: UseStockActions["adjust"] = useCallback(
    async (variant, body) => {
      if (inFlight.current.has(variant.id)) return { ok: false, message: "Ya hay un ajuste en curso para esta variante." };
      markBusy(variant.id, true);
      try {
        const updated = await updateStock(variant.id, body);
        toast({
          variant: "success",
          title: `Stock de ${variant.sku} actualizado`,
          description: `Disponible: ${updated.available}`,
        });
        onChanged(updated);
        return { ok: true, variant: updated };
      } catch (failure) {
        return { ok: false, message: isApiError(failure) ? failure.message : GENERIC_ERROR };
      } finally {
        markBusy(variant.id, false);
      }
    },
    [toast, onChanged],
  );

  return { isBusy, adjust };
};

export type { VariantRef, AdjustOutcome, UseStockActions };
export { useStockActions };
