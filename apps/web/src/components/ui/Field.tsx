import type { Icon as PhosphorIcon } from "@phosphor-icons/react";
import type { InputHTMLAttributes } from "react";
import { useId } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "./Icon";

interface FieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "id"> {
  label: string;
  error?: string;
  helper?: string;
  icon?: PhosphorIcon;
  containerClassName?: string;
}

/**
 * `useId` works fine without "use client": it's a universal React hook, not
 * one that needs browser interactivity, so this stays a Server Component.
 */
const Field = ({ label, error, helper, icon, className, containerClassName, ...rest }: FieldProps) => {
  const inputId = useId();
  const messageId = useId();
  const hasError = Boolean(error);
  const message = error ?? helper;

  return (
    <div className={cn("flex flex-col gap-1.5", containerClassName)}>
      <label htmlFor={inputId} className="text-xs font-bold uppercase tracking-wide text-text-secondary">
        {label}
      </label>
      <div
        className={cn(
          "flex min-h-[38px] items-center gap-2 rounded-nb-sm border-2 bg-surface px-3 shadow-nb-sm",
          "focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus",
          hasError ? "border-danger" : "border-ink",
        )}
      >
        {icon ? <Icon icon={icon} className="shrink-0 text-text-muted" /> : null}
        <input
          id={inputId}
          {...(hasError ? { "aria-invalid": true } : {})}
          {...(message ? { "aria-describedby": messageId } : {})}
          className={cn("min-w-0 flex-1 bg-transparent text-sm outline-none", className)}
          {...rest}
        />
      </div>
      {message ? (
        <p id={messageId} className={cn("text-xs", hasError ? "text-danger" : "text-text-secondary")}>
          {message}
        </p>
      ) : null}
    </div>
  );
};

export type { FieldProps };
export { Field };
