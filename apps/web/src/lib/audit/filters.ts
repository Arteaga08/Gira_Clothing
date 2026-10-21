import { AuditAction, AuditModule, type AuditActorFilter } from "@gira/shared";
import { isObjectId } from "@/lib/inventory/variantId";
import { MODULE_ACTIONS } from "./labels";

/**
 * Filters of the Auditoría screen. Keys and words are Spanish in the page URL
 * (`quien`, `modulo`, `accion`, `periodo`, `registro`); the API keeps its own
 * English names. `accion` carries the action's stable id: there are ~80 and
 * they only show up after a module narrows the list.
 */

const PERIODS = [7, 30, 90, 365] as const;
type AuditPeriod = (typeof PERIODS)[number];
const DEFAULT_PERIOD: AuditPeriod = 30;
const DEFAULT_ACTOR: AuditActorFilter = "team";
const DEFAULT_LIMIT = 25;
/** The URL key of the open entry (`?registro=<id>`). */
const ENTRY_PARAM = "registro";

const ACTOR_TO_URL: Readonly<Record<AuditActorFilter, string>> = {
  team: "equipo",
  admin: "admin",
  system: "sistema",
  customer: "clientes",
  all: "todos",
};
const URL_TO_ACTOR: Readonly<Record<string, AuditActorFilter>> = Object.fromEntries(
  Object.entries(ACTOR_TO_URL).map(([actor, word]) => [word, actor as AuditActorFilter]),
);

const MODULE_TO_URL: Readonly<Record<AuditModule, string>> = {
  [AuditModule.AUTH]: "acceso",
  [AuditModule.CATALOG]: "catalogo",
  [AuditModule.INVENTORY]: "inventario",
  [AuditModule.SETTINGS]: "ajustes",
  [AuditModule.CART]: "carrito",
  [AuditModule.ORDERS]: "pedidos",
  [AuditModule.PAYMENTS]: "pagos",
  [AuditModule.SHIPPING]: "envios",
  [AuditModule.NOTIFICATIONS]: "notificaciones",
  [AuditModule.COUPONS]: "cupones",
};
const URL_TO_MODULE: Readonly<Record<string, AuditModule>> = Object.fromEntries(
  Object.entries(MODULE_TO_URL).map(([module, word]) => [word, module as AuditModule]),
);

interface AuditFilters {
  actor: AuditActorFilter;
  module?: AuditModule;
  /** Only ever set together with `module`, and only to one of that module's actions. */
  action?: AuditAction;
  period: AuditPeriod;
  page: number;
}

/** A change to the filters: `module: undefined` clears the module (and with it the action). */
interface AuditFilterPatch {
  actor?: AuditActorFilter;
  module?: AuditModule | undefined;
  action?: AuditAction | undefined;
  period?: AuditPeriod;
  page?: number;
}

type RawParams = Record<string, string | string[] | undefined>;

const firstOf = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

const belongsTo = (auditModule: AuditModule | undefined, action: string | undefined): action is AuditAction =>
  auditModule !== undefined && action !== undefined && (MODULE_ACTIONS[auditModule] as readonly string[]).includes(action);

const parseAuditFilters = (params: RawParams): AuditFilters => {
  const named = URL_TO_MODULE[firstOf(params.modulo) ?? ""];
  // A module nothing writes to yet (cart) is not offered in the filter, so it is not accepted from the URL either.
  const auditModule = named && MODULE_ACTIONS[named].length > 0 ? named : undefined;
  const action = firstOf(params.accion);
  const period = Number(firstOf(params.periodo));
  const page = Number(firstOf(params.page));

  const filters: AuditFilters = {
    actor: URL_TO_ACTOR[firstOf(params.quien) ?? ""] ?? DEFAULT_ACTOR,
    period: (PERIODS as readonly number[]).includes(period) ? (period as AuditPeriod) : DEFAULT_PERIOD,
    page: Number.isInteger(page) && page >= 1 ? page : 1,
  };
  if (auditModule) filters.module = auditModule;
  if (belongsTo(auditModule, action)) filters.action = action;
  return filters;
};

const parseSelectedEntry = (params: RawParams): string | undefined => {
  const raw = firstOf(params[ENTRY_PARAM]);
  return raw && isObjectId(raw) ? raw : undefined;
};

/** Query string for GET /admin/audit-logs. */
const buildAuditListQuery = (filters: AuditFilters, limit: number = DEFAULT_LIMIT): string => {
  const query = new URLSearchParams();
  query.set("actor", filters.actor);
  if (filters.module) query.set("module", filters.module);
  if (filters.action) query.set("action", filters.action);
  query.set("days", String(filters.period));
  query.set("page", String(filters.page));
  query.set("limit", String(limit));
  return query.toString();
};

/** Page URL params: defaults are omitted so a fresh visit has a clean URL. */
const toSearchParams = (filters: AuditFilters, selected?: string): string => {
  const params = new URLSearchParams();
  if (filters.actor !== DEFAULT_ACTOR) params.set("quien", ACTOR_TO_URL[filters.actor]);
  if (filters.module) params.set("modulo", MODULE_TO_URL[filters.module]);
  if (filters.action) params.set("accion", filters.action);
  if (filters.period !== DEFAULT_PERIOD) params.set("periodo", String(filters.period));
  if (filters.page !== 1) params.set("page", String(filters.page));
  if (selected) params.set(ENTRY_PARAM, selected);
  return params.toString();
};

/** Any change other than the page goes back to page 1; a new module drops an action that is not one of its own. */
const applyFilterPatch = (current: AuditFilters, patch: AuditFilterPatch): AuditFilters => {
  const auditModule = "module" in patch ? patch.module : current.module;
  const action = "action" in patch ? patch.action : current.action;
  const merged: AuditFilters = {
    actor: patch.actor ?? current.actor,
    period: patch.period ?? current.period,
    page: patch.page ?? 1,
  };
  if (auditModule) merged.module = auditModule;
  if (belongsTo(auditModule, action)) merged.action = action;
  return merged;
};

/** True when something narrows the list beyond the defaults: the empty state's wording depends on it. */
const hasActiveFilters = (filters: AuditFilters): boolean =>
  filters.actor !== DEFAULT_ACTOR || Boolean(filters.module) || filters.period !== DEFAULT_PERIOD;

export {
  PERIODS,
  DEFAULT_PERIOD,
  DEFAULT_ACTOR,
  ENTRY_PARAM,
  parseAuditFilters,
  parseSelectedEntry,
  buildAuditListQuery,
  toSearchParams,
  applyFilterPatch,
  hasActiveFilters,
};
export type { AuditFilters, AuditFilterPatch, AuditPeriod };
