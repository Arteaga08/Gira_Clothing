import type { PublicEvent } from "@gira/shared";
import { ArrowUpRight } from "@phosphor-icons/react/dist/ssr";
import { cardImageUrl } from "@/components/store/best-sellers/cardImage";
import { Flower } from "@/components/store/categories/Ornaments";
import { buttonClassName } from "@/components/ui/Button";
import { EventStickers } from "./EventStickers";
import { eventDay, eventHours } from "@/lib/store/eventDate";

interface EventPosterProps {
  event: PublicEvent;
}

const PHOTO_WIDTH = 960;

/**
 * The next event as a street poster: its photo at 4:5 with the city on a
 * label, and beside it a bone sheet taped to the wall with the day set huge and a few stickers stuck on it.
 * The sheet's tilt lives on an inner wrapper so the entrance (which moves the
 * outer one) never fights it. No photo: a menta field with a flower. The map
 * button only exists when the team gave a link.
 */
const EventPoster = ({ event }: EventPosterProps) => {
  const { day, month, weekday } = eventDay(event.date);
  return (
    <div className="grid items-center gap-10 md:grid-cols-2 md:gap-14">
      <figure
        style={{ ["--i" as string]: 1 }}
        className="reveal-item relative mx-auto aspect-[4/5] w-full max-w-md overflow-hidden rounded-nb border-2 border-ink bg-brand-subtle shadow-nb md:max-w-none"
      >
        {event.image ? (
          // eslint-disable-next-line @next/next/no-img-element -- Cloudinary URL from the API; no next/image loader is configured
          <img
            src={cardImageUrl(event.image.url, PHOTO_WIDTH)}
            alt={event.alt}
            width={PHOTO_WIDTH}
            height={Math.round((PHOTO_WIDTH * 5) / 4)}
            loading="lazy"
            decoding="async"
            className="size-full object-cover"
          />
        ) : (
          <div className="grid size-full place-items-center">
            <Flower className="size-1/2" />
          </div>
        )}
        <figcaption className="absolute bottom-4 left-4 border-2 border-ink bg-surface px-3 py-1 font-display text-2xl uppercase leading-none text-ink shadow-nb md:text-3xl">
          {event.city}
        </figcaption>
      </figure>
      <div style={{ ["--i" as string]: 2 }} className="reveal-item relative">
        <article className="events-sheet flex flex-col gap-5 border-2 border-ink bg-surface px-6 pb-8 pt-10 text-text-primary shadow-nb md:px-10 md:pr-40">
          <time dateTime={event.date} className="flex flex-col gap-3">
            <span className="font-display text-[clamp(7rem,18vw,13rem)] leading-none text-ink">{day}</span>
            <span className="font-display text-3xl uppercase leading-none text-brand md:text-4xl">
              {month} · {weekday}
            </span>
          </time>
          <h3 className="text-2xl font-bold leading-tight md:text-3xl">{event.title}</h3>
          <p className="flex flex-col gap-1 text-lg text-text-secondary">
            <span>{event.venue}</span>
            <span>{eventHours(event.startTime, event.endTime)}</span>
          </p>
          {event.mapsUrl ? (
            <a
              href={event.mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Cómo llegar a ${event.title}`}
              className={buttonClassName("edit", "md", "self-start text-base")}
            >
              Cómo llegar
              <ArrowUpRight aria-hidden="true" weight="bold" className="size-5" />
            </a>
          ) : null}
        </article>
        <EventStickers />
      </div>
    </div>
  );
};

export type { EventPosterProps };
export { EventPoster };
