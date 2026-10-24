import { HERO_MAX_SLIDES, type StorefrontHero } from "@gira/shared";
import { ImageTile } from "@/components/catalog/ImageTile";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Panel";

interface HeroPanelProps {
  hero: StorefrontHero;
  onEdit: () => void;
}

/** Summary of the home hero: the photos in order, each with its title. Editing happens in the modal. */
const HeroPanel = ({ hero, onEdit }: HeroPanelProps) => (
  <Panel
    title="Portada"
    hint="Lo primero que se ve en la tienda"
    actions={
      <Button variant="edit" size="sm" onClick={onEdit}>
        Editar
      </Button>
    }
  >
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant={hero.slides.length > 0 ? "ok" : "neutral"}>
        {hero.slides.length > 0 ? "Con fotos" : "Sin fotos"}
      </Badge>
      <span className="text-sm text-text-secondary">
        {hero.slides.length} de {HERO_MAX_SLIDES} fotos
      </span>
    </div>
    {hero.slides.length > 0 ? (
      <ol className="mt-3 flex flex-wrap gap-2">
        {hero.slides.map((slide, index) => (
          <li key={`${slide.image.publicId}-${index}`} className="flex w-24 flex-col gap-1">
            <ImageTile
              url={slide.image.url}
              alt={`Foto ${index + 1} de la portada`}
              className="h-16 w-24 rounded-nb-sm border-2 border-ink object-cover"
            />
            <span className="truncate text-xs text-text-secondary" title={slide.headline || "Gira Clothing (por defecto)"}>
              {slide.headline.trim() || "Sin titular"}
            </span>
          </li>
        ))}
      </ol>
    ) : (
      <p className="mt-3 text-sm text-text-secondary">
        Aún no hay fotos. La tienda muestra «Gira Clothing» y un botón a la tienda.
      </p>
    )}
  </Panel>
);

export type { HeroPanelProps };
export { HeroPanel };
