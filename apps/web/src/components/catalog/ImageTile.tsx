"use client";

import { useState } from "react";
import { T_LABEL } from "@/components/ui/typography";
import { cn } from "@/lib/cn";

interface ImageTileProps {
  url?: string | undefined;
  /** Empty when the neighbouring text already names the picture. */
  alt: string;
  className?: string;
  /** Retired models read as switched off. */
  grayscale?: boolean;
}

/**
 * A picture that fills its box, or an "IMG" tile when there is none or it
 * cannot load (a dead URL, no network). Never a broken-image icon. The caller
 * sets the size and the border; this only decides what goes inside.
 */
const ImageTile = ({ url, alt, className, grayscale = false }: ImageTileProps) => {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  if (!url || failedUrl === url) {
    return (
      <span
        {...(alt ? { role: "img", "aria-label": alt } : { "aria-hidden": true })}
        className={cn(T_LABEL, "grid place-items-center bg-surface-sunken text-text-muted", className)}
      >
        IMG
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- Cloudinary URL from the API; no next/image loader is configured
    <img
      src={url}
      alt={alt}
      loading="lazy"
      onError={() => setFailedUrl(url)}
      className={cn("object-cover", grayscale && "grayscale", className)}
    />
  );
};

export type { ImageTileProps };
export { ImageTile };
