import { useCallback, useState } from "react";
import { resendVerification } from "@/lib/api/auth";
import { authFailureMessage } from "@/lib/auth/authFailures";
import { useCooldown } from "./useCooldown";

/**
 * Asks for a new verification link and enforces the API's 60 s spacing client-side.
 * `cooldown.start()` is exposed because right after signup the first link was just sent,
 * so the wait starts without a request.
 */
const useResendVerification = (email: string) => {
  const cooldown = useCooldown(60);
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { active, start } = cooldown;

  const resend = useCallback(async () => {
    if (pending || active) return;
    setPending(true);
    setError(null);
    try {
      await resendVerification(email);
      setSent(true);
      start();
    } catch (failure) {
      setError(authFailureMessage(failure));
    } finally {
      setPending(false);
    }
  }, [active, email, pending, start]);

  return { cooldown, pending, sent, error, resend };
};

export { useResendVerification };
