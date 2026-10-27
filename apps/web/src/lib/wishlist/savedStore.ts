import { fetchSavedIds, saveVariant, unsaveVariant } from "@/lib/api/wishlist";

/**
 * The saved variant ids of the signed-in customer, shared by every heart on
 * the page. Loaded once on first use; each toggle is optimistic and rolls back
 * if the API refuses. Module-level on purpose: a card in the home and the
 * product page must agree without a provider around the whole store.
 */

type Listener = () => void;

const EMPTY: ReadonlySet<string> = new Set();
let saved: ReadonlySet<string> = EMPTY;
let loading: Promise<void> | null = null;
const listeners = new Set<Listener>();

const emit = (): void => {
  for (const listener of listeners) listener();
};

const replace = (next: ReadonlySet<string>): void => {
  saved = next;
  emit();
};

const subscribe = (listener: Listener): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const getSnapshot = (): ReadonlySet<string> => saved;
const getServerSnapshot = (): ReadonlySet<string> => EMPTY;

/** Fetches the ids once; a failure leaves the hearts empty and lets the next heart retry. */
const ensureLoaded = (): void => {
  if (loading) return;
  loading = fetchSavedIds()
    .then((ids) => replace(new Set([...saved, ...ids])))
    .catch(() => {
      loading = null;
    });
};

/** Flips one variant. Resolves with the API's message when it refused, otherwise null. */
const toggleSaved = async (variantId: string, message: (failure: unknown) => string): Promise<string | null> => {
  const wasSaved = saved.has(variantId);
  const next = new Set(saved);
  if (wasSaved) next.delete(variantId);
  else next.add(variantId);
  replace(next);
  try {
    await (wasSaved ? unsaveVariant(variantId) : saveVariant(variantId));
    return null;
  } catch (failure) {
    const rollback = new Set(saved);
    if (wasSaved) rollback.add(variantId);
    else rollback.delete(variantId);
    replace(rollback);
    return message(failure);
  }
};

/** Forgets a variant locally (the «Guardados» screen removes it itself). */
const forgetSaved = (variantId: string): void => {
  if (!saved.has(variantId)) return;
  const next = new Set(saved);
  next.delete(variantId);
  replace(next);
};

export { subscribe, getSnapshot, getServerSnapshot, ensureLoaded, toggleSaved, forgetSaved };
