"use client";

import { useState } from "react";
import { T_LABEL } from "@/components/ui/typography";
import { cn } from "@/lib/cn";

interface PrintThumbProps {
  url: string;
  /** Accessible name; empty when the neighbouring text already says it. */
  alt: string;
  className?: string;
}

/**
 * The print's picture, or an "IMG" tile when it cannot load (Cloudinary is not
 * in the CSP yet, a dead URL, or no network). Never a broken-image icon.
 */
const PrintThumb = ({ url, alt, className }: PrintThumbProps) => {
  const [failed, setFailed] = useState(false);
  const size = cn("h-12 w-12 shrink-0 rounded-nb-sm border-2 border-ink", className);

  if (failed) {
    return (
      <span aria-hidden="true" className={cn(T_LABEL, size, "grid place-items-center bg-surface-sunken text-text-muted")}>
        IMG
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- Cloudinary URL from the API; no next/image loader is configured
    <img src={url} alt={alt} width={48} height={48} loading="lazy" onError={() => setFailed(true)} className={cn(size, "object-cover")} />
  );
};

export type { PrintThumbProps };
export { PrintThumb };
