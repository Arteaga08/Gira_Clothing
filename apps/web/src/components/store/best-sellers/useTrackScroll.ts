"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Px of slack: sub-pixel scroll positions must not leave an arrow showing at the very end. */
const EDGE_SLACK_PX = 4;
/** Gap between cards (`gap-6`), so one step lands exactly on the next card. */
const CARD_GAP_PX = 24;

/**
 * State and steps of a horizontally scrolling track: whether there is more on
 * each side, and a step of one card. The scrolling itself is native
 * (scroll-snap), so touch, wheel and keyboard keep working.
 */
const useTrackScroll = () => {
  const track = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ canPrevious: false, canNext: false });

  const measure = useCallback(() => {
    const element = track.current;
    if (!element) return;
    const max = element.scrollWidth - element.clientWidth;
    setEdges({
      canPrevious: element.scrollLeft > EDGE_SLACK_PX,
      canNext: element.scrollLeft < max - EDGE_SLACK_PX,
    });
  }, []);

  useEffect(() => {
    const element = track.current;
    if (!element) return;
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [measure]);

  const step = useCallback((direction: 1 | -1) => {
    const element = track.current;
    if (!element) return;
    const card = element.firstElementChild as HTMLElement | null;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    element.scrollBy({ left: ((card?.offsetWidth ?? 280) + CARD_GAP_PX) * direction, behavior: reduce ? "auto" : "smooth" });
  }, []);

  return { track, ...edges, onScroll: measure, step };
};

export { useTrackScroll };
