import type { CustomerOrder, Wire } from "@gira/shared";
import { cardImageUrl } from "@/components/store/best-sellers/cardImage";

const MAX_THUMBS = 3;
const THUMB_WIDTH = 160;

/** Up to three line photos of an order, overlapped; a line without photo is a flat tile. */
const OrderThumbs = ({ lines }: { lines: Wire<CustomerOrder>["lines"] }) => (
  <div className="flex shrink-0" aria-hidden="true">
    {lines.slice(0, MAX_THUMBS).map((line, index) => (
      <span
        key={`${line.sku}-${String(index)}`}
        className="relative -ml-3 block size-14 overflow-hidden rounded-nb-sm border-2 border-ink bg-tile-alt first:ml-0"
      >
        {line.image ? (
          // eslint-disable-next-line @next/next/no-img-element -- Cloudinary URL from the API; no next/image loader is configured
          <img src={cardImageUrl(line.image.url, THUMB_WIDTH)} alt="" width={THUMB_WIDTH} height={200} loading="lazy" decoding="async" className="size-full object-cover" />
        ) : null}
      </span>
    ))}
  </div>
);

export { OrderThumbs };
