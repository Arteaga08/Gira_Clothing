# M9a — Pedidos: backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dejar el modelo de orden y el API admin de pedidos listos para el panel (M9b): folio legible, IVA desglosado, pago con tarjeta/fecha de cobro, prioridad, resumen por grupos, filtros, actividad por orden, corrección de dirección y cambio masivo.

**Architecture:** Cambios aditivos sobre `Order`, `pricingService`, `adminOrderService` y el adapter de pagos. Los DTOs y los grupos de estado viven en `packages/shared` (fuente única para API y panel). Todo cambio de `status` sigue pasando por `applyOrderTransition`. Sin migración: no hay órdenes reales, los campos nuevos nacen `required`.

**Tech Stack:** Node/Express 5, Mongoose, Joi, Stripe SDK, Vitest + supertest + MongoMemoryReplSet, pnpm monorepo (`@gira/shared` se consume desde `dist`).

Rama: `fix/m9a-orders-backend` (desde `main`, ya creada). **Nadie ejecuta `git add/commit/push`**: los pasos "Checkpoint" solo corren tests y muestran `git status`; el commit lo hace Manuel.

---

## Reglas de ejecución (leer antes de la Tarea 1)

- **`@gira/shared` se importa desde `dist`.** Después de tocar `packages/shared/src/**` corre `pnpm --filter @gira/shared build` antes de correr tests o `tsc` del API.
- **Comandos de verificación:**
  - Un archivo: `pnpm --filter @gira/api exec vitest run tests/<ruta> `
  - Tipos: `pnpm -r exec tsc --noEmit`
  - Lint: `pnpm exec eslint apps packages`
- **Flake conocido:** si la suite completa falla 1-2 tests en archivos no relacionados (`socket hang up`, `undefined` río abajo), re-correr ese archivo aislado antes de investigar.
- **Nunca** correr scripts del API sin revisar a qué base apuntan (`.env.development.local` apunta a Atlas). Esta rama no necesita correr ninguno.
- **Dinero:** enteros en unidades menores. Los campos nuevos no llevan sufijo `Cents` (convención del modelo): `discount`, `tax`, `taxRateBps`.

## Mapa de archivos

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `packages/shared/src/constants/order.ts` | modificar | `ORDER_NUMBER_*`, `DEFAULT_TAX_RATE_BPS`, límites de motivo y lote |
| `packages/shared/src/enums/orderPriority.ts` | crear | `OrderPriority` |
| `packages/shared/src/constants/orderStatusGroups.ts` | crear | grupos de operador, `matchStatusGroup` |
| `packages/shared/src/labels/orderStatus.ts` | modificar | etiquetas de prioridad y de grupo |
| `packages/shared/src/types/order.ts` | modificar | DTOs `PublicOrder`/`AdminOrder`, `OrderSummary`, `OrderActivityEntry`, `BulkStatusResult` |
| `packages/shared/src/enums/auditAction.ts` | modificar | `ORDER_PRIORITY_UPDATED`, `ORDER_SHIPPING_ADDRESS_UPDATED` |
| `packages/shared/src/index.ts` | modificar | exportar lo nuevo |
| `apps/api/src/utils/orderNumber.ts` | crear | `generateOrderNumber()` |
| `apps/api/src/utils/orderTax.ts` | crear | `splitTax()` (aritmética pura) |
| `apps/api/src/models/Order.ts` | modificar | campos e índices nuevos |
| `apps/api/src/models/Settings.ts` | modificar | sección `tax.rateBps` |
| `apps/api/src/models/AuditLog.ts` | modificar | índice `{targetId, createdAt}` |
| `apps/api/src/services/pricingService.ts` | modificar | `discount`, `taxRateBps`, `tax` en `Quote` |
| `apps/api/src/services/orderService.ts` | modificar | folio con reintento, tax, terms, mapper público |
| `apps/api/src/services/adminOrderService.ts` | modificar | mapper admin, summary, filtros, actividad, dirección, prioridad, bulk |
| `apps/api/src/services/orderPaymentService.ts` | modificar | `capturedAt` + `card`; `targetId` = `_id`; payloads con folio |
| `apps/api/src/adapters/payment/{types,stripePaymentProvider,stubPaymentProvider}.ts` | modificar | `getChargeDetails` |
| `apps/api/src/validators/{orderValidator,adminOrderValidator}.ts` | modificar | `termsAccepted`, filtros, esquemas nuevos |
| `apps/api/src/routes/v1/admin/adminOrderRoutes.ts` | modificar | rutas nuevas |
| `apps/api/src/controllers/adminOrderController.ts` | modificar | controladores nuevos |
| `apps/api/src/templates/{teamMessages,orderEmails}.ts`, `jobs/dispatchNotifications.ts` | modificar | folio visible = `orderNumber` |
| `apps/api/tests/helpers/seedOrder.ts` + 3 tests con `Order.create` | modificar | campos requeridos nuevos |

---

## Task 1: Constantes, enums y grupos en `@gira/shared`

**Files:**
- Modify: `packages/shared/src/constants/order.ts`
- Create: `packages/shared/src/enums/orderPriority.ts`, `packages/shared/src/constants/orderStatusGroups.ts`
- Modify: `packages/shared/src/labels/orderStatus.ts`, `packages/shared/src/enums/auditAction.ts`, `packages/shared/src/index.ts`
- Test: `apps/api/tests/unit/orderStatusGroups.test.ts`

- [ ] **Step 1: Escribir el test rojo**

```ts
// apps/api/tests/unit/orderStatusGroups.test.ts
import { describe, it, expect } from "vitest";
import {
  OrderStatus,
  ORDER_STATUS_GROUPS,
  ORDER_STATUS_TO_GROUP,
  matchStatusGroup,
  ORDER_NUMBER_PATTERN,
} from "@gira/shared";

describe("grupos de estado", () => {
  it("cada estado pertenece a exactamente un grupo", () => {
    const seen = new Map<string, string>();
    for (const [group, statuses] of Object.entries(ORDER_STATUS_GROUPS)) {
      for (const s of statuses) {
        expect(seen.has(s), `${s} repetido`).toBe(false);
        seen.set(s, group);
      }
    }
    expect([...seen.keys()].sort()).toEqual(Object.values(OrderStatus).sort());
  });

  it("ORDER_STATUS_TO_GROUP coincide con ORDER_STATUS_GROUPS", () => {
    expect(ORDER_STATUS_TO_GROUP[OrderStatus.PAID]).toBe("action");
    expect(ORDER_STATUS_TO_GROUP[OrderStatus.PENDING_PAYMENT]).toBe("waiting");
    expect(ORDER_STATUS_TO_GROUP[OrderStatus.DELIVERED]).toBe("shipping");
    expect(ORDER_STATUS_TO_GROUP[OrderStatus.EXPIRED]).toBe("problems");
  });

  it("matchStatusGroup empata solo con el conjunto exacto, sin importar el orden", () => {
    expect(matchStatusGroup("processing,paid")).toBe("action");
    expect(matchStatusGroup("paid")).toBeNull();
    expect(matchStatusGroup("")).toBeNull();
    expect(matchStatusGroup("paid,processing,shipped")).toBeNull();
  });

  it("ORDER_NUMBER_PATTERN acepta el folio y rechaza I/O/0/1", () => {
    expect(ORDER_NUMBER_PATTERN.test("GC-7KQ2M9XA")).toBe(true);
    expect(ORDER_NUMBER_PATTERN.test("GC-7KQ2M9X0")).toBe(false);
    expect(ORDER_NUMBER_PATTERN.test("GC-7KQ2M9XI")).toBe(false);
    expect(ORDER_NUMBER_PATTERN.test("GC-7KQ2M9")).toBe(false);
  });
});
```

- [ ] **Step 2: Verlo fallar**

Run: `pnpm --filter @gira/api exec vitest run tests/unit/orderStatusGroups.test.ts`
Expected: FAIL (`ORDER_STATUS_GROUPS` no está exportado / `undefined`).

- [ ] **Step 3: Implementar**

`packages/shared/src/constants/order.ts` (conservar `MAX_STATUS_HISTORY`, agregar):

```ts
/** Alphabet without I/O/0/1: the folio is dictated over the phone. */
const ORDER_NUMBER_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const ORDER_NUMBER_PREFIX = "GC-";
const ORDER_NUMBER_BODY_LENGTH = 8;
const ORDER_NUMBER_PATTERN = new RegExp(
  `^${ORDER_NUMBER_PREFIX}[${ORDER_NUMBER_ALPHABET}]{${String(ORDER_NUMBER_BODY_LENGTH)}}$`,
);

/** IVA included in catalog prices, in basis points (1600 = 16%). Lives in Settings; this is its default. */
const DEFAULT_TAX_RATE_BPS = 1600;

const CANCEL_REASON_MIN = 5;
const CANCEL_REASON_MAX = 300;
/** Upper bound of a bulk status change: one request must not fan out unbounded writes. */
const MAX_BULK_ORDERS = 50;
/** Activity feed cap (the audit log can grow without limit; the panel needs the latest). */
const MAX_ORDER_ACTIVITY = 100;
```

Exportarlos todos en el `export {}` del final (exportaciones al final).

`packages/shared/src/enums/orderPriority.ts`:

```ts
/** Triage only: never conditions a status transition, only where the order sorts in the queue. */
enum OrderPriority {
  NORMAL = "normal",
  HIGH = "alta",
  URGENT = "urgente",
}

export { OrderPriority };
```

`packages/shared/src/constants/orderStatusGroups.ts`:

