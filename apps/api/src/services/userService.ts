import type { ApiMeta, AdminUser } from "@gira/shared";
import { UserRole } from "@gira/shared";
import { User } from "../models/User.js";
import {
  parseListQuery,
  buildMeta,
  type ListQueryConfig,
  type RawListQuery,
} from "../utils/parseListQuery.js";

/**
 * Read-only listing. Deliberately outside authService.ts — that file
 * authenticates; this one lists a resource. No GET /:id: the customer drawer
 * in the dashboard links to GET /admin/orders?search=<email> instead, which
 * already resolves "see this customer's orders" without a second endpoint.
 */

interface UserLean {
  _id: unknown;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  twoFactor: { enabled: boolean };
  createdAt: Date;
}

const toAdminUser = (doc: UserLean): AdminUser => ({
  id: String(doc._id),
  name: doc.name,
  email: doc.email,
  role: doc.role,
  isActive: doc.isActive,
  twoFactorEnabled: doc.twoFactor?.enabled ?? false,
  createdAt: doc.createdAt,
});

const LIST_CONFIG: ListQueryConfig = {
  sortable: ["createdAt", "name", "email"],
  searchable: ["name", "email"],
  defaultSort: "-createdAt",
};

interface UserListQuery extends RawListQuery {
  role?: UserRole;
  isActive?: boolean;
}

const listUsers = async (
  query: UserListQuery,
): Promise<{ items: AdminUser[]; meta: ApiMeta }> => {
  const filters: Record<string, unknown> = {};
  if (query.role) filters.role = query.role;
  if (query.isActive !== undefined) filters.isActive = query.isActive;

  const { filter, sort, skip, limit, page } = parseListQuery(query, LIST_CONFIG, filters);
  const [docs, total] = await Promise.all([
    User.find(filter).sort(sort).skip(skip).limit(limit).lean(),
    User.countDocuments(filter),
  ]);

  return {
    items: (docs as unknown as UserLean[]).map(toAdminUser),
    meta: buildMeta(total, { page, limit }),
  };
};

export { listUsers };
