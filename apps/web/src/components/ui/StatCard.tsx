import type { Icon as PhosphorIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "./Icon";
import { NB_SURFACE } from "./styles";
import { T_CAPTION, T_LABEL, T_METRIC } from "./typography";

interface StatCardProps {
  label: string;
  value: string | number;
  unit?: string;
  /** Usually a string; a combined KPI (e.g. Resumen's "Ingresos") may pass a
   *  short fragment with a secondary line for the per-currency breakdown. */
  foot?: ReactNode;
  icon?: PhosphorIcon;
  /**
   * Highlights this card with the single brand accent. The design spec (§4)
   * allows at most ONE accented KPI per screen — enforcing that across a
   * screen's cards is the consumer's responsibility, not this component's.
   */
  accent?: boolean;
  className?: string;
}

const StatCard = ({ label, value, unit, foot, icon, accent = false, className }: StatCardProps) => (
  <div className={cn(NB_SURFACE, "p-6", accent && "bg-brand-subtle", className)}>
    <div className="flex items-start justify-between gap-2">
      <p className={T_LABEL}>{label}</p>
      {icon ? (
        <span className="grid h-7.5 w-7.5 shrink-0 place-items-center rounded-nb-sm border-[1.5px] border-ink bg-brand-subtle">
          <Icon icon={icon} />
        </span>
      ) : null}
    </div>
    <p className={cn("mt-2", T_METRIC)}>
      {value}
      {unit ? <small className="ml-1 text-xs font-semibold text-text-muted">{unit}</small> : null}
    </p>
    {foot ? <p className={cn("mt-2", T_CAPTION)}>{foot}</p> : null}
  </div>
);

export type { StatCardProps };
export { StatCard };
