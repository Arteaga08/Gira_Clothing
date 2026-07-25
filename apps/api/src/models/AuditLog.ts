import { Schema, model, type Model, type Types } from "mongoose";
import { AuditAction, AuditModule } from "@gira/shared";

/**
 * Append-only audit trail (BACKEND_SECURITY_GUIDELINES §10). Records only
 * create — the app never updates or deletes entries.
 *
 * NEVER store PII or secrets in `before`/`after` (no passwords, tokens, 2FA
 * secrets, emails). Store non-sensitive identifiers only.
 */

interface AuditLogAttrs {
  actorId?: Types.ObjectId;
  actorType: "user" | "system";
  action: AuditAction;
  module: AuditModule;
  targetId?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  ip?: string;
  createdAt: Date;
}

type AuditLogModel = Model<AuditLogAttrs>;

const auditLogSchema = new Schema<AuditLogAttrs, AuditLogModel>(
  {
    actorId: { type: Schema.Types.ObjectId, ref: "User", index: true },
    actorType: { type: String, enum: ["user", "system"], required: true },
    action: { type: String, enum: Object.values(AuditAction), required: true },
    module: { type: String, enum: Object.values(AuditModule), required: true, index: true },
    targetId: { type: String },
    before: { type: Schema.Types.Mixed },
    after: { type: Schema.Types.Mixed },
    ip: { type: String },
  },
  {
    // Only createdAt — entries are immutable, so updatedAt is meaningless.
    timestamps: { createdAt: true, updatedAt: false },
  },
);

const AuditLog = model<AuditLogAttrs, AuditLogModel>("AuditLog", auditLogSchema);

export type { AuditLogAttrs };
export { AuditLog };
