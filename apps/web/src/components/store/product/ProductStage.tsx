"use client";

import { useState } from "react";
import type { ImageAttrs } from "@gira/shared";
import { cardImageUrl } from "@/components/store/best-sellers/cardImage";
import { cn } from "@/lib/cn";

interface ProductStageProps {
  images: ImageAttrs[];
  alt: string;
}

const STAGE_WIDTH = 1000;

/**
 * The photo of the chosen variant on the category's colour, with one dot per
 * photo. The parent re-keys it per variant, so a new print starts on its
 * first photo.
 */
const ProductStage = ({ images, alt }: ProductStageProps) => {
  const [current, setCurrent] = useState(0);
  const image = images[current] ?? images[0];

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 px-4 pb-6 pt-6 md:px-6 md:pt-6">
      <div className="aspect-[4/5] w-full max-w-[32rem] overflow-hidden rounded-nb border-2 border-ink bg-surface shadow-nb">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element -- Cloudinary URL from the API; no next/image loader is configured
          <img src={cardImageUrl(image.url, STAGE_WIDTH)} alt={alt} width={STAGE_WIDTH} height={STAGE_WIDTH * 1.25} decoding="async" className="size-full object-cover" />
        ) : null}
      </div>
      {images.length > 1 ? (
        <div role="group" aria-label="Fotos" className="flex gap-3.5">
          {images.map((photo, index) => (
            <button
              key={photo.publicId}
              type="button"
              aria-label={`Foto ${index + 1} de ${images.length}`}
              aria-current={index === current}
              onClick={() => setCurrent(index)}
              className={cn(
                "size-5 rounded-full border-2 border-ink transition-transform duration-150 ease-out motion-reduce:transition-none",
                index === current ? "scale-110 bg-ink" : "bg-surface",
              )}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
};

export type { ProductStageProps };
export { ProductStage };
