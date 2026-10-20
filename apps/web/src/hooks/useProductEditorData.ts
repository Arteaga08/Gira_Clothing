"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchCatalogOptions } from "@/lib/api/adminCatalog";
import { getEditorProduct } from "@/lib/api/adminProducts";
import { isApiError } from "@/lib/api/ApiError";
import { listProductVariants } from "@/lib/api/adminVariants";
import type { CatalogOptions, PickerPrint } from "@/lib/catalog/catalogOptions";
import type { ProductBaseline } from "@/lib/catalog/productForm";

interface EditorData {
  options: CatalogOptions;
  /** `null` on the create form. */
  baseline: ProductBaseline | null;
}

type EditorStatus = "loading" | "error" | "ready";

interface UseProductEditorData {
  status: EditorStatus;
  data: EditorData | null;
  error: string | null;
  /** Bumps every time fresh data lands: the form is keyed by it, so it starts over from the new baseline. */
  dataVersion: number;
  reload: () => void;
  /** A print created from the editor joins the picker without a new request. */
  addCreatedPrint: (print: PickerPrint) => void;
}

const GENERIC_ERROR = "No se pudo cargar el editor.";

/**
 * Loads what the editor needs in parallel: the active categories, families and
 * prints, and (when editing) the product with ALL its variants and their photos.
 * A failed reload replaces the form with the error: showing the old form would
 * let a stale baseline be saved over what the server now holds.
 */
const useProductEditorData = (productId: string | null): UseProductEditorData => {
  const [status, setStatus] = useState<EditorStatus>("loading");
  const [data, setData] = useState<EditorData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dataVersion, setDataVersion] = useState(0);
  const [requested, setRequested] = useState(0);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetchCatalogOptions(),
      productId ? getEditorProduct(productId) : Promise.resolve(null),
      productId ? listProductVariants(productId) : Promise.resolve([]),
    ])
      .then(([options, product, variants]) => {
        if (cancelled) return;
        setData({ options, baseline: product ? { product, variants } : null });
        setStatus("ready");
        setError(null);
        setDataVersion((current) => current + 1);
      })
      .catch((failure: unknown) => {
        if (cancelled) return;
        setStatus("error");
        setError(isApiError(failure) ? failure.message : GENERIC_ERROR);
      });
    return () => {
      cancelled = true;
    };
  }, [productId, requested]);

  const reload = useCallback(() => setRequested((current) => current + 1), []);

  const addCreatedPrint = useCallback((print: PickerPrint) => {
    setData((previous) =>
      previous
        ? {
            ...previous,
            options: {
              ...previous.options,
              prints: [...previous.options.prints, print].sort((a, b) => a.name.localeCompare(b.name, "es")),
            },
          }
        : previous,
    );
  }, []);

  return { status, data, error, dataVersion, reload, addCreatedPrint };
};

export type { EditorData, EditorStatus, UseProductEditorData };
export { useProductEditorData };
