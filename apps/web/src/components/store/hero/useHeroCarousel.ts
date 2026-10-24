import { HERO_SLIDE_SECONDS } from "@gira/shared";
import { useCallback, useEffect, useState } from "react";

const STEP_MS = HERO_SLIDE_SECONDS * 1000;
/** A little longer than the CSS transition: after it, the photo that left may reset out of sight. */
const SETTLE_MS = 900;

interface CarouselState {
  active: number;
  /** The photo that is leaving, only while it fades out; null the rest of the time. */
  previous: number | null;
}

/**
 * Photos take turns on their own, in order, and loop; `next` / `goPrevious`
 * move by hand (arrow keys, swipe). Only keyboard focus inside the hero or a
 * hidden tab pauses the automatic turn.
 */
const useHeroCarousel = (count: number) => {
  const [state, setState] = useState<CarouselState>({ active: 0, previous: null });
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused || count < 2) return;
    const id = window.setInterval(() => {
      if (!document.hidden) setState((s) => ({ active: (s.active + 1) % count, previous: s.active }));
    }, STEP_MS);
    return () => window.clearInterval(id);
  }, [paused, count, state.active]);

  useEffect(() => {
    if (state.previous === null) return;
    const id = window.setTimeout(() => setState((s) => ({ ...s, previous: null })), SETTLE_MS);
    return () => window.clearTimeout(id);
  }, [state]);

  // Manual moves restart the 3 s countdown: the interval depends on `state.active`.
  const next = useCallback(
    () => setState((s) => ({ active: (s.active + 1) % count, previous: s.active })),
    [count],
  );
  const previous = useCallback(
    () => setState((s) => ({ active: (s.active - 1 + count) % count, previous: s.active })),
    [count],
  );
  const pause = useCallback(() => setPaused(true), []);
  const resume = useCallback(() => setPaused(false), []);

  return { ...state, next, goPrevious: previous, focusProps: { onFocus: pause, onBlur: resume } };
};

export { useHeroCarousel };
