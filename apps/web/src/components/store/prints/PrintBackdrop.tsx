import type { PublicPrintSummary } from "@/lib/api/storefront";
import { printImageUrl } from "./printImage";

interface PrintBackdropProps {
  prints: PublicPrintSummary[];
  activeIndex: number;
}

/**
 * Every print's photo, stacked and mounted (remounting flickers). The new one
 * fades in over the old one, which holds until it is covered, so the section
 * never dips to its ink base. Decorative: the name says what it is.
 */
const PrintBackdrop = ({ prints, activeIndex }: PrintBackdropProps) => (
  <div aria-hidden="true" className="absolute inset-0">
    {prints.map((print, position) => (
      // eslint-disable-next-line @next/next/no-img-element -- Cloudinary URL from the API; no next/image loader is configured
      <img
        key={print.id}
        src={printImageUrl(print.image.url)}
        alt=""
        width={print.image.width}
        height={print.image.height}
        loading={position === 0 ? "eager" : "lazy"}
        decoding="async"
        data-active={position === activeIndex}
        className="prints-photo size-full object-cover"
      />
    ))}
  </div>
);

export { PrintBackdrop };
