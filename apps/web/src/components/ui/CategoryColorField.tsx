"use client";

import { Check } from "@phosphor-icons/react/dist/ssr";
import { CATEGORY_COLORS, type CategoryColor } from "@gira/shared";
import { cn } from "@/lib/cn";
import { CATEGORY_COLOR_LABEL, CATEGORY_TONE } from "@/lib/store/categoryColors";
import { Icon } from "./Icon";
import { T_LABEL } from "./typography";

interface CategoryColorFieldProps {
  /** Shared by the radios of one group; also keeps two fields on a page apart. */
  name: string;
  legend: string;
  value: CategoryColor;
  onChange: (color: CategoryColor) => void;
  helper?: string;
}

/**
 * The colour a category gives its storefront cards. A native radio group
 * (arrow keys, one tab stop) dressed as swatches; the chosen one lifts and
 * carries a check, so the choice never relies on colour alone.
 */
const CategoryColorField = ({ name, legend, value, onChange, helper }: CategoryColorFieldProps) => (
  <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
    <legend className={cn(T_LABEL, "mb-2 text-text-secondary")}>{legend}</legend>
    <div className="flex flex-wrap gap-3">
      {CATEGORY_COLORS.map((color) => (
        <label
          key={color}
          title={CATEGORY_COLOR_LABEL[color]}
          className={cn(
            "relative flex size-11 cursor-pointer items-center justify-center rounded-nb-sm border-2 border-ink text-text-primary shadow-nb-sm",
            "has-checked:-translate-x-px has-checked:-translate-y-px has-checked:shadow-nb has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus",
            CATEGORY_TONE[color].strong,
          )}
        >
          <input
            type="radio"
            name={name}
            value={color}
            checked={value === color}
            onChange={() => onChange(color)}
            className="peer sr-only"
          />
          <span className="sr-only">{CATEGORY_COLOR_LABEL[color]}</span>
          <Icon icon={Check} size={20} className="opacity-0 peer-checked:opacity-100" />
        </label>
      ))}
    </div>
    <p className="text-xs text-text-secondary" aria-live="polite">
      {helper ?? CATEGORY_COLOR_LABEL[value]}
    </p>
  </fieldset>
);

export type { CategoryColorFieldProps };
export { CategoryColorField };
