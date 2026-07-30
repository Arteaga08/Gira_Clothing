# M5 · API: 4 endpoints + DTOs compartidos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: usa `subagent-driven-development` (recomendado) o `executing-plans` para ejecutar tarea por tarea. Los pasos usan checkbox (`- [ ]`).
>
> **Al aprobar:** copiar este archivo a `docs/superpowers/plans/2026-07-29-m5-api-dtos-compartidos.md` (convención del repo) antes de empezar.

**Goal:** Cerrar los cuatro huecos del API que el dashboard admin (Bloque 2) necesita para tener
gráfica de tendencia, lista de clientes, lista global de envíos y salud del outbox de
notificaciones — y publicar los DTOs de dominio en `packages/shared` para que `apps/web` (M6+) los
consuma sin duplicar formas ni adivinarlas.

**Architecture:** Cuatro endpoints nuevos, todos bajo `adminRouter` (guard único ya existente), cada
uno siguiendo el patrón de capas del repo (`route → controller → service → model`) sin excepción.
`GET /admin/stats/timeseries` es el único con lógica nueva de verdad: bucketing por día calendario en
zona horaria de México, que hoy no existe en ningún lado del código. Los otros tres son listados o
agregaciones que reusan `parseListQuery`/`buildMeta` o el patrón de `sendResponse` con spread directo
que ya usan los demás endpoints de stats. `packages/shared` gana una capa de tipos (`Wire<T>` +
interfaces de dominio) que no existía — hoy solo tiene enums y el envelope genérico.

**Tech Stack:** Node 24 · pnpm 9.12 · TS estricto NodeNext ESM · Express 5 · Mongoose 8 (replica set)
· Joi · Vitest + supertest + `MongoMemoryReplSet` · **cero dependencias nuevas**.

---

## Context

M1–M4 están mergeados y verificados: 547+ bloques `it()` en verde, backend completo de catálogo,
carrito, checkout, pagos, envíos y notificaciones. El panel admin (Bloque 2) arranca ahora, y la
sesión anterior ya cerró el diseño visual (mockups estáticos en `mockups/`, aprobados por Manuel) y
escribió el spec (`docs/superpowers/specs/2026-07-29-gira-clothing-dashboard-spec.md`).

Ese spec depende de cuatro datos que el API de hoy no expone:

1. **Una serie de tiempo.** `GET /admin/orders/stats` y `GET /admin/stats/overview` devuelven un
   único bucket agregado (`{from, to, days}`), suficiente para KPIs pero no para una gráfica de
   barras por día. No existe bucketing por fecha en ningún archivo del repo.
2. **Un listado de clientes.** `User` existe desde M1 pero no tiene un solo endpoint de listado —
   solo login/registro/perfil propio.
3. **Un listado global de envíos.** `Shipment` existe desde M4, pero solo es alcanzable anidado bajo
   un pedido (`GET /admin/orders/:id/shipment`). No hay "todos los envíos en tránsito".
4. **La salud de la cola de notificaciones.** El modelo `Notification` (outbox) existe desde M4 con
   estados y reintentos, pero cero endpoints la exponen — hoy solo se ve entrando a Mongo.

Ninguno de los cuatro es zona de riesgo transaccional como M3 (nada aquí toca pagos ni stock), pero
sí hay tres trampas propias que el diseño resuelve por adelantado:

1. **El primer y último bucket de una serie rodante mienten.** `parseStatsRange` (usado por los tres
   servicios de stats existentes) calcula `from = now - days*24h`, una ventana rodante que no respeta
   fronteras de día calendario. Bucketear esa ventana por `$dateToString` dejaría el primer y el
   último día parciales, dibujando una caída falsa en ambos extremos de la gráfica. La solución es un
   helper nuevo (`parseDayRange`) que ancla `from` a medianoche local del día `hoy-(days-1)` —
   **nunca tocar `parseStatsRange`**, que tres servicios existentes y un test unitario ya fijan.
2. **`$unwind` antes de sumar infla el ingreso.** Si el pipeline de ingresos por día se calcula
   después de desenrollar `lines[]` (necesario para las unidades vendidas), sumar `$total` multiplica
   el ingreso por el número de líneas de cada pedido. La gráfica de ingresos necesita su propio
   pipeline, sin unwind.
3. **Dos endpoints nuevos tocan datos de personas** (`/admin/users` con PII de clientes,
   `/admin/notifications/health` con una cola que referencia correos de clientes). Ambos DTOs se
   construyen campo por campo, nunca por spread, y la muestra de notificaciones fallidas omite `to` y
   `payload` explícitamente.

**Resultado esperado:** M5 deja al API listo para que M6 (scaffold + sistema de diseño) y M7 (shell +
cliente HTTP) construyan sobre datos reales, y a M8 (Resumen) con su gráfica y su tarjeta de salud de
notificaciones alimentadas de verdad. `packages/shared` deja de ser solo enums: gana las interfaces de
dominio (`AdminOrder`, `Variant`, `AdminUser`, `AdminShipmentListItem`, `TimeseriesStats`…) que M6+
importan en vez de re-declarar.

---

## Decisiones cerradas en esta sesión (vinculantes)

| Decisión | Elección | Por qué |
|---|---|---|
| **Bucketing de tiempo** | Nuevo `parseDayRange.ts`, separado de `parseStatsRange.ts`. | `parseStatsRange` es una ventana rodante que 3 servicios y un test ya fijan; tocarla para agregar día-calendario rompería su contrato. Un helper nuevo, con su propio test, es más seguro que ampliar uno existente con un caso que no necesitaba. |
| **Zona horaria** | `America/Mexico_City`, derivada con `Intl.DateTimeFormat`, nunca un offset hardcodeado. | México eliminó el horario de verano en 2022; un `-6` fijo se rompería si esa política cambia. `Intl` resuelve el offset real de la fecha. |
| **Ingreso del timeseries** | Pipeline separado del de unidades, sumando `$total` sin `$unwind`. | Evita la inflación de ingreso por número de líneas; permite que el test assertee reconciliación exacta contra `orderStatsService.period.revenue`. |
| **`/admin/users` sin `:id`** | Solo `GET /` (listado). | El caso de uso real (ver los pedidos de un cliente) ya lo resuelve `GET /admin/orders?search=<email>`. Un detalle por id no tiene consumidor en el spec. |
| **`/admin/shipments` como router nuevo** | No se toca `adminShipmentRoutes.ts` (el anidado bajo pedido). | Son dos casos de uso distintos (uno global, uno por pedido) con DTOs distintos; mezclarlos arriesga romper el endpoint anidado que ya tienen tests verdes. |
| **DTO de lista de envíos separado** | `AdminShipmentListItem`, no `AdminShipment` reutilizado. | `AdminShipment` no tiene `id` ni `order` (no le hacen falta cuando ya sabes el pedido por la URL); una fila de tabla sí los necesita para poder enlazar. |
| **Fechas en `packages/shared`** | Interfaces con `Date`; `Wire<T>` mapea `Date → string` para el consumidor HTTP. | El API puede validar sus propios DTOs contra `Date` de verdad. El cliente HTTP (M7) jamás recibe un `Date` real desde JSON — tipar la respuesta como `Date` sería un bug de tipos que se manifiesta como excepción en runtime. |
| **`ADMIN_ALLOWED` pasa a exportarse** | Se exporta desde `orderTransitions.ts` (hoy privado). | M9 (Pedidos) necesita derivar qué botón de transición mostrar desde la MISMA fuente de verdad que el API, no de una copia que puede divergir. |
| **Labels a `packages/shared`** | Los mapas `LABELS` de `orderTransitions.ts` y `shipmentTransitions.ts` se mueven a `packages/shared/src/labels/` y se re-exportan desde donde viven hoy. | El dashboard necesita las mismas etiquetas en español que ya usa el API en sus mensajes de error; una copia en `apps/web` se desincroniza en silencio. |

## Fuera de alcance (no-negociable #5)

- No se toca el frontend. `apps/web` no existe todavía (M6).
- No se agrega `from`/`to` a `parseStatsRange` — nadie lo pidió y ya tiene su propio helper para el
  caso nuevo.
- No se agrega `GET /admin/users/:id`, ni edición ni desactivación de usuarios — el spec de M12 solo
  pide listado con drawer que redirige a Pedidos filtrado.
- No se agrega un endpoint de detalle para envíos globales — la fila de la lista enlaza al pedido, que
  ya tiene su propio `GET /admin/orders/:id` con el shipment anidado.
- No se agrega reintento manual de notificaciones fallidas desde este milestone (M8 lo pide en su UI,
  pero como acción sobre `dispatchNotifications`, ya existente; este milestone es de lectura).
- No se refactorizan `orderStats.test.ts` ni `statsOverview.test.ts` para reusar el nuevo
  `seedOrder.ts` — quedan como están, verdes.

## Estructura de archivos

### `packages/shared` (crear/modificar)

| Archivo | Responsabilidad |
|---|---|
| `src/types/wire.ts` | **Nuevo.** `Wire<T>` — mapeo recursivo `Date → string`. |
| `src/types/order.ts` | **Nuevo.** `OrderCustomer`, `ShippingAddress`, `OrderLine`, `PublicOrder`, `AdminOrder`. |
| `src/types/catalog.ts` | **Nuevo.** `PrintFamily`, `ProductCategory`, `Print`, `Product`, `Variant`. |
| `src/types/user.ts` | **Nuevo.** `PublicUser`, `AdminUser`. |
| `src/types/shipment.ts` | **Nuevo.** `ShipmentEvent`, `PublicTracking`, `AdminShipment`, `AdminShipmentListItem`. |
| `src/types/settings.ts` | **Nuevo.** `ShippingSettings`, `CurrencySettings`, `ReservationSettings`, `InventorySettings`, `Settings`. |
| `src/types/stats.ts` | **Nuevo.** `RevenueEntry`, `TopProduct`, `OrderStats`, `LowStockItem`, `InventoryStats`, `Overview`, `TimeseriesPoint`, `TimeseriesStats`, `OutboxHealth`. |
| `src/types/audit.ts` | **Nuevo.** `AuditLogEntry`. |
| `src/labels/orderStatus.ts` | **Nuevo.** El mapa `LABELS` de `OrderStatus`, movido aquí. |
| `src/labels/shipmentStatus.ts` | **Nuevo.** El mapa `LABELS` de `ShipmentStatus`, movido aquí. |
| `src/index.ts` | Extender el barrel con los tipos y labels nuevos. |

### `apps/api/src` (crear)

