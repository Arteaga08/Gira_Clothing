"use client";

import { useCallback, useRef, useState } from "react";
import { createProduct, updateProduct } from "@/lib/api/adminProducts";
import { createVariant, updateVariant } from "@/lib/api/adminVariants";
import { isApiError } from "@/lib/api/ApiError";
import {
  planVariantChanges,
  toCreateBody,
  toUpdateBody,
  type ProductBaseline,
  type ProductFormState,
  type VariantPlan,
} from "@/lib/catalog/productForm";

interface SaveFailure {
  printName: string;
  message: string;
}

type SaveOutcome = { ok: true; productId: string; failures: SaveFailure[] } | { ok: false; message: string };

/** printId -> name, to say WHICH print a failed variant belonged to. */
type PrintNames = ReadonlyMap<string, string>;

interface UseProductSave {
  saving: boolean;
  saveNew: (state: ProductFormState, printNames: PrintNames) => Promise<SaveOutcome>;
  saveExisting: (
    productId: string,
    state: ProductFormState,
    baseline: ProductBaseline,
    printNames: PrintNames,
  ) => Promise<SaveOutcome>;
}

const GENERIC_ERROR = "Inténtalo de nuevo en un momento.";
const BUSY_MESSAGE = "Ya hay un guardado en curso.";

const messageOf = (failure: unknown): string => (isApiError(failure) ? failure.message : GENERIC_ERROR);

/**
 * Runs the variant plan one request at a time (retire, update, create). A
 * failure never stops the rest: it is collected with the print's name so the
 * operator knows exactly which variants are still pending.
 */
const runPlan = async (productId: string, plan: VariantPlan, printNames: PrintNames): Promise<SaveFailure[]> => {
  const failures: SaveFailure[] = [];
  const attempt = async (printId: string, action: () => Promise<unknown>) => {
    try {
      await action();
    } catch (failure) {
      failures.push({ printName: printNames.get(printId) ?? "una estampa", message: messageOf(failure) });
    }
  };

  for (const variant of plan.retire) {
    await attempt(variant.printId, () => updateVariant(variant.id, { isActive: false }));
  }
  for (const { id, printId, patch } of plan.update) {
    await attempt(printId, () => updateVariant(id, patch));
  }
  for (const draft of plan.create) {
    await attempt(draft.printId, () =>
      createVariant({
        product: productId,
        print: draft.printId,
        images: draft.images,
        ...(draft.priceOverride !== undefined ? { priceOverride: draft.priceOverride } : {}),
      }),
    );
  }
  return failures;
};

/**
 * Saves the editor. The model goes first (a failure there stops everything: no
 * variant is attempted without its model), then the variants. Never throws; the
 * ref blocks a second save in the same tick, which state alone cannot.
 */
const useProductSave = (): UseProductSave => {
  const [saving, setSaving] = useState(false);
  const inFlight = useRef(false);

  const guarded = useCallback(async (run: () => Promise<SaveOutcome>): Promise<SaveOutcome> => {
    if (inFlight.current) return { ok: false, message: BUSY_MESSAGE };
    inFlight.current = true;
    setSaving(true);
    try {
      return await run();
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }, []);

  const saveNew: UseProductSave["saveNew"] = useCallback(
    (state, printNames) =>
      guarded(async () => {
        let productId: string;
        try {
          productId = await createProduct(toCreateBody(state));
        } catch (failure) {
          return { ok: false, message: messageOf(failure) };
        }
        const failures = await runPlan(productId, planVariantChanges(state.selected, []), printNames);
        return { ok: true, productId, failures };
      }),
    [guarded],
  );

  const saveExisting: UseProductSave["saveExisting"] = useCallback(
    (productId, state, baseline, printNames) =>
      guarded(async () => {
        const body = toUpdateBody(state, baseline);
        if (body) {
          try {
            await updateProduct(productId, body);
          } catch (failure) {
            return { ok: false, message: messageOf(failure) };
          }
        }
        const failures = await runPlan(productId, planVariantChanges(state.selected, baseline.variants), printNames);
        return { ok: true, productId, failures };
      }),
    [guarded],
  );

  return { saving, saveNew, saveExisting };
};

export type { SaveFailure, SaveOutcome, PrintNames, UseProductSave };
export { useProductSave };
