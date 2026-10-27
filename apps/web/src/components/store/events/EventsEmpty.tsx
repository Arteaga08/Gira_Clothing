import { ArrowUpRight } from "@phosphor-icons/react/dist/ssr";
import { EventStickers } from "./EventStickers";
import { buttonClassName } from "@/components/ui/Button";

interface EventsEmptyProps {
  message: string;
  /** https link for the button (e.g. Instagram), or empty for none. */
  linkUrl: string;
}

/** Nothing upcoming: the team's own message on the same bone sheet, with an optional button. */
const EventsEmpty = ({ message, linkUrl }: EventsEmptyProps) => (
  <div style={{ ["--i" as string]: 1 }} className="reveal-item relative mx-auto max-w-3xl">
    <div className="events-sheet flex flex-col items-start gap-6 border-2 border-ink bg-surface px-6 pb-8 pt-10 shadow-nb md:px-10 md:pr-36">
      <p className="font-display text-[clamp(2rem,5vw,3.5rem)] uppercase leading-[0.95] text-ink">{message}</p>
      {linkUrl ? (
        <a
          href={linkUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonClassName("edit", "md", "text-base")}
        >
          Síguenos
          <ArrowUpRight aria-hidden="true" weight="bold" className="size-5" />
        </a>
      ) : null}
    </div>
    <EventStickers />
  </div>
);

export type { EventsEmptyProps };
export { EventsEmpty };
