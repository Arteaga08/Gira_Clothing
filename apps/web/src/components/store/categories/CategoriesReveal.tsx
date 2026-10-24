"use client";

import type { ReactNode } from "react";
import { useRevealOnScroll } from "@/components/store/best-sellers/useRevealOnScroll";

interface CategoriesRevealProps {
  titleId: string;
  title: string;
  children: ReactNode;
}

/**
 * Title plus tiles of the «Categorías» section, entering once as it comes into
 * view. It sits on a menta band whose top is cut with the wave (store-skin.css).
 */
const CategoriesReveal = ({ titleId, title, children }: CategoriesRevealProps) => {
  const { ref, state } = useRevealOnScroll<HTMLElement>();
  return (
    <section
      ref={ref}
      data-reveal={state}
      aria-labelledby={titleId}
      className="store-reveal store-band-mint store-cut store-cut-ola"
    >
      <div className="mx-auto w-full max-w-[96rem] py-14 md:py-24">
        <h2
          id={titleId}
          style={{ ["--i" as string]: 0 }}
          className="reveal-item px-4 pb-8 font-display text-[clamp(2.5rem,7vw,5.5rem)] uppercase leading-[0.9] text-brand md:px-8"
        >
          {title}
        </h2>
        {children}
      </div>
    </section>
  );
};

export { CategoriesReveal };
