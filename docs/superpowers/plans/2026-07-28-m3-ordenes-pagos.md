# M3 · Órdenes + Pagos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: usa `subagent-driven-development` (recomendado) o `executing-plans` para ejecutar tarea por tarea. Los pasos usan checkbox (`- [ ]`).
>
> **Al aprobar:** copiar este archivo a `docs/superpowers/plans/2026-07-28-m3-ordenes-pagos.md` (convención del repo) antes de empezar.

**Goal:** Entregar el flujo completo de compra en `apps/api` — carrito persistido, checkout invitado o con cuenta, reserva de stock con expiración, cobro por Stripe detrás de adapter y webhook como única fuente del estado "pagado" — sin una sola ruta por la que se pueda sobrevender o cobrar dos veces.

**Architecture:** Se replica el layering de M1/M2 (`routes → controllers → services → models`, controllers nunca importan models ni adapters — lo impone ESLint). Tres piezas nuevas rompen el molde de M2 a propósito y por razones concretas: (1) `reservationService` corre dentro de `session.withTransaction` porque toca N `Variant` + 1 `StockReservation`, (2) la ruta del webhook se monta con `express.raw` **antes** de toda la cadena de middleware porque la verificación de firma necesita el byte exacto, (3) `src/jobs/` arranca solo desde `server.ts` para que los tests nunca hereden timers. El resto —Settings, Cart, Order, admin— sigue el patrón vertical de M2 al pie de la letra.

**Tech Stack:** Node 24 · pnpm 9.12 · TS estricto NodeNext ESM · Express 5 · Mongoose 8 (**replica set**, por transacciones) · Joi · stripe · Vitest + supertest + `mongodb-memory-server` (`MongoMemoryReplSet`).

---

## Context

M1 y M2 están mergeados a `main` y verificados: monorepo pnpm, auth JWT + 2FA, catálogo completo (`PrintFamily`/`Print`/`ProductCategory`/`Product`/`Variant`) y stock atómico probado bajo concurrencia real. Hoy el backend sabe **qué se vende** pero no sabe **vender**: no hay carrito, ni orden, ni cobro, ni forma de apartar una unidad mientras la clienta paga.

M3 construye exactamente eso, y es el milestone de mayor riesgo del proyecto. El spec lo llama "riesgo arquitectónico #1": **la ventana entre reservar stock y confirmar el pago**. Dos fallas concretas hay que impedir, y ninguna se arregla con cuidado al codear — se arreglan con diseño:

1. **Sobreventa.** Dos clientas compran la última unidad al mismo tiempo, ambas pagan, una se queda sin producto después de que ya le cobraste.
2. **Doble cobro / doble descuento de stock.** El webhook de Stripe se reentrega (lo hace por diseño), el cliente da doble clic en "pagar", o la red reintenta un request — y el mismo pago produce dos órdenes o descuenta stock dos veces.

Cuatro capas independientes lo mitigan, y **ninguna sustituye a la otra**: `findOneAndUpdate` atómico (evita sobreventa) + reserva con expiración (evita stock congelado) + webhook como única fuente del estado "pagado" (evita órdenes fantasma) + job de conciliación (cubre webhooks perdidos). Por eso **TDD es obligatorio** aquí, y por eso los tests de concurrencia con `Promise.allSettled` no son opcionales.

**Resultado esperado:** el frontend público (Bloque 3) puede llevar a una clienta de "agregar al carrito" a "orden pagada con stock descontado" sin intervención manual, y el panel admin (Bloque 2) puede listar, filtrar y operar esas órdenes.

---

## Decisiones cerradas en esta sesión (vinculantes)

| Decisión | Elección | Por qué |
|---|---|---|
| **Carrito** | Persistido en Mongo **solo para usuarios con cuenta**. TTL por inactividad configurable. El invitado arma su carrito en el cliente y manda las líneas en el checkout. | Un carrito de invitado en DB obliga a una cookie de sesión anónima y a un segundo objeto que expirar y reconciliar, sin beneficio real: el invitado no vuelve a otro dispositivo. |
| **Modo Stripe** | `PaymentIntent` + Payment Element embebido. El backend crea el intent y devuelve `client_secret`. | PCI SAQ-A, el checkout no sale del sitio de Gira, y la interfaz del adapter (`createPayment`/`getPayment`/`refundPayment`/`parseWebhookEvent`) queda angosta y traducible a Mercado Pago. |
| **Dónde vive la reserva** | Colección `StockReservation`, un doc por orden. | Ver el bloque siguiente — es la decisión más importante del milestone. |
| **Índice TTL** | Sobre `purgeAt`, **no** sobre `expiresAt`. | Ver el bloque siguiente. |
| **Multi-documento** | `session.withTransaction` en reserve/commit/release. Mongo local pasa a replica set de 1 nodo. | N `Variant` + 1 `StockReservation` en la misma operación. Sin transacción, un crash a media operación deja `reserved` inflado o descontado de más — corrupción silenciosa de stock. |
| **Acceso a "mi orden"** | `GET /orders/:publicId` con id CSPRNG de 32 bytes como capacidad bearer + rate limit dedicado. Además `GET /orders/mine` para el panel de usuario autenticado. | El id **es** la credencial: va en el correo de M4 y se abre de un clic. No adivinable por fuerza bruta. |
| **Variante huérfana** | **No se puede reservar** (409), y además se cierra el pendiente #2 de M2 en su origen: reactivar una variante con producto/print inactivo devuelve 409. | Ver Tarea 9. |
| **Moneda del cobro** | Se elige por orden (`MXN` o `USD`) y **toda la aritmética se hace en esa moneda** tras convertir cada precio unitario. Stripe cobra en una sola moneda; los totales tienen que cuadrar exactamente con lo cobrado. | — |
| **Reposición al reembolsar** | Automática **solo** si la orden seguía en `paid` (nada salió del taller). De `processing` en adelante, no se repone y queda el audit para que la admin ajuste con `PATCH /admin/variants/:id/stock`. | Reponer stock de algo que ya se envió inventa unidades que no existen. |

### La regla dura del TTL (lee esto antes de tocar `StockReservation`)

Un índice TTL de Mongo **borra documentos**. No puede decrementar `Variant.reserved`. Si el TTL borrara una reserva activa, esas unidades quedarían apartadas para siempre, sin ningún registro de a quién devolvérselas: **stock fantasma permanente**.

Por eso el diseño separa dos cosas que suenan iguales:

```
expiresAt   → cuándo vence la reserva.  Lo barre el CRON, que libera de verdad
              (flip atómico active→released + $inc reserved: -qty).
              NO tiene índice TTL.

purgeAt     → cuándo se puede borrar el documento ya inútil.  Se fija SOLO al
              llegar a estado terminal (committed/released), 30 días después.
              Este sí tiene el índice TTL (expireAfterSeconds: 0).
```

El índice TTL nunca ve una reserva activa. Es un recolector de basura, no el mecanismo de liberación.

### Por qué `flip primero, $inc después`

Dentro de la transacción el orden importa igual. Primero se hace el flip atómico de `status` sobre la reserva (`{ order, status: "active" }` en el filtro), y solo si ese flip devolvió documento se aplican los `$inc` sobre las variantes. El filtro por `status: "active"` es el **ticket de exactamente-una-vez**: veinte llamadas concurrentes a `commit` compiten por él y exactamente una lo gana.

La transacción cierra el resto: si algo falla a media aplicación, el flip se revierte junto con los `$inc`. Sin transacción, el mismo orden fallaría hacia "stock atascado" (recuperable a mano) en vez de hacia "sobreventa" (irrecuperable) — pero fallaría igual. Por eso hay transacción.

---

## Fuera de alcance (no-negociable #5)

No se toca ni se "prepara" nada de esto: correos (Resend), Telegram, captura de guía/paquetería y su sub-recurso de tracking, cupones/promociones, endpoints de stats, dashboard, frontend, Mercado Pago, CFDI, endpoint público de cotización de envío pre-checkout.

> **Nota sobre el "panel de usuario":** en esta sesión se construyen **solo los endpoints** que ese panel consumirá (`GET /orders/mine`, `GET /orders/mine/:id`, el carrito). La interfaz visual es Bloque 3 y no se diseña aquí.
>
> **Gap consciente:** el storefront va a necesitar cotizar el envío **antes** de crear la orden (para mostrar "te faltan $X para envío gratis"). No está en la lista de M3, así que no se construye. Cuando se pida, es aditivo: un `POST /orders/quote` que reusa `quoteTotals` sin reservar ni persistir nada.

---

## Estructura de archivos

### `packages/shared` (modificar)

| Archivo | Responsabilidad |
|---|---|
| `src/enums/orderStatus.ts` | **Nuevo.** `OrderStatus`, `PaymentStatus`, `ReservationStatus`. |
| `src/enums/money.ts` | **Nuevo.** `Currency`, `PriceRounding`. |
| `src/enums/auditAction.ts` | + `AuditModule.ORDERS` / `PAYMENTS` / `SETTINGS` / `CART` y sus acciones. |
| `src/index.ts` | Re-exportar lo nuevo. |

### `apps/api/src` (crear)

| Carpeta | Archivos |
|---|---|
| `utils/` | `money.ts` · `publicId.ts` · `orderTransitions.ts` |
| `adapters/payment/` | `types.ts` · `stripePaymentProvider.ts` · `stubPaymentProvider.ts` · `index.ts` (factory) |
| `models/` | `Settings.ts` · `Cart.ts` · `StockReservation.ts` · `Order.ts` · `WebhookEvent.ts` |
| `validators/` | `settingsValidator.ts` · `cartValidator.ts` · `orderValidator.ts` · `adminOrderValidator.ts` |
| `services/` | `settingsService.ts` · `cartService.ts` · `reservationService.ts` · `pricingService.ts` · `orderService.ts` · `orderPaymentService.ts` · `webhookService.ts` · `adminOrderService.ts` |
| `controllers/` | `settingsController.ts` · `cartController.ts` · `orderController.ts` · `webhookController.ts` · `adminOrderController.ts` |
| `routes/v1/` | `cartRoutes.ts` · `orderRoutes.ts` |
| `routes/v1/admin/` | `settingsRoutes.ts` · `adminOrderRoutes.ts` |
| `routes/` | `webhookRoutes.ts` (fuera de `v1/` a propósito: se monta antes de la cadena) |
| `jobs/` | `scheduler.ts` · `expireReservations.ts` · `reconcilePayments.ts` |

### Archivos existentes a modificar

