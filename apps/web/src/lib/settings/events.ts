import {
  EVENTS_EMPTY_MESSAGE_MAX_LENGTH,
  EVENTS_MAX_ITEMS,
  EVENT_ALT_MAX_LENGTH,
  EVENT_CITY_MAX_LENGTH,
  EVENT_TITLE_MAX_LENGTH,
  EVENT_URL_MAX_LENGTH,
  EVENT_VENUE_MAX_LENGTH,
  type StorefrontEvent,
  type StorefrontEvents,
} from "@gira/shared";

/**
 * Events form helpers. The draft keeps what the team typed as is;
 * `parseEvents` trims it and applies the same rules as the API, so a mistake
 * shows in the modal before a round trip.
 */

type EventsParseResult = { events: StorefrontEvents } | { error: string };

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

const blankEvent = (id: string): StorefrontEvent => ({
  id,
  title: "",
  date: "",
  startTime: "",
  endTime: "",
  city: "",
  venue: "",
  mapsUrl: "",
  image: null,
  alt: "",
});

const trimEvent = (event: StorefrontEvent): StorefrontEvent => ({
  id: event.id,
  title: event.title.trim(),
  date: event.date,
  startTime: event.startTime,
  endTime: event.endTime,
  city: event.city.trim(),
  venue: event.venue.trim(),
  mapsUrl: event.mapsUrl.trim(),
  image: event.image,
  alt: event.alt.trim(),
});

const trimEvents = (draft: StorefrontEvents): StorefrontEvents => ({
  items: draft.items.map(trimEvent),
  emptyMessage: draft.emptyMessage.trim(),
  emptyLinkUrl: draft.emptyLinkUrl.trim(),
});

/** Equal signatures mean nothing changed; leading or trailing spaces do not count. */
const eventsSignature = (draft: StorefrontEvents): string => JSON.stringify(trimEvents(draft));

const isHttpsUrl = (value: string): boolean => {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
};

const isRealDay = (value: string): boolean =>
  DAY_PATTERN.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));

const tooLong = (value: string, max: number): boolean => value.length > max;

const parseEvent = (event: StorefrontEvent, number: number): string | null => {
  const at = `Evento ${number}:`;
  if (!event.title) return `${at} falta el nombre.`;
  if (tooLong(event.title, EVENT_TITLE_MAX_LENGTH)) return `${at} el nombre admite hasta ${EVENT_TITLE_MAX_LENGTH} caracteres.`;
  if (!isRealDay(event.date)) return `${at} elige la fecha.`;
  if (!TIME_PATTERN.test(event.startTime)) return `${at} elige la hora de inicio.`;
  if (event.endTime && !TIME_PATTERN.test(event.endTime)) return `${at} la hora de cierre no es válida.`;
  if (!event.city) return `${at} falta la ciudad.`;
  if (tooLong(event.city, EVENT_CITY_MAX_LENGTH)) return `${at} la ciudad admite hasta ${EVENT_CITY_MAX_LENGTH} caracteres.`;
  if (!event.venue) return `${at} falta el lugar.`;
  if (tooLong(event.venue, EVENT_VENUE_MAX_LENGTH)) return `${at} el lugar admite hasta ${EVENT_VENUE_MAX_LENGTH} caracteres.`;
  if (event.mapsUrl && (tooLong(event.mapsUrl, EVENT_URL_MAX_LENGTH) || !isHttpsUrl(event.mapsUrl))) {
    return `${at} el enlace del mapa debe empezar con https://.`;
  }
  if (tooLong(event.alt, EVENT_ALT_MAX_LENGTH)) return `${at} la descripción de la foto admite hasta ${EVENT_ALT_MAX_LENGTH} caracteres.`;
  if (event.image && !event.alt) return `${at} describe la foto para poder mostrarla.`;
  return null;
};

const parseEvents = (draft: StorefrontEvents): EventsParseResult => {
  const events = trimEvents(draft);
  if (events.items.length > EVENTS_MAX_ITEMS) return { error: `Puedes guardar hasta ${EVENTS_MAX_ITEMS} eventos.` };
  for (const [index, event] of events.items.entries()) {
    const error = parseEvent(event, index + 1);
    if (error) return { error };
  }
  if (!events.emptyMessage) return { error: "Escribe el mensaje que se muestra cuando no hay eventos." };
  if (tooLong(events.emptyMessage, EVENTS_EMPTY_MESSAGE_MAX_LENGTH)) {
    return { error: `El mensaje admite hasta ${EVENTS_EMPTY_MESSAGE_MAX_LENGTH} caracteres.` };
  }
  if (events.emptyLinkUrl && (tooLong(events.emptyLinkUrl, EVENT_URL_MAX_LENGTH) || !isHttpsUrl(events.emptyLinkUrl))) {
    return { error: "El enlace del botón debe empezar con https://." };
  }
  return { events };
};

export type { EventsParseResult };
export { blankEvent, eventsSignature, parseEvents };