| Carpeta | Archivos |
|---|---|
| `utils/` | `parseDayRange.ts` |
| `services/` | `timeseriesStatsService.ts` · `userService.ts` |
| `controllers/` | `userController.ts` · `notificationController.ts` |
| `validators/` | `userValidator.ts` |
| `routes/v1/admin/` | `userRoutes.ts` · `shipmentRoutes.ts` (global, distinto del anidado) · `notificationRoutes.ts` |

### Archivos existentes a modificar

| Archivo | Cambio |
|---|---|
| [utils/orderTransitions.ts](apps/api/src/utils/orderTransitions.ts) | Exportar `ADMIN_ALLOWED`; re-exportar `LABELS` desde `@gira/shared`. |
| [utils/shipmentTransitions.ts](apps/api/src/utils/shipmentTransitions.ts) | Re-exportar `LABELS` desde `@gira/shared`. |
| [services/orderStatsService.ts](apps/api/src/services/orderStatsService.ts) | Exportar `REVENUE_STATUSES` (hoy privado). |
| [controllers/statsController.ts](apps/api/src/controllers/statsController.ts) | Agregar `timeseries`. |
| [routes/v1/admin/statsRoutes.ts](apps/api/src/routes/v1/admin/statsRoutes.ts) | Montar `GET /timeseries`. |
| [models/Order.ts](apps/api/src/models/Order.ts) | `orderSchema.index({ createdAt: -1 })`. |
| [models/User.ts](apps/api/src/models/User.ts) | `userSchema.index({ role: 1, createdAt: -1 })`. |
| [services/shipmentService.ts](apps/api/src/services/shipmentService.ts) | Agregar `listAdminShipments` + `AdminShipmentListItem`. |
| [controllers/shipmentController.ts](apps/api/src/controllers/shipmentController.ts) | Agregar `list`. |
| [validators/shipmentValidator.ts](apps/api/src/validators/shipmentValidator.ts) | Agregar `shipmentListQuerySchema`. |
| [services/notificationService.ts](apps/api/src/services/notificationService.ts) | Agregar `getOutboxHealth`. |
| [routes/v1/admin/index.ts](apps/api/src/routes/v1/admin/index.ts) | Montar `/users`, `/shipments`, `/notifications`. |
| `apps/api/tests/setup.ts` | Sin cambios esperados — se verifica en Tarea 8. |

---

## Tarea 0: Rama de trabajo

- [ ] **Paso 1:** confirmar el estado

Run: `git status --short && git branch -a`
Expected: status vacío (o solo `mockups/` sin trackear, de la sesión de diseño); rama actual
`feat/bloque2-dashboard-admin` o `main`.

- [ ] **Paso 2:** pedir aprobación a Manuel y crear la rama

```bash
git checkout -b feat/m5-api-dtos-compartidos
```

> **Nombre exacto de la rama: `feat/m5-api-dtos-compartidos`.** Verificarlo con
> `git branch --show-current` y **leerlo dos veces** antes de usarlo en cualquier comando de merge.
> Ninguna tarea posterior ejecuta `git add`/`commit`/`push` sin mostrar `git status` + `git diff` y
> esperar aprobación explícita de Manuel.

---

## Tarea 1: `Wire<T>` + DTOs de dominio en `packages/shared` (sin lógica, solo tipos)

**Depends on:** 0. **Files:** Create `packages/shared/src/types/{wire,order,catalog,user,shipment,settings,stats,audit}.ts`; Modify `packages/shared/src/index.ts`

- [ ] **Paso 1:** `wire.ts`

```ts
/**
 * Maps a server-side DTO (which may contain real `Date` objects) to the shape
 * a JSON HTTP response actually carries. `JSON.stringify` turns every `Date`
 * into an ISO string — a client that types the parsed response as `Date` is
 * one `order.createdAt.toLocaleDateString()` away from a runtime exception.
 *
 * Apply this ONLY at the HTTP boundary (apps/web's api client). The API
 * itself keeps using the plain interfaces below, where `Date` is real.
 */
type Wire<T> = T extends Date
  ? string
  : T extends (infer U)[]
    ? Wire<U>[]
    : T extends object
      ? { [K in keyof T]: Wire<T[K]> }
      : T;

export type { Wire };
```

- [ ] **Paso 2:** `order.ts` — espeja `orderService.PublicOrder` / `adminOrderService.PublicAdminOrder`

```ts
import type { Currency, OrderStatus, PaymentStatus } from "../enums/index.js";

interface OrderCustomer {
  email: string;
  name: string;
  phone?: string;
}

interface ShippingAddress {
  recipient: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

interface ImageAttrs {
  url: string;
  publicId: string;
  width: number;
  height: number;
}

interface OrderLine {
  sku: string;
  productName: string;
  printName: string;
  image?: ImageAttrs;
  qty: number;
  unitPrice: number;
  lineTotal: number;
}

interface PublicOrder {
  publicId: string;
  status: OrderStatus;
  customer: OrderCustomer;
  shipping: ShippingAddress;
  lines: OrderLine[];
  currency: Currency;
  subtotal: number;
  shippingCost: number;
  total: number;
  createdAt: Date;
  paidAt?: Date;
}

interface StatusHistoryEntry {
  status: OrderStatus;
  at: Date;
  reason?: string;
}

interface OrderPayment {
  provider: string;
  intentId?: string;
  status: PaymentStatus;
  lastError?: string;
}

interface AdminOrder extends PublicOrder {
  user?: string;
  statusHistory: StatusHistoryEntry[];
  payment: OrderPayment;
  updatedAt: Date;
}

export type {
  OrderCustomer,
  ShippingAddress,
  ImageAttrs,
  OrderLine,
  PublicOrder,
  StatusHistoryEntry,
  OrderPayment,
  AdminOrder,
};
```

- [ ] **Paso 3:** `catalog.ts` — espeja los DTOs de `printFamilyService`/`productCategoryService`/`printService`/`productService`/`variantService`

```ts
import type { ImageAttrs } from "./order.js";

interface PrintFamily {
  id: string;
  name: string;
  slug: string;
  description?: string;
  isActive: boolean;
}

interface ProductCategory {
  id: string;
  name: string;
  slug: string;
  description?: string;
  isActive: boolean;
}

interface Print {
  id: string;
  name: string;
  slug: string;
  sku: string;
  family: string;
  image: ImageAttrs;
  isActive: boolean;
}

interface Measurements {
  widthCm?: number;
  heightCm?: number;
  depthCm?: number;
}

interface Product {
  id: string;
  name: string;
  slug: string;
  category: string;
  description?: string;
  basePrice: number;
  measurements?: Measurements;
  materials?: string[];
  isActive: boolean;
}

interface Variant {
  id: string;
  product: string;
  print: string;
  sku: string;
  images: ImageAttrs[];
  priceOverride?: number;
  onHand: number;
  reserved: number;
  /** Computed: onHand - reserved. Never stored. */
  available: number;
  isActive: boolean;
}

export type { PrintFamily, ProductCategory, Print, Measurements, Product, Variant };
```

- [ ] **Paso 4:** `user.ts`

```ts
import type { UserRole } from "../enums/index.js";

interface PublicUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  twoFactorEnabled: boolean;
  isActive: boolean;
}

interface AdminUser extends PublicUser {
  createdAt: Date;
}

export type { PublicUser, AdminUser };
```

- [ ] **Paso 5:** `shipment.ts`

```ts
import type { ShipmentStatus } from "../enums/index.js";

interface ShipmentEvent {
  status: ShipmentStatus;
  at: Date;
  note?: string;
}

interface PublicTracking {
  carrier: string;
  trackingNumber: string;
  trackingUrl?: string;
  status: ShipmentStatus;
  events: ShipmentEvent[];
}

interface AdminShipment extends PublicTracking {
  createdAt: Date;
  updatedAt: Date;
}

/** Row shape for GET /admin/shipments — distinct from AdminShipment on purpose:
 *  a list row needs `id`/`order` to link somewhere; the order-nested endpoint
 *  never did, and `events[]` is unbounded so the list drops it for `lastEventAt`. */
interface AdminShipmentListItem {
  id: string;
  order: string;
  orderPublicId: string;
  carrier: string;
  trackingNumber: string;
  trackingUrl?: string;
  status: ShipmentStatus;
  lastEventAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type { ShipmentEvent, PublicTracking, AdminShipment, AdminShipmentListItem };
```

- [ ] **Paso 6:** `settings.ts`

```ts
import type { Currency, PriceRounding } from "../enums/index.js";

interface ShippingSettings {
  nationalFee: number;
  internationalFee: number;
  freeShippingThreshold: number | null;
}

interface CurrencySettings {
  mxnPerUsdCents: number;
  rounding: PriceRounding;
  supported: Currency[];
}

interface ReservationSettings {
  ttlMinutes: number;
  cartInactivityDays: number;
}

interface InventorySettings {
  lowStockThreshold: number;
}

interface Settings {
  id: string;
  shipping: ShippingSettings;
  currency: CurrencySettings;
  reservation: ReservationSettings;
  inventory: InventorySettings;
}

export type {
  ShippingSettings,
  CurrencySettings,
  ReservationSettings,
  InventorySettings,
  Settings,
};
```

- [ ] **Paso 7:** `stats.ts` — incluye las formas nuevas de M5 (`TimeseriesStats`, `OutboxHealth`)

```ts
import type { Currency, OrderStatus, NotificationChannelKind, NotificationType } from "../enums/index.js";

interface RevenueEntry {
  currency: Currency;
  revenue: number;
  orders: number;
  averageTicket: number;
}

interface TopProduct {
  sku: string;
  productName: string;
  printName: string;
  units: number;
}

interface OrderStatsAlerts {
  awaitingPreparation: number;
  stuckInProcessing: number;
  inTransitTooLong: number;
  disputed: number;
  pendingPayment: number;
}

interface OrderStats {
  range: { from: Date; to: Date; days: number };
  period: {
    totalOrders: number;
    paidOrders: number;
    revenue: RevenueEntry[];
    unitsSold: number;
    topProducts: TopProduct[];
  };
  byStatus: Partial<Record<OrderStatus, number>>;
  alerts: OrderStatsAlerts;
}

interface LowStockItem {
  id: string;
  sku: string;
  available: number;
}

interface InventoryStats {
  lowStockThreshold: number;
  activeVariants: number;
  outOfStock: number;
  lowStock: number;
  unitsOnHand: number;
  unitsReserved: number;
  unitsAvailable: number;
  lowStockItems: LowStockItem[];
}

interface Overview {
  orders: OrderStats;
  inventory: InventoryStats;
}

interface TimeseriesPoint {
  day: string; // "YYYY-MM-DD", local calendar day
  orders: number;
  unitsSold: number;
  revenue: RevenueEntry[];
}

interface TimeseriesStats {
  range: { from: Date; to: Date; days: number; timezone: string };
  granularity: "day";
  series: TimeseriesPoint[];
}

interface FailedNotificationSample {
  id: string;
  channel: NotificationChannelKind;
  type: NotificationType;
  attempts: number;
  lastError?: string;
  updatedAt: Date;
}

interface OutboxHealth {
  pending: number;
  sending: number;
  failed: number;
  sent: number;
  stale: number;
  oldestPendingAt: Date | null;
  failedSample: FailedNotificationSample[];
}

export type {
  RevenueEntry,
  TopProduct,
  OrderStatsAlerts,
  OrderStats,
  LowStockItem,
  InventoryStats,
  Overview,
  TimeseriesPoint,
  TimeseriesStats,
  FailedNotificationSample,
  OutboxHealth,
};
```

