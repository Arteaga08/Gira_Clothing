import { getEvents } from "@/lib/api/storefront";
import { EventsView } from "./EventsView";

/**
 * Events of the home (M13 section 8), below the offer banner. Edited in
 * «Contenido de home». The API unreachable, or nothing upcoming and no message
 * written yet, no section.
 */
const Events = async () => {
  const events = await getEvents();
  if (!events || (!events.next && !events.emptyMessage)) return null;
  return <EventsView events={events} />;
};

export { Events };
