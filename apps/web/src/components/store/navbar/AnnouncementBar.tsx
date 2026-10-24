import type { StorefrontAnnouncement } from "@gira/shared";
import type { CSSProperties } from "react";

/** About 9px of travel per character at ~30px/s: a slow, calm reading speed. */
const SECONDS_PER_CHAR = 0.3;
const MIN_DURATION_SECONDS = 20;
/** A group repeats the messages until it holds about this many items, so it always outruns a wide screen. */
const MIN_GROUP_ITEMS = 12;

interface AnnouncementBarProps {
  announcement: StorefrontAnnouncement;
}

const Separator = () => (
  <svg aria-hidden="true" viewBox="0 0 20 20" className="size-3.5 shrink-0" fill="currentColor">
    <path d="M10 0l2.4 7.6L20 10l-7.6 2.4L10 20l-2.4-7.6L0 10l7.6-2.4z" />
  </svg>
);

const buildGroup = (items: readonly string[], originals: number, hidden: boolean) => {
  return (
    <ul
      className="store-marquee__group flex min-w-[100vw] shrink-0 items-center justify-around gap-10 pr-10"
      aria-hidden={hidden || undefined}
    >
      {items.map((message, index) => (
        <li
          key={index}
          className={`flex shrink-0 items-center gap-10 whitespace-nowrap${index >= originals ? " store-marquee__repeat" : ""}`}
        >
          <span>{message}</span>
          <Separator />
        </li>
      ))}
    </ul>
  );
};

/**
 * Scrolling pill above the navbar (same inset and pill language as the nav items), edited from Ajustes. A Server Component:
 * the page ships it as plain HTML and CSS. Hidden or empty renders nothing.
 * Messages are React text children, never HTML. The second copy of the
 * messages is `aria-hidden` so a screen reader hears them once.
 */
const AnnouncementBar = ({ announcement }: AnnouncementBarProps) => {
  const { enabled, messages } = announcement;
  if (!enabled || messages.length === 0) return null;

  const items = Array.from({ length: Math.ceil(MIN_GROUP_ITEMS / messages.length) }, () => messages).flat();
  const groupChars = items.reduce((sum, message) => sum + message.length, 0);
  const duration = Math.max(MIN_DURATION_SECONDS, groupChars * SECONDS_PER_CHAR);
  const style = { "--store-marquee-duration": `${duration}s` } as CSSProperties;

  return (
    <div className="relative z-[var(--z-topbar)] px-4 pt-3 md:px-8">
      <section
        aria-label="Anuncios"
        className="store-marquee mx-auto flex max-w-[90rem] items-center overflow-hidden rounded-nb-pill border-2 border-ink bg-[var(--store-marquee-bg)] text-[var(--store-marquee-fg)] shadow-nb-sm"
        style={{ minHeight: "var(--store-marquee-height)" }}
      >
        <div className="store-marquee__track flex w-max text-sm font-bold uppercase tracking-wide" style={style}>
          {buildGroup(items, messages.length, false)}
          {buildGroup(items, messages.length, true)}
        </div>
      </section>
    </div>
  );
};

export type { AnnouncementBarProps };
export { AnnouncementBar };
