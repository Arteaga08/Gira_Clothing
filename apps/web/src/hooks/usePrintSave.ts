"use client";

import { useCallback, useState } from "react";
import { createAdminPrint, reactivatePrint, retirePrint, updateAdminPrint } from "@/lib/api/adminPrints";
import { isApiError } from "@/lib/api/ApiError";
import {
  toCreateBody,
  toUpdateBody,
  validatePrintForm,
  type PrintBaseline,
  type PrintFormValues,
} from "@/lib/prints/printForm";

const GENERIC_ERROR = "Inténtalo de nuevo en un momento.";

interface UsePrintSave {
  saving: boolean;
  /** A message from the API (already in Spanish) or the generic one. */
  error: string | null;
  clearError: () => void;
  /** Each action resolves `true` when it went through; on `false` the reason is in `error` / `fieldErrors`. */
  create: (values: PrintFormValues) => Promise<boolean>;
  update: (id: string, values: PrintFormValues, baseline: PrintBaseline) => Promise<boolean>;
  retire: (id: string) => Promise<boolean>;
  reactivate: (id: string) => Promise<boolean>;
}

/** Runs one write at a time: field checks first (no request if they fail), then the call, mapping failures to a message. */
const usePrintSave = (): UsePrintSave => {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async (action: () => Promise<unknown>): Promise<boolean> => {
    setSaving(true);
    setError(null);
    try {
      await action();
      return true;
    } catch (failure) {
      setError(isApiError(failure) ? failure.message : GENERIC_ERROR);
      return false;
    } finally {
      setSaving(false);
    }
  }, []);

  const create = useCallback(
    async (values: PrintFormValues): Promise<boolean> => {
      // The form already shows field errors; this is the guard that keeps a bad body off the network.
      if (Object.keys(validatePrintForm(values, "create")).length > 0) return false;
      return run(() => createAdminPrint(toCreateBody(values)));
    },
    [run],
  );

  const update = useCallback(
    async (id: string, values: PrintFormValues, baseline: PrintBaseline): Promise<boolean> => {
      if (Object.keys(validatePrintForm(values, "edit")).length > 0) return false;
      const body = toUpdateBody(values, baseline);
      if (Object.keys(body).length === 0) return true;
      return run(() => updateAdminPrint(id, body));
    },
    [run],
  );

  const retire = useCallback((id: string) => run(() => retirePrint(id)), [run]);
  const reactivate = useCallback((id: string) => run(() => reactivatePrint(id)), [run]);
  const clearError = useCallback(() => setError(null), []);

  return { saving, error, clearError, create, update, retire, reactivate };
};

export type { UsePrintSave };
export { usePrintSave };
