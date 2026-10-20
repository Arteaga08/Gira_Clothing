"use client";

import { VARIANT_IMAGES_MAX } from "@gira/shared";
import type { ImageAttrs } from "@gira/shared";
import { ArrowLeftIcon, ArrowRightIcon, TrashIcon } from "@phosphor-icons/react/dist/ssr";
import { Badge } from "@/components/ui/Badge";
import { IconButton } from "@/components/ui/IconButton";
import { NB_PRESSABLE } from "@/components/ui/styles";
import { useToast } from "@/components/ui/Toast";
import { T_PANEL_HINT } from "@/components/ui/typography";
import type { UseImageUpload } from "@/hooks/useImageUpload";
import { cn } from "@/lib/cn";
import type { PickerPrint } from "@/lib/catalog/catalogOptions";
import type { VariantDraft } from "@/lib/catalog/productForm";
import { ImageTile } from "./ImageTile";
import { UploadTile } from "./UploadTile";

interface VariantPhotosProps {
  drafts: VariantDraft[];
  prints: ReadonlyMap<string, PickerPrint>;
  activePrintId: string | null;
  onSelect: (printId: string) => void;
  onImagesChange: (printId: string, images: ImageAttrs[]) => void;
  /** Adds uploaded photos to the end, merged against the latest draft (the upload outlives renders). */
  onImagesAppend: (printId: string, added: ImageAttrs[]) => void;
  upload: UseImageUpload["upload"];
  uploading: boolean;
}

const photosLabel = (count: number): string => (count === 1 ? "1 foto" : `${count} fotos`);

/**
 * Photos are per variant (print): pick the print first, and below it are ITS
 * photos. The first one is the cover. Reordering is by arrows (no dragging),
 * and while an upload is running the controls that would race with it are off.
 */
const VariantPhotos = ({ drafts, prints, activePrintId, onSelect, onImagesChange, onImagesAppend, upload, uploading }: VariantPhotosProps) => {
  const { toast } = useToast();
  const active = drafts.find((draft) => draft.printId === activePrintId);

  if (drafts.length === 0 || !active) {
    return <p className={T_PANEL_HINT}>Elige al menos una estampa para subir sus fotos.</p>;
  }

  const activeName = prints.get(active.printId)?.name ?? "la estampa";
  const full = active.images.length >= VARIANT_IMAGES_MAX;

  const move = (index: number, delta: number) => {
    const next = [...active.images];
    const [moved] = next.splice(index, 1);
    next.splice(index + delta, 0, moved as ImageAttrs);
    onImagesChange(active.printId, next);
  };

  const remove = (index: number) => onImagesChange(active.printId, active.images.filter((_, i) => i !== index));

  const handleFiles = async (files: File[]) => {
    const room = Math.max(0, VARIANT_IMAGES_MAX - active.images.length);
    const accepted = files.slice(0, room);
    if (files.length > accepted.length) {
      toast({
        variant: "warning",
        title: "Límite de fotos",
        description: `Cada estampa admite hasta ${VARIANT_IMAGES_MAX} fotos.`,
      });
    }
    const added: ImageAttrs[] = [];
    for (const file of accepted) {
      const outcome = await upload(file, "variants");
      if (outcome.ok) added.push(outcome.image);
      else toast({ variant: "error", title: "No se pudo subir la foto", description: outcome.message });
    }
    if (added.length > 0) onImagesAppend(active.printId, added);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-3" role="group" aria-label="Estampas del modelo">
        {drafts.map((draft) => {
          const print = prints.get(draft.printId);
          const selected = draft.printId === active.printId;
          return (
            <button
              key={draft.printId}
              type="button"
              aria-pressed={selected}
              onClick={() => onSelect(draft.printId)}
              className={cn(
                "flex items-center gap-3 rounded-nb-sm border-2 border-ink px-3 py-2 text-left shadow-nb-sm",
                NB_PRESSABLE,
                selected ? "bg-brand text-text-inverse" : "bg-surface text-text-primary",
              )}
            >
              <ImageTile
                url={draft.images[0]?.url ?? print?.imageUrl}
                alt=""
                className="h-10 w-10 rounded-nb-sm border-2 border-ink"
              />
              <span className="flex flex-col">
                <span className="text-sm font-bold">{print?.name ?? "Estampa"}</span>
                <span className={cn("font-mono text-2xs", selected ? "text-text-inverse-secondary" : "text-text-muted")}>
                  {photosLabel(draft.images.length)}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <ul aria-label={`Fotos de ${activeName}`} className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {active.images.map((image, index) => (
          <li
            key={`${image.publicId}-${index}`}
            className="relative aspect-square overflow-hidden rounded-nb-sm border-2 border-ink bg-surface-sunken"
          >
            <ImageTile url={image.url} alt={`Foto ${index + 1} de ${activeName}`} className="h-full w-full" />
            {index === 0 ? (
              <Badge variant="ok" className="absolute left-2 top-2">
                Portada
              </Badge>
            ) : null}
            <div className="absolute inset-x-2 bottom-2 flex items-center gap-2">
              <IconButton
                icon={ArrowLeftIcon}
                label="Mover antes"
                size="sm"
                disabled={uploading || index === 0}
                onClick={() => move(index, -1)}
              />
              <IconButton
                icon={ArrowRightIcon}
                label="Mover después"
                size="sm"
                disabled={uploading || index === active.images.length - 1}
                onClick={() => move(index, 1)}
              />
              <IconButton
                icon={TrashIcon}
                label="Quitar foto"
                size="sm"
                className="ml-auto"
                disabled={uploading}
                onClick={() => remove(index)}
              />
            </div>
          </li>
        ))}
        <li>
          <UploadTile
            label="Subir fotos"
            hint={`Hasta ${VARIANT_IMAGES_MAX} por estampa`}
            multiple
            busy={uploading}
            disabled={full}
            className="aspect-square h-full w-full"
            onFiles={(files) => void handleFiles(files)}
          />
        </li>
      </ul>
    </div>
  );
};

export type { VariantPhotosProps };
export { VariantPhotos };
