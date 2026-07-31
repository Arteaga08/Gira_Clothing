import type { SelectHTMLAttributes } from "react";
import { useId } from "react";
import { cn } from "@/lib/cn";

interface SelectOption {
  value: string;
  label: string;
}

interface SelectFieldProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "id"> {
  label: string;
  options: SelectOption[];
  error?: string;
  helper?: string;
  containerClassName?: string;
}

const SelectField = ({
  label,
  options,
  error,
  helper,
  className,
  containerClassName,
  ...rest
}: SelectFieldProps) => {
  const selectId = useId();
  const messageId = useId();
  const hasError = Boolean(error);
  const message = error ?? helper;

  return (
    <div className={cn("flex flex-col gap-1.5", containerClassName)}>
      <label htmlFor={selectId} className="text-xs font-bold uppercase tracking-wide text-text-secondary">
        {label}
      </label>
      <div
        className={cn(
          "flex min-h-[38px] items-center gap-2 rounded-nb-sm border-2 bg-surface px-3 shadow-nb-sm",
          "focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus",
          hasError ? "border-danger" : "border-ink",
        )}
      >
        <select
          id={selectId}
          {...(hasError ? { "aria-invalid": true } : {})}
          {...(message ? { "aria-describedby": messageId } : {})}
          className={cn("min-w-0 flex-1 bg-transparent text-sm outline-none", className)}
          {...rest}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      {message ? (
        <p id={messageId} className={cn("text-xs", hasError ? "text-danger" : "text-text-secondary")}>
          {message}
        </p>
      ) : null}
    </div>
  );
};

export type { SelectFieldProps, SelectOption };
export { SelectField };
