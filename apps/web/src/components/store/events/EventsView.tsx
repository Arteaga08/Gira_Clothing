import type { PublicEvents } from "@gira/shared";
import { EventPoster } from "./EventPoster";
import { EventsEmpty } from "./EventsEmpty";
import { EventsLater } from "./EventsLater";
import { EventsReveal } from "./EventsReveal";

const TITLE_ID = "events-title";

interface EventsViewProps {
  events: PublicEvents;
}

/** The next stop as a poster, the following ones listed under it; with none upcoming, the team's own message. */
const EventsView = ({ events }: EventsViewProps) => (
  <EventsReveal titleId={TITLE_ID} title="Próximas paradas">
    {events.next ? (
      <>
        <EventPoster event={events.next} />
        <EventsLater events={events.later} />
      </>
    ) : (
      <EventsEmpty message={events.emptyMessage} linkUrl={events.emptyLinkUrl} />
    )}
  </EventsReveal>
);

export type { EventsViewProps };
export { EventsView };
