/**
 * The login merges the browser cart into the account cart and then navigates away client-side. The
 * store layout, where the notice lives, stays mounted across that navigation, so the count of lines
 * the API refused for good travels as a window event instead of storage: nothing persists, a reload
 * never repeats the notice, and blocked storage cannot matter.
 */

const DROPPED_EVENT = "gira:cart-lines-dropped";

const announceDroppedLines = (count: number): void => {
  if (!Number.isInteger(count) || count <= 0) return;
  window.dispatchEvent(new CustomEvent<number>(DROPPED_EVENT, { detail: count }));
};

/** Subscribes to the announcement; returns the unsubscribe function. */
const onDroppedLines = (listener: (count: number) => void): (() => void) => {
  const handler = (event: Event) => {
    const count = (event as CustomEvent<number>).detail;
    if (Number.isInteger(count) && count > 0) listener(count);
  };
  window.addEventListener(DROPPED_EVENT, handler);
  return () => window.removeEventListener(DROPPED_EVENT, handler);
};

const droppedLinesMessage = (count: number): string =>
  count === 1
    ? "Quitamos 1 producto de tu carrito porque ya no está disponible."
    : `Quitamos ${String(count)} productos de tu carrito porque ya no están disponibles.`;

export { announceDroppedLines, onDroppedLines, droppedLinesMessage };
