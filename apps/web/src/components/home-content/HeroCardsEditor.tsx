import { HERO_CARD_MAX_LENGTH, HERO_MAX_CARDS, HERO_SURFACE_COLORS } from "@gira/shared";
import { Plus, Trash } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { IconButton } from "@/components/ui/IconButton";
import { SURFACE_FILL } from "@/lib/store/heroColors";
import type { HeroCardDraft } from "@/lib/settings/hero";
import { ColorChoice } from "./ColorChoice";

interface HeroCardsEditorProps {
  slideNumber: number;
  cards: HeroCardDraft[];
  onChange: (cards: HeroCardDraft[]) => void;
}

/** The floating cards of one photo: up to two, each with its text and its fill. */
const HeroCardsEditor = ({ slideNumber, cards, onChange }: HeroCardsEditorProps) => (
  <div className="flex flex-col gap-3">
    {cards.map((card, index) => (
      <div key={index} className="flex items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <Field
            label={`Card ${index + 1}`}
            helper={`${card.text.length}/${HERO_CARD_MAX_LENGTH}`}
            maxLength={HERO_CARD_MAX_LENGTH}
            autoComplete="off"
            value={card.text}
            onChange={(event) => onChange(cards.map((c, i) => (i === index ? { ...c, text: event.target.value } : c)))}
          />
          <ColorChoice
            legend={`Color de la card ${index + 1}`}
            options={HERO_SURFACE_COLORS}
            fillOf={SURFACE_FILL}
            value={card.color}
            onChange={(color) => onChange(cards.map((c, i) => (i === index ? { ...c, color } : c)))}
          />
        </div>
        <IconButton
          icon={Trash}
          label={`Quitar la card ${index + 1} de la foto ${slideNumber}`}
          variant="danger"
          className="mt-[calc(var(--text-2xs)*1.5+0.375rem)] shrink-0"
          onClick={() => onChange(cards.filter((_, i) => i !== index))}
        />
      </div>
    ))}
    <div>
      <Button
        variant="positive"
        size="sm"
        disabled={cards.length >= HERO_MAX_CARDS}
        onClick={() => onChange([...cards, { text: "", color: "pink" }])}
      >
        <Plus aria-hidden="true" /> Agregar card
      </Button>
    </div>
  </div>
);

export type { HeroCardsEditorProps };
export { HeroCardsEditor };