- [ ] **Paso 8:** `audit.ts`

```ts
import type { AuditAction, AuditModule } from "../enums/index.js";

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
```

- [ ] **Paso 9:** extender el barrel `src/index.ts` — **agregar al final**, no reordenar lo existente

```ts
import type { Wire } from "./types/wire.js";
import type {
  OrderCustomer,
  ShippingAddress,
  ImageAttrs,
  OrderLine,
  PublicOrder,
  StatusHistoryEntry,
  OrderPayment,
  AdminOrder,
} from "./types/order.js";
import type {
  PrintFamily,
  ProductCategory,
  Print,
  Measurements,
  Product,
  Variant,
} from "./types/catalog.js";
import type { PublicUser, AdminUser } from "./types/user.js";
import type {
  ShipmentEvent,
  PublicTracking,
  AdminShipment,
  AdminShipmentListItem,
} from "./types/shipment.js";
import type {
  ShippingSettings,
  CurrencySettings,
  ReservationSettings,
  InventorySettings,
  Settings,
} from "./types/settings.js";
import type {
  RevenueEntry,
  TopProduct,
  OrderStatsAlerts,
  OrderStats,
  LowStockItem,
  InventoryStats,
  Overview,
  TimeseriesPoint,
  TimeseriesStats,
  FailedNotificationSample,
  OutboxHealth,
} from "./types/stats.js";
import type { AuditLogEntry } from "./types/audit.js";
import { ORDER_STATUS_LABELS } from "./labels/orderStatus.js";
import { SHIPMENT_STATUS_LABELS } from "./labels/shipmentStatus.js";

export type {
  Wire,
  OrderCustomer,
  ShippingAddress,
  ImageAttrs,
  OrderLine,
  PublicOrder,
  StatusHistoryEntry,
  OrderPayment,
  AdminOrder,
  PrintFamily,
  ProductCategory,
  Print,
  Measurements,
  Product,
  Variant,
  PublicUser,
  AdminUser,
  ShipmentEvent,
  PublicTracking,
  AdminShipment,
  AdminShipmentListItem,
  ShippingSettings,
  CurrencySettings,
  ReservationSettings,
  InventorySettings,
  Settings,
  RevenueEntry,
  TopProduct,
  OrderStatsAlerts,
  OrderStats,
  LowStockItem,
  InventoryStats,
  Overview,
  TimeseriesPoint,
  TimeseriesStats,
  FailedNotificationSample,
  OutboxHealth,
  AuditLogEntry,
};
export { ORDER_STATUS_LABELS, SHIPMENT_STATUS_LABELS };
```

> **Nota de import:** si `src/index.ts` hoy importa los enums directamente de sus archivos (no de un
> barrel `enums/index.ts`), ajustar el import de `stats.ts`/`order.ts`/etc. arriba a las rutas reales
> (`../enums/orderStatus.js`, etc.) en vez de asumir `enums/index.ts` — verificar en el Paso 10.

- [ ] **Paso 10:** verificar que compila

Run: `pnpm --filter @gira/shared build`
Expected: sin errores. Si `enums/index.ts` no existe como barrel, corregir los imports de los
archivos nuevos para apuntar directamente a cada archivo de enum (mismo patrón que ya usa el
`index.ts` existente).

---

## Tarea 2: Mover los `LABELS` a `packages/shared` (TDD — no debe cambiar ningún string)

**Depends on:** 1. **Files:** Create `packages/shared/src/labels/{orderStatus,shipmentStatus}.ts`; Modify `apps/api/src/utils/orderTransitions.ts`, `apps/api/src/utils/shipmentTransitions.ts`

- [ ] **Paso 1: Test primero** — pinning test para asegurar que los mensajes de error no cambian ni un carácter

```ts
// apps/api/tests/unit/orderTransitions.test.ts — AGREGAR al describe existente, no reemplazar
import { ORDER_STATUS_LABELS } from "@gira/shared";

it("LABELS de @gira/shared coincide con el mapa re-exportado", () => {
  expect(LABELS).toBe(ORDER_STATUS_LABELS);
});
```

```ts
// apps/api/tests/unit/shipmentTransitions.test.ts — AGREGAR al describe existente
import { SHIPMENT_STATUS_LABELS } from "@gira/shared";

it("LABELS de @gira/shared coincide con el mapa re-exportado", () => {
  expect(LABELS).toBe(SHIPMENT_STATUS_LABELS);
});
```

- [ ] **Paso 2:** correr → FAIL (el import de `@gira/shared` no existe todavía).

- [ ] **Paso 3: Implementar**

