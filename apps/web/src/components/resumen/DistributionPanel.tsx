import type { OrderStatus } from "@gira/shared";
import { ChartBarIcon } from "@phosphor-icons/react/dist/ssr";
import { EmptyState } from "@/components/ui/EmptyState";
import { Panel } from "@/components/ui/Panel";
import { ORDER_STATUS_BG } from "@/components/ui/styles";
import { formatInteger } from "@/lib/format";
import { distributionFrom } from "@/lib/stats/distribution";

interface DistributionPanelProps {
  byStatus: Partial<Record<OrderStatus, number>>;
  className?: string | undefined;
}

const DistributionPanel = ({ byStatus, className }: DistributionPanelProps) => {
  const { segments, total } = distributionFrom(byStatus);

  if (segments.length === 0) {
    return (
      <Panel title="Distribución por estado" className={className}>
        <EmptyState
          icon={ChartBarIcon}
          title="Sin pedidos en el periodo"
          description="Aún no hay pedidos registrados en este periodo."
        />
      </Panel>
    );
  }

  const ariaLabel = segments.map((segment) => `${segment.count} ${segment.label}`).join(", ");

  return (
    <Panel
      title="Distribución por estado"
      hint={`${formatInteger(total)} pedidos en el periodo`}
      className={className}
    >
      <div
        role="img"
        aria-label={ariaLabel}
        className="flex h-[34px] overflow-hidden rounded-nb-sm border-2 border-ink"
      >
        {segments.map((segment) => (
          <span
            key={segment.status}
            style={{ width: `${segment.percent}%` }}
            className={`min-w-1 border-r-[1.5px] border-ink last:border-r-0 ${ORDER_STATUS_BG[segment.status]}`}
          />
        ))}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs lg:grid-cols-3">
        {segments.map((segment) => (
          <div key={segment.status} className="flex items-center gap-2">
            <span
              className={`h-3 w-3 shrink-0 rounded-[3px] border-[1.5px] border-ink ${ORDER_STATUS_BG[segment.status]}`}
            />
            <span className="min-w-0 flex-1 truncate text-text-secondary">{segment.label}</span>
            <span className="font-mono font-bold">{formatInteger(segment.count)}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
};

export { DistributionPanel };
export type { DistributionPanelProps };
