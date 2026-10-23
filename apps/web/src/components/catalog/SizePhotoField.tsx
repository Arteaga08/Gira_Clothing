import { useId } from "react";
import { Button } from "@/components/ui/Button";
import { T_CAPTION, T_LABEL } from "@/components/ui/typography";
import { ImageTile } from "./ImageTile";
import { UploadTile } from "./UploadTile";

interface SizePhotoFieldProps {
  /** `null` when the model has no size photo. */
  imageUrl: string | null;
  busy: boolean;
  error?: string | undefined;
  onPick: (file: File) => void;
  onRemove: () => void;
}

/** The single photo (or diagram) that shows the model's real size. Replacing is just picking another file. */
const SizePhotoField = ({ imageUrl, busy, error, onPick, onRemove }: SizePhotoFieldProps) => {
  const errorId = useId();
  return (
  <div className="flex flex-col gap-1.5 sm:col-span-2">
    <span className={`${T_LABEL} text-text-secondary`}>Foto de tamaño</span>
    <div className="grid items-start gap-3 sm:grid-cols-[10rem_10rem_minmax(0,1fr)]">
      {imageUrl ? (
        <div className="flex flex-col gap-2">
          <ImageTile
            url={imageUrl}
            alt="Foto de tamaño del modelo"
            className="aspect-square w-full rounded-nb-sm border-2 border-ink"
          />
          <Button size="sm" variant="danger" onClick={onRemove} disabled={busy}>
            Quitar foto
          </Button>
        </div>
      ) : null}
      <UploadTile
        label={imageUrl ? "Reemplazar foto" : "Subir foto de tamaño"}
        hint="JPG, PNG, WEBP o AVIF · 5 MB"
        busy={busy}
        describedBy={error ? errorId : undefined}
        className="aspect-square w-full"
        onFiles={(files) => onPick(files[0] as File)}
      />
      <p className={`${T_CAPTION} sm:self-center`}>
        Una foto o diagrama que muestre el tamaño real, por ejemplo junto a una mano o con las medidas marcadas. Es una
        sola por modelo y se muestra en la tienda junto a las medidas.
      </p>
    </div>
    {error ? (
      <p id={errorId} role="alert" className="text-xs text-danger">
        {error}
      </p>
    ) : null}
  </div>
  );
};

export type { SizePhotoFieldProps };
export { SizePhotoField };
