import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { NB_PRESSABLE } from "./styles";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  children: ReactNode;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: "bg-brand text-text-inverse hover:bg-brand-hover",
  secondary: "bg-surface text-text-primary",
  // Starts with no border/shadow (mirrors mockups/mockup.css .btn-ghost);
  // its own hover state below adds the treatment back in.
  ghost: "border-transparent bg-transparent shadow-none hover:border-ink hover:bg-surface hover:shadow-nb-sm",
  danger: "bg-danger-soft text-danger",
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "min-h-[30px] px-3 py-1 text-xs",
  md: "min-h-[38px] px-4 py-2 text-sm",
};

const ButtonSpinner = () => (
  <span
    aria-hidden="true"
    className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent"
  />
);

const Button = ({
  variant = "secondary",
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
      className={cn(
        "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-nb-sm border-2 border-ink font-bold shadow-nb-sm",
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none",
        NB_PRESSABLE,
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        className,
      )}
      {...rest}
    >
      {loading && <ButtonSpinner />}
      {children}
    </button>
  );
};

export type { ButtonProps, ButtonVariant, ButtonSize };
export { Button };
