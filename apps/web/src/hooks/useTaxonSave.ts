"use client";

import { useCallback, useState } from "react";
import { isApiError } from "@/lib/api/ApiError";
import type { TaxonConfig } from "@/lib/taxonomy/config";
import {
  toCreateBody,
  toUpdateBody,
  validateTaxonForm,
  type TaxonBaseline,
  type TaxonFormValues,
} from "@/lib/taxonomy/taxonForm";

const GENERIC_ERROR = "Inténtalo de nuevo en un momento.";

interface UseTaxonSave {
  saving: boolean;
  /** A message from the API (already in Spanish) or the generic one. */
  error: string | null;
  clearError: () => void;
  /** Each action resolves `true` when it went through; on `false` the reason is in `error`. */
  create: (values: TaxonFormValues) => Promise<boolean>;
  update: (id: string, values: TaxonFormValues, baseline: TaxonBaseline) => Promise<boolean>;
  retire: (id: string) => Promise<boolean>;
  reactivate: (id: string) => Promise<boolean>;
}

/** Runs one write at a time: field checks first (no request if they fail), then the call, mapping failures to a message. */
const useTaxonSave = (config: TaxonConfig): UseTaxonSave => {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { client, limits } = config;

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
    async (values: TaxonFormValues): Promise<boolean> => {
      // The form already shows field errors; this is the guard that keeps a bad body off the network.
      if (Object.keys(validateTaxonForm(values, limits)).length > 0) return false;
      return run(() => client.create(toCreateBody(values)));
    },
    [run, client, limits],
  );

  const update = useCallback(
    async (id: string, values: TaxonFormValues, baseline: TaxonBaseline): Promise<boolean> => {
      if (Object.keys(validateTaxonForm(values, limits)).length > 0) return false;
      const body = toUpdateBody(values, baseline);
      if (Object.keys(body).length === 0) return true;
      return run(() => client.update(id, body));
    },
    [run, client, limits],
  );

  const retire = useCallback((id: string) => run(() => client.retire(id)), [run, client]);
  const reactivate = useCallback((id: string) => run(() => client.reactivate(id)), [run, client]);
  const clearError = useCallback(() => setError(null), []);

  return { saving, error, clearError, create, update, retire, reactivate };
};

export type { UseTaxonSave };
export { useTaxonSave };
