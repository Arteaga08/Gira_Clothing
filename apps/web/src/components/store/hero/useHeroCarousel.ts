import { HERO_SLIDE_SECONDS } from "@gira/shared";
import { useCallback, useEffect, useState } from "react";

const STEP_MS = HERO_SLIDE_SECONDS * 1000;
/** Matches the CSS transition of the track; the snap back waits for it to finish. */
const TRANSITION_MS = 750;

/**
 * Vertical carousel that only ever travels UP: the track holds the slides plus
 * a clone of the first, and after reaching the clone it snaps back to 0 without
 * a transition. It always advances on its own (under reduced motion the swap is
 * instant, no travel); only keyboard focus inside the hero or a hidden tab
 * pauses it.
 */
const useHeroCarousel = (count: number) => {
  const [pos, setPos] = useState(0);
  const [animate, setAnimate] = useState(true);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused || count < 2) return;
    const id = window.setInterval(() => {
      if (!document.hidden) setPos((p) => (p >= count ? p : p + 1));
    }, STEP_MS);
    return () => window.clearInterval(id);
  }, [paused, count, pos]);

  useEffect(() => {
    if (pos !== count) return;
    const id = window.setTimeout(() => {
      setAnimate(false);
      setPos(0);
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => setAnimate(true)));
    }, TRANSITION_MS);
    return () => window.clearTimeout(id);
  }, [pos, count]);

  const pause = useCallback(() => setPaused(true), []);
  const resume = useCallback(() => setPaused(false), []);

  return { pos, active: pos % count, animate, focusProps: { onFocus: pause, onBlur: resume } };
};

export { TRANSITION_MS, useHeroCarousel };
