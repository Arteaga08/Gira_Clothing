import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { NB_CONTROL_CHROME, NB_PRESSABLE } from "./styles";

/**
 * A button is coloured by what it does, never left white:
 * primary (amarillo) save / confirm · danger (rojo) cancel, close, delete, leave ·
 * edit (lila) edit, open, copy, move, navigate · positive (menta) create, refresh, retry, restore, clear.
 */
type ButtonVariant = "primary" | "danger" | "edit" | "positive";
type ButtonSize = "sm" | "md";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  children: ReactNode;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  // Amarillo is EXCLUSIVE to the primary action — it never fills anything
  // else. Text is ink, not hueso: amarillo is far too light for white text
  // (~1.2:1) and ink reads at 17.8:1 on it.
  primary: "bg-cta text-text-primary hover:bg-cta-hover",
  danger: "bg-danger-soft text-danger",
  edit: "bg-tile-alt text-text-primary",
  positive: "bg-brand-subtle text-text-primary",
};

/* 12px vertical / 24px horizontal on md is a deliberate one-off: 12 + 16 of
   line height + 12 lands on 40px, the shared control height, even though 12
   itself isn't a multiple of 8. See DESIGN.md — Espaciado. */
const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "min-h-8 px-4 py-1.5 text-xs",
  md: "px-6 py-3 text-sm",
};

const ButtonSpinner = () => (
  <span
    aria-hidden="true"
    className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent"
  />
);

const buttonClassName = (variant: ButtonVariant, size: ButtonSize = "md", className?: string): string =>
  cn(
    "inline-flex items-center justify-center gap-2 whitespace-nowrap font-bold",
    NB_CONTROL_CHROME,
    "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none",
    NB_PRESSABLE,
    VARIANT_CLASSES[variant],
    SIZE_CLASSES[size],
    className,
  );

const Button = ({
  variant,
  size = "md",
  loading = false,
  disabled,
  className,
  children,
  type = "button",
  ...rest
}: ButtonProps) => {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClassName(variant, size, className)}
      {...rest}
    >
      {loading && <ButtonSpinner />}
      {children}
    </button>
  );
};

export type { ButtonProps, ButtonVariant, ButtonSize };
export { Button, buttonClassName };
