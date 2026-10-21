import type { Types } from "mongoose";
import { UserRole } from "@gira/shared";
import type {
  AuditAction,
  AuditActor,
  AuditActorFilter,
  AuditLogEntry,
  AuditModule,
  ApiMeta,
} from "@gira/shared";
import { AuditLog, type AuditLogAttrs } from "../models/AuditLog.js";
import { User } from "../models/User.js";
import { AppError } from "../utils/AppError.js";
import { buildAuditChanges } from "../utils/auditChanges.js";
import { logger } from "../config/logger.js";
import { parseListQuery, buildMeta, type ListQueryConfig, type RawListQuery } from "../utils/parseListQuery.js";
import { parseStatsRange } from "../utils/parseStatsRange.js";

/**
 * Append-only audit recorder (BACKEND_SECURITY_GUIDELINES §10). Best-effort:
 * a failure is logged but NEVER propagates — it must not roll back or block the
 * operation being audited. Never pass PII or secrets in before/after.
 */

interface AuditEntry {
  actorId?: Types.ObjectId | undefined;
  actorType: "user" | "system";
  action: AuditAction;
  module: AuditModule;
  targetId?: string | undefined;
  before?: Record<string, unknown> | undefined;
  after?: Record<string, unknown> | undefined;
  ip?: string | undefined;
}

const recordAudit = async (entry: AuditEntry): Promise<void> => {
  try {
    await AuditLog.create(entry);
  } catch (err) {
    logger.error({ err, action: entry.action }, "No se pudo registrar auditoría");
  }
};

/**
 * Read side of the audit trail. Append-only stays append-only: this module
 * exposes create + read, and NOTHING that updates or deletes an entry.
 *
 * The panel DTO is deliberately narrower than what is stored: no IP, no actor
 * id (the actor is resolved to a role), and before/after only through the
 * whitelist in `buildAuditChanges` — stored snapshots are free-form, so the
 * read side does not trust every writer to have kept PII out.
 */

const LIST_CONFIG: ListQueryConfig = {
  sortable: ["createdAt", "action", "module"],
  searchable: ["targetId"],
  defaultSort: "-createdAt",
};

interface AuditLogListQuery extends RawListQuery {
  module?: AuditModule;
  action?: AuditAction;
  actorId?: string;
  actor?: AuditActorFilter;
  days?: unknown;
}

type StoredLog = AuditLogAttrs & { _id: Types.ObjectId };

/** Admins are a handful of accounts, so filtering by role is an `$in` over their ids. */
const adminIds = async (): Promise<Types.ObjectId[]> =>
  User.find({ role: UserRole.ADMIN }).distinct("_id");

const actorFilter = async (actor: AuditActorFilter): Promise<Record<string, unknown> | null> => {
  if (actor === "all") return null;
  if (actor === "system") return { actorType: "system" };
  const admins = await adminIds();
  if (actor === "admin") return { actorType: "user", actorId: { $in: admins } };
  // `$nin` also matches a missing actorId: unknown actors (login with no account) count as customers.
  if (actor === "customer") return { actorType: "user", actorId: { $nin: admins } };
  return { $or: [{ actorType: "system" }, { actorType: "user", actorId: { $in: admins } }] };
};

/** One query for the whole page: actor id → role. */
const resolveRoles = async (docs: StoredLog[]): Promise<Map<string, string>> => {
  const ids = [...new Set(docs.flatMap((doc) => (doc.actorId ? [String(doc.actorId)] : [])))];
  if (ids.length === 0) return new Map();
  const users = await User.find({ _id: { $in: ids } }, { role: 1 }).lean();
  return new Map(users.map((user) => [String(user._id), user.role]));
};

const actorOf = (doc: StoredLog, roles: Map<string, string>): AuditActor => {
  if (doc.actorType === "system") return "system";
  const role = doc.actorId ? roles.get(String(doc.actorId)) : undefined;
  if (role === UserRole.ADMIN) return "admin";
  if (role === UserRole.CUSTOMER) return "customer";
  return "unknown";
};

const toAuditLogEntry = (doc: StoredLog, roles: Map<string, string>): AuditLogEntry => ({
  id: String(doc._id),
  actor: actorOf(doc, roles),
  action: doc.action,
  module: doc.module,
  ...(doc.targetId ? { targetId: doc.targetId } : {}),
  changes: buildAuditChanges(doc.action, doc.before, doc.after),
  createdAt: doc.createdAt,
});

const listAuditLogs = async (
  query: AuditLogListQuery,
): Promise<{ items: AuditLogEntry[]; meta: ApiMeta }> => {
  const filters: Record<string, unknown> = {};
  if (query.module) filters.module = query.module;
  if (query.action) filters.action = query.action;
  if (query.actorId) filters.actorId = query.actorId;
  if (query.days !== undefined) {
    const { from } = parseStatsRange({ days: query.days }, 30);
    filters.createdAt = { $gte: from };
  }
  // Under $and: the free-text search below owns the top-level $or.
  const byActor = query.actor ? await actorFilter(query.actor) : null;
  if (byActor) filters.$and = [byActor];

  const { filter, sort, skip, limit, page } = parseListQuery(query, LIST_CONFIG, filters);
  const [docs, total] = await Promise.all([
    AuditLog.find(filter).sort(sort).skip(skip).limit(limit).lean<StoredLog[]>(),
    AuditLog.countDocuments(filter),
  ]);
  const roles = await resolveRoles(docs);

  return {
    items: docs.map((doc) => toAuditLogEntry(doc, roles)),
    meta: buildMeta(total, { page, limit }),
  };
};

const getAuditLog = async (id: string): Promise<AuditLogEntry> => {
  const doc = await AuditLog.findById(id).lean<StoredLog>();
  if (!doc) throw new AppError("El registro de auditoría no existe.", 404);
  return toAuditLogEntry(doc, await resolveRoles([doc]));
};

export type { AuditEntry, AuditLogListQuery };
export { recordAudit, listAuditLogs, getAuditLog };
