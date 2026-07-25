import type { Types } from "mongoose";
import type { AuditAction, AuditModule } from "@gira/shared";
import { AuditLog } from "../models/AuditLog.js";
import { logger } from "../config/logger.js";

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

export type { AuditEntry };
export { recordAudit };
