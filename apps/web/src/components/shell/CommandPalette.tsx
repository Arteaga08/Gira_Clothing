"use client";

import { MagnifyingGlassIcon } from "@phosphor-icons/react/dist/ssr";
import { useRouter } from "next/navigation";
import { useId, useMemo, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/ui/Icon";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { cn } from "@/lib/cn";
import { NAV_ITEMS, type NavItemConfig } from "@/lib/navigation";
import { useCommandPalette } from "./CommandPaletteProvider";

/** Accent-insensitive comparison: "envios" must find "Envíos". */
const normalize = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

const matchesQuery = (item: NavItemConfig, query: string): boolean => {
  if (!query) return true;
  const needle = normalize(query);
  return (
    normalize(item.label).includes(needle) ||
    item.keywords.some((keyword) => normalize(keyword).includes(needle))
  );
};

/**
 * ⌘K/Ctrl+K palette scoped to navigation only in M7 — searching orders or
 * products needs endpoints and debounce this milestone doesn't have, and
 * there are no data screens yet to search. Rendered through a portal:
 * Sidebar and TopBar are both `sticky`/`fixed` with a `transform`, which
 * creates stacking contexts that would trap this dialog below the scrim
 * even with a higher `z-index`.
 */
const CommandPalette = () => {
  const { open, closePalette } = useCommandPalette();
  const router = useRouter();
  const dialogRef = useFocusTrap<HTMLDivElement>(open);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const [wasOpen, setWasOpen] = useState(open);
  const listboxId = useId();
  const titleId = useId();

  const results = useMemo(() => NAV_ITEMS.filter((item) => matchesQuery(item, query)), [query]);

  // State adjusted during render (React's pattern for "reset on prop
  // change") rather than an effect: this component doesn't unmount when
  // `open` goes false — it just returns null below — so query/activeIndex
  // would otherwise leak into the next time the palette opens.
  if (open !== wasOpen) {
    setWasOpen(open);
    if (!open) {
      setQuery("");
      setActiveIndex(-1);
    }
  }

  if (typeof document === "undefined" || !open) return null;

  const moveSelection = (direction: 1 | -1) => {
    if (results.length === 0) return;
    let next = activeIndex;
    for (let step = 0; step < results.length; step += 1) {
      next = (next + direction + results.length) % results.length;
      if (results[next]?.available) {
        setActiveIndex(next);
        return;
      }
    }
  };

  const activate = (index: number) => {
    const item = results[index];
    if (!item?.available) return;
    closePalette();
    router.push(item.href);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closePalette();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      moveSelection(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      moveSelection(-1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      activate(activeIndex);
    }
  };

  const activeItem = results[activeIndex];

  return createPortal(
    <div className="fixed inset-0 z-[var(--z-overlay)]">
      <div aria-hidden="true" onClick={closePalette} className="fixed inset-0 bg-scrim" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={handleKeyDown}
        className="relative z-[var(--z-dialog)] mx-auto mt-24 flex w-full max-w-md flex-col gap-3 rounded-nb border-2 border-ink bg-surface p-3 shadow-nb-lg"
      >
        <h2 id={titleId} className="sr-only">
          Buscar en el panel
        </h2>
        <div className="flex items-center gap-2 rounded-nb-sm border-2 border-ink bg-surface-sunken px-3 py-2">
          <Icon icon={MagnifyingGlassIcon} size={16} className="shrink-0 text-text-muted" />
          <input
            role="combobox"
            aria-expanded="true"
            aria-controls={listboxId}
            {...(activeItem ? { "aria-activedescendant": `${listboxId}-${activeItem.key}` } : {})}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(-1);
            }}
            placeholder="Ir a…"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none"
          />
        </div>
        <ul id={listboxId} role="listbox" aria-label="Resultados" className="flex flex-col gap-0.5">
          {results.length === 0 ? (
            <li className="px-3 py-6 text-center text-sm text-text-muted">Sin resultados</li>
          ) : (
            results.map((item, index) => (
              <li
                key={item.key}
                id={`${listboxId}-${item.key}`}
                role="option"
                aria-selected={index === activeIndex}
                aria-disabled={!item.available}
                onClick={() => activate(index)}
                className={cn(
                  "flex items-center gap-3 rounded-nb-sm px-3 py-2 text-sm",
                  item.available ? "cursor-pointer" : "cursor-not-allowed text-text-muted",
                  index === activeIndex && "bg-brand-soft font-bold text-brand",
                )}
              >
                <Icon icon={item.icon} className="shrink-0" />
                {item.label}
                {item.available ? null : (
                  <span className="ml-auto text-[10px] font-bold uppercase tracking-wide">Pronto</span>
                )}
              </li>
            ))
          )}
        </ul>
      </div>
    </div>,
    document.body,
  );
};

export { CommandPalette };