| Archivo | Cambio |
|---|---|
| [app.ts](apps/api/src/app.ts) | Montar `webhookRouter` con `express.raw` **inmediatamente después de `helmet()`**, antes de todo lo demás. |
| [server.ts](apps/api/src/server.ts) | `startJobs()` tras conectar DB; `stopJobs()` en el graceful shutdown. |
| [config/env.ts](apps/api/src/config/env.ts) | `stripe: StripeConfig \| null` con el mismo patrón todo-o-nada de Cloudinary. |
| [middlewares/rateLimit.ts](apps/api/src/middlewares/rateLimit.ts) | `checkoutLimiter`, `orderLookupLimiter`, `cartLimiter`. |
| [routes/v1/index.ts](apps/api/src/routes/v1/index.ts) | Montar `/cart` y `/orders`. |
| [routes/v1/admin/index.ts](apps/api/src/routes/v1/admin/index.ts) | Montar `/settings` y `/orders`. |
| [services/variantService.ts](apps/api/src/services/variantService.ts) | Guard de reactivación (pendiente #2 de M2). |
| [tests/setup.ts](apps/api/tests/setup.ts) | Conectar al replica set compartido con `dbName` único por archivo. |
| [apps/api/vitest.config.ts](apps/api/vitest.config.ts) | `globalSetup` + techo de workers (pendiente #1 de M2). |
| `apps/api/.env.*.example` | 2 líneas Stripe con placeholders + nota del `?replicaSet=` en `MONGODB_URI` de dev. |
| [README.md](README.md) | Sección "Mongo local como replica set". |

---

## Tarea 0: Rama de trabajo

El repo está en `main` limpio (`a1cf974 FEAT: post-review`). No existe ninguna otra rama, local ni remota.

- [ ] **Paso 1:** confirmar el estado

Run: `git status --short && git branch -a`
Expected: sin salida en el status; solo `main` y `remotes/origin/main`.

- [ ] **Paso 2:** pedir aprobación a Manuel y crear la rama

```bash
git checkout -b feat/m3-ordenes-pagos
```

> **Nombre exacto de la rama: `feat/m3-ordenes-pagos`.** Verificarlo con `git branch --show-current` antes de usarlo en cualquier comando de merge, y **leerlo dos veces** antes de escribirlo. Ninguna tarea posterior ejecuta `git add`/`commit`/`push` sin mostrar `git status` + `git diff` y esperar aprobación explícita.

---

## Tarea 1: Infraestructura de tests — replica set + fin del flake

**Depends on:** 0. **Va primero porque todo lo demás depende de que las transacciones funcionen en tests.**

**Files:** Create `apps/api/tests/globalSetup.ts`; Modify `apps/api/tests/setup.ts`, `apps/api/vitest.config.ts`, `README.md`, `apps/api/.env.development.example`

Esto cierra de paso el **pendiente #1 de M2** (flakiness bajo ejecución paralela): hoy cada archivo de test levanta su propio `MongoMemoryServer`, y con 10 archivos eso satura CPU/IO. Un solo replica set compartido por `globalSetup` elimina la causa raíz en vez de parchear el pool.

- [ ] **Paso 1: `tests/globalSetup.ts`** — arranca UN replica set para toda la suite

```ts
import { MongoMemoryReplSet } from "mongodb-memory-server";

/**
 * Boots ONE in-memory replica set for the whole suite. A replica set (not a
 * standalone) is mandatory: reservationService runs inside
 * session.withTransaction, and Mongo only supports transactions on a replica
 * set. `count: 1` is enough — we need the oplog, not real replication.
 *
 * Sharing one server across every test file also kills the M2 flake: booting a
 * separate mongod per file saturated CPU/IO under Vitest's default pool.
 */

let replSet: MongoMemoryReplSet;

const setup = async (): Promise<void> => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: "wiredTiger" } });
  process.env.MONGO_TEST_URI = replSet.getUri();
};

const teardown = async (): Promise<void> => {
  await replSet.stop();
};

export { setup, teardown };
```

- [ ] **Paso 2: `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    globalSetup: ["./tests/globalSetup.ts"],
    setupFiles: ["./tests/setup.ts"],
    // The replica set downloads a binary on first run; give it room.
    testTimeout: 30000,
    hookTimeout: 60000,
    include: ["tests/**/*.test.ts"],
    // One shared mongod, but many workers hammering it. Capping threads keeps
    // the suite deterministic (M2 post-review, pendiente #1).
    poolOptions: { threads: { maxThreads: 4 } },
  },
});
```

- [ ] **Paso 3: `tests/setup.ts`** — reemplazar el bloque de conexión (líneas 25-49) por:

```ts
import { beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";
import { randomBytes } from "node:crypto";

// Each test FILE gets its own database on the shared replica set, so the
// afterEach wipe never touches another file's data while both run in parallel.
const dbName = `gira_test_${randomBytes(6).toString("hex")}`;

beforeAll(async () => {
  const uri = process.env.MONGO_TEST_URI;
  if (!uri) throw new Error("globalSetup no expuso MONGO_TEST_URI.");
  await mongoose.connect(uri, { dbName });
  // Unique-index assertions (duplicate slug/sku/publicId -> 409) must be
  // deterministic on the very first test — autoIndex builds lazily otherwise.
  await Promise.all(mongoose.modelNames().map((name) => mongoose.model(name).init()));
});

afterEach(async () => {
  const { collections } = mongoose.connection;
  for (const key of Object.keys(collections)) {
    await collections[key]?.deleteMany({});
  }
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});
```

Las líneas 1-23 (variables de entorno + borrado de `CLOUDINARY_*`) **no se tocan**; se les suma en la Tarea 3 el borrado de las `STRIPE_*`.

- [ ] **Paso 4: documentar el requisito en `README.md`** (sección nueva)

```markdown
## Mongo local como replica set (requerido desde M3)

Las transacciones de Mongo solo existen en replica set. Una sola vez:

```bash
mongod --replSet rs0 --dbpath /usr/local/var/mongodb
mongosh --eval 'rs.initiate()'
```

Y en `.env.development.local`:

```
MONGODB_URI=mongodb://127.0.0.1:27017/gira-dev?replicaSet=rs0
```

Los tests no necesitan nada: `MongoMemoryReplSet` lo arranca solo.
```

Añadir la misma nota como comentario junto a `MONGODB_URI` en `.env.development.example`.

- [ ] **Paso 5: Verificar que la suite existente sigue verde**

Run: `pnpm --filter @gira/api test`
Expected: los 100+ tests de M1+M2 en verde, **sin flakes**. Correrlo **tres veces seguidas** y confirmar que las tres pasan — ese es el criterio de cierre del pendiente #1.

- [ ] **Paso 6:** mostrar diff, pedir aprobación, commit.

---

## Tarea 2: Enums compartidos

**Depends on:** 0. **Files:** Create `packages/shared/src/enums/orderStatus.ts`, `packages/shared/src/enums/money.ts`; Modify `packages/shared/src/enums/auditAction.ts`, `packages/shared/src/index.ts`

- [ ] **Paso 1: `orderStatus.ts`**

```ts
/**
 * Order lifecycle. The valid transitions between these live in
 * apps/api/src/utils/orderTransitions.ts and are verified server-side on every
 * change — never a jump or a rollback without an explicit rule.
 *
 * There is deliberately NO "payment_failed" order status: Stripe lets a
 * customer retry a failed PaymentIntent with another card, so a failure is a
 * property of the payment, not the end of the order. The order stays in
 * PENDING_PAYMENT and PaymentStatus.FAILED records what happened.
 */
enum OrderStatus {
  PENDING_PAYMENT = "pending_payment",
  PAID = "paid",
  PROCESSING = "processing",
  SHIPPED = "shipped",
  DELIVERED = "delivered",
  CANCELLED = "cancelled",
  EXPIRED = "expired",
  REFUNDED = "refunded",
  DISPUTED = "disputed",
}

/** Provider-side payment state, tracked independently of the order lifecycle. */
enum PaymentStatus {
  REQUIRES_PAYMENT = "requires_payment",
  PROCESSING = "processing",
  SUCCEEDED = "succeeded",
  FAILED = "failed",
  CANCELLED = "cancelled",
  REFUNDED = "refunded",
}

enum ReservationStatus {
  ACTIVE = "active",
  COMMITTED = "committed",
  RELEASED = "released",
}

export { OrderStatus, PaymentStatus, ReservationStatus };
```

- [ ] **Paso 2: `money.ts`**

```ts
/**
 * Every monetary amount in the system is an INTEGER in minor units (MXN
 * centavos / USD cents). Floats drift, and an order snapshot that drifts is a
 * billing bug you cannot reconstruct.
 */
enum Currency {
  MXN = "MXN",
  USD = "USD",
}

/** Applied to the DERIVED currency (USD) only. MXN is captured, never derived. */
enum PriceRounding {
  /** Nearest cent — plain conversion. */
  NONE = "none",
  /** Round up to the next 0.50 (e.g. 56.02 -> 56.50). */
  UP_TO_50_CENTS = "up_to_50_cents",
  /** Round up to the next whole unit (e.g. 56.02 -> 57.00). */
  UP_TO_UNIT = "up_to_unit",
}

export { Currency, PriceRounding };
```

- [ ] **Paso 3: `auditAction.ts`** — agregar al final de cada enum, sin reordenar lo de M1/M2

```ts
enum AuditModule {
  AUTH = "auth",
  CATALOG = "catalog",
  INVENTORY = "inventory",
  SETTINGS = "settings",
  CART = "cart",
  ORDERS = "orders",
  PAYMENTS = "payments",
}

enum AuditAction {
  // ...acciones de M1 y M2 sin tocar...
  SETTINGS_SHIPPING_UPDATED = "settings_shipping_updated",
  SETTINGS_CURRENCY_UPDATED = "settings_currency_updated",
  SETTINGS_RESERVATION_UPDATED = "settings_reservation_updated",
  ORDER_CREATED = "order_created",
  ORDER_STATUS_CHANGED = "order_status_changed",
  ORDER_EXPIRED = "order_expired",
  ORDER_REFUND_REQUESTED = "order_refund_requested",
  STOCK_RESERVED = "stock_reserved",
  STOCK_RESERVATION_COMMITTED = "stock_reservation_committed",
  STOCK_RESERVATION_RELEASED = "stock_reservation_released",
  STOCK_RESTOCKED_ON_REFUND = "stock_restocked_on_refund",
  PAYMENT_INTENT_CREATED = "payment_intent_created",
  PAYMENT_SUCCEEDED = "payment_succeeded",
  PAYMENT_FAILED = "payment_failed",
  PAYMENT_CANCELLED = "payment_cancelled",
  PAYMENT_REFUNDED = "payment_refunded",
  PAYMENT_DISPUTED = "payment_disputed",
  WEBHOOK_REJECTED = "webhook_rejected",
}
```

Acciones granulares y no un `ORDER_UPDATED` genérico: el panel de auditoría de M4 necesita responder "quién movió esta orden y por qué" sin decodificar `targetId`.

- [ ] **Paso 4: `index.ts`**

```ts
import type { ApiStatus, ApiMeta, ApiResponse } from "./types/apiResponse.js";
import { UserRole } from "./enums/userRole.js";
import { AuditModule, AuditAction } from "./enums/auditAction.js";
import { OrderStatus, PaymentStatus, ReservationStatus } from "./enums/orderStatus.js";
import { Currency, PriceRounding } from "./enums/money.js";

export type { ApiStatus, ApiMeta, ApiResponse };
export {
  UserRole,
  AuditModule,
  AuditAction,
  OrderStatus,
  PaymentStatus,
  ReservationStatus,
  Currency,
  PriceRounding,
};
```

- [ ] **Paso 5: Rebuild obligatorio**

Run: `pnpm --filter @gira/shared build`
Expected: build limpio. **Sin esto, `apps/api` sigue viendo el paquete de M2** (resuelve a `dist/`) y tanto `tsc` como vitest fallarán con "has no exported member OrderStatus".

- [ ] **Paso 6:** `pnpm -r exec tsc --noEmit` → sin errores. Diff, aprobación, commit.

---

## Tarea 3: Env de Stripe

**Depends on:** 2. **Files:** Modify `apps/api/src/config/env.ts`, `apps/api/tests/setup.ts`, ambos `.env.*.example`, `apps/api/package.json`; Test `apps/api/tests/unit/env.test.ts`

- [ ] **Paso 1: Dependencia**

Run: `pnpm --filter @gira/api add stripe`
Después: `pnpm audit --prod --audit-level=high` → sin high/critical.

- [ ] **Paso 2: Tests de env primero** — agregar a `tests/unit/env.test.ts`

```ts
describe("loadEnv · Stripe", () => {
  it("exige las dos variables en producción", () => {
    expect(() => loadEnv({ ...prodBase, STRIPE_SECRET_KEY: undefined, STRIPE_WEBHOOK_SECRET: undefined }))
      .toThrow(/STRIPE_SECRET_KEY/);
  });
  it("acepta ninguna de las dos fuera de producción y deja stripe en null", () => {
    expect(loadEnv({ ...devBase }).stripe).toBeNull();
  });
  it("rechaza una configuración a medias fuera de producción", () => {
    expect(() => loadEnv({ ...devBase, STRIPE_SECRET_KEY: "sk_test_x" }))
      .toThrow(/Configuración de Stripe incompleta/);
  });
});
```

(`prodBase`/`devBase` son los objetos de entorno que ya usa el archivo para los casos de Cloudinary — reusarlos, no duplicarlos.)

- [ ] **Paso 3:** correr → FAIL (`stripe` no existe en `Env`).

- [ ] **Paso 4: Implementar en `config/env.ts`** — mismo patrón todo-o-nada que Cloudinary

```ts
interface StripeConfig {
  secretKey: string;
  webhookSecret: string;
  /** Signature timestamp tolerance in seconds (anti-replay). */
  webhookToleranceSeconds: number;
}

interface Env {
  /* ...campos de M1/M2... */
  stripe: StripeConfig | null;
}

// dentro de loadEnv(), tras el bloque de Cloudinary:
const toleranceRaw = source.STRIPE_WEBHOOK_TOLERANCE_SECONDS?.trim();
const webhookToleranceSeconds = toleranceRaw ? Number(toleranceRaw) : 300;
if (!Number.isInteger(webhookToleranceSeconds) || webhookToleranceSeconds <= 0) {
  errors.push("STRIPE_WEBHOOK_TOLERANCE_SECONDS debe ser un entero positivo de segundos.");
}

let stripe: StripeConfig | null = null;

if (nodeEnv === "production") {
  // In production the real provider is mandatory — no silent stub charges.
  const secretKey = requireVar(source, "STRIPE_SECRET_KEY", errors);
  const webhookSecret = requireVar(source, "STRIPE_WEBHOOK_SECRET", errors);
  if (secretKey && webhookSecret) {
    stripe = { secretKey, webhookSecret, webhookToleranceSeconds };
  }
} else {
  const secretKey = source.STRIPE_SECRET_KEY?.trim();
  const webhookSecret = source.STRIPE_WEBHOOK_SECRET?.trim();
  // Both or neither — a half-configured provider fails at charge time instead.
  if (secretKey && webhookSecret) {
    stripe = { secretKey, webhookSecret, webhookToleranceSeconds };
  } else if (secretKey || webhookSecret) {
    errors.push(
      "Configuración de Stripe incompleta: define STRIPE_SECRET_KEY y STRIPE_WEBHOOK_SECRET, o ninguna.",
    );
  }
}
```

Añadirlo al objeto congelado que devuelve `loadEnv` y a las exportaciones de tipos.

- [ ] **Paso 5: `.env.development.example` y `.env.production.example`**

```
# Stripe (obligatorio en producción; si se omite en dev/test se usa un adapter stub sin red)
# La publishable key NO va aquí: es del frontend (NEXT_PUBLIC_*), no del backend.
STRIPE_SECRET_KEY=<sk_test_... | sk_live_...>
STRIPE_WEBHOOK_SECRET=<whsec_...>
# Ventana de tolerancia de la firma del webhook, en segundos (anti-replay). Default: 300
STRIPE_WEBHOOK_TOLERANCE_SECONDS=300
```

- [ ] **Paso 6: `tests/setup.ts`** — junto al borrado de `CLOUDINARY_*`, añadir

```ts
// Force the stub payment adapter (M3): no test may reach Stripe's network.
// Webhook tests build the real adapter explicitly with a fake key — constructEvent
// is pure crypto and needs no network.
delete process.env.STRIPE_SECRET_KEY;
delete process.env.STRIPE_WEBHOOK_SECRET;
```

- [ ] **Paso 7:** tests de env PASS, `typecheck` y `lint` limpios. Diff, aprobación, commit.

---

## Tarea 4: `money.ts` — conversión y redondeo (TDD)

**Depends on:** 2. **Files:** Create `apps/api/src/utils/money.ts`; Test `apps/api/tests/unit/money.test.ts`

- [ ] **Paso 1: Test primero**

```ts
import { describe, it, expect } from "vitest";
import { Currency, PriceRounding } from "@gira/shared";
import { convertFromMxn, applyRounding } from "../../src/utils/money.js";

// 1785 = 17.85 MXN por 1 USD. 100000 centavos = 1000.00 MXN.
describe("convertFromMxn", () => {
  it("devuelve el mismo entero cuando la moneda destino es MXN", () => {
    expect(convertFromMxn(100000, Currency.MXN, 1785, PriceRounding.NONE)).toBe(100000);
  });
  it("ignora el redondeo cuando la moneda destino es MXN", () => {
    expect(convertFromMxn(100000, Currency.MXN, 1785, PriceRounding.UP_TO_UNIT)).toBe(100000);
  });
  it("convierte a centavos de USD redondeando al centavo", () => {
    // 1000.00 / 17.85 = 56.0224 -> 5602
    expect(convertFromMxn(100000, Currency.USD, 1785, PriceRounding.NONE)).toBe(5602);
  });
  it("redondea hacia arriba al siguiente medio dólar", () => {
    expect(convertFromMxn(100000, Currency.USD, 1785, PriceRounding.UP_TO_50_CENTS)).toBe(5650);
  });
  it("redondea hacia arriba al siguiente dólar entero", () => {
    expect(convertFromMxn(100000, Currency.USD, 1785, PriceRounding.UP_TO_UNIT)).toBe(5700);
  });
  it("no mueve un valor que ya cae exacto en el escalón", () => {
    // 5600 centavos exactos: 56.00 ya es dólar entero
    expect(applyRounding(5600, PriceRounding.UP_TO_UNIT)).toBe(5600);
    expect(applyRounding(5650, PriceRounding.UP_TO_50_CENTS)).toBe(5650);
  });
  it("convierte 0 a 0 con cualquier redondeo", () => {
    expect(convertFromMxn(0, Currency.USD, 1785, PriceRounding.UP_TO_UNIT)).toBe(0);
  });
  it("lanza 500 con un tipo de cambio no positivo", () => {
    expect(() => convertFromMxn(100000, Currency.USD, 0, PriceRounding.NONE))
      .toThrow(expect.objectContaining({ statusCode: 500 }));
  });
  it("siempre devuelve un entero", () => {
    for (const rate of [1731, 1799, 2003, 1666]) {
      const out = convertFromMxn(123456, Currency.USD, rate, PriceRounding.NONE);
      expect(Number.isInteger(out)).toBe(true);
    }
  });
});
```

- [ ] **Paso 2:** correr → FAIL (`Cannot find module '../../src/utils/money.js'`).

- [ ] **Paso 3: Implementar**

```ts
import { Currency, PriceRounding } from "@gira/shared";
import { AppError } from "./AppError.js";

/**
 * Money is ALWAYS an integer in minor units (MXN centavos / USD cents). No
 * float ever touches a price: an order snapshot that drifts by a centavo is a
 * billing bug you cannot reconstruct after the fact.
 *
 * MXN is the captured currency; USD is derived from a configurable rate stored
 * in Settings as `mxnPerUsdCents` (e.g. 1785 == 17.85 MXN per 1 USD), so the
 * rate itself is an integer too. Rounding applies ONLY to the derived currency.
 *
 * Both the rate and the rounding mode are frozen into the order snapshot: a
 * rate change tomorrow must never alter what a customer was charged today.
 */

const MINOR_UNITS = 100;
const HALF_UNIT = 50;

const ceilToStep = (amount: number, step: number): number => Math.ceil(amount / step) * step;

const applyRounding = (amount: number, rounding: PriceRounding): number => {
  switch (rounding) {
    case PriceRounding.UP_TO_50_CENTS:
      return ceilToStep(amount, HALF_UNIT);
    case PriceRounding.UP_TO_UNIT:
      return ceilToStep(amount, MINOR_UNITS);
    default:
      return amount;
  }
};

const convertFromMxn = (
  mxnCents: number,
  currency: Currency,
  mxnPerUsdCents: number,
  rounding: PriceRounding,
): number => {
  if (currency === Currency.MXN) return mxnCents;

  if (!Number.isInteger(mxnPerUsdCents) || mxnPerUsdCents <= 0) {
    // Configuration error, not user input — Settings validation should have caught it.
    throw new AppError("El tipo de cambio configurado no es válido.", 500);
  }

  const cents = Math.round((mxnCents * MINOR_UNITS) / mxnPerUsdCents);
  return applyRounding(cents, rounding);
};

export { applyRounding, convertFromMxn };
```

- [ ] **Paso 4:** test PASS, `typecheck` y `lint` limpios. Diff, aprobación, commit.

---

## Tarea 5: `publicId.ts` y `orderTransitions.ts` (TDD)

**Depends on:** 2. **Files:** Create `apps/api/src/utils/publicId.ts`, `apps/api/src/utils/orderTransitions.ts`; Test `apps/api/tests/unit/publicId.test.ts`, `apps/api/tests/unit/orderTransitions.test.ts`

- [ ] **Paso 1: Tests primero**

```ts
// publicId.test.ts
import { describe, it, expect } from "vitest";
import { generatePublicId } from "../../src/utils/publicId.js";

describe("generatePublicId", () => {
  it("devuelve una cadena base64url segura para URL", () => {
    expect(generatePublicId()).toMatch(/^[A-Za-z0-9_-]+$/);
  });
  it("tiene al menos 43 caracteres (32 bytes de entropía)", () => {
    expect(generatePublicId().length).toBeGreaterThanOrEqual(43);
  });
  it("no repite en 10 000 generaciones", () => {
    const seen = new Set(Array.from({ length: 10_000 }, () => generatePublicId()));
    expect(seen.size).toBe(10_000);
  });
});
```

```ts
// orderTransitions.test.ts
import { describe, it, expect } from "vitest";
import { OrderStatus } from "@gira/shared";
import { canTransition, assertTransition, assertAdminTransition } from "../../src/utils/orderTransitions.js";

describe("canTransition", () => {
  it("permite el camino feliz completo", () => {
    const path = [
      OrderStatus.PENDING_PAYMENT, OrderStatus.PAID, OrderStatus.PROCESSING,
      OrderStatus.SHIPPED, OrderStatus.DELIVERED,
    ];
    for (let i = 0; i < path.length - 1; i += 1) {
      expect(canTransition(path[i]!, path[i + 1]!)).toBe(true);
    }
  });
  it("prohíbe saltarse el pago", () => {
    expect(canTransition(OrderStatus.PENDING_PAYMENT, OrderStatus.SHIPPED)).toBe(false);
  });
  it("prohíbe retroceder", () => {
    expect(canTransition(OrderStatus.SHIPPED, OrderStatus.PROCESSING)).toBe(false);
  });
  it("prohíbe salir de un estado terminal", () => {
    for (const terminal of [OrderStatus.CANCELLED, OrderStatus.EXPIRED, OrderStatus.REFUNDED]) {
      for (const to of Object.values(OrderStatus)) {
        expect(canTransition(terminal, to)).toBe(false);
      }
    }
  });
  it("permite volver a paid cuando se gana una disputa", () => {
    expect(canTransition(OrderStatus.DISPUTED, OrderStatus.PAID)).toBe(true);
  });
  it("prohíbe una transición hacia el mismo estado", () => {
    expect(canTransition(OrderStatus.PAID, OrderStatus.PAID)).toBe(false);
  });
});

describe("assertTransition", () => {
  it("lanza 409 con mensaje en español en una transición inválida", () => {
    expect(() => assertTransition(OrderStatus.PENDING_PAYMENT, OrderStatus.SHIPPED))
      .toThrow(expect.objectContaining({ statusCode: 409 }));
  });
  it("no lanza en una transición válida", () => {
    expect(() => assertTransition(OrderStatus.PAID, OrderStatus.PROCESSING)).not.toThrow();
  });
});

describe("assertAdminTransition", () => {
  it("permite a la admin avanzar la operación", () => {
    expect(() => assertAdminTransition(OrderStatus.PAID, OrderStatus.PROCESSING)).not.toThrow();
    expect(() => assertAdminTransition(OrderStatus.PROCESSING, OrderStatus.SHIPPED)).not.toThrow();
    expect(() => assertAdminTransition(OrderStatus.SHIPPED, OrderStatus.DELIVERED)).not.toThrow();
    expect(() => assertAdminTransition(OrderStatus.PENDING_PAYMENT, OrderStatus.CANCELLED)).not.toThrow();
  });
  it("prohíbe a la admin marcar una orden como pagada a mano", () => {
    expect(() => assertAdminTransition(OrderStatus.PENDING_PAYMENT, OrderStatus.PAID))
      .toThrow(expect.objectContaining({ statusCode: 403 }));
  });
  it("prohíbe a la admin marcar reembolso o disputa a mano", () => {
    for (const to of [OrderStatus.REFUNDED, OrderStatus.DISPUTED]) {
      expect(() => assertAdminTransition(OrderStatus.PAID, to))
        .toThrow(expect.objectContaining({ statusCode: 403 }));
    }
  });
});
```

- [ ] **Paso 2:** correr → FAIL (módulos inexistentes).

- [ ] **Paso 3: Implementar `publicId.ts`**

```ts
import { randomBytes } from "node:crypto";

/**
 * Unguessable public order identifier (BACKEND_SECURITY_GUIDELINES, anti-IDOR).
 * The id IS the credential: whoever holds it can read that order, so it travels
 * only in the confirmation email (M4) and never in a listing. 32 CSPRNG bytes
 * (~256 bits) make enumeration impossible; base64url keeps it URL-safe with no
 * percent-encoding.
 */
const PUBLIC_ID_BYTES = 32;

const generatePublicId = (): string => randomBytes(PUBLIC_ID_BYTES).toString("base64url");

export { generatePublicId };
```

- [ ] **Paso 4: Implementar `orderTransitions.ts`**

```ts
import { OrderStatus } from "@gira/shared";
import { AppError } from "./AppError.js";

/**
 * The single source of truth for the order lifecycle. Every status change —
 * from the webhook, from a job, or from the admin panel — goes through here.
 * A status written directly to the model bypasses this file and is a bug.
 *
 * Two layers, deliberately:
 *  - `assertTransition` answers "is this move legal at all?"
 *  - `assertAdminTransition` answers "may a HUMAN make this move?" — narrower.
 *    Payment-driven states (paid, refunded, disputed, expired) are owned by the
 *    webhook and the reconciliation job. An admin who could type "paid" could
 *    ship unpaid goods, and the audit trail would show it as a legitimate move.
 */

const TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = Object.freeze({
  [OrderStatus.PENDING_PAYMENT]: [OrderStatus.PAID, OrderStatus.CANCELLED, OrderStatus.EXPIRED],
  [OrderStatus.PAID]: [OrderStatus.PROCESSING, OrderStatus.REFUNDED, OrderStatus.DISPUTED],
  [OrderStatus.PROCESSING]: [OrderStatus.SHIPPED, OrderStatus.REFUNDED, OrderStatus.DISPUTED],
  [OrderStatus.SHIPPED]: [OrderStatus.DELIVERED, OrderStatus.DISPUTED],
  [OrderStatus.DELIVERED]: [OrderStatus.REFUNDED, OrderStatus.DISPUTED],
  // A dispute closed in the merchant's favour returns the order to paid.
  [OrderStatus.DISPUTED]: [OrderStatus.PAID, OrderStatus.REFUNDED],
  [OrderStatus.CANCELLED]: [],
  [OrderStatus.EXPIRED]: [],
  [OrderStatus.REFUNDED]: [],
});

/** Moves a human admin may perform. Everything else belongs to the payment flow. */
const ADMIN_ALLOWED: ReadonlySet<string> = new Set([
  `${OrderStatus.PAID}->${OrderStatus.PROCESSING}`,
  `${OrderStatus.PROCESSING}->${OrderStatus.SHIPPED}`,
  `${OrderStatus.SHIPPED}->${OrderStatus.DELIVERED}`,
  `${OrderStatus.PENDING_PAYMENT}->${OrderStatus.CANCELLED}`,
]);

const LABELS: Readonly<Record<OrderStatus, string>> = Object.freeze({
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

const canTransition = (from: OrderStatus, to: OrderStatus): boolean =>
  TRANSITIONS[from].includes(to);

const assertTransition = (from: OrderStatus, to: OrderStatus): void => {
  if (!canTransition(from, to)) {
    throw new AppError(
      `No se puede pasar una orden de "${LABELS[from]}" a "${LABELS[to]}".`,
      409,
    );
  }
};

const assertAdminTransition = (from: OrderStatus, to: OrderStatus): void => {
  assertTransition(from, to);
  if (!ADMIN_ALLOWED.has(`${from}->${to}`)) {
    throw new AppError(
      `El estado "${LABELS[to]}" lo determina el proveedor de pago, no se asigna manualmente.`,
      403,
    );
  }
};

export { TRANSITIONS, LABELS, canTransition, assertTransition, assertAdminTransition };
```

- [ ] **Paso 5:** ambos tests PASS. Diff, aprobación, commit.

---

## Tarea 6: Settings singleton

**Depends on:** 2. **Files:** Create `models/Settings.ts`, `validators/settingsValidator.ts`, `services/settingsService.ts`, `controllers/settingsController.ts`, `routes/v1/admin/settingsRoutes.ts`; Modify `routes/v1/admin/index.ts`; Test `tests/integration/adminSettings.test.ts`

- [ ] **Paso 1: Escribir el test primero.** Casos:

| Grupo | Casos |
|---|---|
| Autorización | anónimo → 401 en GET y en los tres PATCH; cliente autenticado → 403 |
| Lectura | primer `GET /admin/settings` **crea** el singleton con defaults y lo devuelve; un segundo GET devuelve el mismo `id` (no crea otro) |
| Envío | `PATCH /admin/settings/shipping {nationalFee: 12000}` → 200 y persiste; `freeShippingThreshold: null` desactiva el umbral; `nationalFee: -1` → 400; `nationalFee: 12.5` → 400 (entero); campo desconocido descartado por `stripUnknown` |
| Moneda | `PATCH /admin/settings/currency {mxnPerUsdCents: 1785, rounding: "up_to_unit"}` → 200; `mxnPerUsdCents: 0` → 400; `rounding: "wat"` → 400 |
| Reserva | `PATCH /admin/settings/reservation {reservationTtlMinutes: 45}` → 200; `0` → 400; `10000` → 400 (tope) |
| Aislamiento de secciones | PATCH de envío no altera los campos de moneda ni de reserva |
| Auditoría | cada PATCH escribe **su propia** acción (`SETTINGS_SHIPPING_UPDATED` / `_CURRENCY_` / `_RESERVATION_`), nunca una genérica |

- [ ] **Paso 2:** correr → FAIL (404 en todas las rutas).

- [ ] **Paso 3: Modelo**

```ts
import { Schema, model, type HydratedDocument, type Model } from "mongoose";
import { Currency, PriceRounding } from "@gira/shared";

/**
 * Business configuration singleton (ECOMMERCE_ARCHITECTURE_GUIDELINES,
 * "Configuración de negocio centralizada"). Exactly one document, pinned by a
 * unique `key`. Designed to GROW ADDITIVELY: a future feature adds its own
 * section here instead of spawning another settings model.
 *
 * Once this exists, no business threshold may be hardcoded anywhere else.
 * All money is MXN centavos (integers).
 */

const SINGLETON_KEY = "global";

interface ShippingSettings {
  nationalFee: number;
  internationalFee: number;
  /** null disables free shipping entirely. Compared against the MXN subtotal. */
  freeShippingThreshold: number | null;
}

interface CurrencySettings {
  /** MXN centavos per 1 USD. 1785 == 17.85 MXN/USD. Integer, never a float. */
  mxnPerUsdCents: number;
  rounding: PriceRounding;
  /** Currencies the storefront may charge in. MXN is always allowed. */
  supported: Currency[];
}

interface ReservationSettings {
  /** How long stock stays held while the customer pays. */
  ttlMinutes: number;
  /** Idle days before an abandoned logged-in cart is dropped by the TTL index. */
  cartInactivityDays: number;
}

interface SettingsAttrs {
  key: string;
  shipping: ShippingSettings;
  currency: CurrencySettings;
  reservation: ReservationSettings;
}

type SettingsModel = Model<SettingsAttrs>;
type SettingsDocument = HydratedDocument<SettingsAttrs>;

const positiveInt = { type: Number, required: true, min: 0, validate: Number.isInteger };

const settingsSchema = new Schema<SettingsAttrs, SettingsModel>(
  {
    key: { type: String, required: true, unique: true, default: SINGLETON_KEY },
    shipping: {
      nationalFee: { ...positiveInt, default: 15000 },
      internationalFee: { ...positiveInt, default: 60000 },
      freeShippingThreshold: { type: Number, min: 0, default: null },
    },
    currency: {
      mxnPerUsdCents: { type: Number, required: true, min: 1, default: 1800 },
      rounding: {
        type: String,
        enum: Object.values(PriceRounding),
        default: PriceRounding.UP_TO_50_CENTS,
      },
      supported: {
        type: [String],
        enum: Object.values(Currency),
        default: () => [Currency.MXN, Currency.USD],
      },
    },
    reservation: {
      ttlMinutes: { type: Number, required: true, min: 1, max: 1440, default: 30 },
      cartInactivityDays: { type: Number, required: true, min: 1, max: 365, default: 30 },
    },
  },
  { timestamps: true },
);

const Settings = model<SettingsAttrs, SettingsModel>("Settings", settingsSchema);

export type {
  SettingsAttrs,
  SettingsDocument,
  ShippingSettings,
  CurrencySettings,
  ReservationSettings,
};
export { Settings, SINGLETON_KEY };
```

- [ ] **Paso 4: Service** — una sección, un endpoint, una entrada de auditoría

```ts
/**
 * Settings singleton access. Each section has its OWN writer
 * (BACKEND_ARCHITECTURE_GUIDELINES, "Documento singleton editable por
 * secciones"): a single PUT replacing the whole document would silently drop a
 * concurrent edit made in another section.
 *
 * `getSettings` upserts on first read, so a fresh deployment always has usable
 * defaults and no endpoint has to handle "settings do not exist yet".
 */

const getSettings = async (): Promise<SettingsDocument> => {
  const existing = await Settings.findOneAndUpdate(
    { key: SINGLETON_KEY },
    { $setOnInsert: { key: SINGLETON_KEY } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );
  return existing;
};

const updateShippingSettings = async (
  input: Partial<ShippingSettings>,
  ctx: RequestContext,
): Promise<PublicSettings> => {
  const settings = await getSettings();
  const before = { ...settings.shipping };

  // Explicit field assignment — never spread the payload (anti mass-assignment).
  if (input.nationalFee !== undefined) settings.shipping.nationalFee = input.nationalFee;
  if (input.internationalFee !== undefined) {
    settings.shipping.internationalFee = input.internationalFee;
  }
  if (input.freeShippingThreshold !== undefined) {
    settings.shipping.freeShippingThreshold = input.freeShippingThreshold;
  }

  await settings.save();
  await recordAudit({
    actorId: ctx.actorId,
    actorType: "user",
    action: AuditAction.SETTINGS_SHIPPING_UPDATED,
    module: AuditModule.SETTINGS,
    targetId: settings.id as string,
    before,
    after: { ...settings.shipping },
    ip: ctx.ip,
  });

  return toPublicSettings(settings);
};
```

`updateCurrencySettings` y `updateReservationSettings` son idénticos cambiando sección, campos y acción de auditoría. `toPublicSettings(doc)` mapea a un DTO plano `{ id, shipping, currency, reservation }`.

- [ ] **Paso 5: Validator**

```ts
import Joi from "joi";
import { Currency, PriceRounding } from "@gira/shared";

const money = Joi.number().integer().min(0).max(100_000_000).messages({
  "number.base": "El monto debe ser un número.",
  "number.integer": "Los montos se expresan en centavos, sin decimales.",
  "number.min": "El monto no puede ser negativo.",
});

const updateShippingSchema = Joi.object({
  nationalFee: money,
  internationalFee: money,
  freeShippingThreshold: money.allow(null),
})
  .min(1)
  .messages({ "object.min": "Envía al menos un campo para actualizar." });

const updateCurrencySchema = Joi.object({
  mxnPerUsdCents: Joi.number().integer().min(1).max(1_000_000).messages({
    "number.min": "El tipo de cambio debe ser mayor a cero.",
  }),
  rounding: Joi.string().valid(...Object.values(PriceRounding)).messages({
    "any.only": "El modo de redondeo no es válido.",
  }),
  supported: Joi.array().items(Joi.string().valid(...Object.values(Currency))).min(1),
})
  .min(1)
  .messages({ "object.min": "Envía al menos un campo para actualizar." });

const updateReservationSchema = Joi.object({
  ttlMinutes: Joi.number().integer().min(1).max(1440).messages({
    "number.max": "La reserva no puede durar más de 24 horas.",
  }),
  cartInactivityDays: Joi.number().integer().min(1).max(365),
})
  .min(1)
  .messages({ "object.min": "Envía al menos un campo para actualizar." });

export { updateShippingSchema, updateCurrencySchema, updateReservationSchema };
```

- [ ] **Paso 6: Controller + router**

```ts
const settingsRouter = Router();

settingsRouter.get("/", detail);
settingsRouter.patch("/shipping", validate(updateShippingSchema), updateShipping);
settingsRouter.patch("/currency", validate(updateCurrencySchema), updateCurrency);
settingsRouter.patch("/reservation", validate(updateReservationSchema), updateReservation);

export { settingsRouter };
```

Y en [routes/v1/admin/index.ts](apps/api/src/routes/v1/admin/index.ts): `adminRouter.use("/settings", settingsRouter);`

- [ ] **Paso 7:** tests PASS, typecheck y lint limpios. Diff, aprobación, commit.

---

## Tarea 7: `StockReservation` + `reservationService` (TDD estricto — el corazón de M3)

**Depends on:** 1, 2, 6. **Files:** Create `models/StockReservation.ts`, `services/reservationService.ts`; Test `tests/integration/reservation.test.ts`

### Por qué transacción y no solo `findOneAndUpdate`

M2 ya probó que un `findOneAndUpdate` con la condición dentro del filtro resuelve la colisión de **un** documento. Aquí la operación toca **N variantes + el documento de reserva**, y esa atomicidad no se compone: sin transacción, una caída del proceso a media aplicación deja `reserved` inflado (stock fantasma) o descontado de más (sobreventa). `session.withTransaction` hace que las N+1 escrituras se apliquen todas o ninguna.

`withTransaction` **reintenta** el callback ante errores transitorios, así que el callback tiene que ser idempotente. Lo es: el filtro `{ status: ACTIVE }` del flip no ve el efecto de un intento abortado (la aborción lo revirtió), y un `AppError` de negocio aborta y **no** se reintenta.

- [ ] **Paso 1: Escribir `tests/integration/reservation.test.ts` COMPLETO antes de una sola línea de implementación.**

Nivel servicio — camino feliz y bordes:
1. `reserveStock(orderId, [{variant, qty: 3}], 30)` sobre `onHand 10, reserved 0` → `reserved === 3`, `onHand === 10`, reserva `active` con `expiresAt ≈ now + 30min` y `purgeAt === null`.
2. Reservar exactamente el disponible (`qty === 10`) → éxito, `available === 0`.
3. Reservar uno más que el disponible → `AppError` 409 y `reserved` en DB **sin cambios**.
4. Reservar sobre una variante `isActive: false` → 409 y `reserved` sin cambios.
5. **Rollback multi-línea:** dos líneas, la primera con stock y la segunda sin él → 409 y **la primera variante queda con `reserved === 0`** (prueba de que la transacción revirtió).
6. Reservar dos veces para el mismo `orderId` → 409 por el índice único de `order`.
7. `commitReservation(orderId)` → reserva `committed`, `purgeAt` fijado, `onHand -= qty`, `reserved -= qty`.
8. `commitReservation` sobre una reserva ya `committed` → no lanza y **no vuelve a mover el stock** (idempotente).
9. `releaseReservation(orderId, "expired")` → reserva `released` con `releasedReason`, `reserved -= qty`, `onHand` intacto.
10. `releaseReservation` sobre una ya `released` → no-op sin mover stock.
11. `commitReservation` sobre una reserva ya `released` → no-op (no revive stock ya devuelto).
12. `commitReservation(<orderId inexistente>)` → no-op silencioso, sin lanzar.
13. Auditoría: reservar escribe un `STOCK_RESERVED`; el 409 de stock insuficiente **no escribe ninguno**.

**Concurrencia (el punto de toda la tarea):**
14. `onHand 10, reserved 0`. 20 `reserveStock` paralelos de `qty 1`, cada uno con su propio `orderId`:
    `Promise.allSettled` → exactamente **10** `fulfilled`, **10** `rejected` con `statusCode === 409`, `reserved` final `=== 10`, `available === 0`, `onHand` intacto en 10.
15. Una sola reserva de `qty 2`, **20 `commitReservation` paralelos** del mismo `orderId` → `onHand === 8` y `reserved === 0` (el flip atómico dejó pasar exactamente uno).
16. Una sola reserva de `qty 2`, **20 `releaseReservation` paralelos** → `reserved === 0` (nunca negativo) y `onHand === 10`.
17. **Carrera commit vs release** sobre la misma reserva: `Promise.allSettled([commit, release])` → exactamente uno gana; si ganó commit `onHand === 8 && reserved === 0`, si ganó release `onHand === 10 && reserved === 0`. En ningún caso `reserved < 0`.
18. 12 reservas paralelas de `qty 1` sobre `onHand 10, reserved 4` → exactamente **6** exitosas, 6 rechazadas, `reserved` final `=== 10`, `available === 0`.

- [ ] **Paso 2: Correr y verificar que falla**

Run: `pnpm --filter @gira/api test -- reservation`
Expected: FAIL — `reservationService` no existe.

- [ ] **Paso 3: Modelo**

```ts
import { Schema, model, type HydratedDocument, type Model, type Types } from "mongoose";
import { ReservationStatus } from "@gira/shared";

/**
 * Stock held for one in-flight order. ONE document per order (unique index).
 *
 * READ THIS BEFORE TOUCHING THE INDEXES — the two date fields are not
 * interchangeable:
 *
 *   expiresAt : when the hold is due. Swept by the CRON job, which performs the
 *               REAL release (atomic active->released flip + $inc reserved:-qty).
 *               It has NO TTL index, on purpose.
 *   purgeAt   : when this now-useless document may be deleted. Set ONLY when the
 *               reservation reaches a terminal state. This one carries the TTL
 *               index.
 *
 * A TTL index DELETES documents; it cannot decrement Variant.reserved. Putting
 * it on expiresAt would erase active holds and strand those units forever, with
 * no record of whom to return them to. The TTL index must never see an active
 * reservation.
 */

const PURGE_AFTER_DAYS = 30;

interface ReservationLine {
  variant: Types.ObjectId;
  qty: number;
}

interface StockReservationAttrs {
  order: Types.ObjectId;
  lines: ReservationLine[];
  status: ReservationStatus;
  expiresAt: Date;
  purgeAt: Date | null;
  releasedReason?: string;
}

type StockReservationModel = Model<StockReservationAttrs>;
type StockReservationDocument = HydratedDocument<StockReservationAttrs>;

const reservationLineSchema = new Schema<ReservationLine>(
  {
    variant: { type: Schema.Types.ObjectId, ref: "Variant", required: true },
    qty: { type: Number, required: true, min: 1 },
  },
  { _id: false },
);

const stockReservationSchema = new Schema<StockReservationAttrs, StockReservationModel>(
  {
    order: { type: Schema.Types.ObjectId, ref: "Order", required: true, unique: true },
    lines: { type: [reservationLineSchema], required: true },
    status: {
      type: String,
      enum: Object.values(ReservationStatus),
      default: ReservationStatus.ACTIVE,
    },
    expiresAt: { type: Date, required: true },
    purgeAt: { type: Date, default: null },
    releasedReason: { type: String },
  },
  { timestamps: true },
);

// The CRON sweep: active reservations past their due date.
stockReservationSchema.index({ status: 1, expiresAt: 1 });
// Garbage collection of terminal reservations only — purgeAt is null while active.
stockReservationSchema.index({ purgeAt: 1 }, { expireAfterSeconds: 0 });

const StockReservation = model<StockReservationAttrs, StockReservationModel>(
  "StockReservation",
  stockReservationSchema,
);

export type { StockReservationAttrs, StockReservationDocument, ReservationLine };
export { StockReservation, PURGE_AFTER_DAYS };
```

- [ ] **Paso 4: Implementar `reservationService.ts`**

```ts
import mongoose from "mongoose";
import { AuditAction, AuditModule, ReservationStatus } from "@gira/shared";
import { Variant } from "../models/Variant.js";
import { StockReservation, PURGE_AFTER_DAYS, type ReservationLine } from "../models/StockReservation.js";
import { AppError } from "../utils/AppError.js";
import { recordAudit } from "./auditService.js";
import type { RequestContext } from "../utils/requestContext.js";

/**
 * The bridge between "the customer intends to buy" and "the customer paid".
 * The ONLY module allowed to write Variant.reserved.
 *
 * Three invariants, in order of importance:
 *
 * 1. NEVER read-then-write. The availability condition lives inside the
 *    findOneAndUpdate filter (M2's rule), so two racing checkouts are
 *    serialized by Mongo: one wins, the other gets null without ever touching
 *    the winner's document.
 * 2. N variants + 1 reservation is ONE unit of work. session.withTransaction
 *    makes all N+1 writes land together or not at all — without it, a crash
 *    mid-loop leaves reserved inflated (phantom stock) or over-decremented
 *    (oversell). withTransaction RETRIES its callback on transient errors, so
 *    the callback must stay idempotent; an aborted attempt leaves no trace, and
 *    a business AppError aborts without retry.
 * 3. Commit and release are exactly-once. The atomic flip on `status: ACTIVE`
 *    is the ticket: twenty concurrent commits compete for it and exactly one
 *    wins. Everyone else gets null and no-ops — which is what makes a
 *    re-delivered Stripe webhook harmless.
 *
 * Deactivated variants are unreservable (`isActive: true` sits in the filter):
 * a retired variant, or one orphaned by a retired product/print, must never be
 * sellable. Parent activity is validated upstream in pricingService, which
 * loads product and print to price the line anyway.
 */

const OUT_OF_STOCK = "Uno de los artículos ya no tiene existencias suficientes.";

const purgeDate = (): Date => new Date(Date.now() + PURGE_AFTER_DAYS * 24 * 60 * 60 * 1000);

const reserveStock = async (
  orderId: mongoose.Types.ObjectId,
  lines: ReservationLine[],
  ttlMinutes: number,
  ctx: RequestContext,
): Promise<void> => {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      for (const line of lines) {
        const held = await Variant.findOneAndUpdate(
          {
            _id: line.variant,
            isActive: true,
            $expr: { $gte: [{ $subtract: ["$onHand", "$reserved"] }, line.qty] },
          },
          { $inc: { reserved: line.qty } },
          { new: true, session },
        )
          .select("_id")
          .lean();

        if (!held) throw new AppError(OUT_OF_STOCK, 409);
      }

      await StockReservation.create(
        [
          {
            order: orderId,
            lines,
            status: ReservationStatus.ACTIVE,
            expiresAt: new Date(Date.now() + ttlMinutes * 60 * 1000),
            purgeAt: null,
          },
        ],
        { session },
      );
    });
  } finally {
    await session.endSession();
  }

  await recordAudit({
    actorId: ctx.actorId,
    actorType: ctx.actorId ? "user" : "system",
    action: AuditAction.STOCK_RESERVED,
    module: AuditModule.ORDERS,
    targetId: String(orderId),
    after: { lines: lines.length, ttlMinutes },
    ip: ctx.ip,
  });
};

/** Payment confirmed: the held units leave the warehouse for good. Idempotent. */
const commitReservation = async (orderId: mongoose.Types.ObjectId): Promise<boolean> => {
  let applied = false;
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const reservation = await StockReservation.findOneAndUpdate(
        { order: orderId, status: ReservationStatus.ACTIVE },
        { $set: { status: ReservationStatus.COMMITTED, purgeAt: purgeDate() } },
        { new: true, session },
      );
      // Already terminal (or never existed) -> nothing to do. This is the
      // idempotency guarantee a re-delivered webhook relies on.
      if (!reservation) return;

      for (const line of reservation.lines) {
        await Variant.updateOne(
          { _id: line.variant },
          { $inc: { onHand: -line.qty, reserved: -line.qty } },
          { session },
        );
      }
      applied = true;
    });
  } finally {
    await session.endSession();
  }

  if (applied) {
    await recordAudit({
      actorType: "system",
      action: AuditAction.STOCK_RESERVATION_COMMITTED,
      module: AuditModule.ORDERS,
      targetId: String(orderId),
    });
  }
  return applied;
};

/** Payment failed, cancelled, expired or abandoned: give the units back. Idempotent. */
const releaseReservation = async (
  orderId: mongoose.Types.ObjectId,
  reason: string,
): Promise<boolean> => {
  let applied = false;
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const reservation = await StockReservation.findOneAndUpdate(
        { order: orderId, status: ReservationStatus.ACTIVE },
        {
          $set: {
            status: ReservationStatus.RELEASED,
            purgeAt: purgeDate(),
            releasedReason: reason,
          },
        },
        { new: true, session },
      );
      if (!reservation) return;

      for (const line of reservation.lines) {
        await Variant.updateOne(
          { _id: line.variant },
          { $inc: { reserved: -line.qty } },
          { session },
        );
      }
      applied = true;
    });
  } finally {
    await session.endSession();
  }

  if (applied) {
    await recordAudit({
      actorType: "system",
      action: AuditAction.STOCK_RESERVATION_RELEASED,
      module: AuditModule.ORDERS,
      targetId: String(orderId),
      after: { reason },
    });
  }
  return applied;
};

export { reserveStock, commitReservation, releaseReservation, OUT_OF_STOCK };
```

- [ ] **Paso 5: Correr y verificar que pasa**

Run: `pnpm --filter @gira/api test -- reservation`
Expected: PASS, los 18 casos incluidos los cinco de concurrencia.

- [ ] **Paso 6:** diff, aprobación, commit.

---

## Tarea 8: `pricingService` — totales calculados en el servidor (TDD)

**Depends on:** 4, 6. **Files:** Create `services/pricingService.ts`; Test `tests/integration/pricing.test.ts`

**El payload del cliente nunca determina cuánto se cobra.** Este service es el único lugar donde nace un precio: lee `Variant`/`Product`/`Print` de la DB y `Settings`, y devuelve un desglose cerrado. `orderService` lo consume tal cual.

- [ ] **Paso 1: Escribir el test primero.** Casos:

| Grupo | Casos |
|---|---|
| Resolución de líneas | usa `product.basePrice` cuando la variante no tiene override; usa `variant.priceOverride` cuando lo tiene (incluido `priceOverride: 0`, que es un precio válido, no ausencia); variante inexistente → 400; variante `isActive:false` → 409; **producto padre inactivo → 409**; **print padre inactivo → 409**; línea duplicada del mismo `variantId` → 400 (el cliente debe mandar cantidades, no repetir líneas) |
| Subtotal | 2 líneas × cantidades distintas → suma exacta en centavos; una sola línea de `qty 3` → `unitPrice * 3` |
| Envío | destino `MX` → `nationalFee`; destino `US` → `internationalFee`; subtotal **exactamente igual** al umbral → envío 0; **un centavo por debajo** → se cobra; `freeShippingThreshold: null` → siempre se cobra |
| Moneda | en MXN los montos son idénticos a los de catálogo y `exchangeRate` queda registrado igual; en USD cada precio unitario se convierte **y luego** se suma, de modo que `subtotal === Σ(unitPrice × qty)` exactamente (no hay deriva por redondear el total) |
| Umbral y moneda | el umbral de envío gratis se compara **siempre contra el subtotal en MXN**, aunque se cobre en USD |
| Snapshot | el resultado incluye `exchangeRate` y `rounding` vigentes al momento |

- [ ] **Paso 2:** correr → FAIL.

- [ ] **Paso 3: Implementar**

```ts
/**
 * The single origin of every price in the system. The client's payload NEVER
 * determines what is charged (ECOMMERCE_ARCHITECTURE_GUIDELINES, "El servidor
 * calcula el monto"): the client sends variant ids and quantities, nothing else.
 *
 * Order of operations matters. Everything is priced in MXN centavos, then each
 * UNIT price is converted to the charge currency, and only then are the lines
 * summed. Converting the total instead would leave `subtotal !== Σ lines` by a
 * cent or two — and Stripe charges the total, so the customer's receipt would
 * not add up.
 *
 * The free-shipping threshold is always compared against the MXN subtotal,
 * whatever the charge currency: one configured threshold, one meaning.
 */

interface RequestedLine {
  variantId: string;
  qty: number;
}

interface ResolvedLine {
  variant: Types.ObjectId;
  product: Types.ObjectId;
  sku: string;
  productName: string;
  printName: string;
  image?: ImageAttrs;
  qty: number;
  unitPriceMxn: number;
}

interface QuotedLine extends ResolvedLine {
  unitPrice: number;
  lineTotal: number;
}

interface Quote {
  currency: Currency;
  exchangeRate: number;
  rounding: PriceRounding;
  lines: QuotedLine[];
  subtotalMxn: number;
  subtotal: number;
  shippingCost: number;
  total: number;
}

const UNAVAILABLE = "Uno de los artículos ya no está disponible.";

/**
 * Loads each requested variant with its parents and rejects anything that is no
 * longer sellable. A variant whose product or print was retired is an ORPHAN:
 * it stays invisible in the public catalog but is still reachable by id, so the
 * check has to happen here too (M2 post-review, pendiente #2).
 */
const resolveOrderLines = async (requested: RequestedLine[]): Promise<ResolvedLine[]> => {
  const ids = requested.map((l) => l.variantId);
  if (new Set(ids).size !== ids.length) {
    throw new AppError("No repitas el mismo artículo: usa la cantidad.", 400);
  }

  const variants = await Variant.find({ _id: { $in: ids } })
    .populate("product", "name basePrice isActive")
    .populate("print", "name isActive")
    .lean();

  const byId = new Map(variants.map((v) => [String(v._id), v]));

  return requested.map((line) => {
    const variant = byId.get(line.variantId);
    if (!variant) throw new AppError("Uno de los artículos no existe.", 400);

    const product = variant.product as unknown as ProductRef;
    const print = variant.print as unknown as PrintRef;
    if (!variant.isActive || !product.isActive || !print.isActive) {
      throw new AppError(UNAVAILABLE, 409);
    }

    return {
      variant: variant._id as Types.ObjectId,
      product: product._id,
      sku: variant.sku,
      productName: product.name,
      printName: print.name,
      ...(variant.images[0] ? { image: variant.images[0] } : {}),
      qty: line.qty,
      unitPriceMxn: variant.priceOverride ?? product.basePrice,
    };
  });
};

interface QuoteInput {
  currency: Currency;
  /** ISO-3166 alpha-2. "MX" is national, anything else international. */
  destinationCountry: string;
}

const quoteTotals = async (lines: ResolvedLine[], input: QuoteInput): Promise<Quote> => {
  const settings = await getSettings();
  const { mxnPerUsdCents, rounding } = settings.currency;

  if (!settings.currency.supported.includes(input.currency)) {
    throw new AppError("La moneda seleccionada no está disponible.", 400);
  }

  const subtotalMxn = lines.reduce((sum, l) => sum + l.unitPriceMxn * l.qty, 0);

  const quotedLines: QuotedLine[] = lines.map((l) => {
    const unitPrice = convertFromMxn(l.unitPriceMxn, input.currency, mxnPerUsdCents, rounding);
    return { ...l, unitPrice, lineTotal: unitPrice * l.qty };
  });

  const subtotal = quotedLines.reduce((sum, l) => sum + l.lineTotal, 0);

  const { nationalFee, internationalFee, freeShippingThreshold } = settings.shipping;
  const feeMxn = input.destinationCountry === "MX" ? nationalFee : internationalFee;
  // Threshold is always read against the MXN subtotal, whatever we charge in.
  const shipsFree = freeShippingThreshold !== null && subtotalMxn >= freeShippingThreshold;
  const shippingCost = shipsFree
    ? 0
    : convertFromMxn(feeMxn, input.currency, mxnPerUsdCents, rounding);

  return {
    currency: input.currency,
    exchangeRate: mxnPerUsdCents,
    rounding,
    lines: quotedLines,
    subtotalMxn,
    subtotal,
    shippingCost,
    total: subtotal + shippingCost,
  };
};

export type { RequestedLine, ResolvedLine, QuotedLine, Quote, QuoteInput };
export { resolveOrderLines, quoteTotals, UNAVAILABLE };
```

- [ ] **Paso 4:** tests PASS, typecheck y lint limpios. Diff, aprobación, commit.

---

## Tarea 9: Cerrar el pendiente #2 de M2 — variante huérfana

**Depends on:** 8. **Files:** Modify `services/variantService.ts`; Test `tests/integration/adminVariants.test.ts`

La Tarea 8 ya impide **vender** una variante huérfana. Esta tarea la cierra también en su origen, para que la admin no pueda crear el estado confuso de entrada.

- [ ] **Paso 1: Añadir los casos a `adminVariants.test.ts`**

```ts
it("rechaza reactivar una variante cuyo producto está retirado", async () => {
  // variante desactivada + producto desactivado
  const res = await request(app)
    .patch(`/api/v1/admin/variants/${variantId}`)
    .set("Origin", ORIGIN)
    .set("Cookie", adminCookie)
    .send({ isActive: true });

  expect(res.status).toBe(409);
  expect(res.body.message).toMatch(/producto/i);
});

it("rechaza reactivar una variante cuyo estampado está retirado", async () => {
  // ...mismo patrón con el print desactivado -> 409, mensaje menciona el estampado
});

it("permite reactivar cuando ambos padres siguen activos", async () => {
  // ...-> 200 con isActive: true
});

it("permite desactivar sin revisar a los padres", async () => {
  // PATCH { isActive: false } con padres inactivos -> 200 (retirar siempre se puede)
});
```

- [ ] **Paso 2:** correr → FAIL (hoy devuelve 200 en los dos primeros).

- [ ] **Paso 3: Implementar el guard en `updateVariant`** — insertar antes del `variant.save()`

```ts
  // Reactivation guard (M2 post-review, pendiente #2): an active variant whose
  // product or print was retired is an ORPHAN. It stays hidden in the public
  // catalog but is still reachable by id, so letting it back on is a silent
  // trap. Retiring it, on the other hand, is always allowed.
  if (input.isActive === true && !variant.isActive) {
    const [product, print] = await Promise.all([
      Product.findById(variant.product).select("isActive").lean(),
      Print.findById(variant.print).select("isActive").lean(),
    ]);
    if (!product?.isActive) {
      throw new AppError(
        "No puedes reactivar esta variante: su producto está retirado. Reactiva primero el producto.",
        409,
      );
    }
    if (!print?.isActive) {
      throw new AppError(
        "No puedes reactivar esta variante: su estampado está retirado. Reactiva primero el estampado.",
        409,
      );
    }
  }
```

> **Ojo con el test de M2 que depende del comportamiento viejo.** `catalogPublic.test.ts` tiene un caso ("excluye variantes cuyo estampado fue desactivado") que llegaba al estado "variante activa con print retirado" **vía la API**. Ese estado sigue siendo válido y el filtro público sigue siendo correcto — lo que cambia es cómo se llega a él. Reescribir ese setup para desactivar el print **después** de crear la variante activa (que es además el escenario realista) en vez de reactivar la variante. Correr `pnpm --filter @gira/api test -- catalogPublic` y confirmar verde.

- [ ] **Paso 4:** ambos archivos de test PASS. Diff, aprobación, commit.

---

## Tarea 10: Carrito persistido (usuarios con cuenta)

**Depends on:** 6, 8. **Files:** Create `models/Cart.ts`, `validators/cartValidator.ts`, `services/cartService.ts`, `controllers/cartController.ts`, `routes/v1/cartRoutes.ts`; Modify `middlewares/rateLimit.ts`, `routes/v1/index.ts`; Test `tests/integration/cart.test.ts`

- [ ] **Paso 1: Escribir el test primero.** Casos:

| Grupo | Casos |
|---|---|
| Autorización | anónimo → 401 en GET/PUT/DELETE (el invitado no tiene carrito en servidor) |
| Lectura | primer `GET /cart` devuelve carrito vacío sin crear documento; tras un PUT devuelve la línea con precio vivo y `available` |
| Escritura | `PUT /cart/lines/:variantId {qty: 2}` → 200 con 1 línea; repetir con `{qty: 5}` **reemplaza** la cantidad (no suma); `{qty: 0}` elimina la línea; `qty: -1` → 400; `qty: 999` → 400 (tope 20); variante inexistente → 400; variante inactiva → 409 |
| Borrado | `DELETE /cart/lines/:variantId` → 200 sin la línea; `DELETE /cart` → carrito vacío |
| Aislamiento | el carrito de un usuario no aparece en el de otro |
| Precio vivo | cambiar `product.basePrice` y volver a `GET /cart` refleja el precio nuevo (**el carrito nunca congela precios; eso es exclusivo de la orden**) |
| Disponibilidad | una línea cuya variante quedó sin stock aparece con `available: 0` y `isAvailable: false`, **sin** romper la respuesta |
| Expiración | cada escritura empuja `expiresAt` a `now + cartInactivityDays` |

- [ ] **Paso 2:** correr → FAIL.

- [ ] **Paso 3: Modelo**

```ts
/**
 * Persisted cart — logged-in customers only. A guest builds their cart in the
 * browser and posts the lines at checkout: a server-side guest cart would need
 * an anonymous session cookie and a second expiring object to reconcile, for a
 * shopper who is not coming back from another device.
 *
 * A cart holds NO stock. Nothing is reserved until an order is created, so an
 * abandoned cart can never strand inventory.
 *
 * Prices are NOT stored here. The cart quotes live catalog prices on every
 * read; freezing a price is exclusively an Order concern (the snapshot).
 *
 * Expiry uses `expiresAt` + expireAfterSeconds: 0 rather than a fixed
 * expireAfterSeconds, so the idle window stays configurable from Settings
 * (expireAfterSeconds is baked into the index at creation time).
 */

interface CartLine {
  variant: Types.ObjectId;
  qty: number;
}

interface CartAttrs {
  user: Types.ObjectId;
  lines: CartLine[];
  expiresAt: Date;
}

const cartSchema = new Schema<CartAttrs, CartModel>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    lines: { type: [cartLineSchema], default: [] },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

cartSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
```

`cartLineSchema` = `{ variant: ObjectId ref Variant required, qty: Number required min 1 max 20 }`, `{ _id: false }`.

- [ ] **Paso 4: Service**

```ts
const MAX_LINES = 30;
const MAX_QTY_PER_LINE = 20;

const touchExpiry = async (): Promise<Date> => {
  const { reservation } = await getSettings();
  return new Date(Date.now() + reservation.cartInactivityDays * 24 * 60 * 60 * 1000);
};

/** Reads the cart and quotes it against LIVE catalog prices — never a snapshot. */
const getCart = async (userId: Types.ObjectId, currency: Currency, country: string) => {
  const cart = await Cart.findOne({ user: userId }).lean();
  if (!cart || cart.lines.length === 0) return emptyCartView(currency);

  // Lines whose variant died (deleted variant) are dropped from the view rather
  // than failing the whole cart — a stale cart must never 500 the storefront.
  const resolved = await resolveCartLines(cart.lines);
  return buildCartView(resolved, currency, country);
};

/** Absolute set, not an increment: a retried "add" must not double the quantity. */
const setCartLine = async (
  userId: Types.ObjectId,
  variantId: string,
  qty: number,
): Promise<CartView> => { /* upsert, validate variant is sellable, enforce MAX_LINES */ };
```

`setCartLine` con `qty: 0` elimina la línea. La validación de "vendible" reusa `resolveOrderLines` de `pricingService` para una sola línea — no se duplica la regla de padres inactivos.

- [ ] **Paso 5: Rate limiter + rutas**

En `middlewares/rateLimit.ts`:

```ts
// Cart writes are frequent and low-risk, but not unlimited: a script hammering
// PUT /cart/lines is still write load on the DB.
const cartLimiter = createLimiter({
  windowMs: FIFTEEN_MIN,
  max: 120,
  message: "Demasiadas operaciones sobre el carrito. Espera un momento.",
});
```

```ts
// routes/v1/cartRoutes.ts
const cartRouter = Router();

// Guest carts live in the browser; everything here requires an account.
cartRouter.use(protect, cartLimiter);

cartRouter.get("/", validate(cartQuerySchema, "query"), detail);
cartRouter.put(
  "/lines/:variantId",
  validate(variantIdParamSchema, "params"),
  validate(setCartLineSchema),
  setLine,
);
cartRouter.delete("/lines/:variantId", validate(variantIdParamSchema, "params"), removeLine);
cartRouter.delete("/", clear);

export { cartRouter };
```

`variantIdParamSchema = Joi.object({ variantId: objectId.required() })` en `commonValidator.ts` (reusar el `objectId` que ya existe). Montar con `v1Router.use("/cart", cartRouter)`.

- [ ] **Paso 6:** tests PASS, typecheck y lint limpios. Diff, aprobación, commit.

---

## Tarea 11: Adapter `PaymentProvider`

**Depends on:** 3. **Files:** Create `adapters/payment/{types,stripePaymentProvider,stubPaymentProvider,index}.ts`; Test `tests/unit/paymentAdapter.test.ts`

- [ ] **Paso 1: Interfaz de dominio**

```ts
/**
 * Narrow, domain-owned payment interface. No Stripe type crosses this boundary,
 * so adding Mercado Pago later is a new file here and nothing else — the
 * services that consume it never learn which provider is live.
 *
 * The SDK client is INJECTED (see StripeClientPort) rather than constructed
 * inside the adapter: it keeps the network out of tests without vi.mock gymnastics,
 * while the real Stripe crypto (webhook signature verification) stays under test.
 */

interface CreatePaymentInput {
  /** Minor units, in `currency`. Computed by pricingService, never by the client. */
  amount: number;
  currency: Currency;
  /** Same key on a retry -> the provider returns the SAME charge, never a second one. */
  idempotencyKey: string;
  metadata: { orderId: string; publicId: string };
  receiptEmail?: string;
}

interface PaymentView {
  providerId: string;
  status: PaymentStatus;
  amount: number;
  currency: Currency;
  /** Only present right after creation — the browser needs it to mount the Element. */
  clientSecret?: string;
  lastError?: string;
}

/** Provider-agnostic shape every webhook collapses into before touching business code. */
interface ProviderEvent {
  id: string;
  type: ProviderEventType;
  paymentId?: string;
  orderId?: string;
  amount?: number;
  reason?: string;
  raw: unknown;
}

enum ProviderEventType {
  PAYMENT_SUCCEEDED = "payment_succeeded",
  PAYMENT_FAILED = "payment_failed",
  PAYMENT_CANCELLED = "payment_cancelled",
  PAYMENT_REFUNDED = "payment_refunded",
  DISPUTE_OPENED = "dispute_opened",
  DISPUTE_CLOSED_WON = "dispute_closed_won",
  DISPUTE_CLOSED_LOST = "dispute_closed_lost",
  /** Anything we deliberately do not act on. Acknowledged with 200, never processed. */
  IGNORED = "ignored",
}

interface PaymentProvider {
  createPayment(input: CreatePaymentInput): Promise<PaymentView>;
  getPayment(providerId: string): Promise<PaymentView>;
  refundPayment(providerId: string, amount?: number): Promise<void>;
  /** Verifies signature + timestamp tolerance. Throws AppError(400) on failure. */
  parseWebhookEvent(rawBody: Buffer, signature: string): ProviderEvent;
}

export type { CreatePaymentInput, PaymentView, ProviderEvent, PaymentProvider };
export { ProviderEventType };
```

- [ ] **Paso 2: Tests primero** (`tests/unit/paymentAdapter.test.ts`)

```ts
describe("stripePaymentProvider · createPayment", () => {
  it("manda amount, currency, idempotencyKey y metadata al SDK", async () => {
    const create = vi.fn().mockResolvedValue({
      id: "pi_1", status: "requires_payment_method", amount: 5000,
      currency: "mxn", client_secret: "pi_1_secret",
    });
    const provider = createStripePaymentProvider(config, fakeClient({ create }));

    await provider.createPayment({
      amount: 5000, currency: Currency.MXN, idempotencyKey: "key-1",
      metadata: { orderId: "o1", publicId: "p1" },
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 5000, currency: "mxn", metadata: { orderId: "o1", publicId: "p1" } }),
      { idempotencyKey: "key-1" },
    );
  });
  it("mapea el estado del SDK a PaymentStatus del dominio", async () => { /* succeeded -> SUCCEEDED */ });
  it("convierte un error del SDK en AppError 502", async () => { /* ... */ });
});

describe("stripePaymentProvider · parseWebhookEvent", () => {
  // Firma REAL generada offline con el helper de Stripe: sin red, sin mock del crypto.
  const sign = (payload: string, timestamp?: number) =>
    new Stripe("sk_test_fake").webhooks.generateTestHeaderString({
      payload, secret: "whsec_fake", ...(timestamp ? { timestamp } : {}),
    });

  it("acepta una firma válida y mapea el tipo", () => {
    const payload = JSON.stringify({ id: "evt_1", type: "payment_intent.succeeded", data: { object: { id: "pi_1", metadata: { orderId: "o1" } } } });
    const event = provider.parseWebhookEvent(Buffer.from(payload), sign(payload));
    expect(event).toMatchObject({ id: "evt_1", type: ProviderEventType.PAYMENT_SUCCEEDED, orderId: "o1" });
  });
  it("rechaza una firma inválida con 400", () => {
    expect(() => provider.parseWebhookEvent(Buffer.from("{}"), "t=1,v1=deadbeef"))
      .toThrow(expect.objectContaining({ statusCode: 400 }));
  });
  it("rechaza un evento fuera de la tolerancia de timestamp (replay) con 400", () => {
    const payload = JSON.stringify({ id: "evt_2", type: "payment_intent.succeeded", data: { object: {} } });
    const old = Math.floor(Date.now() / 1000) - 3600;
    expect(() => provider.parseWebhookEvent(Buffer.from(payload), sign(payload, old)))
      .toThrow(expect.objectContaining({ statusCode: 400 }));
  });
  it("mapea un tipo no manejado a IGNORED en vez de lanzar", () => { /* customer.created -> IGNORED */ });
  it("rechaza un body alterado aunque la firma sea de un payload válido", () => { /* tamper -> 400 */ });
});

describe("factory", () => {
  it("devuelve el stub cuando env.stripe es null", () => { /* ... */ });
});
```

- [ ] **Paso 3:** correr → FAIL.

- [ ] **Paso 4: Implementar el adapter de Stripe**

```ts
/** The exact slice of the Stripe SDK this adapter uses — injectable for tests. */
interface StripeClientPort {
  paymentIntents: {
    create(params: unknown, options: { idempotencyKey: string }): Promise<StripeIntent>;
    retrieve(id: string): Promise<StripeIntent>;
  };
  refunds: { create(params: unknown): Promise<unknown> };
  webhooks: {
    constructEvent(payload: Buffer, header: string, secret: string, tolerance?: number): StripeEvent;
  };
}

const STATUS_MAP: Record<string, PaymentStatus> = {
  requires_payment_method: PaymentStatus.REQUIRES_PAYMENT,
  requires_confirmation: PaymentStatus.REQUIRES_PAYMENT,
  requires_action: PaymentStatus.REQUIRES_PAYMENT,
  processing: PaymentStatus.PROCESSING,
  succeeded: PaymentStatus.SUCCEEDED,
  canceled: PaymentStatus.CANCELLED,
};

const EVENT_MAP: Record<string, ProviderEventType> = {
  "payment_intent.succeeded": ProviderEventType.PAYMENT_SUCCEEDED,
  "payment_intent.payment_failed": ProviderEventType.PAYMENT_FAILED,
  "payment_intent.canceled": ProviderEventType.PAYMENT_CANCELLED,
  "charge.refunded": ProviderEventType.PAYMENT_REFUNDED,
  "charge.dispute.created": ProviderEventType.DISPUTE_OPENED,
};

const parseWebhookEvent = (rawBody: Buffer, signature: string): ProviderEvent => {
  let event: StripeEvent;
  try {
    // Signature + timestamp tolerance in one call; a replayed capture past the
    // window throws here and never reaches business code.
    event = client.webhooks.constructEvent(
      rawBody, signature, config.webhookSecret, config.webhookToleranceSeconds,
    );
  } catch (err) {
    logger.warn({ err }, "Stripe webhook signature rejected");
    throw new AppError("Firma del webhook inválida.", 400);
  }

  // charge.dispute.closed carries the outcome in the payload, not the type.
  const type =
    event.type === "charge.dispute.closed"
      ? disputeOutcome(event)
      : (EVENT_MAP[event.type] ?? ProviderEventType.IGNORED);

  return { id: event.id, type, ...extractRefs(event), raw: event };
};
```

`extractRefs` saca `paymentId` (`data.object.id` o `data.object.payment_intent`) y `orderId` (`data.object.metadata.orderId`).

- [ ] **Paso 5: Stub** — determinista, sin red, para dev y tests de checkout

```ts
/**
 * No-network fallback used when Stripe credentials are absent (dev/test).
 * Deterministic ids so tests can assert on them. Its parseWebhookEvent verifies
 * an HMAC with a fixed dev secret, so a developer can simulate a webhook with
 * curl without a Stripe account — the shape of the flow stays identical.
 */
```

- [ ] **Paso 6: Factory** — mismo patrón exacto que `adapters/upload/index.ts`

```ts
let cached: PaymentProvider | undefined;

/** Provider chosen by configuration, never by conditionals in business code. */
const getPaymentProvider = (): PaymentProvider => {
  cached ??= env.stripe ? createStripePaymentProvider(env.stripe) : createStubPaymentProvider();
  return cached;
};
```

- [ ] **Paso 7:** tests PASS. **Ningún test toca la red.** Diff, aprobación, commit.

---

## Tarea 12: `Order` + creación de orden con idempotencia (TDD)

**Depends on:** 5, 7, 8, 10, 11. **Files:** Create `models/Order.ts`, `services/orderService.ts`; Test `tests/integration/orderCreate.test.ts`

- [ ] **Paso 1: Escribir el test primero.** Casos:

| Grupo | Casos |
|---|---|
| Camino feliz | invitado con `lines` → orden `pending_payment`, `publicId` de ≥43 chars, reserva `active`, `reserved` incrementado, `clientSecret` devuelto |
| Con cuenta | usuario autenticado con `useCart: true` → toma las líneas del carrito y **lo vacía** al crear la orden; la orden queda ligada a `user` |
| **Totales del servidor** | mandar `total: 1` en el payload → **se ignora** (`stripUnknown`) y el total persistido es el calculado; mandar `unitPrice` en una línea → ignorado |
| Snapshot | la orden guarda `unitPriceMxn`, `unitPrice`, `exchangeRate`, `rounding`, `sku`, `productName`, `printName`; cambiar `product.basePrice` después **no** altera la orden |
| Idempotencia | dos POST con el **mismo** `Idempotency-Key` → una sola orden, la segunda respuesta devuelve la misma `publicId` y **no** reserva stock otra vez; sin header → 400; dos POST **concurrentes** con la misma key → exactamente una orden creada |
| Stock | pedir más que el disponible → 409 y **nada persistido** (ni orden ni reserva ni `reserved`); pedir exactamente el disponible → 201 |
| Validación | `lines: []` → 400; `qty: 0` → 400; `qty: 999` → 400; email inválido → 400; sin dirección → 400; `currency: "EUR"` → 400 |
| Variante huérfana | variante con producto retirado → 409 y sin efectos |
| Fallo del proveedor | si `createPayment` lanza → 502, la reserva queda **liberada** y la orden `cancelled` (verificar `reserved === 0`) |
| Auditoría | crea un `ORDER_CREATED` y un `PAYMENT_INTENT_CREATED` |

- [ ] **Paso 2:** correr → FAIL.

- [ ] **Paso 3: Modelo**

```ts
/**
 * Immutable purchase record. Every line freezes the exact price charged, in both
 * MXN and the charge currency, plus the exchange rate and rounding mode in force
 * at that moment. The order NEVER re-reads the catalog to display itself: a price
 * change tomorrow must not rewrite what someone paid today.
 *
 * `publicId` is a CSPRNG capability (anti-IDOR): whoever holds it may read the
 * order. `idempotencyKey` is unique so a double-click or a network retry can
 * never create a second order — or a second charge — for the same intent.
 *
 * There is no `payment_failed` order status: Stripe lets the customer retry a
 * failed intent, so a failure lives in `payment.status` while the order waits.
 */

interface OrderLineSnapshot {
  variant: Types.ObjectId;
  product: Types.ObjectId;
  sku: string;
  productName: string;
  printName: string;
  image?: ImageAttrs;
  qty: number;
  unitPriceMxn: number;
  unitPrice: number;
  lineTotal: number;
}

interface OrderAttrs {
  publicId: string;
  user?: Types.ObjectId;
  customer: { email: string; name: string; phone?: string };
  shipping: {
    recipient: string;
    line1: string;
    line2?: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  lines: OrderLineSnapshot[];
  currency: Currency;
  exchangeRate: number;
  rounding: PriceRounding;
  subtotal: number;
  shippingCost: number;
  total: number;
  status: OrderStatus;
  statusHistory: { status: OrderStatus; at: Date; reason?: string }[];
  payment: {
    provider: string;
    intentId?: string;
    status: PaymentStatus;
    lastError?: string;
  };
  idempotencyKey: string;
  paidAt?: Date;
}

// The capability lookup: GET /orders/:publicId.
orderSchema.index({ publicId: 1 }, { unique: true });
// Idempotent creation: the unique index IS the guarantee, not the pre-check.
orderSchema.index({ idempotencyKey: 1 }, { unique: true });
// "My orders" panel.
orderSchema.index({ user: 1, createdAt: -1 });
// Admin listing + the reconciliation job's scan for stale pending orders.
orderSchema.index({ status: 1, createdAt: 1 });
// Admin search by customer.
orderSchema.index({ "customer.email": 1, createdAt: -1 });
```

- [ ] **Paso 4: `orderService.createOrder`** — el orden de las operaciones es la parte delicada

```ts
/**
 * Checkout. The order of operations is load-bearing; do not reshuffle it.
 *
 *  1. Idempotency check FIRST. A retry must short-circuit before it can reserve
 *     stock or create a second charge.
 *  2. Resolve + price the lines from the DB. The client's payload contributes
 *     variant ids, quantities, address and currency — never a single amount.
 *  3. Reserve stock BEFORE persisting the order, using a pre-generated order id.
 *     If the process dies between the two, an active reservation points at an
 *     order that does not exist, and the expiry sweep releases it at TTL —
 *     stock recovers by itself. The reverse order would leave a pending order
 *     holding nothing, which the customer could pay for.
 *  4. Persist the order.
 *  5. Ask the provider for a payment intent, keyed by publicId so a network
 *     retry reuses the same charge.
 *
 * Steps 4 and 5 roll back explicitly on failure: release the hold, mark the
 * order cancelled. Nothing is left holding units it will never sell.
 */
const createOrder = async (input: CreateOrderInput, ctx: OrderContext): Promise<CreatedOrder> => {
  const existing = await Order.findOne({ idempotencyKey: input.idempotencyKey }).lean();
  if (existing) return toCreatedOrder(existing, await refreshClientSecret(existing));

  const requested = input.useCart && ctx.userId
    ? await takeCartLines(ctx.userId)
    : input.lines;
  if (!requested || requested.length === 0) {
    throw new AppError("Tu carrito está vacío.", 400);
  }

  const resolved = await resolveOrderLines(requested);
  const quote = await quoteTotals(resolved, {
    currency: input.currency,
    destinationCountry: input.shipping.country,
  });

  const settings = await getSettings();
  const orderId = new mongoose.Types.ObjectId();

  await reserveStock(
    orderId,
    resolved.map((l) => ({ variant: l.variant, qty: l.qty })),
    settings.reservation.ttlMinutes,
    { actorId: ctx.userId, ip: ctx.ip },
  );

  let order: OrderDocument;
  try {
    order = await Order.create({
      _id: orderId,
      publicId: generatePublicId(),
      ...(ctx.userId ? { user: ctx.userId } : {}),
      customer: input.customer,
      shipping: input.shipping,
      lines: quote.lines.map(toLineSnapshot),
      currency: quote.currency,
      exchangeRate: quote.exchangeRate,
      rounding: quote.rounding,
      subtotal: quote.subtotal,
      shippingCost: quote.shippingCost,
      total: quote.total,
      status: OrderStatus.PENDING_PAYMENT,
      statusHistory: [{ status: OrderStatus.PENDING_PAYMENT, at: new Date() }],
      payment: { provider: "stripe", status: PaymentStatus.REQUIRES_PAYMENT },
      idempotencyKey: input.idempotencyKey,
    });
  } catch (err) {
    await releaseReservation(orderId, "order_creation_failed");
    // A racing request with the same key won: return ITS order, not an error.
    if (isDuplicateKeyError(err)) {
      const winner = await Order.findOne({ idempotencyKey: input.idempotencyKey }).lean();
      if (winner) return toCreatedOrder(winner, await refreshClientSecret(winner));
    }
    throw err;
  }

  let payment: PaymentView;
  try {
    payment = await getPaymentProvider().createPayment({
      amount: quote.total,
      currency: quote.currency,
      idempotencyKey: order.publicId,
      metadata: { orderId: String(order._id), publicId: order.publicId },
      receiptEmail: input.customer.email,
    });
  } catch (err) {
    await releaseReservation(orderId, "payment_setup_failed");
    order.status = OrderStatus.CANCELLED;
    order.statusHistory.push({ status: OrderStatus.CANCELLED, at: new Date(), reason: "payment_setup_failed" });
    await order.save();
    throw err;
  }

  order.payment.intentId = payment.providerId;
  order.payment.status = payment.status;
  await order.save();

  if (input.useCart && ctx.userId) await clearCart(ctx.userId);

  await recordAudit({ /* ORDER_CREATED, module ORDERS, targetId: order.publicId */ });
  await recordAudit({ /* PAYMENT_INTENT_CREATED, module PAYMENTS */ });

  return toCreatedOrder(order.toObject(), payment.clientSecret);
};
```

> **Nota deliberada sobre la auditoría:** `targetId` lleva el `publicId`, no el email ni el nombre. El audit log no guarda PII (`BACKEND_SECURITY_GUIDELINES` §10).

- [ ] **Paso 5:** tests PASS. Diff, aprobación, commit.

---

## Tarea 13: Endpoints de orden (invitado + panel de usuario)

**Depends on:** 12. **Files:** Create `validators/orderValidator.ts`, `controllers/orderController.ts`, `routes/v1/orderRoutes.ts`; Modify `middlewares/rateLimit.ts`, `routes/v1/index.ts`; Test `tests/integration/orderRoutes.test.ts`

- [ ] **Paso 1: Escribir el test primero.** Casos:

| Grupo | Casos |
|---|---|
| Checkout | `POST /orders` anónimo con líneas → 201; con cookie de cliente y `useCart` → 201; sin `Origin` → 403 (`verifyOrigin`) |
| Consulta pública | `GET /orders/:publicId` sin sesión → 200 con la orden; `publicId` inexistente → 404; `publicId` de otra orden → devuelve **esa** orden (es una capacidad, no un IDOR) |
| **No fuga de datos** | la respuesta pública **no** incluye `idempotencyKey`, `payment.intentId`, `user`, ni `_id` interno; sí incluye `publicId`, líneas, totales y estado |
| Panel de usuario | `GET /orders/mine` anónimo → 401; autenticado → solo sus órdenes, paginado con `meta`; **nunca** las de otro usuario aunque manden `?user=` |
| Ownership | `GET /orders/mine/:id` con el id de una orden ajena → 404 (no 403: no se confirma que exista) |
| Rate limit | el limiter de checkout y el de consulta están **montados** (verificable con `NODE_ENV=production` temporal, como hace `auth.test.ts` de M1) |

- [ ] **Paso 2:** correr → FAIL.

- [ ] **Paso 3: Validator**

```ts
const orderLineSchema = Joi.object({
  variantId: objectId.required(),
  qty: Joi.number().integer().min(1).max(20).required().messages({
    "number.min": "La cantidad debe ser al menos 1.",
    "number.max": "La cantidad máxima por artículo es 20.",
  }),
});

const shippingAddressSchema = Joi.object({
  recipient: Joi.string().trim().min(2).max(120).required(),
  line1: Joi.string().trim().min(3).max(200).required(),
  line2: Joi.string().trim().max(200).allow(""),
  city: Joi.string().trim().min(2).max(120).required(),
  state: Joi.string().trim().min(2).max(120).required(),
  postalCode: Joi.string().trim().max(20).required(),
  country: Joi.string().trim().uppercase().length(2).required().messages({
    "string.length": "Usa el código de país de 2 letras (por ejemplo, MX).",
  }),
});

/**
 * NOTE: there is no `total`, `subtotal`, `unitPrice` or `shippingCost` key here,
 * on purpose. stripUnknown drops them if a client sends them; the server is the
 * only origin of an amount.
 */
const createOrderSchema = Joi.object({
  lines: Joi.array().items(orderLineSchema).min(1).max(30),
  useCart: Joi.boolean().default(false),
  currency: Joi.string().valid(...Object.values(Currency)).default(Currency.MXN),
  customer: Joi.object({
    email: Joi.string().trim().lowercase().email().max(160).required().messages({
      "string.email": "Escribe un correo electrónico válido.",
    }),
    name: Joi.string().trim().min(2).max(120).required(),
    phone: Joi.string().trim().max(30).allow(""),
  }).required(),
  shipping: shippingAddressSchema.required(),
})
  .xor("lines", "useCart")
  .messages({ "object.xor": "Envía las líneas del carrito o usa useCart, no ambos." });

const publicIdParamSchema = Joi.object({
  publicId: Joi.string().trim().pattern(/^[A-Za-z0-9_-]{43,64}$/).required().messages({
    "string.pattern.base": "El identificador de la orden no es válido.",
  }),
});
```

- [ ] **Paso 4: Rate limiters**

```ts
// Anti card-testing: a scripted checkout loop is how stolen cards get validated.
const checkoutLimiter = createLimiter({
  windowMs: FIFTEEN_MIN,
  max: 10,
  message: "Demasiados intentos de compra. Espera unos minutos e intenta de nuevo.",
});

// The publicId is unguessable, but a leaked link should not be a scraping tool.
const orderLookupLimiter = createLimiter({
  windowMs: FIFTEEN_MIN,
  max: 30,
  message: "Demasiadas consultas. Espera unos minutos.",
});
```

- [ ] **Paso 5: Router**

```ts
const orderRouter = Router();

// Checkout is open to guests; the limiter is the only barrier, so it is strict.
orderRouter.post("/", checkoutLimiter, validate(createOrderSchema), create);

// Authenticated customer panel. Mounted BEFORE /:publicId so "mine" is never
// swallowed by the param route.
orderRouter.get("/mine", protect, validate(myOrdersQuerySchema, "query"), listMine);
orderRouter.get("/mine/:id", protect, validate(objectIdParamSchema, "params"), detailMine);

orderRouter.get(
  "/:publicId",
  orderLookupLimiter,
  validate(publicIdParamSchema, "params"),
  detailByPublicId,
);

export { orderRouter };
```

> El orden de las rutas es load-bearing: `/mine` tiene que declararse antes que `/:publicId` o Express lo interpreta como un `publicId` (y el validator lo rechazaría con 400).

- [ ] **Paso 6:** tests PASS. Diff, aprobación, commit.

---

## Tarea 14: Webhook de Stripe (TDD estricto)

**Depends on:** 11, 12. **Files:** Create `models/WebhookEvent.ts`, `services/orderPaymentService.ts`, `services/webhookService.ts`, `controllers/webhookController.ts`, `routes/webhookRoutes.ts`; Modify `app.ts`; Test `tests/integration/stripeWebhook.test.ts`

### Por qué el body crudo va antes de todo

`express.json` parsea y descarta los bytes originales; `mongoSanitize` y `sanitizeInput` mutan claves y escapan strings. Cualquiera de los tres invalida la firma HMAC, que se calcula sobre el **byte exacto** que Stripe envió. Por eso esta ruta se monta inmediatamente después de `helmet()` con `express.raw`, antes del resto de la cadena.

Efecto colateral consciente: el webhook **no** pasa por `globalLimiter`. Es deliberado — Stripe reintenta en ráfaga y limitar sus reintentos causaría el problema que el webhook existe para evitar. La barrera del endpoint es la firma criptográfica, no el rate limit.

- [ ] **Paso 1: Escribir `tests/integration/stripeWebhook.test.ts` COMPLETO antes de implementar.**

Estos tests construyen la firma **real** con `stripe.webhooks.generateTestHeaderString` (crypto puro, sin red) y hacen `vi.mock` de la factory de pagos para que devuelva el adapter de Stripe con la llave falsa.

| # | Caso | Aserción |
|---|---|---|
| 1 | firma inválida | 400, `WebhookEvent` sin documentos, orden intacta |
| 2 | firma válida con timestamp de hace 1 hora (replay) | 400, nada procesado |
| 3 | body alterado tras firmar | 400 |
| 4 | `payment_intent.succeeded` sobre orden `pending_payment` | 200; orden `paid` con `paidAt`; reserva `committed`; `onHand -= qty`; `reserved -= qty` |
| 5 | **el mismo `event.id` entregado dos veces** | segunda → 200; **un solo** `WebhookEvent`; `onHand` **sin cambios** respecto al caso 4 |
| 6 | **dos entregas concurrentes del mismo `event.id`** (`Promise.allSettled`) | exactamente una procesa; `onHand` descontado **una** vez |
| 7 | `payment_intent.succeeded` sobre una orden ya `paid` | 200 no-op, stock sin cambios |
| 8 | `payment_intent.payment_failed` | 200; orden **sigue** `pending_payment`; `payment.status === failed`; `reserved` intacto (la clienta puede reintentar) |
| 9 | `payment_intent.canceled` | 200; orden `cancelled`; `reserved` liberado; `onHand` intacto |
| 10 | `charge.refunded` sobre orden `paid` | 200; orden `refunded`; **stock repuesto** (`onHand` de vuelta) |
| 11 | `charge.refunded` sobre orden `shipped` | 200; orden `refunded`; **stock NO repuesto**; audit lo registra |
| 12 | `charge.dispute.created` | 200; orden `disputed` |
| 13 | `charge.dispute.closed` ganada | 200; orden vuelve a `paid` |
| 14 | evento de tipo desconocido (`customer.created`) | 200, sin efectos, `WebhookEvent` marcado como ignorado |
| 15 | evento cuyo `orderId` no existe | 200 (no reintentar eternamente algo irreparable), logueado |
| 16 | **el body llega crudo** | un payload con la clave `$set` sobrevive intacto a la firma → prueba de que `mongoSanitize` no corrió |

- [ ] **Paso 2:** correr → FAIL.

- [ ] **Paso 3: Modelo `WebhookEvent`**

```ts
/**
 * Persisted webhook dedupe (ECOMMERCE_ARCHITECTURE_GUIDELINES, "Dedupe
 * persistido por event.id"). Providers RE-DELIVER events by design — on their
 * own retry schedule, and after any 5xx we return.
 *
 * The unique index on eventId IS the dedupe, not a pre-read: an insert that
 * throws E11000 means "someone else already claimed this event", which makes
 * two concurrent deliveries safe without a lock.
 */
webhookEventSchema.index({ provider: 1, eventId: 1 }, { unique: true });
```

Campos: `provider`, `eventId`, `type`, `status: "processed" | "ignored" | "failed"`, `orderId?`, `processedAt?`, `error?`, `purgeAt` con TTL de 90 días.

- [ ] **Paso 4: `orderPaymentService`** — los efectos, compartidos por webhook y job

```ts
/**
 * The effects of a payment outcome on an order. Lives apart from webhookService
 * on purpose: the reconciliation job (Tarea 15) applies the EXACT same effects
 * when a webhook never arrives. Two copies of this logic would drift, and the
 * drift would only show up as a stock discrepancy weeks later.
 *
 * Every function here is idempotent — it checks the order's current status and
 * no-ops if the effect already landed.
 */

const applyPaymentSucceeded = async (orderId: Types.ObjectId): Promise<void> => {
  const order = await Order.findById(orderId);
  if (!order) return;
  if (order.status !== OrderStatus.PENDING_PAYMENT) return; // already settled

  assertTransition(order.status, OrderStatus.PAID);
  order.status = OrderStatus.PAID;
  order.paidAt = new Date();
  order.payment.status = PaymentStatus.SUCCEEDED;
  order.statusHistory.push({ status: OrderStatus.PAID, at: new Date() });
  await order.save();

  // Only now do the held units leave the warehouse. Idempotent by design.
  await commitReservation(order._id);

  await recordAudit({ /* PAYMENT_SUCCEEDED, module PAYMENTS, targetId: order.publicId */ });
};

const applyPaymentFailed = async (orderId, reason) => {
  // Order STAYS pending_payment: Stripe lets the customer retry the same intent
  // with another card, and releasing the hold here would sell the item out from
  // under someone who is one tap away from paying.
};

const applyPaymentCancelled = async (orderId) => { /* -> CANCELLED + releaseReservation */ };

const applyRefund = async (orderId: Types.ObjectId): Promise<void> => {
  const order = await Order.findById(orderId);
  if (!order || order.status === OrderStatus.REFUNDED) return;

  const wasUnshipped = order.status === OrderStatus.PAID;
  assertTransition(order.status, OrderStatus.REFUNDED);
  order.status = OrderStatus.REFUNDED;
  order.payment.status = PaymentStatus.REFUNDED;
  order.statusHistory.push({ status: OrderStatus.REFUNDED, at: new Date() });
  await order.save();

  // Restock ONLY if nothing left the workshop. Past `paid` the goods are gone or
  // in transit, and putting them back would invent units that do not exist —
  // the audit entry tells the admin to adjust by hand if they come back.
  if (wasUnshipped) {
    for (const line of order.lines) {
      await adjustOnHand(String(line.variant), line.qty, { });
    }
    await recordAudit({ /* STOCK_RESTOCKED_ON_REFUND */ });
  }
  await recordAudit({ /* PAYMENT_REFUNDED */ });
};

const applyDisputeOpened = async (orderId) => { /* -> DISPUTED */ };
const applyDisputeClosed = async (orderId, won: boolean) => { /* won -> PAID, lost -> applyRefund */ };
```

- [ ] **Paso 5: `webhookService.handleProviderEvent`**

```ts
const handleProviderEvent = async (event: ProviderEvent): Promise<"processed" | "duplicate"> => {
  try {
    await WebhookEvent.create({
      provider: "stripe",
      eventId: event.id,
      type: event.type,
      status: "processed",
      purgeAt: purgeDate(),
    });
  } catch (err) {
    // E11000: another delivery (or another instance) already claimed this event.
    // This is the whole dedupe — no lock, no read-then-write.
    if (isDuplicateKeyError(err)) return "duplicate";
    throw err;
  }

  const orderId = await resolveOrderId(event);
  if (!orderId) return "processed"; // unknown order: ack, do not retry forever

  switch (event.type) {
    case ProviderEventType.PAYMENT_SUCCEEDED:  await applyPaymentSucceeded(orderId); break;
    case ProviderEventType.PAYMENT_FAILED:     await applyPaymentFailed(orderId, event.reason); break;
    case ProviderEventType.PAYMENT_CANCELLED:  await applyPaymentCancelled(orderId); break;
    case ProviderEventType.PAYMENT_REFUNDED:   await applyRefund(orderId); break;
    case ProviderEventType.DISPUTE_OPENED:     await applyDisputeOpened(orderId); break;
    case ProviderEventType.DISPUTE_CLOSED_WON: await applyDisputeClosed(orderId, true); break;
    case ProviderEventType.DISPUTE_CLOSED_LOST:await applyDisputeClosed(orderId, false); break;
    default: break; // IGNORED
  }
  return "processed";
};
```

- [ ] **Paso 6: Controller y ruta**

```ts
// routes/webhookRoutes.ts — NOT under routes/v1/: this router mounts before the
// middleware chain, so it deliberately sits outside the versioned tree.
const webhookRouter = Router();

webhookRouter.post(
  "/stripe",
  express.raw({ type: "application/json", limit: "1mb" }),
  stripeWebhook,
);

export { webhookRouter };
```

```ts
const stripeWebhook = asyncHandler(async (req: Request, res: Response) => {
  const signature = req.headers["stripe-signature"];
  if (typeof signature !== "string") {
    throw new AppError("Falta la firma del webhook.", 400);
  }

  // Throws AppError(400) on bad signature or a timestamp outside tolerance.
  const event = getPaymentProvider().parseWebhookEvent(req.body as Buffer, signature);
  const outcome = await handleProviderEvent(event);

  // Always 200 once the signature checked out: a 4xx/5xx makes Stripe retry, and
  // there is nothing to retry for a duplicate or an event we chose to ignore.
  sendResponse(res, 200, outcome === "duplicate" ? "Evento ya procesado." : "Evento procesado.");
});
```

- [ ] **Paso 7: `app.ts`** — el montaje es lo más delicado del milestone

```ts
const buildApp = (): Express => {
  const app = express();

  app.use(helmet());

  // The Stripe webhook mounts HERE, before every other middleware, with a RAW
  // body parser. Signature verification hashes the exact bytes Stripe sent:
  // express.json would discard them, and mongoSanitize/sanitizeInput would
  // rewrite keys and escape strings, invalidating the HMAC every time.
  //
  // It also sits before globalLimiter on purpose — Stripe retries in bursts, and
  // throttling those retries would cause the exact problem the webhook prevents.
  // The barrier here is the cryptographic signature, not a rate limit.
  app.use("/api/webhooks", webhookRouter);

  app.use(cors({ origin: allowedOrigins, credentials: true }));
  app.use(express.json({ limit: "10kb" }));
  /* ...resto de la cadena de M1, sin cambios... */
};
```

- [ ] **Paso 8:** los 16 casos PASS. Diff, aprobación, commit.

---

## Tarea 15: Jobs — expiración de reservas y conciliación de pagos

**Depends on:** 7, 14. **Files:** Create `jobs/expireReservations.ts`, `jobs/reconcilePayments.ts`, `jobs/scheduler.ts`; Modify `server.ts`; Test `tests/integration/jobs.test.ts`

- [ ] **Paso 1: Escribir el test primero.** Los tests llaman a las funciones de job **directamente** — nunca esperan a un timer.

| Job | Casos |
|---|---|
| `expireReservations` | reserva vencida `active` → liberada, `reserved` devuelto, orden a `expired`; reserva **no** vencida → intacta; reserva ya `committed` y vencida → **no** se toca (el stock ya salió); reserva vencida cuya orden no existe → se libera igual, sin lanzar; una reserva vencida cuya orden ya está `cancelled` → libera stock sin intentar la transición; procesa varias en un solo pase; **es idempotente** (dos pases seguidos no doblan la devolución) |
| `reconcilePayments` | orden `pending_payment` vieja cuyo intent está `succeeded` en el proveedor → queda `paid` y la reserva `committed` (el efecto es idéntico al del webhook); intent `canceled` → orden `cancelled` + stock liberado; intent aún `requires_payment` → sin cambios; orden **reciente** (dentro del período de gracia) → **no** se toca; orden ya `paid` → no se consulta al proveedor; error del proveedor en una orden → se loguea y **las demás se siguen procesando** |

- [ ] **Paso 2:** correr → FAIL.

- [ ] **Paso 3: Implementar**

```ts
// jobs/expireReservations.ts
/**
 * Releases holds whose window closed. This is the REAL expiry mechanism — the
 * TTL index on purgeAt only garbage-collects reservations that already reached a
 * terminal state, because a TTL index deletes documents and cannot decrement
 * Variant.reserved.
 *
 * Exported as a plain async function so tests drive it directly; the scheduler
 * is the only thing that puts it on a timer.
 */
const BATCH = 200;

const expireReservations = async (): Promise<{ released: number }> => {
  const due = await StockReservation.find({
    status: ReservationStatus.ACTIVE,
    expiresAt: { $lt: new Date() },
  })
    .select("order")
    .limit(BATCH)
    .lean();

  let released = 0;
  for (const reservation of due) {
    try {
      const applied = await releaseReservation(reservation.order, "expired");
      if (applied) released += 1;
      // The order may not exist (crash between reserve and create) — releasing
      // stock is the point; the status update is best-effort.
      await Order.findOneAndUpdate(
        { _id: reservation.order, status: OrderStatus.PENDING_PAYMENT },
        {
          $set: { status: OrderStatus.EXPIRED },
          $push: { statusHistory: { status: OrderStatus.EXPIRED, at: new Date(), reason: "reservation_expired" } },
        },
      );
    } catch (err) {
      // One bad reservation must not stop the sweep.
      logger.error({ err, order: reservation.order }, "No se pudo expirar la reserva");
    }
  }
  return { released };
};
```

```ts
// jobs/reconcilePayments.ts
/**
 * The safety net for a webhook that never arrived (provider outage, our own
 * downtime, a misconfigured endpoint). Asks the provider for the real state of
 * every stale pending payment and applies the SAME effects the webhook would —
 * by calling orderPaymentService, never by reimplementing them.
 */
const GRACE_MINUTES = 15;

const reconcilePayments = async (): Promise<{ checked: number; settled: number }> => {
  const cutoff = new Date(Date.now() - GRACE_MINUTES * 60 * 1000);
  const stale = await Order.find({
    status: OrderStatus.PENDING_PAYMENT,
    "payment.intentId": { $exists: true },
    createdAt: { $lt: cutoff },
  })
    .select("_id payment.intentId")
    .limit(100)
    .lean();

  const provider = getPaymentProvider();
  let settled = 0;

  for (const order of stale) {
    try {
      const payment = await provider.getPayment(order.payment.intentId!);
      if (payment.status === PaymentStatus.SUCCEEDED) {
        await applyPaymentSucceeded(order._id);
        settled += 1;
      } else if (payment.status === PaymentStatus.CANCELLED) {
        await applyPaymentCancelled(order._id);
        settled += 1;
      }
    } catch (err) {
      logger.error({ err, order: order._id }, "No se pudo conciliar el pago");
    }
  }
  return { checked: stale.length, settled };
};
```

```ts
// jobs/scheduler.ts
/**
 * Lightweight cron: plain intervals, no BullMQ and no Redis (spec trade-off —
 * zero extra infra, at the cost of retries with backoff and job visibility).
 * Started ONLY from server.ts, never from buildApp(), so supertest never inherits
 * a timer that outlives the test run.
 *
 * `unref()` keeps these timers from holding the process open during shutdown.
 */
const EVERY_MINUTE = 60 * 1000;
const EVERY_FIVE_MINUTES = 5 * 60 * 1000;

let timers: NodeJS.Timeout[] = [];

const runSafely = (name: string, job: () => Promise<unknown>) => () => {
  void job().catch((err: unknown) => logger.error({ err, job: name }, "Job falló"));
};

const startJobs = (): void => {
  timers = [
    setInterval(runSafely("expireReservations", expireReservations), EVERY_MINUTE),
    setInterval(runSafely("reconcilePayments", reconcilePayments), EVERY_FIVE_MINUTES),
  ];
  for (const t of timers) t.unref();
  logger.info("Jobs en background iniciados");
};

const stopJobs = (): void => {
  for (const t of timers) clearInterval(t);
  timers = [];
};

export { startJobs, stopJobs, expireReservations, reconcilePayments };
```

- [ ] **Paso 4: `server.ts`** — `startJobs()` después de conectar a la DB y antes del `listen`; `stopJobs()` como primera línea del graceful shutdown existente.

- [ ] **Paso 5:** tests PASS. Diff, aprobación, commit.

---

## Tarea 16: Órdenes en el panel admin

**Depends on:** 12, 14. **Files:** Create `validators/adminOrderValidator.ts`, `services/adminOrderService.ts`, `controllers/adminOrderController.ts`, `routes/v1/admin/adminOrderRoutes.ts`; Modify `routes/v1/admin/index.ts`; Test `tests/integration/adminOrders.test.ts`

- [ ] **Paso 1: Escribir el test primero.** Casos:

| Grupo | Casos |
|---|---|
| Autorización | anónimo → 401; cliente → 403 en las cuatro rutas |
| Listado | `meta` correcto en 2 páginas (crear 25, `?limit=10&page=3` → 5 items, `meta.pages === 3`); `?status=paid` filtra; `?search=<email>` filtra; `?limit=1000` → 400 |
| Detalle | 200 con líneas, totales, `statusHistory` y `payment.intentId` (aquí **sí** se expone: es panel admin); id inexistente → 404 |
| Transición | `PATCH /:id/status {status:"processing"}` sobre `paid` → 200; sobre `pending_payment` → 409 (transición inválida); `{status:"paid"}` → **403** (lo determina el proveedor); `{status:"wat"}` → 400 |
| Reembolso | `POST /:id/refund` sobre `paid` → 200 y llama al adapter; sobre `pending_payment` → 409; el efecto real (`refunded`) llega **por webhook**, no en la respuesta |
| Auditoría | cada cambio de estado escribe un `ORDER_STATUS_CHANGED` con `before`/`after` |

- [ ] **Paso 2:** correr → FAIL.

- [ ] **Paso 3: Implementar** — patrón vertical idéntico a los CRUD de M2, con `parseListQuery`

```ts
const LIST_CONFIG: ListQueryConfig = {
  sortable: ["createdAt", "total", "status"],
  searchable: ["customer.email", "publicId"],
  defaultSort: "-createdAt",
};
```

```ts
/**
 * Requesting a refund only ASKS the provider. The order does not become
 * `refunded` here: that state arrives via charge.refunded on the webhook, same
 * as every other payment truth. Flipping it optimistically would let a failed
 * refund leave the books saying money went back when it did not.
 */
const requestRefund = async (id: string, ctx: RequestContext): Promise<PublicAdminOrder> => {
  const order = await Order.findById(id);
  if (!order) throw new AppError("La orden no existe.", 404);
  if (!order.payment.intentId || order.status !== OrderStatus.PAID) {
    throw new AppError("Solo se puede reembolsar una orden pagada.", 409);
  }

  await getPaymentProvider().refundPayment(order.payment.intentId);
  await recordAudit({ /* ORDER_REFUND_REQUESTED, module PAYMENTS, targetId: order.publicId */ });
  return toPublicAdminOrder(order.toObject());
};
```

El cambio de estado usa `assertAdminTransition(order.status, input.status)` de la Tarea 5.

Montar: `adminRouter.use("/orders", adminOrderRouter);`

- [ ] **Paso 4:** tests PASS. Diff, aprobación, commit.

---

## Tarea 17: Barrido de índices y seguridad

**Depends on:** 16.

- [ ] **Paso 1:** arrancar `pnpm --filter @gira/api dev` contra el Mongo local en replica set y confirmar que **no hay warnings de índice duplicado** de Mongoose en el log de arranque.
- [ ] **Paso 2:** en `mongosh`, `db.<col>.getIndexes()` sobre `settings`, `carts`, `stockreservations`, `orders`, `webhookevents`. Verificar en particular:
  - `stockreservations`: `{order:1}` unique, `{status:1,expiresAt:1}`, y `{purgeAt:1}` **con `expireAfterSeconds: 0`**. Confirmar que **`expiresAt` NO tiene índice TTL** — si lo tiene, es el bug más grave posible en este milestone.
  - `orders`: `{publicId:1}` unique, `{idempotencyKey:1}` unique.
  - `carts`: `{expiresAt:1}` con `expireAfterSeconds: 0`.
- [ ] **Paso 3:** `explain("executionStats")` sobre las tres consultas calientes — el barrido de reservas vencidas, el escaneo de órdenes rezagadas del job de conciliación, y `GET /orders/:publicId` — confirmando `IXSCAN` en las tres. **Pegar la salida real.**
- [ ] **Paso 4: Repaso de seguridad específico de M3**, punto por punto:
  - Ningún endpoint acepta un monto del cliente (`grep -rn "req.body" apps/api/src/services/` no debe encontrar ninguna lectura de `total`/`price`/`amount`).
  - Las respuestas públicas de orden no filtran `idempotencyKey`, `payment.intentId`, `user` ni `_id`.
  - `git ls-files | grep -i env` → solo `.example`, ningún `.local`.
  - `grep -rn "sk_test\|sk_live\|whsec_" apps/api/src/` → cero coincidencias fuera de comentarios.
  - Los tres limiters nuevos están montados y son verificables.
- [ ] **Paso 5:** diff (si hubo ajustes), aprobación, commit.

---

## Tarea 18: Verificación final

**Depends on:** 17. Nada se declara "hecho" sin la salida real pegada (no-negociable #8).

- [ ] **Paso 1:** `pnpm -r exec tsc --noEmit` → sin errores.
- [ ] **Paso 2:** `pnpm build` → limpio (incluye `@gira/shared`).
- [ ] **Paso 3:** `pnpm lint` → sin errores; confirmar que la regla de layering no reporta nada (ningún controller/route importa models ni adapters).
- [ ] **Paso 4:** `pnpm test` → toda la suite verde, incluidos los tests de M1 y M2. Reportar el conteo total. **Correrlo tres veces** para confirmar que el flake del pendiente #1 quedó cerrado.
- [ ] **Paso 5:** `pnpm audit --prod --audit-level=high` → sin vulnerabilidades high/critical (`stripe` es dep nueva).
- [ ] **Paso 6: Recorrido manual end-to-end** con Mongo local + `stripe listen --forward-to localhost:4000/api/webhooks/stripe` y llaves de **test**, pegando cada respuesta:
  1. login admin → cookie
  2. `GET /admin/settings` → singleton con defaults; `PATCH /admin/settings/shipping` → tarifa y umbral configurados
  3. crear catálogo mínimo (reusar el recorrido de M2) y `PATCH /admin/variants/:id/stock {"onHand":5}`
  4. `POST /api/v1/orders` como invitado con `Idempotency-Key` → 201 con `publicId` + `clientSecret`; verificar en `mongosh` que `reserved === 1`
  5. repetir el **mismo** POST con la **misma** key → misma `publicId`, `reserved` sigue en 1
  6. pagar con la tarjeta de prueba `4242 4242 4242 4242` desde el Payment Element (o `stripe trigger payment_intent.succeeded`)
  7. verificar: orden en `paid`, reserva `committed`, `onHand === 4`, `reserved === 0`
  8. reenviar el mismo evento con `stripe events resend <id>` → 200 "Evento ya procesado", `onHand` **sigue** en 4
  9. crear otra orden y **no** pagarla; bajar el TTL a 1 minuto en Settings, esperar y confirmar que el job la deja en `expired` con `reserved === 0`
  10. `GET /api/v1/orders/:publicId` sin sesión → la orden, sin campos internos
  11. `POST /admin/orders/:id/refund` sobre la orden pagada → el webhook `charge.refunded` la deja en `refunded` y repone `onHand` a 5
  12. pedir 6 unidades con `onHand: 5` → **409** sin efectos
- [ ] **Paso 7:** repasar el checklist de arranque de `BACKEND_SECURITY_GUIDELINES.md` en lo que toca a M3, anotando lo que sigue diferido a M4 (correos, tracking, rotación de refresh token).
- [ ] **Paso 8:** mostrar `git status` + `git diff` completos y **esperar aprobación explícita de Manuel** antes de cualquier commit o merge. Confirmar el nombre de la rama con `git branch --show-current` y leerlo dos veces antes de escribirlo en un comando de merge.

---

## Verificación end-to-end (resumen)

| Qué | Comando / evidencia |
|---|---|
| Tipos | `pnpm -r exec tsc --noEmit` |
| Build | `pnpm build` |
| Lint + layering | `pnpm lint` |
| Tests | `pnpm test` × 3 (unit: money, publicId, orderTransitions, paymentAdapter, env · integration: settings, reservation, pricing, cart, orderCreate, orderRoutes, stripeWebhook, jobs, adminOrders) |
| Dependencias | `pnpm audit --prod --audit-level=high` |
| Índices | `getIndexes()` con `expireAfterSeconds` **solo** en `purgeAt` y en `carts.expiresAt` |
| Anti-sobreventa | 20 reservas paralelas → exactamente N éxitos, resto 409, `reserved` nunca negativo |
| Anti-doble-cobro | mismo `Idempotency-Key` → una orden; mismo `event.id` → un solo descuento de stock |
| Flujo real | Recorrido de 12 pasos con `stripe listen`, salidas pegadas |

---

## Gotchas a recordar durante la ejecución

1. **`@gira/shared` se debe rebuildear** (`pnpm --filter @gira/shared build`) tras editar los enums, o `tsc`, vitest y runtime siguen viendo el paquete de M2.
2. **Mongo local tiene que ser replica set** o cualquier cosa que toque `reservationService` falla con `Transaction numbers are only allowed on a replica set member`.
3. **La ruta del webhook se monta antes de `express.json`.** Si un test recibe `{}` en el body o la firma nunca valida, casi seguro se movió de lugar.
4. **`withTransaction` reintenta el callback.** Todo lo que va dentro tiene que ser idempotente, y un `AppError` de negocio aborta sin reintento — no meter efectos secundarios no transaccionales (auditoría, llamadas al proveedor) dentro de la transacción.
5. **Toda petición mutante en supertest necesita `.set("Origin", "http://localhost:3000")`** o `verifyOrigin` responde 403 (herencia de M2).
6. **`mongoSanitize` borra claves con `$` y con puntos** de `req.query`/`req.body` — no diseñar parámetros como `customer.email` en query. En el listado admin la búsqueda por email va por `?search=`, que `parseListQuery` traduce internamente.
7. **`sanitizeInput` escapa XSS en todos los strings**: un nombre con `<` vuelve escapado. Asertar sobre la salida escapada, no "arreglar" el middleware.
8. **El índice TTL va en `purgeAt`, nunca en `expiresAt`.** Si alguien lo mueve, el sistema pierde stock en silencio y ningún test unitario lo detecta — por eso el Paso 2 de la Tarea 17 lo verifica a mano.
9. **Las órdenes no se borran nunca.** `purgeAt` existe solo en `StockReservation` y `WebhookEvent`.
10. **Los jobs no se arrancan en `buildApp()`.** Si un test deja el proceso colgado, alguien los movió ahí.
11. **Git:** ninguna tarea ejecuta `git add`/`commit`/`push` sin mostrar el diff y recibir aprobación explícita. La rama es `feat/m3-ordenes-pagos` — verificarla con `git branch --show-current` antes de cualquier merge.
