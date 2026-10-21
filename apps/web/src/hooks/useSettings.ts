"use client";

import type { Settings, Wire } from "@gira/shared";
import { useCallback, useEffect, useState } from "react";
import { settingsClient } from "@/lib/api/adminSettings";
import { isApiError } from "@/lib/api/ApiError";

type SettingsState =
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "ready"; settings: Wire<Settings> };

interface UseSettings {
  state: SettingsState;
  refresh: () => void;
  /** A section was saved: the API answers with the whole document, no refetch needed. */
  replace: (settings: Wire<Settings>) => void;
}

const GENERIC_ERROR = "No se pudieron cargar los ajustes.";

const useSettings = (): UseSettings => {
  const [state, setState] = useState<SettingsState>({ status: "loading" });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    settingsClient
      .get()
      .then((settings) => {
        if (!cancelled) setState({ status: "ready", settings });
      })
      .catch((failure: unknown) => {
        if (!cancelled) setState({ status: "error", error: isApiError(failure) ? failure.message : GENERIC_ERROR });
      });
    return () => {
      cancelled = true;
    };
  }, [version]);

  const refresh = useCallback(() => {
    setState({ status: "loading" });
    setVersion((current) => current + 1);
  }, []);
  const replace = useCallback((settings: Wire<Settings>) => setState({ status: "ready", settings }), []);

  return { state, refresh, replace };
};

export type { SettingsState, UseSettings };
export { useSettings };
