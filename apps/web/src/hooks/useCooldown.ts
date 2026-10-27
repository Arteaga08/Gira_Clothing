import { useCallback, useEffect, useState } from "react";

/** m:ss, the way a countdown reads. */
const formatCooldown = (seconds: number): string => {
  const safe = Math.max(0, seconds);
  return `${String(Math.floor(safe / 60))}:${String(safe % 60).padStart(2, "0")}`;
};

/**
 * A countdown for "resend" buttons: the API refuses a new link within 60 s of
 * the last one, so the button waits instead of letting the visitor hit a 429.
 */
const useCooldown = (seconds = 60) => {
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    if (remaining <= 0) return;
    const timer = setTimeout(() => setRemaining((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [remaining]);

  const start = useCallback(() => setRemaining(seconds), [seconds]);

  return { remaining, active: remaining > 0, label: formatCooldown(remaining), start };
};

export { formatCooldown, useCooldown };