```ts
import { OrderStatus } from "../enums/orderStatus.js";

type OrderStatusGroup = "action" | "waiting" | "shipping" | "problems";

/**
 * Operator buckets (DASHBOARD §10.A). Record<OrderStatus, …> is exhaustive: a new
 * status without a bucket breaks the typecheck instead of vanishing from the KPI cards.
 */
const ORDER_STATUS_TO_GROUP = {
  [OrderStatus.PAID]: "action",
  [OrderStatus.PROCESSING]: "action",
  [OrderStatus.PENDING_PAYMENT]: "waiting",
  [OrderStatus.SHIPPED]: "shipping",
  [OrderStatus.DELIVERED]: "shipping",
  [OrderStatus.CANCELLED]: "problems",
  [OrderStatus.EXPIRED]: "problems",
  [OrderStatus.REFUNDED]: "problems",
} as const satisfies Record<OrderStatus, OrderStatusGroup>;

const GROUP_KEYS: readonly OrderStatusGroup[] = ["action", "waiting", "shipping", "problems"];

const ORDER_STATUS_GROUPS = Object.fromEntries(
  GROUP_KEYS.map((group) => [
    group,
    (Object.keys(ORDER_STATUS_TO_GROUP) as OrderStatus[]).filter(
      (status) => ORDER_STATUS_TO_GROUP[status] === group,
    ),
  ]),
) as Record<OrderStatusGroup, readonly OrderStatus[]>;

/** Filter value (CSV of statuses) -> the bucket it matches exactly, if any. */
const matchStatusGroup = (csv: string): OrderStatusGroup | null => {
  const parts = new Set(csv.split(",").filter(Boolean));
  if (parts.size === 0) return null;
  for (const group of GROUP_KEYS) {
    const statuses = ORDER_STATUS_GROUPS[group];
    if (parts.size === statuses.length && statuses.every((s) => parts.has(s))) return group;
  }
  return null;
};

export type { OrderStatusGroup };
export { ORDER_STATUS_TO_GROUP, ORDER_STATUS_GROUPS, matchStatusGroup };
```

`packages/shared/src/labels/orderStatus.ts` (agregar, mantener lo existente y exportar al final):

```ts
import { OrderPriority } from "../enums/orderPriority.js";
import type { OrderStatusGroup } from "../constants/orderStatusGroups.js";

const ORDER_PRIORITY_LABELS: Record<OrderPriority, string> = {
  [OrderPriority.NORMAL]: "normal",
  [OrderPriority.HIGH]: "alta",
  [OrderPriority.URGENT]: "urgente",
};

const ORDER_STATUS_GROUP_LABELS: Record<OrderStatusGroup, string> = {
  action: "Requieren acción",
  waiting: "Esperando pago",
  shipping: "En camino",
  problems: "Problemas",
};
```

`packages/shared/src/enums/auditAction.ts`: agregar a `AuditAction`
`ORDER_PRIORITY_UPDATED = "order_priority_updated"` y `ORDER_SHIPPING_ADDRESS_UPDATED = "order_shipping_address_updated"`.

`packages/shared/src/index.ts`: importar/exportar `OrderPriority`, `ORDER_STATUS_TO_GROUP`, `ORDER_STATUS_GROUPS`, `matchStatusGroup`, `OrderStatusGroup` (type), `ORDER_PRIORITY_LABELS`, `ORDER_STATUS_GROUP_LABELS`, y las constantes nuevas de `constants/order.js` (`ORDER_NUMBER_ALPHABET`, `ORDER_NUMBER_PREFIX`, `ORDER_NUMBER_BODY_LENGTH`, `ORDER_NUMBER_PATTERN`, `DEFAULT_TAX_RATE_BPS`, `CANCEL_REASON_MIN`, `CANCEL_REASON_MAX`, `MAX_BULK_ORDERS`, `MAX_ORDER_ACTIVITY`).

- [ ] **Step 4: Build y verlo pasar**

Run: `pnpm --filter @gira/shared build && pnpm --filter @gira/api exec vitest run tests/unit/orderStatusGroups.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Checkpoint** — `pnpm -r exec tsc --noEmit` limpio; `git status --short` (solo muestra, no commitea).

---

## Task 2: IVA — `splitTax`, Settings y `quoteTotals`

**Files:**
- Create: `apps/api/src/utils/orderTax.ts`
- Modify: `apps/api/src/models/Settings.ts`, `apps/api/src/services/pricingService.ts`
- Test: `apps/api/tests/unit/orderTax.test.ts`, `apps/api/tests/integration/pricing.test.ts` (agregar casos)

- [ ] **Step 1: Test rojo de la aritmética**

```ts
// apps/api/tests/unit/orderTax.test.ts
import { describe, it, expect } from "vitest";
import { splitTax } from "../../src/utils/orderTax.js";

describe("splitTax (precios con IVA incluido)", () => {
  it("16% de un total redondo: 11600 -> neto 10000, iva 1600", () => {
    expect(splitTax(11600, 1600)).toEqual({ net: 10000, tax: 1600 });
  });

  it("neto + iva suma exactamente el total (el iva se obtiene por resta)", () => {
    for (const total of [1, 99, 12345, 99999, 123457]) {
      const { net, tax } = splitTax(total, 1600);
      expect(net + tax).toBe(total);
    }
  });

  it("tasa 0 -> sin iva", () => {
    expect(splitTax(5000, 0)).toEqual({ net: 5000, tax: 0 });
  });

  it("total 0 -> todo en cero", () => {
    expect(splitTax(0, 1600)).toEqual({ net: 0, tax: 0 });
  });

  it("rechaza tasas fuera de rango o no enteras", () => {
    expect(() => splitTax(100, -1)).toThrow();
    expect(() => splitTax(100, 10_001)).toThrow();
    expect(() => splitTax(100, 16.5)).toThrow();
  });
});
```

- [ ] **Step 2: Rojo** — `pnpm --filter @gira/api exec vitest run tests/unit/orderTax.test.ts` → FAIL (módulo no existe).

- [ ] **Step 3: Implementar**

```ts
// apps/api/src/utils/orderTax.ts
/**
 * Catalog prices INCLUDE tax (B2C MX), so `tax` is a breakdown OF the total,
 * not an addition to it: net = round(total·10000/(10000+bps)); tax = total − net.
 * Deriving tax by subtraction guarantees net + tax === total to the unit.
 * The discount must already be subtracted from `total` — otherwise we would
 * report tax on money the customer never paid.
 */
const MAX_BPS = 10_000;

const splitTax = (total: number, rateBps: number): { net: number; tax: number } => {
  if (!Number.isInteger(rateBps) || rateBps < 0 || rateBps > MAX_BPS) {
    throw new RangeError("La tasa de IVA debe ser un entero entre 0 y 10000 puntos base.");
  }
  const net = Math.round((total * MAX_BPS) / (MAX_BPS + rateBps));
  return { net, tax: total - net };
};

export { splitTax };
```

- [ ] **Step 4: Verde** — mismo comando → PASS.

- [ ] **Step 5: Test rojo de `quoteTotals`** — en `tests/integration/pricing.test.ts`, siguiendo el patrón de los tests existentes de ese archivo (leerlo primero para reutilizar su `seed`/setup de variantes), agregar:

```ts
it("quoteTotals desglosa el IVA incluido y congela la tasa", async () => {
  const lines = await resolveOrderLines([{ variantId, qty: 1 }]); // basePrice 10000 MXN
  const quote = await quoteTotals(lines, { currency: Currency.MXN, destinationCountry: "MX" });
  // subtotal 10000 + envío nacional por defecto 15000 = 25000; 16% incluido
  expect(quote.discount).toBe(0);
  expect(quote.taxRateBps).toBe(1600);
  expect(quote.total).toBe(quote.subtotal - quote.discount + quote.shippingCost);
  expect(quote.tax).toBe(quote.total - Math.round((quote.total * 10000) / 11600));
});
```

- [ ] **Step 6: Rojo** — `quote.discount` es `undefined` → FAIL.

- [ ] **Step 7: Implementar**

`models/Settings.ts`: agregar `interface TaxSettings { rateBps: number }`, `tax: TaxSettings` en `SettingsAttrs`, exportar el tipo, y en el schema:

```ts
tax: {
  rateBps: {
    type: Number,
    required: true,
    min: 0,
    max: 10000,
    validate: { validator: Number.isInteger, message: "La tasa debe ser un entero en puntos base." },
    default: DEFAULT_TAX_RATE_BPS,
  },
},
```

(importar `DEFAULT_TAX_RATE_BPS` de `@gira/shared`). Si `settingsService.getSettings` hace `findOneAndUpdate` con `$setOnInsert`, verificar que el default aplica a un documento ya existente sin `tax`; si no, agregar el fallback `settings.tax?.rateBps ?? DEFAULT_TAX_RATE_BPS` en `pricingService` (no hay settings reales que migrar, pero los documentos de test viven por archivo).

`services/pricingService.ts`: en `interface Quote` agregar `discount: number; taxRateBps: number; tax: number;` y en `quoteTotals`, reemplazar el `return`:

```ts
const discount = 0; // Cupones llegan en M12a; el campo ya viaja para fijar la identidad contable.
const total = subtotal - discount + shippingCost;
const taxRateBps = settings.tax.rateBps;
const { tax } = splitTax(total, taxRateBps);

