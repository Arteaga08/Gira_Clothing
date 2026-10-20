import { CaretDownIcon } from "@phosphor-icons/react/dist/ssr";
import type { SelectHTMLAttributes } from "react";
import { useId } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "./Icon";

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
      <label
        htmlFor={selectId}
        className="font-mono text-2xs font-bold uppercase tracking-wide text-text-secondary"
      >
        {label}
      </label>
      <div
        className={cn(
          "relative flex min-h-10 items-center rounded-nb-sm border-2 bg-surface pl-3 text-text-primary shadow-nb-sm",
          "focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus",
          hasError ? "border-danger" : "border-ink",
        )}
      >
        <select
          id={selectId}
          {...(hasError ? { "aria-invalid": true } : {})}
          {...(message ? { "aria-describedby": messageId } : {})}
          className={cn(
            "min-h-9 min-w-0 flex-1 cursor-pointer appearance-none bg-transparent pr-10 text-sm outline-none",
            className,
          )}
          {...rest}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {/* The native arrow hugs the border; this one has its own room and never takes the click. */}
        <Icon
          icon={CaretDownIcon}
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary"
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

export type { SelectFieldProps, SelectOption };
export { SelectField };