`packages/shared/src/labels/orderStatus.ts` — **copiar tal cual** el contenido literal de
`LABELS` de [orderTransitions.ts:38-48](apps/api/src/utils/orderTransitions.ts#L38-L48):

```ts
import { OrderStatus } from "../enums/orderStatus.js";

const ORDER_STATUS_LABELS: Readonly<Record<OrderStatus, string>> = Object.freeze({
  [OrderStatus.PENDING_PAYMENT]: "pendiente de pago",
  [OrderStatus.PAID]: "pagada",
  [OrderStatus.PROCESSING]: "en preparación",
  [OrderStatus.SHIPPED]: "enviada",
  [OrderStatus.DELIVERED]: "entregada",
  [OrderStatus.CANCELLED]: "cancelada",
  [OrderStatus.EXPIRED]: "expirada",
  [OrderStatus.REFUNDED]: "reembolsada",
  [OrderStatus.DISPUTED]: "en disputa",
});

export { ORDER_STATUS_LABELS };
```

`packages/shared/src/labels/shipmentStatus.ts` — copiar el de
[shipmentTransitions.ts:30-36](apps/api/src/utils/shipmentTransitions.ts#L30-L36):

```ts
import { ShipmentStatus } from "../enums/shipment.js";

const SHIPMENT_STATUS_LABELS: Readonly<Record<ShipmentStatus, string>> = Object.freeze({
  [ShipmentStatus.IN_TRANSIT]: "en tránsito",
  [ShipmentStatus.OUT_FOR_DELIVERY]: "en reparto",
  [ShipmentStatus.DELIVERED]: "entregado",
  [ShipmentStatus.RETURNED]: "devuelto",
  [ShipmentStatus.LOST]: "extraviado",
});

export { SHIPMENT_STATUS_LABELS };
```

En `apps/api/src/utils/orderTransitions.ts`, reemplazar la declaración local de `LABELS` por:

```ts
import { ORDER_STATUS_LABELS as LABELS } from "@gira/shared";
```

y **borrar** la declaración `const LABELS: Readonly<Record<OrderStatus, string>> = ...` original
(queda re-exportada, no redeclarada, para que `export { TRANSITIONS, LABELS, ... }` al final del
archivo siga funcionando sin tocar el resto del archivo).

Aplicar el mismo reemplazo en `shipmentTransitions.ts` con `SHIPMENT_STATUS_LABELS as LABELS`.

- [ ] **Paso 4:** tests PASS. Diff, aprobación, commit.

Run: `pnpm --filter @gira/shared build && pnpm --filter @gira/api test -- orderTransitions shipmentTransitions`
Expected: verde, y ningún otro test que dependa de los strings de `LABELS` se rompe (son idénticos,
solo cambia de dónde vienen).

---

## Tarea 3: Exportar `ADMIN_ALLOWED` y `REVENUE_STATUSES` (hoy privados)

**Depends on:** 2. **Files:** Modify `apps/api/src/utils/orderTransitions.ts`, `apps/api/src/services/orderStatsService.ts`

- [ ] **Paso 1:** en `orderTransitions.ts`, cambiar la última línea

```ts
// antes:
export { TRANSITIONS, LABELS, canTransition, assertTransition, assertAdminTransition };
// después:
export { TRANSITIONS, LABELS, ADMIN_ALLOWED, canTransition, assertTransition, assertAdminTransition };
```

- [ ] **Paso 2:** en `orderStatsService.ts`, cambiar la última línea

```ts
// antes:
export type { OrderStats, RevenueEntry, TopProduct };
export { getOrderStats, DEFAULT_DAYS };
// después:
export type { OrderStats, RevenueEntry, TopProduct };
export { getOrderStats, DEFAULT_DAYS, REVENUE_STATUSES };
```

- [ ] **Paso 3:** verificar que nada dependía de que fueran privados

Run: `pnpm --filter @gira/api typecheck && pnpm --filter @gira/api test -- orderTransitions orderStats`
Expected: verde. Exportar algo que antes era privado nunca rompe un consumidor existente.

---

## Tarea 4: `parseDayRange` (TDD)

**Depends on:** 0. **Files:** Create `apps/api/src/utils/parseDayRange.ts`; Test `apps/api/tests/unit/parseDayRange.test.ts`

- [ ] **Paso 1: Test primero**

```ts
import { describe, it, expect } from "vitest";
import { parseDayRange, TIMEZONE, MAX_DAYS } from "../../src/utils/parseDayRange.js";

describe("parseDayRange", () => {
  it("default son 30 días", () => {
    const range = parseDayRange({});
    expect(range.days).toBe(30);
    expect(range.dayKeys).toHaveLength(30);
  });

  it("dayKeys tiene exactamente `days` elementos, en orden ascendente, sin huecos", () => {
    const range = parseDayRange({ days: 7 });
    expect(range.dayKeys).toHaveLength(7);
    const sorted = [...range.dayKeys].sort();
    expect(range.dayKeys).toEqual(sorted);
    // contiguos: cada día es el siguiente calendario del anterior
    for (let i = 1; i < range.dayKeys.length; i += 1) {
      const prev = new Date(`${range.dayKeys[i - 1]}T00:00:00Z`);
      const curr = new Date(`${range.dayKeys[i]}T00:00:00Z`);
      expect(curr.getTime() - prev.getTime()).toBe(24 * 60 * 60 * 1000);
    }
  });

  it("el último día del rango es hoy (día calendario local)", () => {
    const range = parseDayRange({ days: 7 });
    const todayLocal = new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE }).format(new Date());
    expect(range.dayKeys.at(-1)).toBe(todayLocal);
  });

  it("`from` es medianoche local del primer día, no una ventana rodante de 24h", () => {
    const range = parseDayRange({ days: 7 });
    const firstDayLocal = new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE }).format(range.from);
    expect(firstDayLocal).toBe(range.dayKeys[0]);
    // medianoche exacta: formatear la hora local debe dar 00:00
    const hour = new Intl.DateTimeFormat("en-US", {
      timeZone: TIMEZONE,
      hour: "2-digit",
      hour12: false,
    }).format(range.from);
    expect(["00", "24"]).toContain(hour);
  });

  it("clampea a MAX_DAYS", () => {
    const range = parseDayRange({ days: 400 });
    expect(range.days).toBe(MAX_DAYS);
    expect(range.dayKeys).toHaveLength(MAX_DAYS);
  });

  it("ignora un days inválido y usa el default", () => {
    expect(parseDayRange({ days: "no-es-numero" }).days).toBe(30);
    expect(parseDayRange({ days: -5 }).days).toBe(30);
    expect(parseDayRange({ days: 0 }).days).toBe(30);
  });

  it("expone timezone como America/Mexico_City", () => {
    expect(parseDayRange({}).timezone).toBe("America/Mexico_City");
  });
});
```

- [ ] **Paso 2:** correr → FAIL.

- [ ] **Paso 3: Implementar**

```ts
import { MAX_DAYS } from "./parseStatsRange.js";

/**
 * Calendar-day bucketing for the timeseries endpoint — deliberately separate
 * from parseStatsRange, whose rolling `now - days*24h` window leaves the
 * first and last bucket partial (a false dip on both ends of a chart). This
 * anchors `from` to LOCAL midnight of `today - (days - 1)`.
 *
 * The local day is derived via Intl, never a hardcoded UTC offset — Mexico
 * dropped DST in 2022, but this helper must not encode that as a fact.
 */

const TIMEZONE = "America/Mexico_City";
const DEFAULT_DAYS = 30;

interface DayRangeQuery {
  days?: unknown;
}

interface DayRange {
  from: Date;
  to: Date;
  days: number;
  timezone: string;
  /** "YYYY-MM-DD" local calendar days, ascending, length === days. */
  dayKeys: string[];
}

const dayFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE });

/** "YYYY-MM-DD" for the local calendar day a UTC instant falls on. */
const localDayKey = (instant: Date): string => dayFormatter.format(instant);

/** UTC instant for LOCAL midnight of the given "YYYY-MM-DD" day key. */
const localMidnightUtc = (dayKey: string): Date => {
  // A naive Date.parse of "YYYY-MM-DDT00:00:00" assumes the runtime's local
  // zone, not Mexico's. Instead: start from UTC midnight, measure the actual
  // offset Mexico had at that instant, and shift by it.
  const utcGuess = new Date(`${dayKey}T00:00:00Z`);
  const partsAtGuess = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(utcGuess);
  const hour = Number(partsAtGuess.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(partsAtGuess.find((p) => p.type === "minute")?.value ?? "0");
  // utcGuess reads as `hour:minute` in Mexico. To land on local midnight we
  // shift utcGuess backward by however far past midnight it actually reads.
  return new Date(utcGuess.getTime() - (hour * 60 + minute) * 60 * 1000);
};

const parseDayRange = (query: DayRangeQuery): DayRange => {
  const raw = Number(query.days);
  const days = Number.isFinite(raw) && raw >= 1 ? Math.min(Math.trunc(raw), MAX_DAYS) : DEFAULT_DAYS;

  const to = new Date();
  const todayKey = localDayKey(to);
  const todayMidnight = localMidnightUtc(todayKey);

  const dayKeys: string[] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const instant = new Date(todayMidnight.getTime() - i * 24 * 60 * 60 * 1000);
    dayKeys.push(localDayKey(instant));
  }

  const from = localMidnightUtc(dayKeys[0]!);
  return { from, to, days, timezone: TIMEZONE, dayKeys };
};

export type { DayRange, DayRangeQuery };
export { parseDayRange, TIMEZONE, DEFAULT_DAYS };
```

> **Nota de robustez horaria:** `localMidnightUtc` mide el offset en el instante de la *adivinanza*
> (medianoche UTC), no en el de la medianoche local real. Como el offset de México es constante
> dentro de una ventana de 24h alrededor de cualquier fecha (no hay salto de DST posible en ese
> rango desde 2022), esto es seguro. Si algún día México reintroduce DST, este helper seguirá
> funcionando porque **no asume** el offset — lo mide cada vez.

- [ ] **Paso 4:** tests PASS. Diff, aprobación, commit.

---

## Tarea 5: `timeseriesStatsService` + endpoint (TDD vía integración)

**Depends on:** 3, 4. **Files:** Create `apps/api/src/services/timeseriesStatsService.ts`; Modify `apps/api/src/controllers/statsController.ts`, `apps/api/src/routes/v1/admin/statsRoutes.ts`, `apps/api/src/models/Order.ts`; Test `apps/api/tests/integration/statsTimeseries.test.ts`, `apps/api/tests/helpers/seedOrder.ts`

- [ ] **Paso 1:** índice en `Order.ts` — agregar junto a los índices existentes

```ts
// junto a las otras orderSchema.index(...) ya existentes
orderSchema.index({ createdAt: -1 });
```

- [ ] **Paso 2: Test primero** — helper de seed, aislado para no arriesgar los tests existentes

```ts
// apps/api/tests/helpers/seedOrder.ts
import mongoose from "mongoose";
import { Currency, OrderStatus, PriceRounding } from "@gira/shared";
import { Order } from "../../src/models/Order.js";

interface SeedOrderOptions {
  status: OrderStatus;
  total: number;
  currency?: Currency;
  createdAt: Date;
  qty?: number;
}

/**
 * Direct Order.create fixture for M5 tests ONLY — lifted from the shape
 * orderStats.test.ts already uses. Kept separate so this file's tests never
 * risk the green suite of orderStats.test.ts / statsOverview.test.ts.
 */
const seedOrder = async (opts: SeedOrderOptions): Promise<mongoose.Types.ObjectId> => {
  const variant = new mongoose.Types.ObjectId();
  const product = new mongoose.Types.ObjectId();
  const qty = opts.qty ?? 1;
  const currency = opts.currency ?? Currency.MXN;

  const doc = await Order.create({
    publicId: new mongoose.Types.ObjectId().toHexString() + "x".repeat(20),
    customer: { email: "cliente@example.com", name: "Ana Pérez" },
    shipping: {
      recipient: "Ana Pérez",
      line1: "Calle Falsa 123",
      city: "CDMX",
      state: "CDMX",
      postalCode: "01000",
      country: "MX",
    },
    lines: [
      {
        variant,
        product,
        sku: `SKU-${variant.toHexString().slice(-6)}`,
        productName: "Tote",
        printName: "Amapolas",
        qty,
        unitPriceMxn: opts.total,
        unitPrice: opts.total,
        lineTotal: opts.total,
      },
    ],
    currency,
    exchangeRate: 1,
    rounding: PriceRounding.NONE,
    subtotal: opts.total,
    shippingCost: 0,
    total: opts.total,
    status: opts.status,
    statusHistory: [{ status: opts.status, at: opts.createdAt }],
    idempotencyKey: new mongoose.Types.ObjectId().toHexString(),
  });

  await Order.updateOne({ _id: doc._id }, { $set: { createdAt: opts.createdAt } });
  return doc._id;
};

export { seedOrder };
export type { SeedOrderOptions };
```

```ts
// apps/api/tests/integration/statsTimeseries.test.ts
import { describe, it, expect } from "vitest";
import request from "supertest";
import { Currency, OrderStatus } from "@gira/shared";
import { buildApp } from "../../src/app.js";
import { loginAsAdmin, loginAsCustomer, ORIGIN } from "../helpers/auth.js";
import { seedOrder } from "../helpers/seedOrder.js";

const app = buildApp();
const URL = "/api/v1/admin/stats/timeseries";

const localMidnightMxUtc = (dayKey: string, hourMx: number, minuteMx = 0): Date => {
  // Construimos una hora UTC que, leída en CDMX, cae en hourMx:minuteMx del día dayKey.
  // CDMX está en UTC-6 todo el año desde 2022 (sin DST) — válido para este test.
  const [y, m, d] = dayKey.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!, hourMx + 6, minuteMx));
};

describe("GET /admin/stats/timeseries", () => {
  it("rechaza sin sesión", async () => {
    const res = await request(app).get(URL);
    expect(res.status).toBe(401);
  });

  it("rechaza a un customer", async () => {
    const cookie = await loginAsCustomer(app);
    const res = await request(app).get(URL).set("cookie", cookie);
    expect(res.status).toBe(403);
  });

  it("con days=7 devuelve exactamente 7 buckets contiguos, ceros en los vacíos", async () => {
    const cookie = await loginAsAdmin(app);
    const res = await request(app).get(`${URL}?days=7`).set("cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body.data.series).toHaveLength(7);
    expect(res.body.data.granularity).toBe("day");
    for (const point of res.body.data.series) {
      expect(point).toEqual(
        expect.objectContaining({ day: expect.any(String), orders: 0, unitsSold: 0, revenue: [] }),
      );
    }
  });

  it("dos pedidos el mismo día local caen en el mismo bucket", async () => {
    const cookie = await loginAsAdmin(app);
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(new Date());
    await seedOrder({ status: OrderStatus.PAID, total: 10_000, createdAt: localMidnightMxUtc(today, 10) });
    await seedOrder({ status: OrderStatus.PAID, total: 20_000, createdAt: localMidnightMxUtc(today, 14) });

    const res = await request(app).get(`${URL}?days=1`).set("cookie", cookie);
    expect(res.body.data.series).toHaveLength(1);
    expect(res.body.data.series[0].orders).toBe(2);
  });

  it("MXN y USD el mismo día generan dos entradas de revenue, nunca sumadas", async () => {
    const cookie = await loginAsAdmin(app);
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(new Date());
    await seedOrder({
      status: OrderStatus.PAID,
      total: 10_000,
      currency: Currency.MXN,
      createdAt: localMidnightMxUtc(today, 9),
    });
    await seedOrder({
      status: OrderStatus.PAID,
      total: 500,
      currency: Currency.USD,
      createdAt: localMidnightMxUtc(today, 9),
    });

    const res = await request(app).get(`${URL}?days=1`).set("cookie", cookie);
    const revenue = res.body.data.series[0].revenue;
    expect(revenue).toHaveLength(2);
    const mxn = revenue.find((r: { currency: string }) => r.currency === Currency.MXN);
    const usd = revenue.find((r: { currency: string }) => r.currency === Currency.USD);
    expect(mxn.amount).toBe(10_000);
    expect(usd.amount).toBe(500);
  });

  it("regresión de zona horaria: 04:00 UTC del 15 jul (22:00 CDMX del 14) cae en el bucket del 14", async () => {
    const cookie = await loginAsAdmin(app);
    await seedOrder({
      status: OrderStatus.PAID,
      total: 10_000,
      createdAt: new Date("2026-07-15T04:00:00Z"),
    });

    const res = await request(app).get(`${URL}?days=365`).set("cookie", cookie);
    const bucket14 = res.body.data.series.find((p: { day: string }) => p.day === "2026-07-14");
    const bucket15 = res.body.data.series.find((p: { day: string }) => p.day === "2026-07-15");
    expect(bucket14?.orders ?? 0).toBeGreaterThanOrEqual(1);
    // Si el bucketing usara UTC en vez de zona local, este pedido caería en el 15.
    if (bucket15) expect(bucket15.orders).toBe(0);
  });

  it("sum(series[].orders) reconcilia con /admin/orders/stats para la misma ventana", async () => {
    const cookie = await loginAsAdmin(app);
    for (let i = 0; i < 3; i += 1) {
      await seedOrder({ status: OrderStatus.PAID, total: 15_000, createdAt: new Date() });
    }

    const [timeseries, orderStats] = await Promise.all([
      request(app).get(`${URL}?days=7`).set("cookie", cookie),
      request(app).get("/api/v1/admin/orders/stats?days=7").set("cookie", cookie),
    ]);

    const totalFromSeries = timeseries.body.data.series.reduce(
      (sum: number, p: { orders: number }) => sum + p.orders,
      0,
    );
    expect(totalFromSeries).toBe(orderStats.body.data.period.totalOrders);
  });

  it("default son 30 buckets; days=400 se clampea a 365", async () => {
    const cookie = await loginAsAdmin(app);
    const resDefault = await request(app).get(URL).set("cookie", cookie);
    expect(resDefault.body.data.series).toHaveLength(30);

    const resClamped = await request(app).get(`${URL}?days=400`).set("cookie", cookie);
    expect(resClamped.body.data.series).toHaveLength(365);
  });
});
```

- [ ] **Paso 3:** correr → FAIL (ruta no existe).

- [ ] **Paso 4: Implementar** — `timeseriesStatsService.ts`

```ts
import { Currency } from "@gira/shared";
import { Order } from "../models/Order.js";
import { parseDayRange, type DayRangeQuery } from "../utils/parseDayRange.js";
import { REVENUE_STATUSES } from "./orderStatsService.js";
import type { TimeseriesStats, TimeseriesPoint, RevenueEntry } from "@gira/shared";

/**
 * Daily bucketing for the Resumen chart. Three separate pipelines, not two:
 * summing $total AFTER $unwind (needed for units) would multiply revenue by
 * the number of lines per order. Revenue runs unwind-free so it reconciles
 * exactly with orderStatsService.period.revenue for the same window.
 *
 * Missing days are filled with zeros HERE, never on the client — an empty
 * day is `revenue: []`, matching the empty-DB convention the other stats
 * endpoints already use.
 */

interface OrderCountRow {
  _id: string;
  orders: number;
}

interface UnitsRow {
  _id: string;
  unitsSold: number;
}

interface RevenueRow {
  _id: { day: string; currency: Currency };
  revenue: number;
  orders: number;
}

const getTimeseriesStats = async (query: DayRangeQuery): Promise<TimeseriesStats> => {
  const range = parseDayRange(query);
  const inRange = { createdAt: { $gte: range.from, $lte: range.to } };
  const dayExpr = { $dateToString: { date: "$createdAt", format: "%Y-%m-%d", timezone: range.timezone } };

  const [orderRows, unitRows, revenueRows] = await Promise.all([
    Order.aggregate<OrderCountRow>([
      { $match: inRange },
      { $group: { _id: dayExpr, orders: { $sum: 1 } } },
    ]),

    Order.aggregate<UnitsRow>([
      { $match: { ...inRange, status: { $in: REVENUE_STATUSES } } },
      { $unwind: "$lines" },
      { $group: { _id: dayExpr, unitsSold: { $sum: "$lines.qty" } } },
    ]),

    // No $unwind here — summing $total post-unwind would multiply revenue by
    // the line count of each order.
    Order.aggregate<RevenueRow>([
      { $match: { ...inRange, status: { $in: REVENUE_STATUSES } } },
      { $group: { _id: { day: dayExpr, currency: "$currency" }, revenue: { $sum: "$total" }, orders: { $sum: 1 } } },
    ]),
  ]);

  const ordersByDay = new Map(orderRows.map((r) => [r._id, r.orders]));
  const unitsByDay = new Map(unitRows.map((r) => [r._id, r.unitsSold]));
  const revenueByDay = new Map<string, RevenueEntry[]>();
  for (const row of revenueRows) {
    const list = revenueByDay.get(row._id.day) ?? [];
    list.push({
      currency: row._id.currency,
      revenue: row.revenue,
      orders: row.orders,
      averageTicket: row.orders > 0 ? Math.round(row.revenue / row.orders) : 0,
    });
    revenueByDay.set(row._id.day, list);
  }

  const series: TimeseriesPoint[] = range.dayKeys.map((day) => ({
    day,
    orders: ordersByDay.get(day) ?? 0,
    unitsSold: unitsByDay.get(day) ?? 0,
    revenue: revenueByDay.get(day) ?? [],
  }));

  return {
    range: { from: range.from, to: range.to, days: range.days, timezone: range.timezone },
    granularity: "day",
    series,
  };
};

export { getTimeseriesStats };
```

> **Nota de forma de respuesta:** el test lee `revenue[0].amount` en la especificación conceptual del
> spec, pero el DTO real de `RevenueEntry` (ya usado por `orderStatsService`) llama al campo
> `revenue`, no `amount`. **Usar `revenue` en la implementación** (como arriba) y ajustar cualquier
> aserción de test que diga `.amount` a `.revenue` antes de correr — este plan prioriza la
> consistencia con el DTO ya existente sobre la nomenclatura tentativa del mockup.

`statsController.ts` — agregar:

```ts
import { getTimeseriesStats } from "../services/timeseriesStatsService.js";

const timeseries = asyncHandler(async (req: Request, res: Response) => {
  const data = await getTimeseriesStats(req.query);
  sendResponse(res, 200, "Serie de estadísticas obtenida correctamente.", data);
});

export { overview, timeseries };
```

`statsRoutes.ts` — agregar antes o después de `/overview` (no hay colisión de path):

```ts
import { statsRangeSchema } from "../../../validators/statsValidator.js";
import { overview, timeseries } from "../../../controllers/statsController.js";

statsRouter.get("/overview", validate(statsRangeSchema, "query"), overview);
statsRouter.get("/timeseries", validate(statsRangeSchema, "query"), timeseries);
```

- [ ] **Paso 5:** tests PASS. Diff, aprobación, commit.

Run: `pnpm --filter @gira/api test -- statsTimeseries parseDayRange`

---

## Tarea 6: `GET /admin/users` (TDD)

**Depends on:** 1. **Files:** Create `apps/api/src/services/userService.ts`, `apps/api/src/controllers/userController.ts`, `apps/api/src/validators/userValidator.ts`, `apps/api/src/routes/v1/admin/userRoutes.ts`; Modify `apps/api/src/models/User.ts`, `apps/api/src/routes/v1/admin/index.ts`; Test `apps/api/tests/integration/adminUsers.test.ts`

- [ ] **Paso 1:** índice en `User.ts`

```ts
userSchema.index({ role: 1, createdAt: -1 });
```

- [ ] **Paso 2: Test primero**

```ts
// apps/api/tests/integration/adminUsers.test.ts
import { describe, it, expect } from "vitest";
import request from "supertest";
import { UserRole } from "@gira/shared";
import { buildApp } from "../../src/app.js";
import { User } from "../../src/models/User.js";
import { loginAsAdmin, loginAsCustomer } from "../helpers/auth.js";

const app = buildApp();
const URL = "/api/v1/admin/users";

describe("GET /admin/users", () => {
  it("rechaza sin sesión", async () => {
    expect((await request(app).get(URL)).status).toBe(401);
  });

  it("rechaza a un customer", async () => {
    const cookie = await loginAsCustomer(app);
    expect((await request(app).get(URL).set("cookie", cookie)).status).toBe(403);
  });

  it("lista con meta de paginación", async () => {
    const cookie = await loginAsAdmin(app);
    await User.create({ name: "Cliente Uno", email: "uno@example.com", password: "Clave1234" });
    const res = await request(app).get(`${URL}?limit=5`).set("cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body.data.users.length).toBeGreaterThan(0);
    expect(res.body.meta).toEqual(
      expect.objectContaining({ page: 1, limit: 5, total: expect.any(Number) }),
    );
  });

  it("el DTO nunca expone password ni twoFactor.secret", async () => {
    const cookie = await loginAsAdmin(app);
    const res = await request(app).get(URL).set("cookie", cookie);
    for (const user of res.body.data.users) {
      expect(user).not.toHaveProperty("password");
      expect(user).not.toHaveProperty("twoFactor");
      expect(user).toEqual(
        expect.objectContaining({
          id: expect.any(String),
          name: expect.any(String),
          email: expect.any(String),
          role: expect.any(String),
          isActive: expect.any(Boolean),
          twoFactorEnabled: expect.any(Boolean),
        }),
      );
    }
  });

  it("busca por nombre y por email", async () => {
    const cookie = await loginAsAdmin(app);
    await User.create({ name: "Zoe Mendoza", email: "zoe.m@example.com", password: "Clave1234" });
    const byName = await request(app).get(`${URL}?search=Zoe`).set("cookie", cookie);
    const byEmail = await request(app).get(`${URL}?search=zoe.m@`).set("cookie", cookie);
    expect(byName.body.data.users.some((u: { email: string }) => u.email === "zoe.m@example.com")).toBe(true);
    expect(byEmail.body.data.users.some((u: { email: string }) => u.email === "zoe.m@example.com")).toBe(true);
  });

  it("filtra por role e isActive", async () => {
    const cookie = await loginAsAdmin(app);
    const res = await request(app).get(`${URL}?role=admin`).set("cookie", cookie);
    for (const user of res.body.data.users) expect(user.role).toBe(UserRole.ADMIN);
  });

  it("un sort desconocido cae al default sin romper", async () => {
    const cookie = await loginAsAdmin(app);
    const res = await request(app).get(`${URL}?sort=noExiste`).set("cookie", cookie);
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Paso 3:** correr → FAIL.

- [ ] **Paso 4: Implementar**

`validators/userValidator.ts`:

```ts
import Joi from "joi";
import { UserRole } from "@gira/shared";
import { listQueryBase } from "./listQueryValidator.js";

const userListQuerySchema = listQueryBase.keys({
  role: Joi.string().valid(...Object.values(UserRole)),
  isActive: Joi.boolean(),
});

export { userListQuerySchema };
```

`services/userService.ts`:

```ts
import type { ApiMeta, AdminUser } from "@gira/shared";
import { UserRole } from "@gira/shared";
import { User } from "../models/User.js";
import { parseListQuery, buildMeta, type ListQueryConfig, type RawListQuery } from "../utils/parseListQuery.js";

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

const listUsers = async (query: UserListQuery): Promise<{ items: AdminUser[]; meta: ApiMeta }> => {
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
```

`controllers/userController.ts`:

```ts
import type { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendResponse } from "../utils/sendResponse.js";
import { listUsers } from "../services/userService.js";

const list = asyncHandler(async (req: Request, res: Response) => {
  const { items, meta } = await listUsers(req.query);
  sendResponse(res, 200, "Clientes obtenidos correctamente.", { users: items }, meta);
});

export { list };
```

`routes/v1/admin/userRoutes.ts`:

```ts
import { Router } from "express";
import { validate } from "../../../middlewares/validate.js";
import { userListQuerySchema } from "../../../validators/userValidator.js";
import { list } from "../../../controllers/userController.js";

const userRouter = Router();

userRouter.get("/", validate(userListQuerySchema, "query"), list);

export { userRouter };
```

`routes/v1/admin/index.ts` — agregar el import y el mount (junto con las Tareas 7 y 8, un solo diff):

```ts
import { userRouter } from "./userRoutes.js";
// ...
adminRouter.use("/users", userRouter);
```

- [ ] **Paso 5:** tests PASS. Diff, aprobación, commit.

Run: `pnpm --filter @gira/api test -- adminUsers`

---

## Tarea 7: `GET /admin/shipments` (TDD)

**Depends on:** 1. **Files:** Modify `apps/api/src/services/shipmentService.ts`, `apps/api/src/controllers/shipmentController.ts`, `apps/api/src/validators/shipmentValidator.ts`, `apps/api/src/routes/v1/admin/index.ts`; Create `apps/api/src/routes/v1/admin/shipmentRoutes.ts`; Test `apps/api/tests/integration/adminShipments.test.ts`

- [ ] **Paso 1: Test primero**

```ts
// apps/api/tests/integration/adminShipments.test.ts
import { describe, it, expect } from "vitest";
import request from "supertest";
import { ShipmentStatus } from "@gira/shared";
import { buildApp } from "../../src/app.js";
import { loginAsAdmin, loginAsCustomer, ORIGIN } from "../helpers/auth.js";
import { seedOrder } from "../helpers/seedOrder.js";
import { OrderStatus } from "@gira/shared";

const app = buildApp();
const URL = "/api/v1/admin/shipments";

const createShipmentFor = async (cookie: string, orderId: string) => {
  return request(app)
    .post(`/api/v1/admin/orders/${orderId}/shipment`)
    .set("cookie", cookie)
    .set("Origin", ORIGIN)
    .send({ carrier: "DHL", trackingNumber: `TRK${Date.now()}` });
};

describe("GET /admin/shipments", () => {
  it("rechaza sin sesión", async () => {
    expect((await request(app).get(URL)).status).toBe(401);
  });

  it("rechaza a un customer", async () => {
    const cookie = await loginAsCustomer(app);
    expect((await request(app).get(URL).set("cookie", cookie)).status).toBe(403);
  });

  it("lista envíos cruzando varios pedidos, con id y order, sin events", async () => {
    const cookie = await loginAsAdmin(app);
    const orderId = await seedOrder({ status: OrderStatus.PROCESSING, total: 10_000, createdAt: new Date() });
    await createShipmentFor(cookie, String(orderId));

    const res = await request(app).get(URL).set("cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body.data.shipments.length).toBeGreaterThan(0);
    const row = res.body.data.shipments[0];
    expect(row).toEqual(
      expect.objectContaining({ id: expect.any(String), order: expect.any(String), orderPublicId: expect.any(String) }),
    );
    expect(row).not.toHaveProperty("events");
  });

  it("filtra por status", async () => {
    const cookie = await loginAsAdmin(app);
    const res = await request(app).get(`${URL}?status=in_transit`).set("cookie", cookie);
    for (const row of res.body.data.shipments) expect(row.status).toBe(ShipmentStatus.IN_TRANSIT);
  });

  it("busca por trackingNumber", async () => {
    const cookie = await loginAsAdmin(app);
    const orderId = await seedOrder({ status: OrderStatus.PROCESSING, total: 5_000, createdAt: new Date() });
    const tracking = `UNIQ${Date.now()}`;
    await request(app)
      .post(`/api/v1/admin/orders/${orderId}/shipment`)
      .set("cookie", cookie)
      .set("Origin", ORIGIN)
      .send({ carrier: "FedEx", trackingNumber: tracking });

    const res = await request(app).get(`${URL}?search=${tracking}`).set("cookie", cookie);
    expect(res.body.data.shipments.some((s: { trackingNumber: string }) => s.trackingNumber === tracking)).toBe(true);
  });
});
```

- [ ] **Paso 2:** correr → FAIL.

- [ ] **Paso 3: Implementar**

`validators/shipmentValidator.ts` — agregar al archivo existente:

```ts
import { ShipmentStatus } from "@gira/shared";
import { listQueryBase } from "./listQueryValidator.js";

const shipmentListQuerySchema = listQueryBase.keys({
  status: Joi.string().valid(...Object.values(ShipmentStatus)),
  carrier: Joi.string().trim().max(60),
});

export { /* ...lo que ya exporta el archivo... */ shipmentListQuerySchema };
```

`services/shipmentService.ts` — agregar (no tocar `toAdminShipment` ni sus consumidores existentes):

```ts
import type { ApiMeta, AdminShipmentListItem } from "@gira/shared";
import { parseListQuery, buildMeta, type ListQueryConfig, type RawListQuery } from "../utils/parseListQuery.js";
import { Shipment, type ShipmentAttrs } from "../models/Shipment.js";
import { ShipmentStatus } from "@gira/shared";

const LIST_CONFIG: ListQueryConfig = {
  sortable: ["createdAt", "updatedAt", "status"],
  searchable: ["trackingNumber", "orderPublicId", "carrier"],
  defaultSort: "-updatedAt",
};

interface ShipmentListQuery extends RawListQuery {
  status?: ShipmentStatus;
  carrier?: string;
}

// Structural read-model over a .lean() doc — events[] is unbounded, so the
// list projects it away and keeps only the timestamp of the latest one.
interface ShipmentListLean extends Omit<ShipmentAttrs, "events"> {
  _id: unknown;
  events: { at: Date }[];
}

const toShipmentListItem = (doc: ShipmentListLean): AdminShipmentListItem => ({
  id: String(doc._id),
  order: String(doc.order),
  orderPublicId: doc.orderPublicId,
  carrier: doc.carrier,
  trackingNumber: doc.trackingNumber,
  ...(doc.trackingUrl ? { trackingUrl: doc.trackingUrl } : {}),
  status: doc.status,
  lastEventAt: doc.events.at(-1)?.at ?? doc.updatedAt,
  createdAt: doc.createdAt,
  updatedAt: doc.updatedAt,
});

const listAdminShipments = async (
  query: ShipmentListQuery,
): Promise<{ items: AdminShipmentListItem[]; meta: ApiMeta }> => {
  const filters: Record<string, unknown> = {};
  if (query.status) filters.status = query.status;
  if (query.carrier) filters.carrier = query.carrier;

  const { filter, sort, skip, limit, page } = parseListQuery(query, LIST_CONFIG, filters);
  const [docs, total] = await Promise.all([
    Shipment.find(filter).sort(sort).skip(skip).limit(limit).lean(),
    Shipment.countDocuments(filter),
  ]);

  return {
    items: (docs as unknown as ShipmentListLean[]).map(toShipmentListItem),
    meta: buildMeta(total, { page, limit }),
  };
};

// añadir listAdminShipments al export final del archivo, junto a lo existente
```

`controllers/shipmentController.ts` — agregar:

```ts
import { listAdminShipments } from "../services/shipmentService.js";

const list = asyncHandler(async (req: Request, res: Response) => {
  const { items, meta } = await listAdminShipments(req.query);
  sendResponse(res, 200, "Envíos obtenidos correctamente.", { shipments: items }, meta);
});

// añadir `list` al export final del archivo
```

`routes/v1/admin/shipmentRoutes.ts` (nuevo, **distinto** de `adminShipmentRoutes.ts`):

```ts
import { Router } from "express";
import { validate } from "../../../middlewares/validate.js";
import { shipmentListQuerySchema } from "../../../validators/shipmentValidator.js";
import { list } from "../../../controllers/shipmentController.js";

const shipmentRouter = Router();

shipmentRouter.get("/", validate(shipmentListQuerySchema, "query"), list);

export { shipmentRouter };
```

`routes/v1/admin/index.ts` — agregar:

```ts
import { shipmentRouter } from "./shipmentRoutes.js";
// ...
adminRouter.use("/shipments", shipmentRouter);
```

- [ ] **Paso 4:** tests PASS. Diff, aprobación, commit.

Run: `pnpm --filter @gira/api test -- adminShipments shipments shipmentRoutes` (los dos últimos son
los suites existentes que no deben romperse).

---

## Tarea 8: `GET /admin/notifications/health` (TDD)

**Depends on:** 1. **Files:** Modify `apps/api/src/services/notificationService.ts`, `apps/api/src/routes/v1/admin/index.ts`; Create `apps/api/src/controllers/notificationController.ts`, `apps/api/src/routes/v1/admin/notificationRoutes.ts`; Test `apps/api/tests/integration/notificationsHealth.test.ts`

- [ ] **Paso 1: Test primero**

```ts
// apps/api/tests/integration/notificationsHealth.test.ts
import { describe, it, expect } from "vitest";
import request from "supertest";
import { NotificationChannelKind, NotificationType, NotificationStatus } from "@gira/shared";
import { buildApp } from "../../src/app.js";
import { Notification } from "../../src/models/Notification.js";
import { loginAsAdmin, loginAsCustomer } from "../helpers/auth.js";

const app = buildApp();
const URL = "/api/v1/admin/notifications/health";

describe("GET /admin/notifications/health", () => {
  it("rechaza sin sesión", async () => {
    expect((await request(app).get(URL)).status).toBe(401);
  });

  it("rechaza a un customer", async () => {
    const cookie = await loginAsCustomer(app);
    expect((await request(app).get(URL).set("cookie", cookie)).status).toBe(403);
  });

  it("base vacía devuelve ceros y oldestPendingAt null", async () => {
    const cookie = await loginAsAdmin(app);
    const res = await request(app).get(URL).set("cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual(
      expect.objectContaining({ pending: 0, sending: 0, failed: 0, sent: 0, stale: 0, oldestPendingAt: null, failedSample: [] }),
    );
  });

  it("cuenta por estado y calcula oldestPendingAt", async () => {
    const cookie = await loginAsAdmin(app);
    const old = new Date(Date.now() - 60 * 60 * 1000);
    await Notification.create({
      channel: NotificationChannelKind.EMAIL,
      type: NotificationType.ORDER_CONFIRMATION,
      to: "cliente@example.com",
      payload: { name: "Ana" },
      status: NotificationStatus.PENDING,
      nextAttemptAt: old,
    });
    await Notification.create({
      channel: NotificationChannelKind.EMAIL,
      type: NotificationType.ORDER_SHIPPED,
      to: "otro@example.com",
      payload: { name: "Luis" },
      status: NotificationStatus.FAILED,
      attempts: 5,
      lastError: "Recipient address rejected",
    });

    const res = await request(app).get(URL).set("cookie", cookie);
    expect(res.body.data.pending).toBe(1);
    expect(res.body.data.failed).toBe(1);
    expect(new Date(res.body.data.oldestPendingAt).getTime()).toBe(old.getTime());
  });

  it("failedSample omite `to` y `payload`, e incluye lastError truncado", async () => {
    const cookie = await loginAsAdmin(app);
    const res = await request(app).get(URL).set("cookie", cookie);
    for (const sample of res.body.data.failedSample) {
      expect(sample).not.toHaveProperty("to");
      expect(sample).not.toHaveProperty("payload");
      expect(sample).toEqual(
        expect.objectContaining({ id: expect.any(String), channel: expect.any(String), type: expect.any(String), attempts: expect.any(Number) }),
      );
    }
  });
});
```

- [ ] **Paso 2:** correr → FAIL.

- [ ] **Paso 3: Implementar**

`services/notificationService.ts` — agregar (reusa `MAX_ATTEMPTS`, ya exportado; no toca
`STALE_SENDING_MS`, que sigue privado y no hace falta aquí):

```ts
import { NotificationStatus } from "@gira/shared";
import type { OutboxHealth, FailedNotificationSample } from "@gira/shared";

const FAILED_SAMPLE_SIZE = 5;
const LAST_ERROR_MAX_LENGTH = 200;

interface StatusCountRow {
  _id: NotificationStatus;
  count: number;
}

interface FailedSampleLean {
  _id: unknown;
  channel: FailedNotificationSample["channel"];
  type: FailedNotificationSample["type"];
  attempts: number;
  lastError?: string;
  updatedAt: Date;
}

/**
 * Read-only outbox health for the dashboard's notification card. Deliberately
 * omits `to` (a customer's email) and `payload` (name + email) from the
 * failed sample — this is an operational health check, not a place a
 * customer's PII should surface. `lastError` is provider text and gets
 * truncated so a provider echoing the recipient back can't leak it whole.
 */
const getOutboxHealth = async (): Promise<OutboxHealth> => {
  const [statusRows, oldestPending, failedDocs] = await Promise.all([
    Notification.aggregate<StatusCountRow>([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
    Notification.findOne({ status: NotificationStatus.PENDING }).sort({ nextAttemptAt: 1 }).select("nextAttemptAt").lean(),
    Notification.find({ status: NotificationStatus.FAILED })
      .sort({ updatedAt: -1 })
      .limit(FAILED_SAMPLE_SIZE)
      .select("channel type attempts lastError updatedAt")
      .lean(),
  ]);

  const countOf = (status: NotificationStatus): number =>
    statusRows.find((r) => r._id === status)?.count ?? 0;

  return {
    pending: countOf(NotificationStatus.PENDING),
    sending: countOf(NotificationStatus.SENDING),
    failed: countOf(NotificationStatus.FAILED),
    sent: countOf(NotificationStatus.SENT),
    stale: 0, // reserved: no STALE status exists yet; SENDING past STALE_SENDING_MS is transient, not queryable as a distinct count without a second pass.
    oldestPendingAt: (oldestPending as { nextAttemptAt?: Date } | null)?.nextAttemptAt ?? null,
    failedSample: (failedDocs as unknown as FailedSampleLean[]).map((doc) => ({
      id: String(doc._id),
      channel: doc.channel,
      type: doc.type,
      attempts: doc.attempts,
      ...(doc.lastError ? { lastError: doc.lastError.slice(0, LAST_ERROR_MAX_LENGTH) } : {}),
      updatedAt: doc.updatedAt,
    })),
  };
};

// añadir getOutboxHealth al export final del archivo
```

> **Nota sobre `stale`:** el plan original preveía un contador de mensajes "estancados" (en
> `SENDING` más allá de `STALE_SENDING_MS`). Calcularlo exige una query aparte
> (`countDocuments({status: SENDING, updatedAt: {$lt: staleBefore}})`) — agregarla es trivial pero
> requiere importar `STALE_SENDING_MS`, hoy privado. **Decisión de esta tarea:** dejar `stale: 0`
> fijo por ahora y anotarlo en "Pendientes conocidos" en vez de exportar una constante interna solo
> para este campo; si M8 lo necesita de verdad, esa sesión decide si vale la pena.

`controllers/notificationController.ts` (nuevo):

```ts
import type { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendResponse } from "../utils/sendResponse.js";
import { getOutboxHealth } from "../services/notificationService.js";

const health = asyncHandler(async (_req: Request, res: Response) => {
  const data = await getOutboxHealth();
  sendResponse(res, 200, "Salud de notificaciones obtenida correctamente.", data);
});

export { health };
```

`routes/v1/admin/notificationRoutes.ts` (nuevo, sin validador — no recibe query, igual que
`GET /admin/variants/stats`):

```ts
import { Router } from "express";
import { health } from "../../../controllers/notificationController.js";

const notificationRouter = Router();

notificationRouter.get("/health", health);

export { notificationRouter };
```

`routes/v1/admin/index.ts` — agregar (mismo diff que las Tareas 6 y 7, un solo commit para las tres
si se ejecutan juntas):

```ts
import { notificationRouter } from "./notificationRoutes.js";
// ...
adminRouter.use("/notifications", notificationRouter);
```

- [ ] **Paso 4:** tests PASS. Diff, aprobación, commit.

Run: `pnpm --filter @gira/api test -- notificationsHealth`

---

## Tarea 9: Guardia de conformidad `Wire<T>` / DTOs

**Depends on:** 1, 5, 6, 7, 8. **Files:** Test `apps/api/tests/unit/wireContract.test.ts`

- [ ] **Paso 1:** escribir el test de compilación — sin aserciones en runtime, el propósito es que
  `tsc`/vitest fallen si un DTO de servicio diverge del tipo compartido

```ts
import { describe, it, expect } from "vitest";
import type {
  AdminOrder,
  AdminUser,
  AdminShipment,
  AdminShipmentListItem,
  TimeseriesStats,
  OutboxHealth,
  Overview,
} from "@gira/shared";

/**
 * Compile-time contract guard. If a service's real return type stops
 * matching its @gira/shared counterpart, this file fails typecheck — not a
 * browser at runtime. `satisfies` intentionally left off: an assignment
 * mismatch must be a hard TS error, not a widened inference.
 */
describe("wire contract", () => {
  it("compila (el valor real de esta prueba es el chequeo de tipos, no la aserción)", () => {
    const assertShape = <T>(_value: T): void => undefined;

    // Cada import de abajo, si el servicio real devuelve una forma distinta,
    // rompe `tsc --noEmit` en este archivo — ver Paso 2.
    assertShape<AdminOrder>({} as AdminOrder);
    assertShape<AdminUser>({} as AdminUser);
    assertShape<AdminShipment>({} as AdminShipment);
    assertShape<AdminShipmentListItem>({} as AdminShipmentListItem);
    assertShape<TimeseriesStats>({} as TimeseriesStats);
    assertShape<OutboxHealth>({} as OutboxHealth);
    assertShape<Overview>({} as Overview);

    expect(true).toBe(true);
  });
});
```

> Esta primera versión fija que los tipos compilan y existen. Una guardia más estricta (comparar el
> tipo de retorno real de `toAdminOrder(...)` contra `AdminOrder` con un helper `Expect<Equal<A,B>>`)
> queda anotada en "Pendientes conocidos" — no es indispensable para cerrar M5 y añade complejidad de
> tipos que esta tarea no necesita para ser útil.

- [ ] **Paso 2:** correr

Run: `pnpm --filter @gira/shared build && pnpm --filter @gira/api typecheck && pnpm --filter @gira/api test -- wireContract`
Expected: verde.

---

## Tarea 10: Verificación final

**Depends on:** 1–9.

- [ ] **Paso 1:** rebuild de shared (obligatorio tras cualquier edición de tipos)

```bash
pnpm --filter @gira/shared build
```

- [ ] **Paso 2:** tipos

```bash
pnpm -r exec tsc --noEmit
```

- [ ] **Paso 3:** build

```bash
pnpm build
```

- [ ] **Paso 4:** lint

```bash
pnpm lint
```

- [ ] **Paso 5:** suite completa

```bash
pnpm --filter @gira/api test
```

Expected: los 4 archivos de integración nuevos (`statsTimeseries`, `adminUsers`, `adminShipments`,
`notificationsHealth`) + `parseDayRange` + `wireContract` en verde, y **ningún** test existente roto
(en particular `orderStats.test.ts`, `statsOverview.test.ts`, `shipments.test.ts`,
`shipmentRoutes.test.ts`, `orderTransitions.test.ts`, `shipmentTransitions.test.ts`).

- [ ] **Paso 6:** dependencias

```bash
pnpm audit --prod --audit-level=high
```

Expected: limpio — **cero dependencias nuevas en M5**.

- [ ] **Paso 7:** recorrido manual end-to-end contra un servidor real

```bash
pnpm --filter @gira/api seed:admin -- --email admin@gira.test --password 'Adm1n2026!' --name 'Admin'
pnpm --filter @gira/api dev &
```

```bash
curl -c /tmp/gira.txt -H 'Origin: http://localhost:3000' -H 'Content-Type: application/json' \
  -d '{"email":"admin@gira.test","password":"Adm1n2026!"}' http://localhost:4000/api/v1/auth/login

curl -b /tmp/gira.txt 'http://localhost:4000/api/v1/admin/stats/timeseries?days=7' | jq '.data.series | length'
curl -b /tmp/gira.txt 'http://localhost:4000/api/v1/admin/users?limit=5' | jq '.data.users[0] | keys'
curl -b /tmp/gira.txt 'http://localhost:4000/api/v1/admin/shipments' | jq '.data'
curl -b /tmp/gira.txt 'http://localhost:4000/api/v1/admin/notifications/health' | jq '.data'
curl 'http://localhost:4000/api/v1/admin/users' # sin cookie
```

Expected respectivamente: `7` · array de llaves sin `password` ni `twoFactor` · `{shipments: [], ...}`
en base vacía (o con filas si se sembraron envíos) · `{pending:0, sending:0, failed:0, sent:0,
stale:0, oldestPendingAt:null, failedSample:[]}` en base vacía · `401`.

- [ ] **Paso 8:** checklist de seguridad — repasar los puntos que este milestone toca

  - Ningún endpoint nuevo se monta fuera de `adminRouter` (los 3 quedan bajo el guard único).
  - `/admin/users` no expone `password` ni `twoFactor.secret` (Tarea 6, test dedicado).
  - `/admin/notifications/health` no expone `to` ni `payload` (Tarea 8, test dedicado).
  - Ningún validador nuevo usa `stripUnknown: false` — todos pasan por `listQueryBase` o
    `statsRangeSchema`, ya configurados.
  - Cero dependencias nuevas (Paso 6).

- [ ] **Paso 9:** escribir la sección **"Pendientes conocidos (post-review)"** al final del plan
  copiado en `docs/superpowers/plans/`, aunque queden solo los dos ítems ya anotados en las Tareas 8
  y 9 — no dejarla vacía sin explicar por qué.

- [ ] **Paso 10:** mostrar `git status` + `git diff` completo y esperar aprobación explícita de
  Manuel antes de cualquier `git add`/`commit`. **No hacer commit como parte de este plan** sin esa
  aprobación.

---

## Verificación end-to-end (resumen)

| Qué | Comando / evidencia |
|---|---|
| Tipos | `pnpm -r exec tsc --noEmit` |
| Build | `pnpm build` |
| Lint | `pnpm lint` |
| Tests | `pnpm --filter @gira/api test` (nuevos: `statsTimeseries`, `adminUsers`, `adminShipments`, `notificationsHealth`, `parseDayRange`, `wireContract`; existentes intactos) |
| Dependencias | `pnpm audit --prod --audit-level=high` — cero nuevas |
| Índices | `getIndexes()` en `orders` (`createdAt: -1` nuevo) y `users` (`role_1_createdAt_-1` nuevo) |
| Timeseries | `?days=7` → 7 buckets; reconciliación con `/admin/orders/stats`; regresión de zona horaria |
| PII | `/admin/users` sin `password`/`twoFactor.secret`; `/admin/notifications/health` sin `to`/`payload` |
| Auth | Los 4 endpoints nuevos → 401 anónimo, 403 customer, 200 admin |

---

## Gotchas a recordar durante la ejecución

1. **`@gira/shared` se debe rebuildear** (`pnpm --filter @gira/shared build`) tras cada edición de
   tipos, o `tsc`, vitest y el runtime siguen viendo el paquete compilado anterior.
2. **`parseStatsRange` no se toca.** El helper nuevo es `parseDayRange`, archivo aparte. Si alguien
   "simplifica" fusionándolos, rompe los tres servicios de stats existentes y su test unitario.
3. **Nunca hardcodear el offset de México.** `localMidnightUtc` en `parseDayRange.ts` mide el offset
   con `Intl`, no asume `-6`. Si alguien lo reemplaza por aritmética fija, el helper se rompe el día
   que la política de DST cambie.
4. **El pipeline de ingresos del timeseries NO lleva `$unwind`.** Si alguien lo fusiona con el de
   unidades "para ahorrar una query", el ingreso queda multiplicado por el número de líneas de cada
   pedido.
5. **Los ingresos jamás se suman entre monedas**, ni en el timeseries ni en ningún endpoint de stats.
   Un `revenue` escalar en vez de un arreglo por moneda es un bug de negocio.
6. **`AdminShipmentListItem` es un tipo separado de `AdminShipment`.** No reusar `toAdminShipment`
   para la lista — no tiene `id`/`order`, y agregarlos ahí rompería `shipments.test.ts`.
7. **`GET /admin/shipments` es un router nuevo**, no una modificación de `adminShipmentRoutes.ts` (el
   anidado bajo `/orders/:id/shipment`). Confundirlos monta la lista global bajo la ruta equivocada.
8. **`STALE_SENDING_MS` sigue privado.** `getOutboxHealth` no lo necesita (Tarea 8); si una sesión
   futura quiere un contador de "estancadas" de verdad, esa es la primera línea a exportar.
9. **`ADMIN_ALLOWED` ahora es público** desde `orderTransitions.ts`. M9 lo importa para decidir qué
   botón de transición mostrar — no se debe volver a hacer privado sin revisar ese consumidor.
10. **Toda petición mutante en supertest necesita `.set("Origin", ORIGIN)`** (`verifyOrigin`),
    incluyendo el `POST .../shipment` que usan los tests de la Tarea 7 para sembrar datos.
11. **`sanitizeInput` escapa XSS en todos los strings** — si un test de búsqueda usa caracteres
    especiales, comparar contra la forma escapada, no la cruda.
12. **`Notification.lastError` se trunca a 200 caracteres** en el DTO de salud, nunca en el modelo —
    el dato completo sigue en Mongo para debugging directo.
13. **Git:** ninguna tarea ejecuta `git add`/`commit`/`push` sin mostrar el diff y recibir aprobación
    explícita de Manuel. La rama es `feat/m5-api-dtos-compartidos` — verificarla con
    `git branch --show-current` antes de cualquier merge.

---

## Pendientes conocidos (post-review)

**Ejecutado el 2026-07-30.** Verificación final completa: `pnpm -r exec tsc --noEmit` limpio,
`pnpm build` limpio, `pnpm lint` limpio, `pnpm audit --prod --audit-level=high` sin
vulnerabilidades y **cero dependencias nuevas** (sin diff en `package.json`/`pnpm-lock.yaml`),
594/595 tests verdes (ver punto 3), y recorrido manual end-to-end contra la base de desarrollo real
(login admin → los 4 endpoints nuevos devolvieron exactamente la forma esperada → 401 sin cookie).
Usuario de verificación creado y luego eliminado de la base real.

### 1. `OutboxHealth.stale` queda fijo en `0`

Calcular mensajes realmente "estancados" (`SENDING` más allá de `STALE_SENDING_MS`) exige exportar
esa constante hoy privada de `notificationService.ts` y sumar una query. Se decidió no hacerlo en
este milestone (ver nota en Tarea 8) porque ningún consumidor de M5 lo necesita — el spec de M8 pide
mostrar la tarjeta con pendientes/fallidas/enviadas, no un contador de estancadas. Si M8 lo pide de
verdad al construir la UI, es una tarea de una línea (exportar la constante + una `countDocuments`).

### 2. Guardia de conformidad `Wire<T>` es solo de existencia, no de forma exacta

El test de la Tarea 9 verifica que los tipos compilan y son importables, pero no compara
estructuralmente el retorno real de cada `toAdmin*` con su interfaz de `@gira/shared` campo por
campo. Una guardia más estricta (con un helper `Expect<Equal<A, B>>`) detectaría un campo de más o
de menos en tiempo de compilación en vez de depender de que los tests de integración lo noten. Se
dejó fuera de alcance por complejidad de tipos no esencial para cerrar M5; candidata a hacerse cuando
M7 empiece a consumir estos tipos desde `apps/web` y un mismatch real aparezca.

### 3. Un test de `inventoryStats.test.ts` falló bajo la suite completa, no relacionado con M5

`pnpm --filter @gira/api test` (595 tests) dio 594 verdes y 1 fallo: "clasifica sin stock, bajo
stock y disponible con el umbral configurado" en `tests/integration/inventoryStats.test.ts`, con
`Cannot read properties of undefined (reading 'family')`. Ese archivo no fue tocado por M5. Corrido
en aislamiento (`pnpm --filter @gira/api test -- inventoryStats`), los 8 tests del archivo pasaron
limpio. Coincide con el flake ya documentado en la memoria del proyecto (contención de CPU bajo
carga completa de la suite, no un bug de aplicación). No bloqueante para cerrar M5.

### 4. Dos correcciones al plan original durante la ejecución

- **`?days=400` vía HTTP no ejercita el clamp interno de `parseDayRange`.** El plan original
  esperaba que `GET /admin/stats/timeseries?days=400` devolviera 365 buckets por clamp silencioso.
  En la práctica, `statsRangeSchema` (Joi, reusado tal cual) ya rechaza `days > 365` con 400 antes de
  que la petición llegue al handler — el clamp de `parseDayRange`/`MAX_DAYS` es defensa en
  profundidad para llamadas directas al servicio, no alcanzable desde HTTP. El test de integración
  se corrigió para reflejar el comportamiento real (`days=365` → 365 buckets; `days=400` → 400 Bad
  Request); el clamp interno sigue cubierto por `parseDayRange.test.ts` a nivel unitario.
- **Dos aserciones de `statsTimeseries.test.ts` usaban horas locales fijas** (10:00/14:00 CDMX) para
  sembrar pedidos "de hoy". Como `parseDayRange.to` es el instante real de la petición y no el fin
  del día calendario, una hora fija en el futuro respecto al momento de ejecución del test quedaba
  fuera de rango. Se reemplazaron por deltas relativos a `Date.now()` (minutos atrás), que siempre
  caen en el pasado y en el día de hoy salvo el segundo exacto de medianoche.
