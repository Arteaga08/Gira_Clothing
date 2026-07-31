import type { Icon as PhosphorIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/cn";
import { Icon } from "./Icon";
import { NB_SURFACE } from "./styles";

interface StatCardProps {
  label: string;
  value: string | number;
  unit?: string;
  foot?: string;
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
  <div className={cn(NB_SURFACE, "p-4", accent && "bg-brand-subtle", className)}>
    <div className="flex items-start justify-between gap-2">
      <p className="text-xs font-bold uppercase tracking-wide text-text-secondary">{label}</p>
      {icon ? (
        <span className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-nb-sm border-[1.5px] border-ink bg-brand-subtle">
          <Icon icon={icon} />
        </span>
      ) : null}
    </div>
    <p className="mt-2 font-mono text-xl font-bold tracking-tight lg:text-2xl">
      {value}
      {unit ? <small className="ml-1 text-xs font-semibold text-text-muted">{unit}</small> : null}
    </p>
    {foot ? <p className="mt-2 text-xs text-text-secondary">{foot}</p> : null}
  </div>
);

export type { StatCardProps };
export { StatCard };
