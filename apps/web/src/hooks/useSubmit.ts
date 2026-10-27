import { useCallback, useRef, useState } from "react";
import { authFailureMessage } from "@/lib/auth/authFailures";

interface RunOptions {
  /** Replaces the default "show the failure message" handling (e.g. to switch to another view on a 403). */
  onError?: (error: unknown) => void;
  /** What a 401 means on this form. */
  unauthorized?: string;
}

/**
 * Submit state for the account forms: one request at a time (a double click is ignored, not
 * queued), a pending flag for the button and the failure text for the notice.
 */
const useSubmit = () => {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);

  const run = useCallback(async (task: () => Promise<void>, options: RunOptions = {}): Promise<void> => {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError(null);
    try {
      await task();
    } catch (failure) {
      if (options.onError) options.onError(failure);
      else setError(authFailureMessage(failure, options.unauthorized === undefined ? {} : { unauthorized: options.unauthorized }));
    } finally {
      busy.current = false;
      setPending(false);
    }
  }, []);

  return { pending, error, setError, run };
};

export type { RunOptions };
export { useSubmit };
