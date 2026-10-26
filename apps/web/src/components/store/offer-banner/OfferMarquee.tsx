import type { CSSProperties } from "react";

/** Big type travels further per character than the navbar marquee: a slower rate keeps it readable. */
const SECONDS_PER_CHAR = 0.45;
const MIN_DURATION_SECONDS = 14;
/** A group repeats the phrase until it holds about this many characters, so it always outruns a wide screen. */
const MIN_GROUP_CHARS = 60;

interface OfferMarqueeProps {
  message: string;
}

const Star = () => (
  <svg aria-hidden="true" viewBox="0 0 20 20" className="offer-marquee__star" fill="currentColor">
    <path d="M10 0l2.4 7.6L20 10l-7.6 2.4L10 20l-2.4-7.6L0 10l7.6-2.4z" />
  </svg>
);

const Group = ({ items, hidden }: { items: string[]; hidden: boolean }) => (
  <ul className="offer-marquee__group" aria-hidden={hidden || undefined}>
    {items.map((message, index) => (
      <li key={index} className={`offer-marquee__item${index > 0 ? " offer-marquee__repeat" : ""}`}>
        <span className="offer-marquee__text">{message}</span>
        <Star />
      </li>
    ))}
  </ul>
);

/**
 * The phrase running across the photo in an endless loop: two identical groups
 * slide one group's width, so the seam never shows (same technique as the
 * navbar marquee). A screen reader hears the phrase once, from the sr-only
 * copy; the moving copies are decorative. Pauses on hover; reduced motion:
 * one still copy.
 */
const OfferMarquee = ({ message }: OfferMarqueeProps) => {
  const items = Array.from({ length: Math.max(2, Math.ceil(MIN_GROUP_CHARS / message.length)) }, () => message);
  const duration = Math.max(MIN_DURATION_SECONDS, items.length * message.length * SECONDS_PER_CHAR);
  const style = { "--offer-marquee-duration": `${duration}s` } as CSSProperties;

  return (
    <div className="offer-marquee">
      <p className="sr-only">{message}</p>
      <div aria-hidden="true" className="offer-marquee__track" style={style}>
        <Group items={items} hidden={false} />
        <Group items={items} hidden />
      </div>
    </div>
  );
};

export type { OfferMarqueeProps };
export { OfferMarquee };
