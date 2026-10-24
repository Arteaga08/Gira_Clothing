import { useId } from "react";
import { cn } from "@/lib/cn";
import { COLOR_LABELS } from "@/lib/settings/hero";

interface ColorChoiceProps<T extends keyof typeof COLOR_LABELS> {
  legend: string;
  options: readonly T[];
  value: T;
  /** Utility that paints a swatch (a token fill, never a literal colour). */
  fillOf: Record<T, string>;
  onChange: (value: T) => void;
}

/**
 * Pick one colour from the palette. Real radio inputs (arrow keys, screen
 * readers) with a swatch on top; the checked one gets a thick ink ring.
 */
const ColorChoice = <T extends keyof typeof COLOR_LABELS>({ legend, options, value, fillOf, onChange }: ColorChoiceProps<T>) => {
  const name = useId();
  return (
    <fieldset className="min-w-0">
      <legend className="mb-1.5 text-xs font-bold text-text-secondary">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <label key={option} className="cursor-pointer">
            <input
              type="radio"
              name={name}
              value={option}
              checked={value === option}
              onChange={() => onChange(option)}
              className="peer sr-only"
            />
            <span
              className={cn(
                "flex items-center gap-2 rounded-nb-sm border-2 border-ink px-2.5 py-1 text-xs font-bold text-text-primary shadow-nb-sm",
                "peer-checked:ring-2 peer-checked:ring-ink peer-checked:ring-offset-2 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus",
                fillOf[option],
              )}
            >
              {COLOR_LABELS[option]}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
};

export type { ColorChoiceProps };
export { ColorChoice };
