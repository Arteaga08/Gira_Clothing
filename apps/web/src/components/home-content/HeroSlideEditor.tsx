import { HERO_BUTTON_COLORS, HERO_HEADLINE_MAX_LENGTH, HERO_HEADLINE_MAX_WORDS, HERO_SURFACE_COLORS } from "@gira/shared";
import { ArrowDown, ArrowUp, Trash } from "@phosphor-icons/react/dist/ssr";
import { ImageTile } from "@/components/catalog/ImageTile";
import { UploadTile } from "@/components/catalog/UploadTile";
import { Field } from "@/components/ui/Field";
import { IconButton } from "@/components/ui/IconButton";
import { SelectField } from "@/components/ui/SelectField";
import { T_LABEL } from "@/components/ui/typography";
import { BUTTON_FILL, SURFACE_FILL } from "@/lib/store/heroColors";
import { countWords, type HeroSlideDraft } from "@/lib/settings/hero";
import { ColorChoice } from "./ColorChoice";
import { HeroCardsEditor } from "./HeroCardsEditor";

interface HeroSlideEditorProps {
  slide: HeroSlideDraft;
  /** 0-based; shown as «Foto N». */
  index: number;
  total: number;
  productOptions: { value: string; label: string }[];
  busy: boolean;
  onChange: (slide: HeroSlideDraft) => void;
  onReplaceImage: (file: File) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
}

const NO_PRODUCT = { value: "", label: "Ir a la tienda (sin producto)" };

/** One photo of the hero: its picture, the model it leads to, its colours and its cards. */
const HeroSlideEditor = ({
  slide,
  index,
  total,
  productOptions,
  busy,
  onChange,
  onReplaceImage,
  onMove,
  onRemove,
}: HeroSlideEditorProps) => {
  const number = index + 1;
  return (
    <li className="flex flex-col gap-4 border-t-2 border-ink pt-4 first:border-t-0 first:pt-0">
      <div className="flex items-center justify-between gap-2">
        <h3 className={T_LABEL}>Foto {number}</h3>
        <div className="flex items-center gap-2">
          <IconButton icon={ArrowUp} label={`Subir la foto ${number}`} variant="edit" size="sm" disabled={index === 0} onClick={() => onMove(-1)} />
          <IconButton icon={ArrowDown} label={`Bajar la foto ${number}`} variant="edit" size="sm" disabled={index === total - 1} onClick={() => onMove(1)} />
          <IconButton icon={Trash} label={`Quitar la foto ${number}`} variant="danger" size="sm" onClick={onRemove} />
        </div>
      </div>
      <div className="grid items-start gap-4 sm:grid-cols-[10rem_minmax(0,1fr)]">
        <div className="flex flex-col gap-2">
          <ImageTile url={slide.image.url} alt={`Foto ${number} de la portada`} className="aspect-[4/3] w-full rounded-nb-sm border-2 border-ink object-cover" />
          <UploadTile label="Cambiar foto" busy={busy} className="w-full" onFiles={(files) => onReplaceImage(files[0] as File)} />
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <Field
            label="Titular de esta foto"
            helper={`${countWords(slide.headline)}/${HERO_HEADLINE_MAX_WORDS} palabras · ${slide.headline.length}/${HERO_HEADLINE_MAX_LENGTH}`}
            maxLength={HERO_HEADLINE_MAX_LENGTH}
            autoComplete="off"
            value={slide.headline}
            onChange={(event) => onChange({ ...slide, headline: event.target.value })}
          />
          <SelectField
            label="Producto al que lleva"
            options={[NO_PRODUCT, ...productOptions]}
            value={slide.productId}
            onChange={(productId) => onChange({ ...slide, productId })}
            helper="Si no eliges uno, el botón lleva a la tienda."
          />
          <ColorChoice
            legend="Color del fondo del titular"
            options={HERO_SURFACE_COLORS}
            fillOf={SURFACE_FILL}
            value={slide.titleColor}
            onChange={(titleColor) => onChange({ ...slide, titleColor })}
          />
          <ColorChoice
            legend="Color del botón"
            options={HERO_BUTTON_COLORS}
            fillOf={BUTTON_FILL}
            value={slide.buttonColor}
            onChange={(buttonColor) => onChange({ ...slide, buttonColor })}
          />
          <HeroCardsEditor slideNumber={number} cards={slide.cards} onChange={(cards) => onChange({ ...slide, cards })} />
        </div>
      </div>
    </li>
  );
};

export type { HeroSlideEditorProps };
export { HeroSlideEditor };
