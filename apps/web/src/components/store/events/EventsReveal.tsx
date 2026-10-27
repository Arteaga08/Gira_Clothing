"use client";

import type { ReactNode } from "react";
import { useRevealOnScroll } from "@/components/store/best-sellers/useRevealOnScroll";

interface EventsRevealProps {
  titleId: string;
  title: string;
  children: ReactNode;
}

/**
 * Title plus content of the «Eventos» section, entering once as it comes into
 * view. It sits on a lila band whose top is cut with the festón (store-skin.css).
 */
const EventsReveal = ({ titleId, title, children }: EventsRevealProps) => {
  const { ref, state } = useRevealOnScroll<HTMLElement>();
  return (
    <section
      ref={ref}
      data-reveal={state}
      aria-labelledby={titleId}
      className="store-reveal store-band-lilac store-cut store-cut-feston"
    >
      <div className="mx-auto w-full max-w-[96rem] px-4 py-14 md:px-8 md:py-24">
        <h2
          id={titleId}
          style={{ ["--i" as string]: 0 }}
          className="reveal-item pb-8 font-display text-[clamp(2.5rem,7vw,5.5rem)] uppercase leading-[0.9] text-brand md:pb-12"
        >
          {title}
        </h2>
        {children}
      </div>
    </section>
  );
};

export type { EventsRevealProps };
export { EventsReveal };
