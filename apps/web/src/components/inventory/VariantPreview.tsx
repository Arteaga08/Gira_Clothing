"use client";

import { PackageIcon } from "@phosphor-icons/react/dist/ssr";
import { EmptyState } from "@/components/ui/EmptyState";
import { T_LABEL, T_PANEL_TITLE } from "@/components/ui/typography";
import type { AdjustOutcome } from "@/hooks/useStockActions";
import type { StockAdjustmentBody } from "@/lib/inventory/adjust";
import type { PanelVariant } from "@/lib/inventory/panelVariant";
import { AdjustStockForm } from "./AdjustStockForm";
import { PrintThumb } from "./PrintThumb";
import { StockBadge } from "./StockBadge";
import { StockFigures } from "./StockFigures";
import { VariantActivity } from "./VariantActivity";

interface VariantPreviewProps {
  variant: PanelVariant;
  threshold: number | null;
  busy: boolean;
  /** Bumped after each adjustment so the history re-reads. */
  activityKey: number;
  onAdjust: (variant: PanelVariant, body: StockAdjustmentBody) => Promise<AdjustOutcome>;
}

/**
 * Everything about the selected variant: figures, the adjustment form and the
 * history. Rendered in the fixed side pane on desktop and inside the SlideOver
 * on mobile, never both at once.
 */
const VariantPreview = ({ variant, threshold, busy, activityKey, onAdjust }: VariantPreviewProps) => (
  <div className="flex flex-col gap-5">
    <div className="flex items-start gap-3">
      <PrintThumb url={variant.print.image.url} alt={`${variant.product.name} · ${variant.print.name}`} className="h-16 w-16" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-base font-bold">{variant.product.name}</p>
        <p className="truncate text-sm text-text-secondary">
          {variant.print.name} · {variant.product.category.name}
        </p>
        <p className="font-mono text-2xs text-text-muted">{variant.sku}</p>
      </div>
      <StockBadge available={variant.available} threshold={threshold} />
    </div>

    <StockFigures onHand={variant.onHand} reserved={variant.reserved} available={variant.available} />

    <section aria-label="Ajustar stock" className="flex flex-col gap-3 border-t-2 border-ink pt-4">
      <h3 className={T_PANEL_TITLE}>Ajustar stock</h3>
      <AdjustStockForm
        key={variant.id}
        variant={variant}
        busy={busy}
        onSubmit={(body) => onAdjust(variant, body)}
      />
    </section>

    <section aria-label="Historial" className="flex flex-col gap-2 border-t-2 border-ink pt-4">
      <h3 className={`${T_LABEL} text-text-muted`}>Historial reciente</h3>
      <VariantActivity variantId={variant.id} reloadKey={activityKey} />
    </section>
  </div>
);

const VariantPreviewPlaceholder = () => (
  <EmptyState
    icon={PackageIcon}
    title="Elige una variante"
    description="Abre una categoría y selecciona una variante para ver su stock, ajustarlo y revisar su historial."
  />
);

export type { VariantPreviewProps };
export { VariantPreview, VariantPreviewPlaceholder };
