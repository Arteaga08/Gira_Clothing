import type { AuditAction, AuditModule } from "../enums/auditAction.js";

interface AuditLogEntry {
  id: string;
  actorId?: string;
  actorType: "user" | "system";
  action: AuditAction;
  module: AuditModule;
  targetId?: string;
  before?: unknown;
  after?: unknown;
  ip?: string;
  createdAt: Date;
}

export type { AuditLogEntry };
