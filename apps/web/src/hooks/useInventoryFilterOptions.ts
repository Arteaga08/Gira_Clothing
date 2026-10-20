"use client";

import { useEffect, useState } from "react";
import { fetchInventoryFilterOptions } from "@/lib/api/adminCatalogOptions";
import { EMPTY_OPTIONS, type InventoryFilterOptions } from "@/lib/inventory/filterOptions";

/**
 * Options for the category / model / print selects, loaded once. If the read
 * fails the selects simply stay empty ("Todas"): the list and the search box
 * keep working, and nothing here is worth an error banner.
 */
const useInventoryFilterOptions = (): InventoryFilterOptions => {
  const [options, setOptions] = useState<InventoryFilterOptions>(EMPTY_OPTIONS);

  useEffect(() => {
    let cancelled = false;
    fetchInventoryFilterOptions()
      .then((loaded) => {
        if (!cancelled) setOptions(loaded);
      })
      .catch(() => {
        // Swallowed on purpose: see above.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return options;
};

export { useInventoryFilterOptions };
