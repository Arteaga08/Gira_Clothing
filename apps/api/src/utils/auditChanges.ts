import { isDeepStrictEqual } from "node:util";
import { AuditAction, type AuditChange } from "@gira/shared";

/**
 * Turns an entry's stored before/after into the list the panel shows. It is a
 * WHITELIST on purpose: `before`/`after` are free-form (Mixed), and a key added
 * by a future writer must stay hidden until someone decides it is safe to show.
 */

/** Scalar fields shown as before → after. */
const PLAIN_FIELDS = new Set([
  "status",
  "priority",
  "onHand",
  "rateBps",
  "tracking",
  "disputeStatus",
  "freeShippingThreshold",
  "quoteTtlMinutes",
  "mxnPerUsdCents",
  "rounding",
  "supported",
  "ttlMinutes",
  "cartInactivityDays",
  "lowStockThreshold",
]);

/** Objects of plain numbers, flattened to `parent.child`. */
const NESTED_FIELDS = new Set(["parcel"]);

/** Fields that may carry PII: only "it changed" is shown, never the values. */
const REDACTED_FIELDS = new Set(["origin"]);

/** `reason` is the operator's own note only on stock moves; elsewhere it can echo provider text. */
const REASON_ACTIONS = new Set<AuditAction>([AuditAction.STOCK_SET, AuditAction.STOCK_ADJUSTED]);

type Snapshot = Record<string, unknown> | undefined;

const isShowable = (value: unknown): boolean => {
  const scalar = (v: unknown) =>
    v === null || typeof v === "string" || typeof v === "number" || typeof v === "boolean";
  return scalar(value) || (Array.isArray(value) && value.every(scalar));
};

const has = (snapshot: Snapshot, key: string): boolean =>
  snapshot !== undefined && Object.hasOwn(snapshot, key);

const asObject = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

/** Union of keys, before's order first, so the list reads in the writer's order. */
const keysOf = (before: Snapshot, after: Snapshot): string[] => [
  ...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]),
];

const valueChange = (
  field: string,
  key: string,
  before: Snapshot,
  after: Snapshot,
): AuditChange | null => {
  const hasBefore = has(before, key);
  const hasAfter = has(after, key);
  const from = before?.[key];
  const to = after?.[key];
  if (hasBefore && hasAfter && isDeepStrictEqual(from, to)) return null;
  if ((hasBefore && !isShowable(from)) || (hasAfter && !isShowable(to))) return null;
  return { field, ...(hasBefore ? { before: from } : {}), ...(hasAfter ? { after: to } : {}) };
};

const buildAuditChanges = (action: AuditAction, before: Snapshot, after: Snapshot): AuditChange[] => {
  const changes: AuditChange[] = [];

  for (const key of keysOf(before, after)) {
    if (REDACTED_FIELDS.has(key)) {
      if (!isDeepStrictEqual(before?.[key], after?.[key])) changes.push({ field: key, redacted: true });
    } else if (NESTED_FIELDS.has(key)) {
      const from = asObject(before?.[key]);
      const to = asObject(after?.[key]);
      for (const child of keysOf(from, to)) {
        const change = valueChange(`${key}.${child}`, child, from, to);
        if (change) changes.push(change);
      }
    } else if (PLAIN_FIELDS.has(key) || (key === "reason" && REASON_ACTIONS.has(action))) {
      const change = valueChange(key, key, before, after);
      if (change) changes.push(change);
    }
  }

  return changes;
};

export { buildAuditChanges };
