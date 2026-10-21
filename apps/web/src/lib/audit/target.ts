import { AuditAction, AuditModule, type AuditLogEntry, type Wire } from "@gira/shared";
import { isObjectId } from "@/lib/inventory/variantId";

interface AuditTarget {
  href: string;
  label: string;
}

/** Catalog actions point at different screens depending on what they touched. */
const CATALOG_TARGETS: Partial<Record<AuditAction, (id: string) => AuditTarget>> = {
  [AuditAction.PRODUCT_CREATED]: (id) => ({ href: `/productos/${id}`, label: "Ver producto" }),
  [AuditAction.PRODUCT_UPDATED]: (id) => ({ href: `/productos/${id}`, label: "Ver producto" }),
  [AuditAction.PRODUCT_DEACTIVATED]: (id) => ({ href: `/productos/${id}`, label: "Ver producto" }),
  [AuditAction.PRINT_CREATED]: (id) => ({ href: `/estampas?estampa=${id}`, label: "Ver estampa" }),
  [AuditAction.PRINT_UPDATED]: (id) => ({ href: `/estampas?estampa=${id}`, label: "Ver estampa" }),
  [AuditAction.PRINT_DEACTIVATED]: (id) => ({ href: `/estampas?estampa=${id}`, label: "Ver estampa" }),
  [AuditAction.PRINT_FAMILY_CREATED]: (id) => ({ href: `/familias?familia=${id}`, label: "Ver familia" }),
  [AuditAction.PRINT_FAMILY_UPDATED]: (id) => ({ href: `/familias?familia=${id}`, label: "Ver familia" }),
  [AuditAction.PRINT_FAMILY_DEACTIVATED]: (id) => ({ href: `/familias?familia=${id}`, label: "Ver familia" }),
  [AuditAction.PRODUCT_CATEGORY_CREATED]: (id) => ({ href: `/categorias?categoria=${id}`, label: "Ver categoría" }),
  [AuditAction.PRODUCT_CATEGORY_UPDATED]: (id) => ({ href: `/categorias?categoria=${id}`, label: "Ver categoría" }),
  [AuditAction.PRODUCT_CATEGORY_DEACTIVATED]: (id) => ({ href: `/categorias?categoria=${id}`, label: "Ver categoría" }),
};

const ORDER_MODULES = new Set<AuditModule>([AuditModule.ORDERS, AuditModule.PAYMENTS, AuditModule.SHIPPING]);

/**
 * Where the entry's target lives in the panel, when it has a screen. Only ids
 * that look like ids become links: a target can also be an upload's public id
 * or a free string from an old writer.
 */
const auditTarget = (entry: Pick<Wire<AuditLogEntry>, "action" | "module" | "targetId">): AuditTarget | null => {
  const id = entry.targetId;
  if (!id || !isObjectId(id)) return null;
  if (ORDER_MODULES.has(entry.module)) return { href: `/pedidos/${id}`, label: "Ver pedido" };
  if (entry.module === AuditModule.COUPONS) return { href: `/cupones?cupon=${id}`, label: "Ver cupón" };
  if (entry.module === AuditModule.CATALOG) return CATALOG_TARGETS[entry.action]?.(id) ?? null;
  return null;
};

export type { AuditTarget };
export { auditTarget };
