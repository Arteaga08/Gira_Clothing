"use client";

import { useRef, type KeyboardEvent } from "react";
import type { PublicProductVariant } from "@gira/shared";
import { cardImageUrl } from "@/components/store/best-sellers/cardImage";
import { cn } from "@/lib/cn";

interface PrintPickerProps {
  variants: PublicProductVariant[];
  selected: number;
  onSelect: (index: number) => void;
}

const KEY_STEP: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };

/**
 * The print is the only choice of a product, so it is a radio group: one tab
 * stop, arrows move and select. A sold-out print stays selectable (the page
 * says so and the buy button is disabled) but is struck through.
 */
const PrintPicker = ({ variants, selected, onSelect }: PrintPickerProps) => {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = KEY_STEP[event.key];
    if (step === undefined) return;
    event.preventDefault();
    const next = (selected + step + variants.length) % variants.length;
    onSelect(next);
    buttons.current[next]?.focus();
  };

  return (
    <div role="radiogroup" aria-label="Estampa" onKeyDown={onKeyDown} className="grid grid-cols-3 gap-x-3 gap-y-4">
      {variants.map((variant, index) => {
        const checked = index === selected;
        const name = variant.print.name;
        return (
          <button
            key={variant.id}
            ref={(node) => {
              buttons.current[index] = node;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={variant.isAvailable ? name : `${name}, agotada`}
            tabIndex={checked ? 0 : -1}
            onClick={() => onSelect(index)}
            className="group text-left"
          >
            <span
              className={cn(
                "relative block aspect-square overflow-hidden rounded-nb-sm border-2 border-ink bg-surface-sunken transition-[transform,box-shadow] duration-150 ease-out motion-reduce:transition-none",
                checked ? "-translate-x-0.5 -translate-y-0.5 shadow-nb" : "group-hover:-translate-x-px group-hover:-translate-y-px group-hover:shadow-nb-sm",
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- Cloudinary URL from the API; no next/image loader is configured */}
              <img src={cardImageUrl(variant.print.image.url, 320)} alt="" loading="lazy" decoding="async" className="size-full object-cover" />
              {variant.isAvailable ? null : (
                <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" className="absolute inset-0 size-full">
                  <line x1="0" y1="100" x2="100" y2="0" stroke="var(--color-ink)" strokeWidth="3" vectorEffect="non-scaling-stroke" />
                </svg>
              )}
            </span>
            <span className={cn("mt-2 block font-mono text-xs leading-tight", checked && "font-bold")}>
              {name}
              {variant.isAvailable ? null : " · agotada"}
            </span>
          </button>
        );
      })}
    </div>
  );
};

export type { PrintPickerProps };
export { PrintPicker };
