"use client";

import { useEffect, useState } from "react";
import { fetchFamilyOptions } from "@/lib/api/adminCatalog";
import type { Option } from "@/lib/catalog/catalogOptions";

/**
 * Active print families for the filter and the form, loaded once. If the read
 * fails the select simply offers nothing beyond "Todas": the list keeps working.
 */
const useFamilyOptions = (): Option[] => {
  const [options, setOptions] = useState<Option[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetchFamilyOptions()
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

export { useFamilyOptions };
