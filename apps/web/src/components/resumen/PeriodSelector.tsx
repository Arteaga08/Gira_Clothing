"use client";

import type { ChangeEvent } from "react";
import type { PeriodPreset } from "@gira/shared";
import { cn } from "@/lib/cn";

interface PeriodSelectorProps {
  activePeriod: PeriodPreset;
  onChange: (period: PeriodPreset, fecha?: string) => void;
}

const PRESET_LABELS: Record<Exclude<PeriodPreset, "custom">, string> = {
  today: "Hoy",
  week: "Semana",
  month: "Mes",
};

/**
 * Calendar-anchored period, not a range: clicking a preset asks for "today"/
 * "this week"/"this month so far"; picking a date switches straight to
 * `custom` for that exact day — there's no separate "apply" step, since a
 * date input's own change event already IS the user's decision.
 */
const PeriodSelector = ({ activePeriod, onChange }: PeriodSelectorProps) => {
  const handleDateChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.value) onChange("custom", event.target.value);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div role="group" aria-label="Periodo" className="flex gap-1">
        {(Object.keys(PRESET_LABELS) as Exclude<PeriodPreset, "custom">[]).map((preset) => (
          <button
            key={preset}
            type="button"
            aria-pressed={activePeriod === preset}
            onClick={() => onChange(preset)}
            className={cn(
              "rounded-nb-sm border-2 border-ink px-2.5 py-1 text-xs font-bold",
              activePeriod === preset ? "bg-brand text-text-inverse" : "bg-surface",
            )}
          >
            {PRESET_LABELS[preset]}
          </button>
        ))}
      </div>
      <label className="flex items-center gap-1.5">
        <span className="sr-only">Buscar un día específico</span>
        <input
          type="date"
          aria-label="Buscar un día específico"
          onChange={handleDateChange}
          className="rounded-nb-sm border-2 border-ink bg-surface px-2 py-1 text-xs font-bold"
        />
      </label>
    </div>
  );
};

export { PeriodSelector };
export type { PeriodSelectorProps };
