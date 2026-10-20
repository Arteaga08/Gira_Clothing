"use client";

import { CheckCircleIcon, PlusCircleIcon } from "@phosphor-icons/react/dist/ssr";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";
import { Segmented } from "@/components/ui/Segmented";
import { NB_PRESSABLE } from "@/components/ui/styles";
import { T_CAPTION } from "@/components/ui/typography";
import { cn } from "@/lib/cn";
import type { PickerPrint } from "@/lib/catalog/catalogOptions";
import { ImageTile } from "./ImageTile";

interface PrintPickerProps {
  prints: PickerPrint[];
  selectedIds: ReadonlySet<string>;
  /** Chosen prints whose variant has reserved units: they cannot be removed. */
  lockedIds: ReadonlySet<string>;
  /** Prints that already had a variant which was retired: choosing one again reactivates it. */
  retiredIds: ReadonlySet<string>;
  onToggle: (printId: string) => void;
  onCreate: () => void;
}

const ALL = "all";

/**
 * One grid of every active print, with a family filter on top. A chosen print
 * becomes (or keeps) a variant of the model. Selection is a ternary of fills,
 * never a base fill plus an override, so the tile always shows the colour it
 * is meant to.
 */
const PrintPicker = ({ prints, selectedIds, lockedIds, retiredIds, onToggle, onCreate }: PrintPickerProps) => {
  const [family, setFamily] = useState<string>(ALL);

  const families = useMemo(() => {
    const seen = new Map<string, string>();
    for (const print of prints) seen.set(print.familyId, print.familyName);
    return [...seen].sort((a, b) => a[1].localeCompare(b[1], "es"));
  }, [prints]);

  const visible = family === ALL ? prints : prints.filter((print) => print.familyId === family);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por familia">
        <Segmented selected={family === ALL} onClick={() => setFamily(ALL)}>
          Todas
        </Segmented>
        {families.map(([id, name]) => (
          <Segmented key={id} selected={family === id} onClick={() => setFamily(id)}>
            {name}
          </Segmented>
        ))}
      </div>

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
        {visible.map((print) => {
          const selected = selectedIds.has(print.id);
          const locked = lockedIds.has(print.id);
          const retired = retiredIds.has(print.id) && !selected;
          return (
            <li key={print.id}>
              <button
                type="button"
                aria-pressed={selected}
                disabled={locked}
                onClick={() => onToggle(print.id)}
                className={cn(
                  "relative flex w-full flex-col gap-1 rounded-nb-sm border-2 border-ink p-2 text-left text-text-primary shadow-nb-sm",
                  NB_PRESSABLE,
                  selected ? "bg-brand-subtle" : "bg-surface",
                  locked && "cursor-not-allowed",
                )}
              >
                <ImageTile url={print.imageUrl} alt="" className="aspect-square w-full rounded-nb-sm border-2 border-ink" />
                {selected ? (
                  <Icon
                    icon={CheckCircleIcon}
                    size={22}
                    className="absolute right-3.5 top-3.5 rounded-full bg-surface text-brand"
                  />
                ) : null}
                <span className="text-sm font-bold leading-snug">{print.name}</span>
                <span className={T_CAPTION}>
                  {print.sku} · {print.familyName}
                </span>
                {locked ? <Badge variant="warn">Con apartados</Badge> : null}
                {retired ? <Badge>Retirada</Badge> : null}
              </button>
            </li>
          );
        })}
        <li>
          <button
            type="button"
            onClick={onCreate}
            className="grid h-full min-h-32 w-full place-content-center justify-items-center gap-1.5 rounded-nb-sm border-2 border-dashed border-ink bg-transparent p-3 text-center text-sm text-text-primary hover:bg-brand-subtle"
          >
            <Icon icon={PlusCircleIcon} size={28} />
            <span className="font-bold">Nueva estampa</span>
            <span className={T_CAPTION}>Súbela y elige su familia</span>
          </button>
        </li>
      </ul>
    </div>
  );
};

export type { PrintPickerProps };
export { PrintPicker };
