import { Button } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Panel";
import { T_METRIC } from "@/components/ui/typography";
import { formatTaxRate } from "@/lib/settings/tax";

interface TaxPanelProps {
  rateBps: number;
  onEdit: () => void;
}

const TaxPanel = ({ rateBps, onEdit }: TaxPanelProps) => (
  <Panel
    title="IVA"
    hint="Incluido en los precios"
    actions={
      <Button variant="edit" size="sm" onClick={onEdit}>
        Editar
      </Button>
    }
  >
    <p className={T_METRIC}>{formatTaxRate(rateBps)}</p>
    <p className="mt-2 text-sm text-text-secondary">
      Se usa para desglosar el IVA de cada pedido nuevo. Los pedidos ya creados conservan su tasa.
    </p>
  </Panel>
);

export type { TaxPanelProps };
export { TaxPanel };
