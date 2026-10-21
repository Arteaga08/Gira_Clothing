import { AuditAction, AuditModule } from "@gira/shared";
import { describe, expect, it } from "vitest";
import { formatChangeValue } from "@/lib/audit/changes";
import {
  applyFilterPatch,
  buildAuditListQuery,
  parseAuditFilters,
  parseSelectedEntry,
  toSearchParams,
} from "@/lib/audit/filters";
import { ACTION_LABELS, MODULE_ACTIONS } from "@/lib/audit/labels";
import { auditTarget } from "@/lib/audit/target";

const ID = "68f2ab12c3d4e5f6a7b8caa1";

describe("filtros de Auditoría", () => {
  it("por defecto: equipo, 30 días, página 1, URL limpia", () => {
    const filters = parseAuditFilters({});
    expect(filters).toEqual({ actor: "team", period: 30, page: 1 });
    expect(toSearchParams(filters)).toBe("");
  });

  it("lee la URL en español y la traduce para el API", () => {
    const filters = parseAuditFilters({ quien: "admin", modulo: "pedidos", accion: "order_status_changed", periodo: "7", page: "2" });
    expect(filters).toEqual({
      actor: "admin",
      module: AuditModule.ORDERS,
      action: AuditAction.ORDER_STATUS_CHANGED,
      period: 7,
      page: 2,
    });
    const query = new URLSearchParams(buildAuditListQuery(filters));
    expect(Object.fromEntries(query)).toEqual({
      actor: "admin",
      module: "orders",
      action: "order_status_changed",
      days: "7",
      page: "2",
      limit: "25",
    });
    expect(toSearchParams(filters, ID)).toBe(
      `quien=admin&modulo=pedidos&accion=order_status_changed&periodo=7&page=2&registro=${ID}`,
    );
  });

  it("descarta valores desconocidos y una acción que no es del módulo", () => {
    expect(parseAuditFilters({ quien: "x", modulo: "y", periodo: "12", page: "-1" })).toEqual({
      actor: "team",
      period: 30,
      page: 1,
    });
    expect(parseAuditFilters({ modulo: "cupones", accion: "order_status_changed" })).toEqual({
      actor: "team",
      module: AuditModule.COUPONS,
      period: 30,
      page: 1,
    });
    expect(parseAuditFilters({ accion: "order_status_changed" })).not.toHaveProperty("action");
    expect(parseAuditFilters({ modulo: "carrito" })).not.toHaveProperty("module");
    expect(parseSelectedEntry({ registro: "no-id" })).toBeUndefined();
    expect(parseSelectedEntry({ registro: ID })).toBe(ID);
  });

  it("cambiar de módulo suelta la acción ajena y vuelve a la página 1", () => {
    const current = parseAuditFilters({ modulo: "pedidos", accion: "order_status_changed", page: "3" });
    expect(applyFilterPatch(current, { module: AuditModule.COUPONS })).toEqual({
      actor: "team",
      module: AuditModule.COUPONS,
      period: 30,
      page: 1,
    });
    expect(applyFilterPatch(current, { module: undefined })).toEqual({ actor: "team", period: 30, page: 1 });
    expect(applyFilterPatch(current, { page: 4 }).action).toBe(AuditAction.ORDER_STATUS_CHANGED);
  });
});

describe("etiquetas", () => {
  it("toda acción tiene nombre y pertenece a exactamente un módulo", () => {
    const listed = Object.values(MODULE_ACTIONS).flat();
    for (const action of Object.values(AuditAction)) {
      expect(ACTION_LABELS[action]).toBeTruthy();
      expect(listed.filter((candidate) => candidate === action)).toHaveLength(1);
    }
  });
});

describe("valores de un cambio", () => {
  it("usa etiquetas, dinero y porcentaje", () => {
    expect(formatChangeValue("status", "paid")).not.toBe("paid");
    expect(formatChangeValue("rateBps", 1600)).toBe("16 %");
    expect(formatChangeValue("freeShippingThreshold", null)).toBe("No se ofrece");
    expect(formatChangeValue("freeShippingThreshold", 150000)).toBe("$1,500.00");
    expect(formatChangeValue("onHand", 1200)).toBe("1,200");
    expect(formatChangeValue("supported", ["MXN", "USD"])).toBe("MXN, USD");
    expect(formatChangeValue("reason", "Conteo")).toBe("Conteo");
    expect(formatChangeValue("onHand", undefined)).toBe("—");
  });
});

describe("enlace al objetivo", () => {
  it("lleva a la pantalla del recurso cuando la hay", () => {
    expect(auditTarget({ module: AuditModule.PAYMENTS, action: AuditAction.PAYMENT_SUCCEEDED, targetId: ID })).toEqual({
      href: `/pedidos/${ID}`,
      label: "Ver pedido",
    });
    expect(auditTarget({ module: AuditModule.COUPONS, action: AuditAction.COUPON_CREATED, targetId: ID })?.href).toBe(
      `/cupones?cupon=${ID}`,
    );
    expect(auditTarget({ module: AuditModule.CATALOG, action: AuditAction.PRINT_UPDATED, targetId: ID })?.href).toBe(
      `/estampas?estampa=${ID}`,
    );
  });

  it("sin pantalla o sin id válido no hay enlace", () => {
    expect(auditTarget({ module: AuditModule.SETTINGS, action: AuditAction.SETTINGS_TAX_UPDATED, targetId: ID })).toBeNull();
    expect(auditTarget({ module: AuditModule.CATALOG, action: AuditAction.IMAGE_UPLOADED, targetId: "gira/prints/x" })).toBeNull();
    expect(auditTarget({ module: AuditModule.ORDERS, action: AuditAction.ORDER_CREATED })).toBeNull();
  });
});
