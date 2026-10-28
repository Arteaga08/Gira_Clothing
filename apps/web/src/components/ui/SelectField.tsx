"use client";

import { CaretDownIcon, CheckIcon } from "@phosphor-icons/react/dist/ssr";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";
import { Icon } from "./Icon";

interface SelectOption {
  value: string;
  label: string;
}

interface SelectFieldProps {
  label: string;
  options: SelectOption[];
  /** Controlled value. Without it the field keeps its own choice, starting at `defaultValue`. */
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  disabled?: boolean;
  error?: string | undefined;
  helper?: string;
  /** Classes for the trigger button. */
  className?: string;
  containerClassName?: string;
}

const LIST_GAP_PX = 6;
const VIEWPORT_MARGIN_PX = 8;
const LIST_MAX_HEIGHT_PX = 288;

/**
 * Select-only combobox (WAI-ARIA APG) with the kit's own list instead of the
 * system one. The list is portalled to <body> and positioned against the
 * trigger, so no panel with `overflow` (SlideOver, tables) can clip it: it
 * shifts left when it would leave the screen and opens upward when there is no
 * room below. Focus never leaves the trigger; the active option is announced
 * with `aria-activedescendant`.
 */
const SelectField = ({
  label,
  options,
  value,
  defaultValue,
  onChange,
  disabled = false,
  error,
  helper,
  className,
  containerClassName,
}: SelectFieldProps) => {
  const baseId = useId();
  const triggerId = `${baseId}-trigger`;
  const listId = `${baseId}-list`;
  const messageId = `${baseId}-message`;
  const optionId = (index: number): string => `${baseId}-option-${index}`;

  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [innerValue, setInnerValue] = useState(defaultValue ?? options[0]?.value ?? "");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const current = value ?? innerValue;
  // -1 when `value` is not among the options (a stale URL filter): nothing is marked selected.
  const selectedIndex = options.findIndex((option) => option.value === current);
  const selected = options[selectedIndex];
  const active = Math.min(activeIndex, options.length - 1);
  const hasError = Boolean(error);
  const message = error ?? helper;

  const close = useCallback(() => setOpen(false), []);

  // Disabled while open (a busy action started): shut the list in the same render, not in an effect.
  if (disabled && open) setOpen(false);

  const openList = () => {
    if (disabled) return;
    setActiveIndex(Math.max(0, selectedIndex));
    setOpen(true);
  };

  const choose = (index: number) => {
    const option = options[index];
    if (!option) return;
    if (value === undefined) setInnerValue(option.value);
    onChange?.(option.value);
    setOpen(false);
  };

  // Place the list against the trigger before the browser paints it.
  useLayoutEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    const list = listRef.current;
    if (!trigger || !list) return;

    const rect = trigger.getBoundingClientRect();
    const listWidth = list.offsetWidth;
    const listHeight = Math.min(list.scrollHeight, LIST_MAX_HEIGHT_PX);
    const roomBelow = window.innerHeight - rect.bottom - VIEWPORT_MARGIN_PX;
    const opensUp = roomBelow < listHeight + LIST_GAP_PX && rect.top > roomBelow;
    const overflowsRight = rect.left + listWidth > window.innerWidth - VIEWPORT_MARGIN_PX;
    const left = overflowsRight ? Math.max(VIEWPORT_MARGIN_PX, rect.right - listWidth) : rect.left;

    list.style.left = `${left}px`;
    list.style.top = opensUp ? `${rect.top - listHeight - LIST_GAP_PX}px` : `${rect.bottom + LIST_GAP_PX}px`;
    list.style.minWidth = `${rect.width}px`;
    list.style.maxHeight = `${LIST_MAX_HEIGHT_PX}px`;
  }, [open, options]);

  // Close on an outside press, on resize, and when something else scrolls.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || listRef.current?.contains(target)) return;
      close();
    };
    const onScroll = (event: Event) => {
      if (listRef.current?.contains(event.target as Node)) return;
      close();
    };
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", close);
    };
  }, [open, close]);

  // Keep the active option visible while arrowing through a long list.
  useEffect(() => {
    if (!open) return;
    document.getElementById(optionId(active))?.scrollIntoView?.({ block: "nearest" });
    // optionId is derived from baseId, which never changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, active]);

  const move = (index: number) => setActiveIndex(Math.min(options.length - 1, Math.max(0, index)));

  const typeAhead = (key: string) => {
    const start = open ? active + 1 : selectedIndex + 1;
    const ordered = [...options.slice(start), ...options.slice(0, start)];
    const match = ordered.find((option) => option.label.toLowerCase().startsWith(key.toLowerCase()));
    if (!match) return;
    const index = options.indexOf(match);
    if (open) setActiveIndex(index);
    else choose(index);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
        event.preventDefault();
        openList();
      } else if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
        typeAhead(event.key);
      }
      return;
    }
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        move(active + 1);
        break;
      case "ArrowUp":
        event.preventDefault();
        move(active - 1);
        break;
      case "Home":
        event.preventDefault();
        move(0);
        break;
      case "End":
        event.preventDefault();
        move(options.length - 1);
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        choose(active);
        break;
      case "Escape":
        // The list closes first; a SlideOver around the field must stay open.
        event.preventDefault();
        event.stopPropagation();
        close();
        break;
      case "Tab":
        close();
        break;
      default:
        if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) typeAhead(event.key);
    }
  };

  return (
    <div className={cn("flex flex-col gap-1.5", containerClassName)}>
      <label
        htmlFor={triggerId}
        className="font-mono text-2xs font-bold uppercase tracking-wide text-text-secondary"
      >
        {label}
      </label>
      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? optionId(active) : undefined}
        {...(hasError ? { "aria-invalid": true } : {})}
        {...(message ? { "aria-describedby": messageId } : {})}
        disabled={disabled}
        onClick={() => (open ? close() : openList())}
        onKeyDown={handleKeyDown}
        className={cn(
          "flex min-h-10 w-full cursor-pointer items-center justify-between gap-3 rounded-nb-sm border-2 bg-surface pl-3 pr-3 text-left text-sm text-text-primary shadow-nb-sm",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
          "disabled:cursor-not-allowed disabled:opacity-50",
          open && "bg-brand-subtle",
          hasError ? "border-danger" : "border-ink",
          className,
        )}
      >
        <span className="min-w-0 flex-1 truncate">{selected?.label ?? "Elige una opción"}</span>
        <Icon
          icon={CaretDownIcon}
          className={cn("shrink-0 text-text-secondary transition-transform duration-150 motion-reduce:transition-none", open && "rotate-180")}
        />
      </button>
      {open && typeof document !== "undefined"
        ? createPortal(
            <ul
              ref={listRef}
              id={listId}
              role="listbox"
              aria-labelledby={triggerId}
              className="fixed z-(--z-dialog) flex w-max max-w-[calc(100vw-1rem)] flex-col gap-0.5 overflow-y-auto rounded-nb border-2 border-ink bg-surface p-1.5 text-text-primary shadow-nb"
            >
              {options.map((option, index) => {
                const isSelected = index === selectedIndex;
                return (
                  <li
                    key={option.value}
                    id={optionId(index)}
                    role="option"
                    aria-selected={isSelected}
                    // Keeps focus on the trigger so the press never blurs it.
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseMove={() => setActiveIndex(index)}
                    onClick={() => choose(index)}
                    className={cn(
                      "flex cursor-pointer items-center justify-between gap-4 rounded-nb-sm border-2 border-transparent px-2.5 py-2 text-sm",
                      isSelected ? "bg-brand font-bold text-text-inverse" : "font-medium",
                      index === active && !isSelected && "border-ink bg-brand-subtle",
                    )}
                  >
                    <span>{option.label}</span>
                    {isSelected ? <Icon icon={CheckIcon} /> : null}
                  </li>
                );
              })}
            </ul>,
            document.body,
          )
        : null}
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
