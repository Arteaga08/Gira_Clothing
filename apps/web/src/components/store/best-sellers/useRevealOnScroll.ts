"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

type RevealState = "shown" | "pending";

/**
 * Entrance for a section below the first screen: it starts hidden only when it
 * really is below the fold, and shows once, as it comes into view. Above the
 * fold, with no IntersectionObserver or with scripts off, it is simply shown:
 * content is never held back.
 */
const useRevealOnScroll = <T extends HTMLElement>(): { ref: RefObject<T | null>; state: RevealState } => {
  const ref = useRef<T | null>(null);
  const [state, setState] = useState<RevealState>("shown");

  useEffect(() => {
    const element = ref.current;
    if (!element || typeof IntersectionObserver === "undefined") return;
    if (element.getBoundingClientRect().top < window.innerHeight * 0.85) return;

    setState("pending");
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        setState("shown");
        observer.disconnect();
      },
      { rootMargin: "0px 0px -12% 0px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return { ref, state };
};

export type { RevealState };
export { useRevealOnScroll };
