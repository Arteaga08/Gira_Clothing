import type { ApiMeta, AuditLogEntry, Wire } from "@gira/shared";
import { isObjectId } from "@/lib/inventory/variantId";
import { ApiError } from "./ApiError";
import { browserRequest } from "./browser";
import { ADMIN_AUDIT_LOGS_PATH } from "./paths";
import { expectData } from "./request";

/** Browser-side, read-only client for /admin/audit-logs: the trail has no write route at all. */

type PanelAuditLog = Wire<AuditLogEntry>;

interface AuditClient {
  list: (query: string) => Promise<{ items: PanelAuditLog[]; meta: ApiMeta }>;
  get: (id: string) => Promise<PanelAuditLog>;
}

const auditClient: AuditClient = {
  list: async (query) => {
    const result = await browserRequest<{ logs: AuditLogEntry[] }>(`${ADMIN_AUDIT_LOGS_PATH}?${query}`);
    const logs = expectData(result).logs ?? [];
    return { items: logs, meta: result.meta ?? { total: logs.length, page: 1, pages: 1, limit: logs.length } };
  },
  get: async (id) => {
    // A manipulated URL never reaches the API: it fails here, before any request.
    if (!isObjectId(id)) throw new ApiError("El identificador del registro no es válido.", "parse");
    return expectData(await browserRequest<{ log: AuditLogEntry }>(`${ADMIN_AUDIT_LOGS_PATH}/${id}`)).log;
  },
};

export type { AuditClient, PanelAuditLog };
export { auditClient };
