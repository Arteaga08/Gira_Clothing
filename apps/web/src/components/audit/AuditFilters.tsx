"use client";

import type { AuditAction, AuditActorFilter, AuditModule } from "@gira/shared";
import { SelectField, type SelectOption } from "@/components/ui/SelectField";
import { PERIODS, type AuditFilterPatch, type AuditFilters as Filters, type AuditPeriod } from "@/lib/audit/filters";
import { ACTION_LABELS, MODULE_ACTIONS, MODULE_LABELS } from "@/lib/audit/labels";

interface AuditFiltersProps {
  filters: Filters;
  onChange: (patch: AuditFilterPatch) => void;
}

const ALL = "";

const ACTOR_OPTIONS: (SelectOption & { value: AuditActorFilter })[] = [
  { value: "team", label: "Equipo y sistema" },
  { value: "admin", label: "Administradores" },
  { value: "system", label: "Sistema" },
  { value: "customer", label: "Clientes" },
  { value: "all", label: "Todos" },
];

const MODULE_OPTIONS: SelectOption[] = [
  { value: ALL, label: "Todos" },
  ...(Object.keys(MODULE_LABELS) as AuditModule[])
    .filter((module) => MODULE_ACTIONS[module].length > 0)
    .map((module) => ({ value: module, label: MODULE_LABELS[module] })),
];

const PERIOD_OPTIONS: SelectOption[] = PERIODS.map((days) => ({
  value: String(days),
  label: days === 365 ? "Último año" : `Últimos ${days} días`,
}));

/** Who, which module, which action of that module, and how far back. Every change lands in the URL. */
const AuditFilters = ({ filters, onChange }: AuditFiltersProps) => {
  const actions = filters.module ? MODULE_ACTIONS[filters.module] : [];
  const actionOptions: SelectOption[] = [
    { value: ALL, label: "Todas" },
    ...actions.map((action) => ({ value: action, label: ACTION_LABELS[action] })),
  ];

  return (
    <div className="flex flex-wrap items-end gap-3">
      <SelectField
        label="Quién"
        options={ACTOR_OPTIONS}
        value={filters.actor}
        onChange={(next) => onChange({ actor: next as AuditActorFilter })}
        containerClassName="min-w-48"
      />
      <SelectField
        label="Módulo"
        options={MODULE_OPTIONS}
        value={filters.module ?? ALL}
        onChange={(next) => onChange({ module: next === ALL ? undefined : (next as AuditModule) })}
        containerClassName="min-w-44"
      />
      {filters.module ? (
        <SelectField
          label="Acción"
          options={actionOptions}
          value={filters.action ?? ALL}
          onChange={(next) => onChange({ action: next === ALL ? undefined : (next as AuditAction) })}
          containerClassName="min-w-56"
        />
      ) : null}
      <SelectField
        label="Periodo"
        options={PERIOD_OPTIONS}
        value={String(filters.period)}
        onChange={(next) => onChange({ period: Number(next) as AuditPeriod })}
        containerClassName="min-w-44"
      />
    </div>
  );
};

export type { AuditFiltersProps };
export { AuditFilters };
