import type { AuditAction, AuditModule } from "../enums/auditAction.js";

/** Who did it, resolved by role: the audit read side never exposes the actor's id, name or email. */
type AuditActor = "admin" | "system" | "customer" | "unknown";

/** `team` = admins + system, the panel's default view (hides customer activity). */
const AUDIT_ACTOR_FILTERS = ["team", "admin", "system", "customer", "all"] as const;
type AuditActorFilter = (typeof AUDIT_ACTOR_FILTERS)[number];

/**
 * One whitelisted field of an entry's before/after. `redacted` marks a field
 * that changed but whose values may carry PII (e.g. the shipping origin).
 */
interface AuditChange {
  field: string;
  before?: unknown;
  after?: unknown;
  redacted?: boolean;
}

interface AuditLogEntry {
  id: string;
  actor: AuditActor;
  action: AuditAction;
  module: AuditModule;
  targetId?: string;
  changes: AuditChange[];
  createdAt: Date;
}

export type { AuditActor, AuditActorFilter, AuditChange, AuditLogEntry };
export { AUDIT_ACTOR_FILTERS };
