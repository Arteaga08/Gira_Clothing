import { useEffect, useRef, type PointerEvent, type RefObject } from "react";

/** A swipe must travel this far and be clearly more horizontal than vertical. */
const SWIPE_MIN_PX = 48;
const SWIPE_AXIS_RATIO = 1.5;

interface HeroControlsHandlers {
  next: () => void;
  previous: () => void;
}

const isTypingTarget = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

/**
 * By hand: arrow keys on a computer, a horizontal swipe on a phone. Arrows
 * only act while the hero is on screen and never while someone is typing or
 * holds a modifier, so they never hijack the rest of the page. Swipes ignore
 * the mouse and leave vertical scrolling alone (the section is `touch-pan-y`).
 */
const useHeroControls = (sectionRef: RefObject<HTMLElement | null>, { next, previous }: HeroControlsHandlers) => {
  // Assumed visible until the observer says otherwise (no observer: always on).
  const onScreen = useRef(true);
  const swipeStart = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        onScreen.current = entry?.isIntersecting ?? false;
      },
      { threshold: 0.4 },
    );
    observer.observe(section);
    return () => observer.disconnect();
  }, [sectionRef]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!onScreen.current || event.defaultPrevented) return;
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (isTypingTarget(event.target)) return;
      if (event.key === "ArrowRight") {
        event.preventDefault();
        next();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        previous();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [next, previous]);

  const swipeProps = {
    onPointerDown: (event: PointerEvent) => {
      swipeStart.current = event.pointerType === "mouse" ? null : { x: event.clientX, y: event.clientY };
    },
    onPointerUp: (event: PointerEvent) => {
      const start = swipeStart.current;
      swipeStart.current = null;
      if (!start) return;
      const dx = event.clientX - start.x;
      const dy = event.clientY - start.y;
      if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) < Math.abs(dy) * SWIPE_AXIS_RATIO) return;
      if (dx < 0) next();
      else previous();
    },
    onPointerCancel: () => {
      swipeStart.current = null;
    },
  };

  return swipeProps;
};

export { useHeroControls };