return {
  currency: input.currency,
  exchangeRate: mxnPerUsdCents,
  rounding,
  lines: quotedLines,
  subtotalMxn,
  subtotal,
  discount,
  shippingCost,
  taxRateBps,
  tax,
  total,
};
```

(importar `splitTax` de `../utils/orderTax.js`).

- [ ] **Step 8: Verde** — `vitest run tests/integration/pricing.test.ts tests/unit/orderTax.test.ts` → PASS.

- [ ] **Step 9: Checkpoint** — tsc limpio (aún no rompe nada: `Order.create` todavía no usa los campos).

---

## Task 3: Campos nuevos del modelo `Order` + folio + términos (atómica: deja la suite verde)

> Esta tarea toca el modelo con campos `required`, así que **también** actualiza todos los puntos que crean órdenes. Hacerla completa antes de correr la suite.

**Files:**
- Create: `apps/api/src/utils/orderNumber.ts`
- Modify: `apps/api/src/models/Order.ts`, `apps/api/src/services/orderService.ts`, `apps/api/src/validators/orderValidator.ts`, `apps/api/src/controllers/orderController.ts` (solo si el tipo lo exige)
- Modify (fixtures): `apps/api/tests/helpers/seedOrder.ts`, `tests/integration/{statsTopProducts,statsOverview,orderStats}.test.ts`
- Modify (checkout): todos los tests que llaman `createOrder(` o `POST /orders` (lista: `adminOrders`, `jobs`, `orderCreate`, `orderNotifications`, `orderRoutes`, `rateLimits`, `shipmentRoutes`, `shipments`, `stripeWebhook`, `passwordReset`, `helpers/auth.ts`)
- Test: `apps/api/tests/unit/orderNumber.test.ts`, `apps/api/tests/integration/orderCreate.test.ts`

- [ ] **Step 1: Tests rojos del folio**

```ts
// apps/api/tests/unit/orderNumber.test.ts
import { describe, it, expect } from "vitest";
import { ORDER_NUMBER_PATTERN } from "@gira/shared";
import { generateOrderNumber } from "../../src/utils/orderNumber.js";

describe("generateOrderNumber", () => {
  it("respeta el formato GC-XXXXXXXX sin I/O/0/1", () => {
    for (let i = 0; i < 500; i += 1) {
      expect(generateOrderNumber()).toMatch(ORDER_NUMBER_PATTERN);
    }
  });

  it("no repite en una muestra razonable", () => {
    const seen = new Set(Array.from({ length: 2000 }, generateOrderNumber));
    expect(seen.size).toBe(2000);
  });
});
```

Y en `tests/integration/orderCreate.test.ts` (leer el archivo y reutilizar su helper de variante/payload; llamarlo `payload()` aquí) agregar:

```ts
describe("M9a · checkout", () => {
  it("devuelve folio, desglose de IVA y sella termsAcceptedAt", async () => {
    const res = await request(app)
      .post("/api/v1/orders")
      .set("Origin", ORIGIN)
      .set("Idempotency-Key", crypto.randomUUID())
      .send({ ...payload(), termsAccepted: true });
    expect(res.status).toBe(201);
    expect(res.body.data.order.orderNumber).toMatch(ORDER_NUMBER_PATTERN);
    expect(res.body.data.order.discount).toBe(0);
    expect(res.body.data.order.taxRateBps).toBe(1600);
    expect(res.body.data.order.tax).toBeGreaterThan(0);
    expect(res.body.data.order).not.toHaveProperty("termsAcceptedAt");

    const doc = await Order.findOne({ orderNumber: res.body.data.order.orderNumber });
    expect(doc?.termsAcceptedAt).toBeInstanceOf(Date);
  });

  it("rechaza 400 si no se aceptan los términos", async () => {
    const res = await request(app)
      .post("/api/v1/orders")
      .set("Origin", ORIGIN)
      .set("Idempotency-Key", crypto.randomUUID())
      .send(payload());
    expect(res.status).toBe(400);
    expect(await Order.countDocuments()).toBe(0);
  });

  it("reintenta con otro folio si el primero ya existe", async () => {
    const real = await import("../../src/utils/orderNumber.js");
    const first = await createCheckout(); // helper local: crea una orden válida con termsAccepted
    const spy = vi
      .spyOn(real, "generateOrderNumber")
      .mockReturnValueOnce(first.orderNumber)
      .mockReturnValueOnce(first.orderNumber);
    const second = await createCheckout();
    expect(second.orderNumber).not.toBe(first.orderNumber);
    expect(spy).toHaveBeenCalledTimes(3);
  });

  it("falla con 500 tras 3 colisiones seguidas y libera la reserva", async () => {
    const real = await import("../../src/utils/orderNumber.js");
    const first = await createCheckout();
    vi.spyOn(real, "generateOrderNumber").mockReturnValue(first.orderNumber);
    await expect(createCheckout()).rejects.toThrow();
    expect(await StockReservation.countDocuments({ status: ReservationStatus.ACTIVE })).toBe(1);
  });
});
```

(`createCheckout()` es un helper local de ~8 líneas que llama `createOrder` con `termsAccepted: true` y devuelve `result.order`; si el módulo no permite `vi.spyOn` por ser ESM, extraer la generación a `const nextOrderNumber = () => orderNumberGenerator.generate()` con un objeto exportado — decidir al ver el error; la prueba de reintento es la que importa.)

- [ ] **Step 2: Rojo** — `vitest run tests/unit/orderNumber.test.ts tests/integration/orderCreate.test.ts` → FAIL.

- [ ] **Step 3: `utils/orderNumber.ts`**

```ts
import { randomInt } from "node:crypto";
import {
  ORDER_NUMBER_ALPHABET,
  ORDER_NUMBER_BODY_LENGTH,
  ORDER_NUMBER_PREFIX,
} from "@gira/shared";

/**
 * Human folio, dictated over the phone. Random on purpose: a shared counter is a
 * write hot spot under concurrency and leaks the shop's total sales volume.
 * Uniqueness is enforced by the unique index; the caller retries on collision.
 */
const generateOrderNumber = (): string => {
  let body = "";
  for (let i = 0; i < ORDER_NUMBER_BODY_LENGTH; i += 1) {
    body += ORDER_NUMBER_ALPHABET[randomInt(ORDER_NUMBER_ALPHABET.length)];
  }
  return `${ORDER_NUMBER_PREFIX}${body}`;
};

export { generateOrderNumber };
```

- [ ] **Step 4: Modelo `Order`**

En `OrderPayment` agregar `capturedAt?: Date; card?: { brand: string; last4: string };` (el uso es en la Tarea 4, pero el schema se declara ya para no tocar el modelo dos veces). En `OrderAttrs` agregar:

```ts
orderNumber: string;
discount: number;
tax: number;
/** Rate used to derive `tax`, frozen so a later Settings change never rewrites a past order. */
taxRateBps: number;
/** Server-stamped when checkout is accepted. Admin-only: never in a customer DTO. */
termsAcceptedAt: Date;
/** Why the order was cancelled: a system code or the admin's free-text reason. */
cancelReason?: string;
priority: OrderPriority;
```

Schema (importar `OrderPriority`, `CANCEL_REASON_MAX`):

```ts
orderNumber: { type: String, required: true, uppercase: true, trim: true },
discount: { type: Number, required: true, min: 0, default: 0 },
tax: { type: Number, required: true, min: 0 },
taxRateBps: { type: Number, required: true, min: 0, max: 10000 },
termsAcceptedAt: { type: Date, required: true },
cancelReason: { type: String, trim: true, maxlength: CANCEL_REASON_MAX },
priority: { type: String, enum: Object.values(OrderPriority), default: OrderPriority.NORMAL },
```

En `orderPaymentSchema`:

```ts
capturedAt: { type: Date },
card: {
  type: new Schema(
    {
      brand: { type: String, trim: true, maxlength: 30, required: true },
      last4: { type: String, trim: true, match: /^\d{4}$/, required: true },
    },
    { _id: false },
  ),
},
```

Índices (junto a los existentes):

```ts
// The human folio: exact lookup from the panel and the unique guard against collisions.
orderSchema.index({ orderNumber: 1 }, { unique: true });
// Operator queue: priority first, then status, newest first.
orderSchema.index({ priority: 1, status: 1, createdAt: -1 });
```

- [ ] **Step 5: `createOrder`**

- `CreateOrderInput` agrega `termsAccepted: true`.
- Reemplazar el bloque `let order … try { order = await Order.create({...}) } catch` por un bucle de hasta 3 intentos sobre el folio:

```ts
const ORDER_NUMBER_ATTEMPTS = 3;

const isOrderNumberCollision = (err: unknown): boolean => {
  const e = err as { code?: number; keyPattern?: Record<string, unknown> };
  return e.code === 11000 && e.keyPattern !== undefined && "orderNumber" in e.keyPattern;
};
```

```ts
let order: OrderDocument | undefined;
for (let attempt = 1; attempt <= ORDER_NUMBER_ATTEMPTS && !order; attempt += 1) {
  try {
    order = await Order.create({
      _id: orderId,
      publicId: generatePublicId(),
      orderNumber: generateOrderNumber(),
      ...(ctx.userId ? { user: ctx.userId } : {}),
      customer: input.customer,
      shipping: input.shipping,
      lines: quote.lines.map(toLineSnapshot),
      currency: quote.currency,
      exchangeRate: quote.exchangeRate,
      rounding: quote.rounding,
      subtotal: quote.subtotal,
      discount: quote.discount,
      shippingCost: quote.shippingCost,
      tax: quote.tax,
      taxRateBps: quote.taxRateBps,
      total: quote.total,
      termsAcceptedAt: new Date(),
      status: OrderStatus.PENDING_PAYMENT,
      statusHistory: [{ status: OrderStatus.PENDING_PAYMENT, at: new Date() }],
      payment: { provider: "stripe", status: PaymentStatus.REQUIRES_PAYMENT },
      idempotencyKey,
      ...(input.useCart && ctx.userId ? { fromCart: true } : {}),
    });
  } catch (err) {
    if (isOrderNumberCollision(err) && attempt < ORDER_NUMBER_ATTEMPTS) continue;
    await releaseReservation(orderId, "order_creation_failed");
    // A racing request with the same key won: return ITS order, not an error.
    if (isDuplicateKeyError(err) && !isOrderNumberCollision(err)) {
      const winner = await Order.findOne({ idempotencyKey }).lean();
      if (winner) {
        return toCreatedOrder(
          toPublicOrder(winner),
          await refreshClientSecret(winner.payment.intentId),
        );
      }
    }
    throw err;
  }
}
if (!order) throw new AppError("No se pudo generar el folio de la orden.", 500);
```

(Importante: `Order.create` con el mismo `_id` tras una colisión de folio es seguro porque el insert fallido no dejó documento.) Importar `generateOrderNumber`.

- Stripe metadata y `Order` ya tienen `orderNumber`: agregar `orderNumber` a `metadata` solo si `PaymentProvider` lo admite; **no** hacerlo ahora (cambia el contrato del adapter sin necesidad).

- [ ] **Step 6: Validador del checkout** — en `createOrderSchema` agregar:

```ts
termsAccepted: Joi.boolean().valid(true).required().messages({
  "any.only": "Debes aceptar los términos y condiciones.",
  "any.required": "Debes aceptar los términos y condiciones.",
}),
```

El controlador ya reenvía `req.body` completo; `CreateOrderInput` lleva `termsAccepted: true`. **El servicio no persiste el booleano**, solo sella `termsAcceptedAt`.

- [ ] **Step 7: Arreglar fixtures y llamadas existentes (guiado por el compilador y la suite)**

1. `tests/helpers/seedOrder.ts` y los `Order.create` de `statsTopProducts`, `statsOverview`, `orderStats`: agregar a cada documento
   `orderNumber: generateOrderNumber()`, `tax: 0`, `taxRateBps: 1600`, `termsAcceptedAt: new Date()`.
   (`discount` y `priority` tienen default.)
2. Correr `pnpm -r exec tsc --noEmit`: cada `createOrder({...})` sin `termsAccepted` marca error de tipos → agregar `termsAccepted: true,` al objeto de entrada. Para los `POST /orders` por HTTP (no los marca el compilador), buscar con `grep -rn "Idempotency-Key" apps/api/tests` y agregar `termsAccepted: true` al `.send({...})` de cada uno (excepto el test de 400 de la Tarea 3).
3. `grep -rn "publicId" apps/api/tests` y verificar que nadie dependa de buscar por `publicId` en el listado admin (se quita en la Tarea 8).

- [ ] **Step 8: Verde** — `pnpm --filter @gira/shared build && pnpm --filter @gira/api test` (re-correr aislado cualquier fallo del flake). Expected: toda la suite verde, incluidas las pruebas nuevas.

- [ ] **Step 9: Checkpoint** — `pnpm -r exec tsc --noEmit`, `pnpm exec eslint apps packages`, `git status --short`.

---

## Task 4: Pago — `capturedAt` y `card{brand,last4}`

**Files:**
- Modify: `apps/api/src/adapters/payment/types.ts`, `stripePaymentProvider.ts`, `stubPaymentProvider.ts`, `apps/api/src/services/orderPaymentService.ts`
- Test: `apps/api/tests/unit/paymentAdapter.test.ts` (agregar), `apps/api/tests/integration/stripeWebhook.test.ts` (agregar)

- [ ] **Step 1: Tests rojos**

En `tests/integration/stripeWebhook.test.ts` (reutilizar su helper para crear una orden pendiente y mandar `payment_succeeded` firmado; leer el archivo para ver los nombres exactos, aquí `sendSucceeded(order)`):

```ts
it("guarda capturedAt y la tarjeta (brand + last4) al confirmarse el pago", async () => {
  const order = await createPendingOrder();
  await sendSucceeded(order);
  const paid = await Order.findById(order._id).lean();
  expect(paid?.status).toBe(OrderStatus.PAID);
  expect(paid?.payment.capturedAt).toBeInstanceOf(Date);
  expect(paid?.payment.card).toEqual({ brand: "visa", last4: "4242" });
});

it("si la consulta de la tarjeta falla, la orden igual queda pagada", async () => {
  vi.spyOn(getPaymentProvider(), "getChargeDetails").mockRejectedValueOnce(new Error("stripe down"));
  const order = await createPendingOrder();
  await sendSucceeded(order);
  const paid = await Order.findById(order._id).lean();
  expect(paid?.status).toBe(OrderStatus.PAID);
  expect(paid?.payment.card).toBeUndefined();
  expect(paid?.payment.capturedAt).toBeInstanceOf(Date); // fallback: ahora
});
```

En `tests/unit/paymentAdapter.test.ts` agregar que el stub devuelve `{ card: { brand: "visa", last4: "4242" }, capturedAt: Date }` para cualquier id.

- [ ] **Step 2: Rojo** — `getChargeDetails is not a function`.

- [ ] **Step 3: Interfaz** (`types.ts`):

```ts
interface ChargeDetails {
  /** When the provider took the money. Absent if it cannot be read. */
  capturedAt?: Date;
  /** Brand + last4 ONLY (PCI SAQ-A): nothing here is enough to charge the card again. */
  card?: { brand: string; last4: string };
}
```

y en `PaymentProvider`: `getChargeDetails(providerId: string): Promise<ChargeDetails>;`. Exportar `ChargeDetails`.

- [ ] **Step 4: Stripe** (`stripePaymentProvider.ts`), junto a `getPayment`:

```ts
const getChargeDetails = async (providerId: string): Promise<ChargeDetails> => {
  try {
    // Stripe does not expand objects on webhook deliveries, so the charge is read back here.
    const intent = await client.paymentIntents.retrieve(providerId, { expand: ["latest_charge"] });
    const charge = typeof intent.latest_charge === "object" ? intent.latest_charge : null;
    if (!charge) return {};
    const card = charge.payment_method_details?.card;
    return {
      capturedAt: new Date(charge.created * 1000),
      ...(card?.brand && card.last4 ? { card: { brand: card.brand, last4: card.last4 } } : {}),
    };
  } catch (err) {
    logger.error({ err }, "Stripe getChargeDetails failed");
    throw new AppError("No se pudo consultar el cargo del pago.", 502);
  }
};
```

Agregarlo al `return` de `createStripePaymentProvider`. **Stub:**

```ts
const getChargeDetails = (): Promise<ChargeDetails> =>
  Promise.resolve({ capturedAt: new Date(), card: { brand: "visa", last4: "4242" } });
```

y al `return` del stub.

- [ ] **Step 5: `applyPaymentSucceeded`** — antes de `applyOrderTransition`, obtener los detalles **fuera** de la transición y sin bloquearla:

```ts
const readChargeDetails = async (intentId: string | undefined): Promise<ChargeDetails> => {
  if (!intentId) return {};
  try {
    return await getPaymentProvider().getChargeDetails(intentId);
  } catch (err) {
    // A missing card label must never keep a paid order from being marked paid.
    logger.warn({ err }, "No se pudo leer el cargo; la orden se marca pagada sin tarjeta");
    return {};
  }
};
```

y en el `set` de la transición `PENDING_PAYMENT → PAID`:

```ts
const details = await readChargeDetails(current.payment.intentId);
const paid = await applyOrderTransition({
  orderId,
  from: OrderStatus.PENDING_PAYMENT,
  to: OrderStatus.PAID,
  actor: SYSTEM,
  set: {
    paidAt: new Date(),
    "payment.status": PaymentStatus.SUCCEEDED,
    "payment.capturedAt": details.capturedAt ?? new Date(),
    ...(details.card ? { "payment.card": details.card } : {}),
  },
});
```

La rama `handleDeadOnArrival` no lleva tarjeta (no es una venta válida).

- [ ] **Step 6: Verde** — `vitest run tests/integration/stripeWebhook.test.ts tests/unit/paymentAdapter.test.ts`. Luego la suite de pagos: `vitest run tests/integration/webhookRetry.test.ts tests/integration/jobs.test.ts`.

- [ ] **Step 7: Checkpoint** — tsc + lint.

---

## Task 5: `cancelReason` en toda cancelación

**Files:**
- Modify: `apps/api/src/services/orderService.ts` (≈L268), `orderPaymentService.ts` (≈L288), `adminOrderService.ts`, `validators/adminOrderValidator.ts`, `controllers/adminOrderController.ts`
- Test: `apps/api/tests/integration/adminOrders.test.ts` (agregar), `orderCreate.test.ts`

- [ ] **Step 1: Tests rojos**

```ts
it("cancelar desde el panel exige motivo y lo guarda en cancelReason", async () => {
  const adminCookie = await loginAsAdmin(app);
  const order = await seedOrder(adminCookie, "CANC1");

  const sinMotivo = await request(app)
    .patch(`${ADMIN_ORDERS_BASE}/${order._id}/status`)
    .set("Origin", ORIGIN).set("Cookie", adminCookie)
    .send({ status: "cancelled" });
  expect(sinMotivo.status).toBe(400);

  const ok = await request(app)
    .patch(`${ADMIN_ORDERS_BASE}/${order._id}/status`)
    .set("Origin", ORIGIN).set("Cookie", adminCookie)
    .send({ status: "cancelled", reason: "Cliente pidió cancelar por teléfono" });
  expect(ok.status).toBe(200);
  expect(ok.body.data.order.cancelReason).toBe("Cliente pidió cancelar por teléfono");
  expect((await Order.findById(order._id))?.cancelReason).toBe("Cliente pidió cancelar por teléfono");
});

it("un motivo no se acepta en transiciones distintas de cancelar", async () => {
  // paid -> processing con reason => 400
});
```

Y en `orderCreate.test.ts`: si el cobro falla al crear (`createPayment` lanza), la orden queda `cancelled` con `cancelReason: "payment_setup_failed"`.

- [ ] **Step 2: Rojo.**

- [ ] **Step 3: Implementar**

`adminOrderValidator.ts`:

```ts
const updateOrderStatusSchema = Joi.object({
  status: Joi.string().valid(...Object.values(OrderStatus)).required()
    .messages({ "any.only": "El estado no es válido." }),
  reason: Joi.when("status", {
    is: OrderStatus.CANCELLED,
    then: Joi.string().trim().min(CANCEL_REASON_MIN).max(CANCEL_REASON_MAX).required()
      .messages({
        "any.required": "Escribe el motivo de la cancelación.",
        "string.min": `El motivo debe tener al menos ${String(CANCEL_REASON_MIN)} caracteres.`,
      }),
    otherwise: Joi.forbidden().messages({ "any.unknown": "El motivo solo aplica al cancelar." }),
  }),
});
```

`changeOrderStatus(id, status, ctx, reason?)` y `cancelPendingOrder(order, ctx, reason)`; el controlador pasa `req.body.reason`. En `cancelPendingOrder` el `applyOrderTransition` queda:

```ts
reason: "admin_cancelled",
set: { "payment.status": PaymentStatus.CANCELLED, cancelReason: reason },
```

En `orderService.createOrder` (fallo de cobro): `set: { cancelReason: "payment_setup_failed" }`. En `orderPaymentService` (≈L288, `payment_cancelled`): `set: { …, cancelReason: "payment_cancelled" }` (conservar el `set` existente y agregar la clave).

- [ ] **Step 4: Verde** — `vitest run tests/integration/adminOrders.test.ts tests/integration/orderCreate.test.ts tests/integration/stripeWebhook.test.ts`.

- [ ] **Step 5: Checkpoint** — tsc + lint.

---

## Task 6: DTOs compartidos y mapper único

**Files:**
- Modify: `packages/shared/src/types/order.ts`, `packages/shared/src/index.ts`
- Modify: `apps/api/src/services/orderService.ts` (`toPublicOrder`), `apps/api/src/services/adminOrderService.ts` (borrar `PublicAdminOrder`/`AdminOrderLean`)
- Test: `apps/api/tests/integration/orderDtos.test.ts` (nuevo), `apps/api/tests/unit/wireContract.test.ts` (ya valida `AdminOrder`)

- [ ] **Step 1: Test rojo de forma exacta**

```ts
// apps/api/tests/integration/orderDtos.test.ts
import { describe, it, expect } from "vitest";
// … imports de supertest/app/helpers como adminOrders.test.ts

const FORBIDDEN_FOR_CUSTOMER = [
  "termsAcceptedAt", "cancelReason", "priority", "actorId", "statusHistory", "user", "idempotencyKey",
];

describe("DTOs de orden", () => {
  it("el DTO público/cliente lleva folio y desglose y NADA administrativo", async () => {
    // crear orden por HTTP (termsAccepted:true) y leerla por /orders/:publicId
    const body = res.body.data.order;
    expect(body.orderNumber).toMatch(ORDER_NUMBER_PATTERN);
    expect(body).toMatchObject({ discount: 0, taxRateBps: 1600 });
    for (const key of FORBIDDEN_FOR_CUSTOMER) expect(body).not.toHaveProperty(key);
    expect(body.payment).toBeUndefined();
  });

  it("el DTO admin trae prioridad, términos, motivo y pago sin secretos", async () => {
    // GET /admin/orders/:id
    const o = res.body.data.order;
    expect(o.priority).toBe("normal");
    expect(typeof o.termsAcceptedAt).toBe("string");
    expect(o.payment).toHaveProperty("status");
    expect(o.payment).not.toHaveProperty("clientSecret");
    expect(typeof o.id).toBe("string");
    for (const h of o.statusHistory) {
      if (h.actorId !== undefined) expect(typeof h.actorId).toBe("string");
    }
    if (o.user !== undefined) expect(typeof o.user).toBe("string");
  });
});
```

- [ ] **Step 2: Rojo.**

- [ ] **Step 3: Tipos compartidos** (`types/order.ts`):

```ts
import type { OrderPriority } from "../enums/orderPriority.js";
import type { OrderStatusGroup } from "../constants/orderStatusGroups.js";
import type { AuditAction } from "../enums/auditAction.js";

interface PublicOrder {
  publicId: string;
  /** The folio the customer reads and quotes ("GC-7KQ2M9XA"). */
  orderNumber: string;
  status: OrderStatus;
  customer: OrderCustomer;
  shipping: ShippingAddress;
  lines: OrderLine[];
  currency: Currency;
  subtotal: number;
  discount: number;
  shippingCost: number;
  /** IVA included in `total` (a breakdown, not an addition). */
  tax: number;
  taxRateBps: number;
  total: number;
  createdAt: Date;
  paidAt?: Date;
}

interface OrderPayment {
  provider: string;
  intentId?: string;
  status: PaymentStatus;
  lastError?: string;
  capturedAt?: Date;
  /** Brand + last4 only. */
  card?: { brand: string; last4: string };
  refundedAmount?: number;
  refundedAt?: Date;
}

interface AdminOrder extends CustomerOrder {
  user?: string;
  priority: OrderPriority;
  /** Admin-only: the customer never sees their own consent record. */
  termsAcceptedAt: Date;
  cancelReason?: string;
  statusHistory: StatusHistoryEntry[];
  payment: OrderPayment;
  disputeStatus?: DisputeStatus;
  disputedAt?: Date;
  updatedAt: Date;
}

interface OrderSummary {
  /** Every status, zero-filled. NOT bounded by date: a stuck order does not age out. */
  countsByStatus: Record<OrderStatus, number>;
  byGroup: Record<OrderStatusGroup, number>;
  /** Orders with an open dispute. */
  disputed: number;
}

/** "Who did what and when" — the audit trail WITHOUT before/after (they can carry PII). */
interface OrderActivityEntry {
  action: AuditAction;
  actorType: "user" | "system";
  actorId?: string;
  createdAt: Date;
}

type BulkStatusOutcome = "updated" | "unchanged" | "rejected";

interface BulkStatusResult {
  results: { id: string; orderNumber: string; outcome: BulkStatusOutcome; message?: string }[];
  summary: Record<BulkStatusOutcome, number>;
}
```

Exportar `OrderSummary`, `OrderActivityEntry`, `BulkStatusOutcome`, `BulkStatusResult` en `types/order.ts` e `index.ts` (también el `Wire`-mapping que ya use ese archivo para `AdminOrder`).

- [ ] **Step 4: Mapper público** (`orderService.ts`): agregar `orderNumber`, `discount`, `tax`, `taxRateBps` a `OrderLean` y al objeto de `toPublicOrder`.

- [ ] **Step 5: Mapper admin** — en `adminOrderService.ts` borrar `PublicAdminOrder` y `AdminOrderLean`; usar `AdminOrder` de `@gira/shared`:

```ts
import type { AdminOrder } from "@gira/shared";

interface AdminOrderLean extends OrderLean {
  user?: Types.ObjectId;
  priority?: OrderPriority;
  termsAcceptedAt: Date;
  cancelReason?: string;
  statusHistory: {
    status: OrderStatus; at: Date; actorType: "user" | "system"; actorId?: Types.ObjectId; reason?: string;
  }[];
  payment: OrderPayment; // from models/Order.ts
  disputeStatus?: DisputeStatus;
  disputedAt?: Date;
  updatedAt: Date;
}

const toAdminOrder = (doc: AdminOrderLean): AdminOrder => ({
  ...toCustomerOrder(doc),
  ...(doc.user ? { user: String(doc.user) } : {}),
  priority: doc.priority ?? OrderPriority.NORMAL,
  termsAcceptedAt: doc.termsAcceptedAt,
  ...(doc.cancelReason ? { cancelReason: doc.cancelReason } : {}),
  statusHistory: doc.statusHistory.map((h) => ({
    status: h.status,
    at: h.at,
    actorType: h.actorType,
    ...(h.actorId ? { actorId: String(h.actorId) } : {}),
    ...(h.reason ? { reason: h.reason } : {}),
  })),
  payment: {
    provider: doc.payment.provider,
    ...(doc.payment.intentId ? { intentId: doc.payment.intentId } : {}),
    status: doc.payment.status,
    ...(doc.payment.lastError ? { lastError: doc.payment.lastError } : {}),
    ...(doc.payment.capturedAt ? { capturedAt: doc.payment.capturedAt } : {}),
    ...(doc.payment.card ? { card: { brand: doc.payment.card.brand, last4: doc.payment.card.last4 } } : {}),
    ...(doc.payment.refundedAmount !== undefined ? { refundedAmount: doc.payment.refundedAmount } : {}),
    ...(doc.payment.refundedAt ? { refundedAt: doc.payment.refundedAt } : {}),
  },
  ...(doc.disputeStatus ? { disputeStatus: doc.disputeStatus } : {}),
  ...(doc.disputedAt ? { disputedAt: doc.disputedAt } : {}),
  updatedAt: doc.updatedAt,
});
```

Renombrar `toPublicAdminOrder` → `toAdminOrder` en todo el archivo y reemplazar los tipos de retorno `PublicAdminOrder` por `AdminOrder` (incluye `export type`). Reexportar `AdminOrder` donde otros módulos importaban `PublicAdminOrder` (`grep -rn PublicAdminOrder apps`).

- [ ] **Step 6: Verde** — `pnpm --filter @gira/shared build && vitest run tests/integration/orderDtos.test.ts tests/unit/wireContract.test.ts tests/integration/adminOrders.test.ts tests/integration/orderRoutes.test.ts` y `pnpm -r exec tsc --noEmit`.

- [ ] **Step 7: Checkpoint** — tsc + lint; revisar que `apps/web` sigue compilando (`pnpm --filter @gira/web exec tsc --noEmit`) porque consume `@gira/shared`.

---

## Task 7: Actividad por orden (`targetId` = `_id`)

**Files:**
- Modify: `apps/api/src/models/AuditLog.ts`; los `recordAudit` de `orderService`, `adminOrderService`, `orderPaymentService`, `shipmentService`, `jobs/expireReservations.ts`, `paymentAlertService.ts`
- Modify: `adminOrderService.ts`, `adminOrderRoutes.ts`, `adminOrderController.ts`
- Test: `apps/api/tests/integration/adminOrderActivity.test.ts` (nuevo)

- [ ] **Step 1: Test rojo**

```ts
describe("GET /admin/orders/:id/activity", () => {
  it("lista las acciones de la orden, más reciente primero, sin before/after ni ip", async () => {
    const adminCookie = await loginAsAdmin(app);
    const order = await seedOrder(adminCookie, "ACT1");
    await request(app).patch(`${ADMIN_ORDERS_BASE}/${order._id}/status`)
      .set("Origin", ORIGIN).set("Cookie", adminCookie).send({ status: "cancelled", reason: "Prueba de actividad" });

    const res = await request(app).get(`${ADMIN_ORDERS_BASE}/${order._id}/activity`)
      .set("Cookie", adminCookie);
    expect(res.status).toBe(200);
    const actions = res.body.data.activity.map((a: { action: string }) => a.action);
    expect(actions).toEqual(expect.arrayContaining([
      AuditAction.ORDER_STATUS_CHANGED, AuditAction.ORDER_CREATED, AuditAction.PAYMENT_INTENT_CREATED,
    ]));
    for (const entry of res.body.data.activity) {
      expect(entry).not.toHaveProperty("before");
      expect(entry).not.toHaveProperty("after");
      expect(entry).not.toHaveProperty("ip");
      expect(entry).not.toHaveProperty("targetId");
    }
    const dates = res.body.data.activity.map((a: { createdAt: string }) => a.createdAt);
    expect([...dates].sort().reverse()).toEqual(dates);
  });

  it("no mezcla actividad de otra orden y 404 si la orden no existe", async () => {
    // dos órdenes: la actividad de A no contiene entradas de B; id válido inexistente => 404
  });

  it("exige admin", async () => { /* 401 anónimo, 403 cliente */ });
});
```

- [ ] **Step 2: Rojo.**

- [ ] **Step 3: `targetId` = `_id`** — mecánico, con verificación por grep. En los seis archivos cambiar `targetId: <algo>.publicId` por `targetId: String(<algo>._id)`. Casos especiales (leer el contexto de cada uno):
  - `orderPaymentService.ts` ≈L402-480: la variable local `publicId` se usa para el audit **y** para filtrar (`{ _id: orderId, publicId, status: REFUNDED }`). Introducir `let orderRef = ""` guardando `String(order._id)` para el audit y conservar `publicId` solo donde se usa de filtro/payload.
  - `shipmentService.ts` ≈L162, L227: `order` ya está cargado; usar `String(order._id)`.
  - `paymentAlertService.ts` ≈L68: recibe un snapshot con `publicId` (L22) → agregar `id: string` al snapshot y a sus llamadores.
  - `jobs/expireReservations.ts` L61.

  Verificación: `grep -rn "targetId: .*publicId" apps/api/src` → **sin resultados**.

- [ ] **Step 4: Índice** (`AuditLog.ts`): `auditLogSchema.index({ targetId: 1, createdAt: -1 });`

- [ ] **Step 5: Servicio**

```ts
const ORDER_ACTIVITY_MODULES = [AuditModule.ORDERS, AuditModule.PAYMENTS, AuditModule.SHIPPING];

const getOrderActivity = async (id: string): Promise<OrderActivityEntry[]> => {
  const exists = await Order.exists({ _id: id });
  if (!exists) throw new AppError("La orden no existe.", 404);

  const rows = await AuditLog.find({ targetId: id, module: { $in: ORDER_ACTIVITY_MODULES } })
    .sort({ createdAt: -1, _id: -1 })
    .limit(MAX_ORDER_ACTIVITY)
    .select("action actorType actorId createdAt")
    .lean();

  return rows.map((r) => ({
    action: r.action,
    actorType: r.actorType,
    ...(r.actorId ? { actorId: String(r.actorId) } : {}),
    createdAt: r.createdAt,
  }));
};
```

Ruta (registrada con las demás `/:id`): `adminOrderRouter.get("/:id/activity", validate(objectIdParamSchema, "params"), activity);` Controlador: `sendResponse(res, 200, "Actividad de la orden obtenida correctamente.", { activity })`.

- [ ] **Step 6: Verde** — `vitest run tests/integration/adminOrderActivity.test.ts tests/integration/adminAuditLogs.test.ts tests/integration/shipments.test.ts tests/integration/stripeWebhook.test.ts tests/integration/jobs.test.ts`. Cualquier test que consultaba `AuditLog` por `targetId = publicId` se actualiza a `String(order._id)`.

- [ ] **Step 7: Checkpoint** — tsc + lint.

---

## Task 8: `GET /admin/orders/summary` y listado con filtros

**Files:**
- Modify: `apps/api/src/services/adminOrderService.ts`, `validators/adminOrderValidator.ts`, `routes/v1/admin/adminOrderRoutes.ts`, `controllers/adminOrderController.ts`
- Test: `apps/api/tests/integration/adminOrderList.test.ts` (nuevo)

- [ ] **Step 1: Tests rojos** (usar `seedOrder` de `tests/helpers/seedOrder.ts`, que acepta `createdAt` y crea `customer.email = cliente@example.com`; extenderlo con `opts.priority?`, `opts.email?`, `opts.name?`, `opts.phone?` y `opts.orderNumber?` — cambio chico del helper)

```ts
describe("GET /admin/orders/summary", () => {
  it("cuenta por estado y por grupo sin acotar por fecha", async () => {
    const old = new Date("2025-01-01");
    await seedOrder({ status: OrderStatus.PAID, total: 1000, createdAt: old });
    await seedOrder({ status: OrderStatus.PROCESSING, total: 1000, createdAt: new Date() });
    await seedOrder({ status: OrderStatus.PENDING_PAYMENT, total: 1000, createdAt: old });
    await seedOrder({ status: OrderStatus.REFUNDED, total: 1000, createdAt: old });

    const res = await request(app).get(`${BASE}/summary`).set("Cookie", adminCookie);
    expect(res.status).toBe(200);
    const s = res.body.data.summary;
    expect(s.countsByStatus.paid).toBe(1);
    expect(s.countsByStatus.shipped).toBe(0); // ceros incluidos
    expect(s.byGroup).toEqual({ action: 2, waiting: 1, shipping: 0, problems: 1 });
    expect(s.disputed).toBe(0);
  });

  it("disputed cuenta solo disputeStatus=open", async () => { /* seed con disputeStatus open y lost */ });
});

describe("GET /admin/orders (filtros)", () => {
  it("status acepta uno o una lista separada por comas", async () => {
    const r = await get("?status=paid,processing");
    expect(r.body.data.orders.every((o) => ["paid", "processing"].includes(o.status))).toBe(true);
    expect((await get("?status=nope")).status).toBe(400);
  });
  it("group filtra por el grupo de operador", async () => { /* ?group=action */ });
  it("group y status juntos se intersectan", async () => { /* ?group=action&status=paid */ });
  it("priority filtra", async () => { /* ?priority=urgente */ });
  it("orderNumber es coincidencia exacta, sin importar mayúsculas", async () => {
    // ?orderNumber=gc-7kq2m9xa encuentra GC-7KQ2M9XA; un prefijo NO encuentra
  });
  it("search encuentra por nombre, teléfono, correo o prefijo de folio, y NO por publicId", async () => {
    // search=<publicId completo> => 0 resultados
  });
  it("sort fuera de la lista blanca responde 400", async () => {
    expect((await get("?sort=payment.intentId")).status).toBe(400);
    expect((await get("?sort=-priority")).status).toBe(200);
  });
  it("devuelve meta de paginación", async () => { /* limit=1 => pages = total */ });
});
```

- [ ] **Step 2: Rojo.**

- [ ] **Step 3: Validador**

```ts
const csvOf = (allowed: readonly string[]) =>
  Joi.string().custom((value: string, helpers) =>
    value.split(",").every((v) => allowed.includes(v)) ? value : helpers.error("any.invalid"),
  );

const ADMIN_SORTABLE = ["createdAt", "total", "status", "priority"];

const adminOrderListQuerySchema = listQueryBase.keys({
  status: csvOf(Object.values(OrderStatus)).messages({ "any.invalid": "El estado no es válido." }),
  group: Joi.string().valid(...Object.keys(ORDER_STATUS_GROUPS)),
  priority: Joi.string().valid(...Object.values(OrderPriority)),
  orderNumber: Joi.string().trim().uppercase().pattern(ORDER_NUMBER_PATTERN)
    .messages({ "string.pattern.base": "El folio no tiene un formato válido." }),
  sort: Joi.string().trim().max(40).custom((value: string, helpers) =>
    ADMIN_SORTABLE.includes(value.replace(/^-/, "")) ? value : helpers.error("any.invalid"),
  ).messages({ "any.invalid": "No se puede ordenar por ese campo." }),
});
```

(Recordatorio: `validate()` reemplaza `req.query` con la salida de Joi; `uppercase()` y `convert` están bien aquí, no hay fechas.)

- [ ] **Step 4: Servicio**

```ts
const LIST_CONFIG: ListQueryConfig = {
  sortable: ["createdAt", "total", "status", "priority"],
  // publicId is a credential and no longer searchable. Folio prefix is handled below.
  searchable: ["customer.email", "customer.name", "customer.phone"],
  defaultSort: "-createdAt",
};

interface AdminOrderListQuery extends RawListQuery {
  status?: string;
  group?: OrderStatusGroup;
  priority?: OrderPriority;
  orderNumber?: string;
}

const buildStatusFilter = (csv?: string, group?: OrderStatusGroup): Record<string, unknown> | undefined => {
  const byStatus = csv ? csv.split(",") : undefined;
  const byGroup = group ? [...ORDER_STATUS_GROUPS[group]] : undefined;
  if (byStatus && byGroup) return { $in: byStatus.filter((s) => byGroup.includes(s as OrderStatus)) };
  const list = byStatus ?? byGroup;
  return list ? { $in: list } : undefined;
};

const listAdminOrders = async (query: AdminOrderListQuery) => {
  const filters: Record<string, unknown> = {};
  const status = buildStatusFilter(query.status, query.group);
  if (status) filters.status = status;
  if (query.priority) filters.priority = query.priority;
  if (query.orderNumber) filters.orderNumber = query.orderNumber;

  const { filter, sort, skip, limit, page } = parseListQuery(query, LIST_CONFIG, filters);

  // Folio prefix joins the free-text search; parseListQuery only knows plain fields.
  const term = typeof query.search === "string" ? query.search.trim().slice(0, 80) : "";
  if (term && Array.isArray(filter.$or)) {
    (filter.$or as Record<string, unknown>[]).push({
      orderNumber: new RegExp(`^${escapeRegex(term)}`, "i"),
    });
  }
  // … find/count/map igual que hoy, con toAdminOrder
};
```

(importar `escapeRegex` de `parseListQuery.ts`, ya exportado). Resumen:

```ts
const getOrderSummary = async (): Promise<OrderSummary> => {
  const [grouped, disputed] = await Promise.all([
    Order.aggregate<{ _id: OrderStatus; count: number }>([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
    Order.countDocuments({ disputeStatus: DisputeStatus.OPEN }),
  ]);

  const countsByStatus = Object.fromEntries(
    Object.values(OrderStatus).map((s) => [s, 0]),
  ) as Record<OrderStatus, number>;
  for (const row of grouped) countsByStatus[row._id] = row.count;

  const byGroup = { action: 0, waiting: 0, shipping: 0, problems: 0 };
  for (const status of Object.values(OrderStatus)) {
    byGroup[ORDER_STATUS_TO_GROUP[status]] += countsByStatus[status];
  }
  return { countsByStatus, byGroup, disputed };
};
```

Ruta `adminOrderRouter.get("/summary", summary)` **antes** de `/:id`; controlador `{ summary }`.

- [ ] **Step 5: Verde** — `vitest run tests/integration/adminOrderList.test.ts tests/integration/adminOrders.test.ts tests/integration/queryHardening.test.ts`. Ajustar cualquier test viejo que busque por `publicId` en el listado.

- [ ] **Step 6: Checkpoint** — tsc + lint.

---

## Task 9: Prioridad

**Files:** `adminOrderService.ts`, `adminOrderValidator.ts`, `adminOrderRoutes.ts`, `adminOrderController.ts`; Test: `apps/api/tests/integration/adminOrderPriority.test.ts`

- [ ] **Step 1: Test rojo**

```ts
it("cambia la prioridad, audita y no toca el status", async () => {
  const order = await seedOrder(adminCookie, "PRI1");
  const res = await request(app).patch(`${BASE}/${order._id}/priority`)
    .set("Origin", ORIGIN).set("Cookie", adminCookie).send({ priority: "urgente" });
  expect(res.status).toBe(200);
  expect(res.body.data.order.priority).toBe("urgente");
  const after = await Order.findById(order._id);
  expect(after?.status).toBe(order.status);
  expect(after?.statusHistory).toHaveLength(order.statusHistory.length);
  expect(await AuditLog.countDocuments({ action: AuditAction.ORDER_PRIORITY_UPDATED, targetId: String(order._id) })).toBe(1);
});
it("rechaza valores fuera del enum (400) y órdenes inexistentes (404)", async () => { /* … */ });
it("exige admin (401/403)", async () => { /* … */ });
```

- [ ] **Step 2: Rojo.**
- [ ] **Step 3: Implementar**

```ts
// validator
const updatePrioritySchema = Joi.object({
  priority: Joi.string().valid(...Object.values(OrderPriority)).required()
    .messages({ "any.only": "La prioridad no es válida." }),
});
```

```ts
// service — atomic single write; priority never conditions a transition
const updateOrderPriority = async (id: string, priority: OrderPriority, ctx: RequestContext): Promise<AdminOrder> => {
  const before = await Order.findById(id).select("priority");
  if (!before) throw new AppError("La orden no existe.", 404);
  const updated = await Order.findByIdAndUpdate(id, { $set: { priority } }, { new: true }).lean();
  if (!updated) throw new AppError("La orden no existe.", 404);
  await recordAudit({
    actorId: ctx.actorId, actorType: "user",
    action: AuditAction.ORDER_PRIORITY_UPDATED, module: AuditModule.ORDERS,
    targetId: id,
    before: { priority: before.priority ?? OrderPriority.NORMAL }, after: { priority },
    ip: ctx.ip,
  });
  return toAdminOrder(updated as AdminOrderLean);
};
```

Ruta: `adminOrderRouter.patch("/:id/priority", validate(objectIdParamSchema,"params"), validate(updatePrioritySchema), updatePriority);`

- [ ] **Step 4: Verde** — `vitest run tests/integration/adminOrderPriority.test.ts`.
- [ ] **Step 5: Checkpoint** — tsc + lint.

---

## Task 10: Corrección de dirección de envío

**Files:** `adminOrderService.ts`, `adminOrderValidator.ts` (reutiliza el schema del checkout → exportar `shippingAddressSchema` desde `orderValidator.ts`), `adminOrderRoutes.ts`, `adminOrderController.ts`; Test: `apps/api/tests/integration/adminOrderAddress.test.ts`

- [ ] **Step 1: Tests rojos**

```ts
const newAddress = {
  recipient: "Luis Gómez", line1: "Av. Reforma 10", city: "CDMX", state: "CDMX",
  postalCode: "06600", country: "MX",
};

it.each([OrderStatus.PENDING_PAYMENT, OrderStatus.PAID, OrderStatus.PROCESSING])(
  "corrige la dirección en %s", async (status) => {
    const id = await seedOrder({ status, total: 1000, createdAt: new Date() });
    const res = await patchAddress(id, newAddress);
    expect(res.status).toBe(200);
    expect(res.body.data.order.shipping.recipient).toBe("Luis Gómez");
  });

it.each([OrderStatus.SHIPPED, OrderStatus.DELIVERED, OrderStatus.CANCELLED, OrderStatus.EXPIRED, OrderStatus.REFUNDED])(
  "la dirección queda congelada en %s (409)", async (status) => {
    const id = await seedOrder({ status, total: 1000, createdAt: new Date() });
    const res = await patchAddress(id, newAddress);
    expect(res.status).toBe(409);
    expect((await Order.findById(id))?.shipping.recipient).toBe("Ana Pérez");
  });

it("404 si no existe, 400 si la dirección es inválida", async () => { /* … */ });

it("la auditoría no guarda la dirección (PII)", async () => {
  await patchAddress(id, newAddress);
  const log = await AuditLog.findOne({ action: AuditAction.ORDER_SHIPPING_ADDRESS_UPDATED }).lean();
  expect(log?.before).toBeUndefined();
  expect(log?.after).toBeUndefined();
  expect(log?.targetId).toBe(String(id));
});

it("una carrera con el envío no gana: si pasó a shipped, 409", async () => { /* mover a shipped y luego PATCH */ });
```

- [ ] **Step 2: Rojo.**
- [ ] **Step 3: Implementar**

```ts
const ADDRESS_EDITABLE_STATUSES: readonly OrderStatus[] = [
  OrderStatus.PENDING_PAYMENT, OrderStatus.PAID, OrderStatus.PROCESSING,
];

/**
 * The status guard lives IN THE FILTER, not in a read-then-write: a shipment created
 * between the check and the update could otherwise redirect a parcel already on its way.
 * The audit entry carries no address (PII).
 */
const updateShippingAddress = async (id: string, address: ShippingAddress, ctx: RequestContext): Promise<AdminOrder> => {
  const updated = await Order.findOneAndUpdate(
    { _id: id, status: { $in: ADDRESS_EDITABLE_STATUSES } },
    { $set: { shipping: address } },
    { new: true, runValidators: true },
  ).lean();

  if (!updated) {
    const exists = await Order.exists({ _id: id });
    if (!exists) throw new AppError("La orden no existe.", 404);
    throw new AppError("La dirección ya no se puede corregir: la orden está enviada o cerrada.", 409);
  }

  await recordAudit({
    actorId: ctx.actorId, actorType: "user",
    action: AuditAction.ORDER_SHIPPING_ADDRESS_UPDATED, module: AuditModule.ORDERS,
    targetId: id, ip: ctx.ip,
  });
  return toAdminOrder(updated as AdminOrderLean);
};
```

Validador: `export { shippingAddressSchema }` desde `orderValidator.ts`; la ruta usa `validate(shippingAddressSchema.required())` (el body **es** la dirección). Ruta `PATCH /:id/shipping-address`.

- [ ] **Step 4: Verde** — `vitest run tests/integration/adminOrderAddress.test.ts`.
- [ ] **Step 5: Checkpoint** — tsc + lint.

---

## Task 11: Cambio masivo de estatus

**Files:** `adminOrderService.ts`, `adminOrderValidator.ts`, `adminOrderRoutes.ts`, `adminOrderController.ts`; Test: `apps/api/tests/integration/adminOrderBulk.test.ts`

- [ ] **Step 1: Tests rojos**

```ts
it("mueve las pagadas a processing, deja las que ya lo estaban y rechaza el resto", async () => {
  const a = await seedOrder({ status: OrderStatus.PAID, … });
  const b = await seedOrder({ status: OrderStatus.PROCESSING, … });
  const c = await seedOrder({ status: OrderStatus.PENDING_PAYMENT, … });

  const res = await bulk([a, b, c], "processing");
  expect(res.status).toBe(200);
  const byId = Object.fromEntries(res.body.data.results.map((r) => [r.id, r.outcome]));
  expect(byId[String(a)]).toBe("updated");
  expect(byId[String(b)]).toBe("unchanged");
  expect(byId[String(c)]).toBe("rejected");
  expect(res.body.data.summary).toEqual({ updated: 1, unchanged: 1, rejected: 1 });
  expect((await Order.findById(a))?.status).toBe(OrderStatus.PROCESSING);
  expect((await Order.findById(c))?.status).toBe(OrderStatus.PENDING_PAYMENT);
});

it("escribe UNA entrada de auditoría por orden movida (nunca una por lote)", async () => {
  await bulk([a, d], "processing"); // dos pagadas
  expect(await AuditLog.countDocuments({ action: AuditAction.ORDER_STATUS_CHANGED })).toBe(2);
});

it("rechaza más de 50 ids, ids repetidos o vacíos (400) y estados distintos de processing", async () => { /* … */ });
it("un id inexistente sale como rejected sin tumbar el lote", async () => { /* … */ });
it("exige admin", async () => { /* 401/403 */ });
```

- [ ] **Step 2: Rojo.**
- [ ] **Step 3: Implementar**

```ts
// validator
const bulkStatusSchema = Joi.object({
  ids: Joi.array().items(objectId).min(1).max(MAX_BULK_ORDERS).unique().required()
    .messages({ "array.max": `Máximo ${String(MAX_BULK_ORDERS)} órdenes por lote.`, "array.unique": "Hay órdenes repetidas." }),
  // The only manual move that makes sense in bulk (paid -> processing).
  status: Joi.string().valid(OrderStatus.PROCESSING).required()
    .messages({ "any.only": "Solo se puede marcar en preparación en lote." }),
});
```

```ts
// service — reuses changeOrderStatus: assert + atomic transition + ORDER_PREPARING email + one audit per order
const bulkChangeStatus = async (ids: string[], status: OrderStatus, ctx: RequestContext): Promise<BulkStatusResult> => {
  const results: BulkStatusResult["results"] = [];
  for (const id of ids) {
    const order = await Order.findById(id).select("orderNumber status").lean();
    if (!order) {
      results.push({ id, orderNumber: "", outcome: "rejected", message: "La orden no existe." });
      continue;
    }
    if (order.status === status) {
      results.push({ id, orderNumber: order.orderNumber, outcome: "unchanged" });
      continue;
    }
    try {
      await changeOrderStatus(id, status, ctx);
      results.push({ id, orderNumber: order.orderNumber, outcome: "updated" });
    } catch (err) {
      if (!(err instanceof AppError)) throw err;
      results.push({ id, orderNumber: order.orderNumber, outcome: "rejected", message: err.message });
    }
  }
  const summary = { updated: 0, unchanged: 0, rejected: 0 };
  for (const r of results) summary[r.outcome] += 1;
  return { results, summary };
};
```

Secuencial a propósito (≤50, cada una con su transición atómica y su correo). Ruta `PATCH /bulk-status` registrada **antes** de `/:id`.

- [ ] **Step 4: Verde** — `vitest run tests/integration/adminOrderBulk.test.ts`.
- [ ] **Step 5: Checkpoint** — tsc + lint.

---

## Task 12: Folio visible en Telegram, correos y logs

**Files:** `templates/teamMessages.ts`, `templates/orderEmails.ts`, `jobs/dispatchNotifications.ts`, `jobs/expireReservations.ts`, payloads en `orderPaymentService.ts` (≈L58, L84, L273, L551), `adminOrderService.ts` (≈L196), `shipmentService.ts` (≈L92, L215), `paymentAlertService.ts` (≈L22, L44); Tests: `tests/unit/orderEmails.test.ts` (existente), `tests/unit/teamMessages.test.ts` (nuevo), `tests/integration/orderNotifications.test.ts`, `tests/integration/dispatchNotifications.test.ts`

- [ ] **Step 1: Tests rojos**

```ts
// tests/unit/teamMessages.test.ts
import { renderTeamOrderPaid, renderTeamPaymentFailed } from "../../src/templates/teamMessages.js";

it("el aviso lleva el folio legible y nunca el publicId", () => {
  const msg = renderTeamOrderPaid({ orderNumber: "GC-7KQ2M9XA", total: 25000, currency: Currency.MXN, itemCount: 2 });
  const text = [msg.title, ...msg.lines].join("\n");
  expect(text).toContain("Folio: GC-7KQ2M9XA");
  expect(JSON.stringify(msg)).not.toMatch(/[A-Za-z0-9_-]{43}/); // ningún publicId (43 chars base64url)
});
```

En `orderEmails.test.ts`: el asunto o cuerpo de confirmación/preparando/enviado contiene `GC-…` como texto visible, y el enlace sigue usando `publicId`. En `orderNotifications.test.ts`/`dispatchNotifications.test.ts`: el mensaje de equipo encolado al pagar contiene el folio y no el `publicId`.

- [ ] **Step 2: Rojo.**

- [ ] **Step 3: Implementar**

Reglas (mecánicas):
1. `TeamOrderSnapshot.publicId` → `orderNumber`; los cuatro `render*` de `teamMessages.ts` reciben `orderNumber` y muestran `Folio: ${orderNumber}`. Actualizar el comentario de cabecera ("carry the order's folio…").
2. `dispatchNotifications.ts`: `String(payload.publicId)` → `String(payload.orderNumber)` en los 4 casos de equipo.
3. Los payloads de **equipo** (`TEAM_*`) pasan `orderNumber: order.orderNumber` en lugar de `publicId`; `paymentAlertService` agrega `orderNumber` a su snapshot (junto con el `id` de la Tarea 7). En `shipmentService.ts` ≈L215 (incidencia de envío) `shipment.orderPublicId` → cargar el folio: el `order` ya está en alcance en `addShipmentEvent`; si no, `Order.findById(shipment.order).select("orderNumber")`.
4. Los payloads de **correo** (`OrderEmailSnapshot`) **conservan** `publicId` (el enlace) y **agregan** `orderNumber`. En `orderEmails.ts`: `OrderEmailSnapshot.orderNumber: string`; mostrar el folio en el cuerpo y el asunto: `Confirmamos tu compra ${orderNumber}`, `Estamos preparando tu pedido ${orderNumber}`, `Tu pedido ${orderNumber} va en camino`; y una línea `Folio: <strong>${escapeHtml(orderNumber)}</strong>` en el HTML / `Folio: ${orderNumber}` en el texto.
5. `jobs/expireReservations.ts` L38: `{ err, order: order.orderNumber }`.
6. `adminOrderService.changeOrderStatus` (payload de `ORDER_PREPARING`): agregar `orderNumber: order.orderNumber`.

Verificación: `grep -rn "Folio: \${.*publicId" apps/api/src` y `grep -rn "String(payload.publicId)" apps/api/src` → sin resultados.

- [ ] **Step 4: Verde** — `vitest run tests/unit/teamMessages.test.ts tests/unit/orderEmails.test.ts tests/integration/orderNotifications.test.ts tests/integration/dispatchNotifications.test.ts tests/integration/shipments.test.ts tests/integration/stripeWebhook.test.ts`.

- [ ] **Step 5: Checkpoint** — tsc + lint.

---

## Task 13: Verificación final, revisión y cierre

- [ ] **Step 1: Verificación completa**

```bash
pnpm --filter @gira/shared build
pnpm -r exec tsc --noEmit
pnpm exec eslint apps packages
pnpm --filter @gira/api test        # re-correr aislado cualquier fallo del flake
pnpm --filter @gira/web test
pnpm audit --prod --audit-level high
```

Expected: tsc y eslint sin errores; API verde (salvo el flake, que pasa aislado); web verde; audit sin vulnerabilidades high/critical nuevas.

- [ ] **Step 2: Recorrido manual con Stripe en modo test** (requiere `stripe listen`; **no** apuntar a Atlas: usar una base local). Checkout con `termsAccepted:true` → orden con `GC-…`, `tax`, `taxRateBps`; pago → `payment.card` + `capturedAt`; `summary`, listado con `status=paid,processing`/`group=action`/`orderNumber=`, `activity`, `shipping-address`, `priority`, `bulk-status` con cookie admin.

- [ ] **Step 3: `requesting-code-review`** sobre el diff completo; atender hallazgos con `receiving-code-review`.

- [ ] **Step 4: `verification-before-completion`** — repetir Step 1 tras los fixes y reportar el resultado real.

- [ ] **Step 5: Cierre (sin comitear)** — mostrar `git status` y `git diff --stat` a Manuel y entregar los comandos:

```bash
git add -A
git commit -m "FIX: M9a pedidos backend (folio, IVA, tarjeta, prioridad, resumen, filtros, actividad, dirección, lote)"
git checkout main && git merge --no-ff fix/m9a-orders-backend -m "Merge: M9a pedidos backend"
```

- [ ] **Step 6: Memoria** — actualizar `project_milestone_status` (M9a implementada, rama, pendientes, M9b sigue) y `project_standards_debt` (resueltos: `orderNumber`, `taxCents`→`tax`, `termsAcceptedAt`, `cancelReason`, `capturedAt`/`card`, folio en Telegram/correos; quedan: `adminAlertedAt`, internalNotes, carrier lista cerrada → M10). Completar la sección "Pendientes conocidos" de este plan.

---

## Auto-revisión (spec → tarea)

| Requisito aprobado | Tarea |
|---|---|
| `orderNumber` `GC-XXXXXXXX`, único, reintento | 1, 3 |
| IVA incluido, `taxRateBps` en Settings, `tax` por resta | 2, 3 |
| `discount` (0) | 2, 3 |
| `termsAcceptedAt` obligatorio (400 sin él) | 3 |
| `cancelReason` en toda cancelación, motivo obligatorio del admin | 5 |
| `capturedAt`, `card{brand,last4}` (best-effort) | 4 |
| `refundedAmount`/`refundedAt` | ya existían (descartado) |
| DTO público sin campos admin; admin con `id`, `actorId` string | 6 |
| `ORDER_STATUS_GROUPS` con `satisfies` exhaustivo | 1 |
| `/admin/orders/summary` sin rango | 8 |
| Filtros status CSV/group/priority/orderNumber/search; sort lista blanca | 8 |
| Prioridad | 9 |
| Actividad por orden (audit `_id`, sin before/after) | 7 |
| Corrección de dirección pending/paid/processing, guard atómico | 10 |
| Cambio masivo ≤50, un audit por orden | 11 |
| Folio en Telegram/correos/logs en lugar de `publicId` | 12 |
| shipped/delivered solo vía Shipment | ya hecho (descartado) |
| Toast/SlideOver/Toggle, página, `lib/orders/status.ts` | M9b |

## Pendientes conocidos (post-review)

**Desviaciones respecto al plan original:**
- `tests/` está fuera de `tsc` (`exclude`), así que los fixtures y llamadas a `createOrder`/`POST /orders` se arreglaron corriendo la suite, no con el compilador. Helper nuevo `tests/helpers/orders.ts` (`seedCatalogVariant`, `createPendingOrder`).
- El folio se fuerza en tests con `vi.mock` + `vi.hoisted` (no `vi.spyOn`, que no funciona sobre exports ESM).
- Cambio masivo responde `data.result` (`{results, summary}`).
- `capturedAt`/`card` se escriben **después** de la transición a `paid` con un `$set` dirigido (`stampChargeDetails`, filtro `capturedAt` ausente), y también en los caminos de reintento; así Stripe lento nunca retrasa el "pagada". Sin dato de Stripe, `capturedAt` cae a `paidAt`.
- Revisión de código aplicada: lote que no aborta ante un error inesperado (esa orden sale `rejected`), 503 claro tras 3 colisiones de folio, regex de prefijo anclado sin `i` (usa el índice), `total` nunca negativo.

**Quedan (decisiones o fuera de M9a):**
- **Despliegue:** no hay migración. Antes de arrancar con la base de Atlas: borrar órdenes de prueba (sin `orderNumber`/`tax`/`termsAcceptedAt` el índice único falla con duplicados nulos y los DTOs salen incompletos) y vaciar la cola `notifications` de pruebas (filas viejas con `{publicId}` rompen el render de `orderNumber`). Auditorías viejas con `targetId = publicId` no salen en "actividad".
- **Edición de la tasa de IVA:** `Settings.tax.rateBps` existe (default 1600) sin ruta de actualización (Ajustes, M12c).
- **País vs envío:** corregir la dirección no recalcula `shippingCost` si cambia de nacional a internacional. Confirmar si es lo deseado antes de M9b.
- **Motivo de cancelación en carrera:** si el webhook cancela antes que el admin, `cancelReason` queda `payment_cancelled` y se pierde el texto del admin (la auditoría conserva quién actuó).
- Notas internas y `adminAlertedAt`: no entraron (no pedidas).
- Ruta pública por folio y enlace `…/orden/:publicId` (Bloque 3). `Shipment.orderPublicId` y carrier en lista cerrada (M10).
- M9b: Toast, SlideOver, Toggle, página Pedidos, `lib/orders/status.ts` (reexportar de shared), folio en `breadcrumbs.ts`.
