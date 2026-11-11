import type { ShippingAddress, ShippingQuoteRef } from "@gira/shared";

/** The slice of `Storage` the key needs; injected so it can be tested and so a blocked storage degrades. */
interface KeyStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface FingerprintInput {
  lines: { variantId: string; qty: number }[];
  address: ShippingAddress;
  phone: string;
  quote: ShippingQuoteRef;
  couponCode?: string | undefined;
}

interface ResolveOptions {
  storage?: KeyStorage | null;
  makeKey?: () => string;
  now?: () => number;
}

interface StoredKey {
  fingerprint: string;
  key: string;
  at: number;
}

const STORAGE_KEY = "gira:checkout-key:v1";

/** Same window as the stock reservation: past it the order the key points to has expired anyway. */
const CHECKOUT_KEY_MAX_AGE_MS = 30 * 60 * 1000;

const browserStorage = (): KeyStorage | null => {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
};

/**
 * Everything the order is built from. If any of it changes the order would be a different one, so the
 * key must change too; if none does, a retry must reuse the key (the API then replays the same order).
 */
const checkoutFingerprint = ({ lines, address, phone, quote, couponCode }: FingerprintInput): string => {
  const cart = [...lines]
    .sort((a, b) => a.variantId.localeCompare(b.variantId))
    .map((l) => `${l.variantId}:${l.qty}`)
    .join(",");
  const to = [
    address.recipient,
    address.line1,
    address.line2 ?? "",
    address.district,
    address.city,
    address.state,
    address.postalCode,
    address.country,
    phone,
  ].join("|");
  return [cart, to, `${quote.quoteId}#${quote.rateId}`, (couponCode ?? "").trim().toUpperCase()].join("#");
};

const isStoredKey = (value: unknown): value is StoredKey =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as StoredKey).fingerprint === "string" &&
  typeof (value as StoredKey).key === "string" &&
  typeof (value as StoredKey).at === "number";

const readStored = (storage: KeyStorage): StoredKey | null => {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    return isStoredKey(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

/** The `Idempotency-Key` for this exact checkout: reused while the fingerprint holds and the key is fresh. */
const resolveCheckoutKey = (fingerprint: string, options: ResolveOptions = {}): string => {
  const storage = options.storage === undefined ? browserStorage() : options.storage;
  const makeKey = options.makeKey ?? (() => crypto.randomUUID());
  const now = options.now ?? Date.now;

  const stored = storage ? readStored(storage) : null;
  if (stored && stored.fingerprint === fingerprint && now() - stored.at < CHECKOUT_KEY_MAX_AGE_MS) {
    return stored.key;
  }

  const key = makeKey();
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify({ fingerprint, key, at: now() } satisfies StoredKey));
  } catch {
    // Blocked storage: the key still works for this attempt, it just won't survive a reload.
  }
  return key;
};

/** Called once the checkout is over (paid, or definitively refused): the next purchase starts a new key. */
const forgetCheckoutKey = (storage: KeyStorage | null = browserStorage()): void => {
  try {
    storage?.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to forget if storage is blocked.
  }
};

export type { KeyStorage, FingerprintInput };
export { checkoutFingerprint, resolveCheckoutKey, forgetCheckoutKey, CHECKOUT_KEY_MAX_AGE_MS };
