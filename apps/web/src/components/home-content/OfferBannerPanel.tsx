import type { StorefrontOfferBanner } from "@gira/shared";
import { ImageTile } from "@/components/catalog/ImageTile";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Panel";

interface OfferBannerPanelProps {
  banner: StorefrontOfferBanner;
  onEdit: () => void;
}

/** Summary of the offer banner: whether it shows, its photo, its phrase and where it leads. Editing happens in the modal. */
const OfferBannerPanel = ({ banner, onEdit }: OfferBannerPanelProps) => (
  <Panel
    title="Banner de ofertas"
    hint="Debajo de Novedades"
    actions={
      <Button variant="edit" size="sm" onClick={onEdit}>
        Editar
      </Button>
    }
  >
    <Badge variant={banner.enabled ? "ok" : "neutral"}>{banner.enabled ? "Visible" : "Oculto"}</Badge>
    {banner.image || banner.message ? (
      <div className="mt-3 flex items-start gap-3">
        {banner.image ? (
          <ImageTile
            url={banner.image.url}
            alt={banner.alt || "Foto del banner de ofertas"}
            className="h-16 w-28 shrink-0 rounded-nb-sm border-2 border-ink object-cover"
          />
        ) : null}
        <div className="flex min-w-0 flex-col gap-1 text-sm">
          <span className="text-text-primary">{banner.message || "Sin frase"}</span>
          <span className="truncate text-text-secondary">
            {banner.buttonLabel || "Botón"} → {banner.productId ? "un producto" : "la tienda"}
          </span>
        </div>
      </div>
    ) : (
      <p className="mt-3 text-sm text-text-secondary">
        Aún no hay banner. Una foto a lo ancho con una frase que corre en bucle y un botón.
      </p>
    )}
  </Panel>
);

export type { OfferBannerPanelProps };
export { OfferBannerPanel };
