import type { PublicEvent } from "@gira/shared";
import { ArrowUpRight } from "@phosphor-icons/react/dist/ssr";
import { eventDay } from "@/lib/store/eventDate";

interface EventsLaterProps {
  events: PublicEvent[];
}

/** The stops after the poster, one line each: short date, city and place. A line is a link only when it has a map. */
const EventsLater = ({ events }: EventsLaterProps) => {
  if (events.length === 0) return null;
  return (
    <div style={{ ["--i" as string]: 3 }} className="reveal-item mt-14 md:mt-20">
      <h3 className="pb-4 font-display text-3xl uppercase leading-none text-brand md:text-4xl">Después</h3>
      <ol className="border-t-2 border-ink">
        {events.map((event) => {
          const { day, month } = eventDay(event.date);
          const row = (
            <>
              <time dateTime={event.date} className="font-display text-3xl uppercase leading-none text-ink md:text-4xl">
                {day} {month}
              </time>
              <span className="min-w-0 text-lg font-bold md:text-xl">
                {event.city}
                <span className="block font-normal text-text-secondary md:inline md:before:content-['_·_']">
                  {event.title} · {event.venue}
                </span>
              </span>
              {event.mapsUrl ? <ArrowUpRight aria-hidden="true" weight="bold" className="size-6 shrink-0" /> : null}
            </>
          );
          const rowClass = "events-later-row flex items-center gap-4 border-b-2 border-ink py-4 md:gap-8";
          return (
            <li key={`${event.date}-${event.startTime}-${event.title}`}>
              {event.mapsUrl ? (
                <a
                  href={event.mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Cómo llegar a ${event.title}`}
                  className={`${rowClass} events-later-link`}
                >
                  {row}
                </a>
              ) : (
                <div className={rowClass}>{row}</div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
};

export type { EventsLaterProps };
export { EventsLater };
