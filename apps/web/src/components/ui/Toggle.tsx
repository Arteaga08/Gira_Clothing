"use client";

import { cn } from "@/lib/cn";

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
  className?: string;
}

/** An on/off switch, used instead of a checkbox when the change applies immediately. */
const Toggle = ({ checked, onChange, label, disabled = false, className }: ToggleProps) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className={cn(
      "inline-flex items-center gap-2 text-sm font-medium text-text-primary",
      "disabled:cursor-not-allowed disabled:opacity-45",
      className,
    )}
  >
    <span
      aria-hidden="true"
      className={cn(
        "relative h-6 w-10 shrink-0 rounded-nb-pill border-2 border-ink transition-colors duration-150",
        checked ? "bg-brand" : "bg-surface-sunken",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 h-4 w-4 rounded-full transition-[left] duration-150 motion-reduce:transition-none",
          checked ? "left-[18px] bg-surface" : "left-0.5 bg-ink",
        )}
      />
    </span>
    {label}
  </button>
);

export type { ToggleProps };
export { Toggle };
