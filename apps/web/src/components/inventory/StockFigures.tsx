import { T_LABEL, T_METRIC_SM } from "@/components/ui/typography";
import { formatInteger } from "@/lib/format";
import type { PanelVariant } from "@/lib/inventory/panelVariant";

type StockFiguresProps = Pick<PanelVariant, "onHand" | "reserved" | "available">;

/** En mano, apartado, disponible: always mono, disponible = en mano − apartado. */
const StockFigures = ({ onHand, reserved, available }: StockFiguresProps) => (
  <dl className="grid grid-cols-3 gap-3">
    <div>
      <dt className={`${T_LABEL} text-text-muted`}>En mano</dt>
      <dd className={T_METRIC_SM}>{formatInteger(onHand)}</dd>
    </div>
    <div>
      <dt className={`${T_LABEL} text-text-muted`}>Apartado</dt>
      <dd className={T_METRIC_SM}>{formatInteger(reserved)}</dd>
    </div>
    <div>
      <dt className={`${T_LABEL} text-text-muted`}>Disponible</dt>
      <dd className={T_METRIC_SM}>{formatInteger(available)}</dd>
    </div>
  </dl>
);

export type { StockFiguresProps };
export { StockFigures };
