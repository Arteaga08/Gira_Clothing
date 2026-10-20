"use client";

import { useEffect, useState } from "react";
import { fetchCategoryOptions } from "@/lib/api/adminCatalog";
import type { Option } from "@/lib/catalog/catalogOptions";

/**
 * Options for the category filter, loaded once. If the read fails the select
 * simply stays on "Todas": the list and the search box keep working, and
 * nothing here is worth an error banner.
 */
const useCategoryOptions = (): Option[] => {
  const [options, setOptions] = useState<Option[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetchCategoryOptions()
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

export { useCategoryOptions };
