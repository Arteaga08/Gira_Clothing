# M4 · Notificaciones + Envíos + Hardening — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: usa `subagent-driven-development` (recomendado) o `executing-plans` para ejecutar tarea por tarea. Los pasos usan checkbox (`- [ ]`).
>
> **Al aprobar:** copiar este archivo a `docs/superpowers/plans/2026-07-28-m4-notificaciones-envios.md` (convención del repo) antes de empezar.

**Goal:** Cerrar el Bloque 1 del backend: que una orden pagada avise sola (correo a la clienta, Telegram al equipo), que la admin capture paquetería y guía desde el panel con seguimiento consultable, y que el proyecto pase el checklist de seguridad completo con `audit` limpio.

**Architecture:** Dos adapters nuevos (`Mailer`, `NotificationChannel`) con el mismo patrón factory que `adapters/payment/` — real si hay credenciales, stub si no. Los correos **no se mandan en línea**: se encolan en una colección `Notification` (outbox) y un job del scheduler los despacha con reintentos y backoff, igual que el spec ya lo dibujó ("cron ligero → expirar reservas · reintentos de correo · conciliar pagos huérfanos"). El envío vive en su propia colección `Shipment` (un doc por orden, enum propio, log de eventos), y capturar la guía es la acción que mueve la orden a `shipped`. Stats por módulo + overview siguiendo `BACKEND_ARCHITECTURE_GUIDELINES`.

**Tech Stack:** Node 24 · pnpm 9.12 · TS estricto NodeNext ESM · Express 5 · Mongoose 8 (replica set) · Joi · `fetch` nativo para Resend y Telegram (**cero dependencias nuevas**) · Vitest + supertest + `MongoMemoryReplSet`.

---

## Context

M1, M2 y M3 están mergeados a `main` y verificados: monorepo pnpm con capas, auth JWT + 2FA, catálogo con stock atómico, y el flujo completo carrito → checkout → reserva con transacción → webhook de Stripe → jobs de expiración y conciliación → panel admin de órdenes. **412 bloques `it()` en verde.**

Hoy el sistema cobra bien pero es **mudo y ciego después del cobro**: la clienta paga y nadie le escribe; el equipo no se entera de que entró una orden; cuando la admin manda el paquete no hay dónde anotar la paquetería ni la guía, y la clienta no tiene forma de seguir su envío. Además el panel no tiene una sola cifra operativa (cuánto se vendió, qué está atascado, qué se quedó sin stock) y el checklist de seguridad quedó explícitamente pendiente de repaso completo desde M1.

M4 cierra exactamente eso. **No es zona de riesgo como M3** — nada aquí puede sobrevender ni cobrar dos veces — pero sí tiene dos trampas propias que el diseño resuelve por adelantado:

1. **Correos duplicados.** `applyPaymentSucceeded` puede correr dos veces (webhook reentregado + job de conciliación). Si el correo se manda ahí en línea, la clienta recibe dos confirmaciones. El outbox lo impide con un **índice único `(order, type)`**: la segunda encolada choca con E11000 y es un no-op, exactamente el mismo patrón de "el índice ES la garantía" que M3 usa para `idempotencyKey`.
2. **Correos perdidos.** Resend caído durante 30 segundos no puede costar la confirmación de una compra. El outbox persiste primero y despacha después, con reintentos y backoff.

**Resultado esperado:** el Bloque 1 queda cerrado y verificado. El dashboard (Bloque 2) tiene stats, envíos y auditoría que consumir; el storefront (Bloque 3) tiene seguimiento público que mostrar.

---

## Estado de pendientes previos (verificado antes de planear)

| Origen | Pendiente | Estado hoy |
|---|---|---|
| M2 #1 | Flakiness de la suite en paralelo | **Cerrado en M3** (Tarea 1: `globalSetup` con un solo `MongoMemoryReplSet` + `maxThreads: 4`). |
| M2 #2 | Reactivar variante huérfana | **Cerrado en M3** (Tarea 9: guard en `variantService` + 409 al reservar). |
| M3 | — | **El plan de M3 no dejó sección "Pendientes conocidos"**; termina en "Gotchas a recordar". Lo verifiqué con `grep -n "Pendiente" docs/superpowers/plans/2026-07-28-m3-ordenes-pagos.md`: las únicas coincidencias son referencias a los dos pendientes de M2, ya cerrados. **M4 no arrastra deuda documentada.** |

Los tres huecos que M3 sí dejó **por diseño** (y que M4 no toca, porque no están en su alcance): `POST /orders/quote` para cotizar envío pre-checkout, adapter de Mercado Pago, y rotación de refresh token.

---

## Decisiones cerradas en esta sesión (vinculantes)

| Decisión | Elección | Por qué |
|---|---|---|
| **Entrega de correos** | Outbox `Notification` + job `dispatchNotifications` con backoff exponencial. | Aprobado por Manuel. El spec ya listaba "reintentos de correo" como job del cron. Hace los tests deterministas: se asierta sobre la cola, nunca sobre la red. |
| **Anti-duplicado** | Índice único parcial `(order, type)`. | El webhook reentregado y el job de conciliación llaman al mismo efecto. El índice es la garantía, no un `if`. |
| **Claim del job** | `findOneAndUpdate({status: pending, nextAttemptAt: {$lte: now}} → sending)` atómico. | Mismo "ticket de exactamente-una-vez" que el flip de `StockReservation`. Dos instancias del job nunca mandan el mismo correo. |
| **Dependencias nuevas** | **Ninguna.** Resend y Telegram se llaman con `fetch` nativo + `AbortSignal.timeout`. | Ambas APIs son un POST con JSON. Un SDK por proveedor es superficie de `audit` a cambio de nada, y el objetivo del milestone es justamente `audit` limpio. |
| **Dónde vive el envío** | Colección `Shipment`, un doc por orden, enum propio + `events[]`. | Aprobado por Manuel. Mantiene `Order` como snapshot; permite índice propio por número de guía; sigue el patrón "sub-recurso de estado con historial rastreable" del estándar. |
| **Captura de guía** | `POST /admin/orders/:id/shipment` crea el envío **y** mueve la orden `processing → shipped` vía `assertAdminTransition`, **y** encola el correo de guía. | Es una sola realidad operativa ("ya lo mandé"). Partirla en dos endpoints permite el estado inconsistente "orden enviada sin guía capturada". |
| **Tracking público** | `GET /api/v1/orders/:publicId/tracking` con `trackingLimiter` propio (60/15 min). | Aprobado por Manuel. Es el enlace del correo de guía. El `publicId` sigue siendo la credencial; el limiter evita que un enlace filtrado sea herramienta de scraping. |
| **Umbral de bajo stock** | Nueva sección `inventory` en Settings (`lowStockThreshold`), con su PATCH y su acción de auditoría. | El estándar es explícito: una vez que existe Settings, **ningún umbral de negocio se hardcodea**. |
| **Stats** | Por módulo (`/admin/orders/stats`, `/admin/variants/stats`) + `/admin/stats/overview` de composición pura + `/admin/audit-logs`. | Aprobado por Manuel (las tres opciones). El overview se construye al final, cuando los módulos ya existen — como manda el estándar. |
| **Moneda en los stats** | Los ingresos se agrupan **por moneda**, nunca sumados entre MXN y USD. | Sumar dos monedas produce un número que no significa nada. |
| **Correos del equipo** | Telegram para: orden pagada, pago fallido, envío devuelto/perdido. | Son los tres eventos que exigen acción humana inmediata. Todo lo demás ya vive en el panel. |

---

## Fuera de alcance (no-negociable #5)

No se toca ni se "prepara": dashboard, frontend, Mercado Pago, CFDI, `POST /orders/quote`, integración con API de paqueterías (la guía es captura manual, decisión del spec), cupones/promociones, plantillas de correo con editor visual, correos de marketing, rotación de refresh token, notificaciones por WhatsApp/SMS.

---

## Estructura de archivos

### `packages/shared` (modificar)

| Archivo | Responsabilidad |
|---|---|
| `src/enums/shipment.ts` | **Nuevo.** `ShipmentStatus`. |
| `src/enums/notification.ts` | **Nuevo.** `NotificationChannelKind`, `NotificationType`, `NotificationStatus`. |
| `src/enums/auditAction.ts` | + `AuditModule.SHIPPING` / `NOTIFICATIONS` y sus acciones. |
| `src/index.ts` | Re-exportar lo nuevo. |

### `apps/api/src` (crear)

| Carpeta | Archivos |
|---|---|
| `adapters/mailer/` | `types.ts` · `resendMailer.ts` · `stubMailer.ts` · `index.ts` (factory) |
| `adapters/notification/` | `types.ts` · `telegramChannel.ts` · `stubChannel.ts` · `index.ts` (factory) |
| `templates/` | `orderEmails.ts` · `teamMessages.ts` |
| `utils/` | `shipmentTransitions.ts` · `parseStatsRange.ts` |
| `models/` | `Notification.ts` · `Shipment.ts` |
| `services/` | `notificationService.ts` · `shipmentService.ts` · `orderStatsService.ts` · `inventoryStatsService.ts` · `overviewService.ts` |
| `validators/` | `shipmentValidator.ts` · `statsValidator.ts` · `auditLogValidator.ts` |
| `controllers/` | `shipmentController.ts` · `statsController.ts` · `auditLogController.ts` |
| `routes/v1/admin/` | `adminShipmentRoutes.ts` · `statsRoutes.ts` · `auditLogRoutes.ts` |
| `jobs/` | `dispatchNotifications.ts` |

### Archivos existentes a modificar

| Archivo | Cambio |
|---|---|
| [config/env.ts](apps/api/src/config/env.ts) | `mail: MailConfig \| null` y `telegram: TelegramConfig \| null`, mismo patrón todo-o-nada que Cloudinary/Stripe. |
| [middlewares/rateLimit.ts](apps/api/src/middlewares/rateLimit.ts) | `catalogLimiter` (anti-scraping) y `trackingLimiter`. |
| [routes/v1/catalogRoutes.ts](apps/api/src/routes/v1/catalogRoutes.ts) | Montar `catalogLimiter` al tope del router. |
| [routes/v1/orderRoutes.ts](apps/api/src/routes/v1/orderRoutes.ts) | `GET /:publicId/tracking` con `trackingLimiter`. |
| [routes/v1/admin/adminOrderRoutes.ts](apps/api/src/routes/v1/admin/adminOrderRoutes.ts) | `GET /stats` (antes de `/:id`) + montar `adminShipmentRouter` bajo `/:id/shipment`. |
| [routes/v1/admin/variantRoutes.ts](apps/api/src/routes/v1/admin/variantRoutes.ts) | `GET /stats` (antes de `/:id`). |
| [routes/v1/admin/index.ts](apps/api/src/routes/v1/admin/index.ts) | Montar `/stats` y `/audit-logs`. |
| [services/orderPaymentService.ts](apps/api/src/services/orderPaymentService.ts) | Encolar confirmación + aviso al equipo en `applyPaymentSucceeded`; aviso de pago fallido en `applyPaymentFailed`. |
| [services/adminOrderService.ts](apps/api/src/services/adminOrderService.ts) | Encolar correo de preparación al pasar a `processing`. |
| [services/auditService.ts](apps/api/src/services/auditService.ts) | `listAuditLogs` (lectura paginada). |
| [services/settingsService.ts](apps/api/src/services/settingsService.ts) | Sección `inventory` + `updateInventorySettings`. |
| [models/Settings.ts](apps/api/src/models/Settings.ts) | Sección `inventory.lowStockThreshold`. |
| [validators/settingsValidator.ts](apps/api/src/validators/settingsValidator.ts) | `updateInventorySchema`. |
| [jobs/scheduler.ts](apps/api/src/jobs/scheduler.ts) | Sumar `dispatchNotifications` cada minuto. |
| [tests/setup.ts](apps/api/tests/setup.ts) | Borrar `RESEND_*` y `TELEGRAM_*` para forzar stubs. |
| `apps/api/.env.*.example` | Bloques de Resend y Telegram con placeholders. |

---

## Tarea 0: Rama de trabajo

- [ ] **Paso 1:** confirmar el estado

Run: `git status --short && git branch -a`
Expected: status vacío; solo `main` y `remotes/origin/main` (`aa7ecb3 Merge M3: órdenes + pagos`).

- [ ] **Paso 2:** pedir aprobación a Manuel y crear la rama

```bash
git checkout -b feat/m4-notificaciones-envios
```

> **Nombre exacto de la rama: `feat/m4-notificaciones-envios`.** Verificarlo con `git branch --show-current` y **leerlo dos veces** antes de escribirlo en cualquier comando de merge. Ninguna tarea posterior ejecuta `git add`/`commit`/`push` sin mostrar `git status` + `git diff` y esperar aprobación explícita de Manuel.

---

## Tarea 1: Enums compartidos

**Depends on:** 0. **Files:** Create `packages/shared/src/enums/shipment.ts`, `packages/shared/src/enums/notification.ts`; Modify `packages/shared/src/enums/auditAction.ts`, `packages/shared/src/index.ts`

- [ ] **Paso 1: `shipment.ts`**

```ts
/**
 * Shipment lifecycle, independent of OrderStatus on purpose: an order is
 * "shipped" the moment the package leaves, but the parcel itself keeps moving
 * through states the order does not care about. Valid transitions live in
 * apps/api/src/utils/shipmentTransitions.ts.
 */
enum ShipmentStatus {
  IN_TRANSIT = "in_transit",
  OUT_FOR_DELIVERY = "out_for_delivery",
  DELIVERED = "delivered",
  RETURNED = "returned",
  LOST = "lost",
}

export { ShipmentStatus };
```

- [ ] **Paso 2: `notification.ts`**

```ts
/**
 * Outbox taxonomy. Nothing is sent inline: every message is queued as a
 * Notification document and dispatched by the background job, so a provider
 * outage costs a retry instead of a lost order confirmation.
 */

enum NotificationChannelKind {
  /** Transactional email to the customer (Resend). */
  EMAIL = "email",
  /** Operational ping to the Gira team (Telegram). */
  TEAM = "team",
}

enum NotificationType {
  ORDER_CONFIRMATION = "order_confirmation",
  ORDER_PREPARING = "order_preparing",
  ORDER_SHIPPED = "order_shipped",
  TEAM_ORDER_PAID = "team_order_paid",
  TEAM_PAYMENT_FAILED = "team_payment_failed",
  TEAM_SHIPMENT_INCIDENT = "team_shipment_incident",
}

enum NotificationStatus {
  PENDING = "pending",
  /** Claimed by a dispatcher run. Reclaimed if the process died mid-send. */
  SENDING = "sending",
  SENT = "sent",
  /** Gave up after MAX_ATTEMPTS. Visible in the admin audit trail. */
  FAILED = "failed",
}

export { NotificationChannelKind, NotificationType, NotificationStatus };
```

- [ ] **Paso 3: `auditAction.ts`** — agregar al final de cada enum, sin reordenar lo existente

```ts
enum AuditModule {
  // ...AUTH, CATALOG, INVENTORY, SETTINGS, CART, ORDERS, PAYMENTS sin tocar...
  SHIPPING = "shipping",
  NOTIFICATIONS = "notifications",
}

enum AuditAction {
  // ...acciones de M1/M2/M3 sin tocar...
  SETTINGS_INVENTORY_UPDATED = "settings_inventory_updated",
  SHIPMENT_CREATED = "shipment_created",
  SHIPMENT_STATUS_CHANGED = "shipment_status_changed",
  NOTIFICATION_FAILED = "notification_failed",
}
```

`NOTIFICATION_FAILED` se registra **solo** cuando el outbox se rinde tras el último intento — no en cada reintento, o el audit trail se vuelve un log de red. `targetId` es el `publicId` de la orden y `after` lleva `{ type, attempts }`: **nunca el correo del destinatario** (§10 del estándar: sin PII en los snapshots).

- [ ] **Paso 4: `index.ts`** — sumar a los imports y al bloque de export

```ts
import { ShipmentStatus } from "./enums/shipment.js";
import {
  NotificationChannelKind,
  NotificationType,
  NotificationStatus,
} from "./enums/notification.js";

export {
  // ...lo existente...
  ShipmentStatus,
  NotificationChannelKind,
  NotificationType,
  NotificationStatus,
};
```

- [ ] **Paso 5: Rebuild obligatorio**

Run: `pnpm --filter @gira/shared build`
Expected: build limpio. **Sin esto `apps/api` sigue viendo el paquete de M3** (resuelve a `dist/`) y `tsc` fallará con "has no exported member ShipmentStatus".

- [ ] **Paso 6:** `pnpm -r exec tsc --noEmit` → sin errores. Diff, aprobación, commit.

---

## Tarea 2: Env de Resend y Telegram

**Depends on:** 1. **Files:** Modify `apps/api/src/config/env.ts`, `apps/api/tests/setup.ts`, `apps/api/.env.development.example`, `apps/api/.env.production.example`; Test `apps/api/tests/unit/env.test.ts`

- [ ] **Paso 1: Tests primero** — agregar a `tests/unit/env.test.ts`, reusando `prodBase`/`devBase` que el archivo ya define para Cloudinary y Stripe

```ts
describe("loadEnv · Resend", () => {
  it("exige las dos variables en producción", () => {
    expect(() =>
      loadEnv({ ...prodBase, RESEND_API_KEY: undefined, MAIL_FROM: undefined }),
    ).toThrow(/RESEND_API_KEY/);
  });
  it("acepta ninguna fuera de producción y deja mail en null", () => {
    expect(loadEnv({ ...devBase }).mail).toBeNull();
  });
  it("rechaza una configuración a medias fuera de producción", () => {
    expect(() => loadEnv({ ...devBase, RESEND_API_KEY: "re_test_x" })).toThrow(
      /Configuración de correo incompleta/,
    );
  });
  it("rechaza un MAIL_FROM sin formato de correo", () => {
    expect(() =>
      loadEnv({ ...devBase, RESEND_API_KEY: "re_test_x", MAIL_FROM: "no-es-correo" }),
    ).toThrow(/MAIL_FROM/);
  });
});

describe("loadEnv · Telegram", () => {
  it("deja telegram en null cuando no hay credenciales, incluso en producción", () => {
    expect(loadEnv({ ...prodBase, TELEGRAM_BOT_TOKEN: undefined, TELEGRAM_CHAT_ID: undefined }).telegram)
      .toBeNull();
  });
  it("rechaza una configuración a medias", () => {
    expect(() => loadEnv({ ...devBase, TELEGRAM_BOT_TOKEN: "123:abc" })).toThrow(
      /Configuración de Telegram incompleta/,
    );
  });
});
```

> **Ojo con la asimetría, es deliberada:** el correo es **obligatorio en producción** (una compra sin confirmación es un problema de negocio), pero Telegram **nunca** lo es — el spec dice literalmente "stub si no hay credenciales". Un canal interno caído no debe impedir arrancar la API. Los tests de arriba lo fijan.

- [ ] **Paso 2:** correr → FAIL (`mail` no existe en `Env`).

Run: `pnpm --filter @gira/api test -- env`

- [ ] **Paso 3: Implementar en `config/env.ts`**

```ts
interface MailConfig {
  apiKey: string;
  /** Verified sender, e.g. "Gira Clothing <hola@giraclothing.mx>". */
  from: string;
}

interface TelegramConfig {
  botToken: string;
  chatId: string;
}

interface Env {
  /* ...campos de M1/M2/M3... */
  /** null outside production when no provider is configured -> stub mailer. */
  mail: MailConfig | null;
  /** null whenever credentials are absent — including production. Internal channel. */
  telegram: TelegramConfig | null;
}
```

Dentro de `loadEnv()`, después del bloque de Stripe:

```ts
  const MAIL_FROM_PATTERN = /^[^<>@\s]+@[^<>@\s]+\.[^<>@\s]+$|^[^<>]+<[^<>@\s]+@[^<>@\s]+\.[^<>@\s]+>$/;

  const validateFrom = (from: string): void => {
    if (!MAIL_FROM_PATTERN.test(from)) {
      errors.push('MAIL_FROM debe ser un correo válido o "Nombre <correo@dominio>".');
    }
  };

  let mail: MailConfig | null = null;

  if (nodeEnv === "production") {
    // A paid order with no confirmation email is a business incident, not a
    // degraded mode — production must fail fast instead of silently stubbing.
    const apiKey = requireVar(source, "RESEND_API_KEY", errors);
    const from = requireVar(source, "MAIL_FROM", errors);
    if (apiKey && from) {
      validateFrom(from);
      mail = { apiKey, from };
    }
  } else {
    const apiKey = source.RESEND_API_KEY?.trim();
    const from = source.MAIL_FROM?.trim();
    if (apiKey && from) {
      validateFrom(from);
      mail = { apiKey, from };
    } else if (apiKey || from) {
      errors.push(
        "Configuración de correo incompleta: define RESEND_API_KEY y MAIL_FROM, o ninguna.",
      );
    }
  }

  // Telegram is the INTERNAL channel: optional in every environment (spec:
  // "stub si no hay credenciales"). An internal ping is never worth blocking boot.
  let telegram: TelegramConfig | null = null;
  const botToken = source.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = source.TELEGRAM_CHAT_ID?.trim();
  if (botToken && chatId) {
    telegram = { botToken, chatId };
  } else if (botToken || chatId) {
    errors.push(
      "Configuración de Telegram incompleta: define TELEGRAM_BOT_TOKEN y TELEGRAM_CHAT_ID, o ninguna.",
    );
  }
```

Sumar `mail` y `telegram` al objeto congelado que devuelve `loadEnv` y a `export type`.

- [ ] **Paso 4: `.env.development.example` y `.env.production.example`**

```
# Resend (obligatorio en producción; si se omite en dev/test se usa un mailer stub sin red)
RESEND_API_KEY=<re_...>
# Remitente verificado en Resend. Formato: correo@dominio o "Nombre <correo@dominio>"
MAIL_FROM=Gira Clothing <hola@giraclothing.mx>

# Telegram para avisos al equipo (SIEMPRE opcional; sin credenciales se usa un stub que loguea)
TELEGRAM_BOT_TOKEN=<123456:ABC-DEF...>
TELEGRAM_CHAT_ID=<-1001234567890>
```

- [ ] **Paso 5: `tests/setup.ts`** — junto a los borrados de `CLOUDINARY_*` y `STRIPE_*`

```ts
// Force the stub mailer and the stub team channel (M4): no test may reach
// Resend or Telegram over the network.
delete process.env.RESEND_API_KEY;
delete process.env.MAIL_FROM;
delete process.env.TELEGRAM_BOT_TOKEN;
delete process.env.TELEGRAM_CHAT_ID;
```

- [ ] **Paso 6:** tests de env PASS; `pnpm -r exec tsc --noEmit` y `pnpm lint` limpios. Diff, aprobación, commit.

---

## Tarea 3: Adapter `Mailer`

**Depends on:** 2. **Files:** Create `apps/api/src/adapters/mailer/types.ts`, `resendMailer.ts`, `stubMailer.ts`, `index.ts`; Test `apps/api/tests/unit/mailerAdapter.test.ts`

- [ ] **Paso 1: Test primero**

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { createStubMailer } from "../../src/adapters/mailer/stubMailer.js";
import { createResendMailer } from "../../src/adapters/mailer/resendMailer.js";

const message = {
  to: "clienta@example.com",
  subject: "Confirmamos tu compra",
  html: "<p>Gracias</p>",
  text: "Gracias",
};

describe("stubMailer", () => {
  it("resuelve con un providerId determinista y no toca la red", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const result = await createStubMailer().send(message);
    expect(result.providerId).toMatch(/^stub-/);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

describe("resendMailer", () => {
  afterEach(() => vi.restoreAllMocks());

  it("hace POST a la API de Resend con el remitente configurado", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "re_123" }), { status: 200 }),
    );
    const mailer = createResendMailer({ apiKey: "re_test", from: "Gira <hola@gira.mx>" });

    const result = await mailer.send(message);

    expect(result.providerId).toBe("re_123");
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe("https://api.resend.com/emails");
    expect((init as RequestInit).method).toBe("POST");
    const body = JSON.parse((init as RequestInit).body as string) as Record<string, unknown>;
    expect(body.from).toBe("Gira <hola@gira.mx>");
    expect(body.to).toEqual(["clienta@example.com"]);
  });

  it("lanza AppError 502 cuando el proveedor responde error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ message: "invalid api key" }), { status: 401 }),
    );
    const mailer = createResendMailer({ apiKey: "re_bad", from: "Gira <hola@gira.mx>" });

    await expect(mailer.send(message)).rejects.toMatchObject({ statusCode: 502 });
  });

  it("no incluye la API key en el mensaje del error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("nope", { status: 500 }));
    const mailer = createResendMailer({ apiKey: "re_super_secret", from: "Gira <hola@gira.mx>" });

    await expect(mailer.send(message)).rejects.toThrow(
      expect.not.stringContaining("re_super_secret") as unknown as string,
    );
  });
});
```

- [ ] **Paso 2:** correr → FAIL (módulos inexistentes).

Run: `pnpm --filter @gira/api test -- mailerAdapter`

- [ ] **Paso 3: `types.ts`**

```ts
/**
 * Narrow, domain-owned mail interface. No provider type crosses this boundary,
 * so swapping Resend for anything else is one new file here and nothing else.
 * The caller passes an already-rendered message: templates live in src/templates/,
 * never inside an adapter.
 */

interface MailMessage {
  to: string;
  subject: string;
  html: string;
  /** Plain-text fallback. Always sent — some clients never render the HTML part. */
  text: string;
}

interface MailResult {
  providerId: string;
}

interface Mailer {
  send(message: MailMessage): Promise<MailResult>;
}

export type { MailMessage, MailResult, Mailer };
```

- [ ] **Paso 4: `resendMailer.ts`**

```ts
import type { MailConfig } from "../../config/env.js";
import { AppError } from "../../utils/AppError.js";
import type { Mailer, MailMessage, MailResult } from "./types.js";

/**
 * Resend over plain fetch — the whole API surface we need is one JSON POST, and
 * a provider SDK would add dependency (and audit) surface for nothing.
 *
 * Failures throw AppError(502) WITHOUT the provider's raw body: a 401 from
 * Resend can echo request details back, and this error text ends up in
 * Notification.lastError, which the admin panel will display. The API key never
 * appears in a message, a log, or a stored field.
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const TIMEOUT_MS = 10_000;

const createResendMailer = (config: MailConfig): Mailer => ({
  send: async (message: MailMessage): Promise<MailResult> => {
    let response: Response;
    try {
      response = await fetch(RESEND_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: config.from,
          to: [message.to],
          subject: message.subject,
          html: message.html,
          text: message.text,
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      // Network error or timeout: retryable, and the outbox will retry it.
      throw new AppError("No se pudo contactar al proveedor de correo.", 502);
    }

    if (!response.ok) {
      throw new AppError(
        `El proveedor de correo rechazó el envío (HTTP ${String(response.status)}).`,
        502,
      );
    }

    const body = (await response.json()) as { id?: string };
    return { providerId: body.id ?? "unknown" };
  },
});

export { createResendMailer };
```

- [ ] **Paso 5: `stubMailer.ts`**

```ts
import { createHash } from "node:crypto";
import { logger } from "../../config/logger.js";
import type { Mailer, MailMessage, MailResult } from "./types.js";

/**
 * No-network fallback when RESEND_API_KEY is absent (dev/test). Deterministic:
 * same message -> same providerId, so tests can assert on it. Logs the subject
 * and a hash, NEVER the recipient or the body (BACKEND_SECURITY_GUIDELINES §11:
 * no PII in logs).
 */
const createStubMailer = (): Mailer => ({
  send: (message: MailMessage): Promise<MailResult> => {
    const hash = createHash("sha256")
      .update(`${message.to}|${message.subject}`)
      .digest("hex")
      .slice(0, 16);
    logger.info({ subject: message.subject, hash }, "Correo simulado (stub mailer)");
    return Promise.resolve({ providerId: `stub-${hash}` });
  },
});

export { createStubMailer };
```

- [ ] **Paso 6: `index.ts`** — factory idéntico al de `adapters/payment/`

```ts
import { env } from "../../config/env.js";
import { createResendMailer } from "./resendMailer.js";
import { createStubMailer } from "./stubMailer.js";
import type { Mailer } from "./types.js";

let cached: Mailer | undefined;

/** Provider chosen by configuration, never by conditionals in business code. */
const getMailer = (): Mailer => {
  cached ??= env.mail ? createResendMailer(env.mail) : createStubMailer();
  return cached;
};

export type { MailMessage, MailResult, Mailer } from "./types.js";
export { getMailer };
```

- [ ] **Paso 7:** tests PASS, typecheck y lint limpios. Diff, aprobación, commit.

---

## Tarea 4: Adapter `NotificationChannel` (Telegram)

**Depends on:** 2. **Files:** Create `apps/api/src/adapters/notification/types.ts`, `telegramChannel.ts`, `stubChannel.ts`, `index.ts`; Test `apps/api/tests/unit/notificationAdapter.test.ts`

- [ ] **Paso 1: Test primero**

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { createStubChannel } from "../../src/adapters/notification/stubChannel.js";
import { createTelegramChannel } from "../../src/adapters/notification/telegramChannel.js";

const message = { title: "Nueva orden pagada", lines: ["Folio: ABC", "Total: $1,200.00 MXN"] };

describe("stubChannel", () => {
  it("resuelve sin tocar la red", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await expect(createStubChannel().notify(message)).resolves.toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

describe("telegramChannel", () => {
  afterEach(() => vi.restoreAllMocks());

  it("manda el mensaje al chat configurado", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    await createTelegramChannel({ botToken: "123:abc", chatId: "-100" }).notify(message);

    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe("https://api.telegram.org/bot123:abc/sendMessage");
    const body = JSON.parse((init as RequestInit).body as string) as Record<string, unknown>;
    expect(body.chat_id).toBe("-100");
    expect(String(body.text)).toContain("Nueva orden pagada");
    expect(String(body.text)).toContain("Folio: ABC");
  });

  it("lanza AppError 502 cuando Telegram responde error, sin filtrar el token", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("bad", { status: 400 }));
    const channel = createTelegramChannel({ botToken: "123:supersecret", chatId: "-100" });

    await expect(channel.notify(message)).rejects.toMatchObject({ statusCode: 502 });
    await expect(channel.notify(message)).rejects.toThrow(
      expect.not.stringContaining("supersecret") as unknown as string,
    );
  });
});
```

- [ ] **Paso 2:** correr → FAIL.

- [ ] **Paso 3: `types.ts`**

```ts
/**
 * Internal team channel. Deliberately dumber than Mailer: a title and a list of
 * lines, because an operational ping is a glance, not a document. Keeping the
 * interface this narrow is what lets the stub be honest — it can render
 * everything the real channel renders.
 */

interface TeamMessage {
  title: string;
  lines: string[];
}

interface NotificationChannel {
  notify(message: TeamMessage): Promise<void>;
}

export type { TeamMessage, NotificationChannel };
```

- [ ] **Paso 4: `telegramChannel.ts`**

```ts
import type { TelegramConfig } from "../../config/env.js";
import { AppError } from "../../utils/AppError.js";
import type { NotificationChannel, TeamMessage } from "./types.js";

/**
 * Telegram Bot API over plain fetch. The bot token lives in the URL path, so no
 * error message here may ever echo the URL — it would leak the token into
 * Notification.lastError and into the logs.
 */

const TIMEOUT_MS = 10_000;

const render = (message: TeamMessage): string =>
  [message.title, "", ...message.lines].join("\n");

const createTelegramChannel = (config: TelegramConfig): NotificationChannel => ({
  notify: async (message: TeamMessage): Promise<void> => {
    let response: Response;
    try {
      response = await fetch(`https://api.telegram.org/bot${config.botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: config.chatId,
          text: render(message),
          disable_web_page_preview: true,
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      throw new AppError("No se pudo contactar al canal de notificaciones.", 502);
    }

    if (!response.ok) {
      throw new AppError(
        `El canal de notificaciones rechazó el mensaje (HTTP ${String(response.status)}).`,
        502,
      );
    }
  },
});

export { createTelegramChannel };
```

- [ ] **Paso 5: `stubChannel.ts`**

```ts
import { logger } from "../../config/logger.js";
import type { NotificationChannel, TeamMessage } from "./types.js";

/**
 * Used whenever Telegram credentials are absent — which the spec allows in
 * EVERY environment, production included. The team channel is a convenience,
 * not a business guarantee, so its absence must never break a flow.
 */
const createStubChannel = (): NotificationChannel => ({
  notify: (message: TeamMessage): Promise<void> => {
    logger.info({ title: message.title }, "Aviso al equipo simulado (stub channel)");
    return Promise.resolve();
  },
});

export { createStubChannel };
```

- [ ] **Paso 6: `index.ts`**

```ts
import { env } from "../../config/env.js";
import { createTelegramChannel } from "./telegramChannel.js";
import { createStubChannel } from "./stubChannel.js";
import type { NotificationChannel } from "./types.js";

let cached: NotificationChannel | undefined;

const getNotificationChannel = (): NotificationChannel => {
  cached ??= env.telegram ? createTelegramChannel(env.telegram) : createStubChannel();
  return cached;
};

export type { TeamMessage, NotificationChannel } from "./types.js";
export { getNotificationChannel };
```

- [ ] **Paso 7:** tests PASS, typecheck y lint limpios. Diff, aprobación, commit.

---

## Tarea 5: Plantillas de correo y de avisos

**Depends on:** 1. **Files:** Create `apps/api/src/templates/orderEmails.ts`, `apps/api/src/templates/teamMessages.ts`; Test `apps/api/tests/unit/orderEmails.test.ts`

Funciones **puras**: reciben un snapshot plano y devuelven `{ subject, html, text }`. No leen DB, no leen `env` más que `clientUrl`, no formatean con librerías externas.

- [ ] **Paso 1: Test primero**

```ts
import { describe, it, expect } from "vitest";
import { Currency } from "@gira/shared";
import {
  renderOrderConfirmation,
  renderOrderPreparing,
  renderOrderShipped,
  formatMoney,
} from "../../src/templates/orderEmails.js";

const snapshot = {
  publicId: "abc123",
  customerName: "Ana",
  currency: Currency.MXN,
  subtotal: 120000,
  shippingCost: 15000,
  total: 135000,
  lines: [{ productName: "Tote", printName: "Amapolas", qty: 2, lineTotal: 120000 }],
};

describe("formatMoney", () => {
  it("formatea centavos a pesos con dos decimales", () => {
    expect(formatMoney(135000, Currency.MXN)).toBe("$1,350.00 MXN");
  });
  it("formatea dólares con su sufijo", () => {
    expect(formatMoney(5650, Currency.USD)).toBe("$56.50 USD");
  });
  it("formatea cero", () => {
    expect(formatMoney(0, Currency.MXN)).toBe("$0.00 MXN");
  });
});

describe("renderOrderConfirmation", () => {
  const mail = renderOrderConfirmation(snapshot);

  it("escribe el asunto en español y sin el publicId", () => {
    expect(mail.subject).toBe("Confirmamos tu compra en Gira Clothing");
  });
  it("incluye las líneas, el total y el enlace a la orden", () => {
    expect(mail.html).toContain("Tote");
    expect(mail.html).toContain("Amapolas");
    expect(mail.html).toContain("$1,350.00 MXN");
    expect(mail.html).toContain("/orden/abc123");
  });
  it("escapa el HTML de los datos de la clienta", () => {
    const evil = { ...snapshot, customerName: "<script>alert(1)</script>" };
    expect(renderOrderConfirmation(evil).html).not.toContain("<script>");
  });
  it("entrega también una versión de texto plano no vacía", () => {
    expect(mail.text.length).toBeGreaterThan(0);
    expect(mail.text).not.toContain("<");
  });
});

describe("renderOrderPreparing", () => {
  it("anuncia la preparación sin prometer fecha de entrega", () => {
    const mail = renderOrderPreparing(snapshot);
    expect(mail.subject).toContain("preparando");
    expect(mail.html).toContain("/orden/abc123");
  });
});

describe("renderOrderShipped", () => {
  const mail = renderOrderShipped({
    ...snapshot,
    carrier: "Estafeta",
    trackingNumber: "1234567890",
  });

  it("incluye paquetería, número de guía y el enlace de seguimiento", () => {
    expect(mail.html).toContain("Estafeta");
    expect(mail.html).toContain("1234567890");
    expect(mail.html).toContain("/orden/abc123/seguimiento");
  });
});
```

- [ ] **Paso 2:** correr → FAIL.

- [ ] **Paso 3: Implementar `orderEmails.ts`**

```ts
import { Currency } from "@gira/shared";
import { env } from "../config/env.js";

/**
 * Pure render functions. They take a FLAT SNAPSHOT — never a Mongoose document
 * — so a template can never trigger a query, and the outbox can store exactly
 * what it will render. Copy is Spanish (customer-facing); code is English
 * (non-negociable #3).
 *
 * Every interpolated value goes through escapeHtml. The customer name and the
 * address reach us through the API, and sanitizeInput escapes them on the way
 * in, but an email built by string concatenation must not depend on that: two
 * layers, neither replacing the other.
 */

interface OrderEmailLine {
  productName: string;
  printName: string;
  qty: number;
  lineTotal: number;
}

interface OrderEmailSnapshot {
  publicId: string;
  customerName: string;
  currency: Currency;
  subtotal: number;
  shippingCost: number;
  total: number;
  lines: OrderEmailLine[];
}

interface ShippedEmailSnapshot extends OrderEmailSnapshot {
  carrier: string;
  trackingNumber: string;
}

interface RenderedMail {
  subject: string;
  html: string;
  text: string;
}

const MINOR_UNITS = 100;

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/** Minor units -> "$1,350.00 MXN". Integer math only; no float ever touches a price. */
const formatMoney = (minorUnits: number, currency: Currency): string => {
  const units = Math.trunc(minorUnits / MINOR_UNITS);
  const cents = String(Math.abs(minorUnits % MINOR_UNITS)).padStart(2, "0");
  const grouped = units.toLocaleString("en-US");
  return `$${grouped}.${cents} ${currency}`;
};

const orderUrl = (publicId: string): string => `${env.clientUrl}/orden/${publicId}`;
const trackingUrl = (publicId: string): string => `${orderUrl(publicId)}/seguimiento`;

const renderLinesHtml = (lines: OrderEmailLine[], currency: Currency): string =>
  lines
    .map(
      (line) =>
        `<tr><td>${escapeHtml(line.productName)} · ${escapeHtml(line.printName)}</td>` +
        `<td align="right">${String(line.qty)}</td>` +
        `<td align="right">${formatMoney(line.lineTotal, currency)}</td></tr>`,
    )
    .join("");

const renderLinesText = (lines: OrderEmailLine[], currency: Currency): string =>
  lines
    .map(
      (line) =>
        `- ${line.productName} · ${line.printName} x${String(line.qty)} — ` +
        formatMoney(line.lineTotal, currency),
    )
    .join("\n");

const layout = (heading: string, bodyHtml: string): string =>
  `<!doctype html><html lang="es"><body style="font-family:system-ui,sans-serif;color:#1a1a1a">` +
  `<h1 style="font-size:20px">${escapeHtml(heading)}</h1>${bodyHtml}` +
  `<p style="font-size:12px;color:#666">Gira Clothing</p></body></html>`;

const totalsHtml = (snapshot: OrderEmailSnapshot): string =>
  `<p>Subtotal: ${formatMoney(snapshot.subtotal, snapshot.currency)}<br>` +
  `Envío: ${formatMoney(snapshot.shippingCost, snapshot.currency)}<br>` +
  `<strong>Total: ${formatMoney(snapshot.total, snapshot.currency)}</strong></p>`;

const renderOrderConfirmation = (snapshot: OrderEmailSnapshot): RenderedMail => ({
  subject: "Confirmamos tu compra en Gira Clothing",
  html: layout(
    `¡Gracias por tu compra, ${snapshot.customerName}!`,
    `<p>Ya recibimos tu pago. Te avisamos en cuanto empecemos a preparar tu pedido.</p>` +
      `<table width="100%">${renderLinesHtml(snapshot.lines, snapshot.currency)}</table>` +
      totalsHtml(snapshot) +
      `<p><a href="${orderUrl(snapshot.publicId)}">Ver mi pedido</a></p>`,
  ),
  text:
    `¡Gracias por tu compra, ${snapshot.customerName}!\n\n` +
    `Ya recibimos tu pago.\n\n${renderLinesText(snapshot.lines, snapshot.currency)}\n\n` +
    `Total: ${formatMoney(snapshot.total, snapshot.currency)}\n\n` +
    `Ver mi pedido: ${orderUrl(snapshot.publicId)}`,
});

const renderOrderPreparing = (snapshot: OrderEmailSnapshot): RenderedMail => ({
  subject: "Estamos preparando tu pedido",
  html: layout(
    `${snapshot.customerName}, ya estamos en eso`,
    `<p>Tu pedido está en preparación. Te mandamos el número de guía en cuanto salga del taller.</p>` +
      `<p><a href="${orderUrl(snapshot.publicId)}">Ver mi pedido</a></p>`,
  ),
  text:
    `${snapshot.customerName}, ya estamos preparando tu pedido.\n\n` +
    `Te mandamos el número de guía en cuanto salga del taller.\n\n` +
    `Ver mi pedido: ${orderUrl(snapshot.publicId)}`,
});

const renderOrderShipped = (snapshot: ShippedEmailSnapshot): RenderedMail => ({
  subject: "Tu pedido va en camino",
  html: layout(
    `${snapshot.customerName}, tu pedido ya salió`,
    `<p>Paquetería: <strong>${escapeHtml(snapshot.carrier)}</strong><br>` +
      `Número de guía: <strong>${escapeHtml(snapshot.trackingNumber)}</strong></p>` +
      `<p><a href="${trackingUrl(snapshot.publicId)}">Seguir mi envío</a></p>`,
  ),
  text:
    `${snapshot.customerName}, tu pedido ya salió.\n\n` +
    `Paquetería: ${snapshot.carrier}\nNúmero de guía: ${snapshot.trackingNumber}\n\n` +
    `Seguir mi envío: ${trackingUrl(snapshot.publicId)}`,
});

export type { OrderEmailSnapshot, ShippedEmailSnapshot, OrderEmailLine, RenderedMail };
export { formatMoney, renderOrderConfirmation, renderOrderPreparing, renderOrderShipped };
```

- [ ] **Paso 4: `teamMessages.ts`**

```ts
import type { Currency } from "@gira/shared";
import { formatMoney } from "./orderEmails.js";
import type { TeamMessage } from "../adapters/notification/types.js";

/**
 * Operational pings. They carry the order's publicId (an internal-channel
 * identifier, not a public link) and never the customer's email or address:
 * a Telegram group is not a place to spill PII.
 */

interface TeamOrderSnapshot {
  publicId: string;
  total: number;
  currency: Currency;
  itemCount: number;
}

const renderTeamOrderPaid = (snapshot: TeamOrderSnapshot): TeamMessage => ({
  title: "🛍️ Nueva orden pagada",
  lines: [
    `Folio: ${snapshot.publicId}`,
    `Total: ${formatMoney(snapshot.total, snapshot.currency)}`,
    `Artículos: ${String(snapshot.itemCount)}`,
  ],
});

const renderTeamPaymentFailed = (publicId: string, reason?: string): TeamMessage => ({
  title: "⚠️ Pago rechazado",
  lines: [`Folio: ${publicId}`, ...(reason ? [`Motivo: ${reason}`] : [])],
});

const renderTeamShipmentIncident = (
  publicId: string,
  status: string,
  carrier: string,
): TeamMessage => ({
  title: "📦 Incidencia de envío",
  lines: [`Folio: ${publicId}`, `Estado: ${status}`, `Paquetería: ${carrier}`],
});

export type { TeamOrderSnapshot };
export { renderTeamOrderPaid, renderTeamPaymentFailed, renderTeamShipmentIncident };
```

- [ ] **Paso 5:** tests PASS, typecheck y lint limpios. Diff, aprobación, commit.

---

## Tarea 6: Modelo `Notification` + `notificationService` (TDD)

**Depends on:** 3, 4, 5. **Files:** Create `apps/api/src/models/Notification.ts`, `apps/api/src/services/notificationService.ts`; Test `apps/api/tests/integration/notifications.test.ts`

### La regla dura del outbox

`applyPaymentSucceeded` corre desde el webhook **y** desde el job de conciliación. Ambos son idempotentes sobre la orden, pero encolar un correo es un efecto nuevo: sin protección, la clienta recibe dos confirmaciones. La protección **no es un `if`** — es el índice único `(order, type)`, exactamente como `Order.idempotencyKey` en M3. Encolar dos veces lanza E11000, que el service traduce a un no-op silencioso.

- [ ] **Paso 1: Escribir el test COMPLETO antes de implementar**

Casos a nivel service:

| Grupo | Casos |
|---|---|
| Encolado | `enqueueNotification({order, type: ORDER_CONFIRMATION, channel: EMAIL, to, payload})` → doc `pending`, `attempts === 0`, `nextAttemptAt <= now`, `purgeAt` **null** |
| Idempotencia | encolar el mismo `(order, type)` dos veces → **un solo documento**, sin lanzar |
| Idempotencia (concurrencia) | 10 `enqueueNotification` en paralelo del mismo `(order, type)` con `Promise.allSettled` → exactamente **1** documento en DB, **0** rechazos propagados |
| Sin orden | dos avisos de equipo sin `order` (`order: undefined`) → **ambos** se crean (el índice único es parcial, solo aplica cuando `order` existe) |
| Claim | `claimNextBatch(10)` sobre 3 pendientes → 3 docs en `sending` con `attempts === 1` |
| Claim (exactamente-una-vez) | 1 pendiente, **20 `claimNextBatch` en paralelo** → exactamente **1** claim total entre todas las llamadas |
| Claim (ventana) | un pendiente con `nextAttemptAt` en el futuro **no** se reclama |
| Claim (recuperación) | un `sending` con `updatedAt` de hace 15 min **sí** se re-reclama (el proceso murió a media entrega) |
| Éxito | `markSent(id, "re_123")` → `sent`, `sentAt` fijado, `purgeAt` fijado |
| Fallo reintentable | `markFailed(id, "502")` con `attempts: 1` → vuelve a `pending`, `nextAttemptAt` **mayor** que antes (backoff), `lastError` guardado |
| Fallo terminal | `markFailed(id, "502")` con `attempts: 5` → `failed`, `purgeAt` fijado, y **una** entrada de auditoría `NOTIFICATION_FAILED` |
| Auditoría sin PII | esa entrada **no** contiene el correo del destinatario (asertar `JSON.stringify(entry)` sin `@`) |

- [ ] **Paso 2:** correr → FAIL (`notificationService` no existe).

Run: `pnpm --filter @gira/api test -- notifications`

- [ ] **Paso 3: Modelo**

```ts
import { Schema, model, type HydratedDocument, type Model, type Types } from "mongoose";
import { NotificationChannelKind, NotificationStatus, NotificationType } from "@gira/shared";

/**
 * Transactional outbox. Nothing is sent inline: business code enqueues, the
 * dispatcher job delivers. That buys two things a direct send cannot:
 *
 *  1. EXACTLY-ONE per (order, type), enforced by a partial unique index.
 *     applyPaymentSucceeded runs from the webhook AND from the reconciliation
 *     job — without this index the customer gets two confirmation emails.
 *  2. Retries. A 30-second Resend outage costs a retry, not a lost purchase
 *     confirmation.
 *
 * `purgeAt` carries the TTL index and is set ONLY on a terminal state
 * (sent/failed) — same discipline as StockReservation in M3: the TTL index is a
 * garbage collector, never the mechanism that decides anything.
 */

const PURGE_AFTER_DAYS = 30;

interface NotificationAttrs {
  channel: NotificationChannelKind;
  type: NotificationType;
  /** Email address, or the team channel id. Operational data, never audited. */
  to: string;
  order?: Types.ObjectId;
  /** Flat snapshot the template renders. No secrets, no Mongoose documents. */
  payload: Record<string, unknown>;
  status: NotificationStatus;
  attempts: number;
  nextAttemptAt: Date;
  lastError?: string;
  providerId?: string;
  sentAt?: Date;
  purgeAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

type NotificationModel = Model<NotificationAttrs>;
type NotificationDocument = HydratedDocument<NotificationAttrs>;

const notificationSchema = new Schema<NotificationAttrs, NotificationModel>(
  {
    channel: { type: String, enum: Object.values(NotificationChannelKind), required: true },
    type: { type: String, enum: Object.values(NotificationType), required: true },
    to: { type: String, required: true, trim: true },
    order: { type: Schema.Types.ObjectId, ref: "Order" },
    payload: { type: Schema.Types.Mixed, required: true },
    status: {
      type: String,
      enum: Object.values(NotificationStatus),
      required: true,
      default: NotificationStatus.PENDING,
    },
    attempts: { type: Number, required: true, default: 0, min: 0 },
    nextAttemptAt: { type: Date, required: true, default: () => new Date() },
    lastError: { type: String },
    providerId: { type: String },
    sentAt: { type: Date },
    purgeAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// The exactly-one guarantee. PARTIAL on purpose: team pings carry no order, and
// several of them may legitimately exist for the same type.
notificationSchema.index(
  { order: 1, type: 1 },
  { unique: true, partialFilterExpression: { order: { $exists: true } } },
);
// The dispatcher's hot query: pending work whose time has come.
notificationSchema.index({ status: 1, nextAttemptAt: 1 });
// Garbage collection of terminal documents only.
notificationSchema.index({ purgeAt: 1 }, { expireAfterSeconds: 0 });

const Notification = model<NotificationAttrs, NotificationModel>(
  "Notification",
  notificationSchema,
);

export type { NotificationAttrs, NotificationDocument };
export { Notification, PURGE_AFTER_DAYS };
```

- [ ] **Paso 4: Service**

```ts
import type { Types } from "mongoose";
import {
  AuditAction,
  AuditModule,
  NotificationChannelKind,
  NotificationStatus,
  NotificationType,
} from "@gira/shared";
import { Notification, PURGE_AFTER_DAYS, type NotificationDocument } from "../models/Notification.js";
import { recordAudit } from "./auditService.js";
import { logger } from "../config/logger.js";

/**
 * Outbox access. Enqueue is BEST-EFFORT by contract: a failure to queue a
 * notification must never roll back the payment it was announcing — same rule
 * as recordAudit (BACKEND_SECURITY_GUIDELINES §10).
 *
 * The claim is an atomic findOneAndUpdate whose filter carries the state
 * (`status: pending`). That filter IS the exactly-once ticket: two dispatcher
 * runs racing for the same document, exactly one wins — the same pattern M3
 * uses for the reservation flip.
 */

const MAX_ATTEMPTS = 5;
const BASE_BACKOFF_MS = 60 * 1000;
/** A `sending` document older than this was orphaned by a dead process. */
const STALE_SENDING_MS = 10 * 60 * 1000;

const purgeDate = (): Date => new Date(Date.now() + PURGE_AFTER_DAYS * 24 * 60 * 60 * 1000);

/** 1, 2, 4, 8, 16 minutes — enough to ride out an outage without hammering. */
const backoffFrom = (attempts: number): Date =>
  new Date(Date.now() + BASE_BACKOFF_MS * 2 ** Math.max(0, attempts - 1));

const isDuplicateKeyError = (err: unknown): boolean =>
  typeof err === "object" &&
  err !== null &&
  "code" in err &&
  (err as { code?: number }).code === 11000;

interface EnqueueInput {
  channel: NotificationChannelKind;
  type: NotificationType;
  to: string;
  order?: Types.ObjectId | undefined;
  payload: Record<string, unknown>;
}

/** Returns false when the message was already queued (duplicate) or failed to queue. */
const enqueueNotification = async (input: EnqueueInput): Promise<boolean> => {
  try {
    await Notification.create({
      channel: input.channel,
      type: input.type,
      to: input.to,
      ...(input.order ? { order: input.order } : {}),
      payload: input.payload,
      status: NotificationStatus.PENDING,
      attempts: 0,
      nextAttemptAt: new Date(),
    });
    return true;
  } catch (err) {
    // Already queued for this (order, type): the effect already landed.
    if (isDuplicateKeyError(err)) return false;
    logger.error({ err, type: input.type }, "No se pudo encolar la notificación");
    return false;
  }
};

/**
 * Claims up to `limit` messages, one atomic flip at a time. Sequential on
 * purpose: a bulk update could not tell us WHICH documents we won, and the
 * batch is small by design.
 */
const claimNextBatch = async (limit: number): Promise<NotificationDocument[]> => {
  const claimed: NotificationDocument[] = [];
  const staleBefore = new Date(Date.now() - STALE_SENDING_MS);

  for (let i = 0; i < limit; i += 1) {
    const doc = await Notification.findOneAndUpdate(
      {
        $or: [
          { status: NotificationStatus.PENDING, nextAttemptAt: { $lte: new Date() } },
          // Orphan recovery: a process that died mid-send left this behind.
          { status: NotificationStatus.SENDING, updatedAt: { $lt: staleBefore } },
        ],
      },
      { $set: { status: NotificationStatus.SENDING }, $inc: { attempts: 1 } },
      { new: true, sort: { nextAttemptAt: 1 } },
    );
    if (!doc) break;
    claimed.push(doc);
  }

  return claimed;
};

const markSent = async (id: Types.ObjectId, providerId: string): Promise<void> => {
  await Notification.updateOne(
    { _id: id },
    {
      $set: {
        status: NotificationStatus.SENT,
        sentAt: new Date(),
        purgeAt: purgeDate(),
        providerId,
      },
      $unset: { lastError: "" },
    },
  );
};

/** Back to pending with backoff, or terminal once the attempts run out. */
const markFailed = async (doc: NotificationDocument, error: string): Promise<void> => {
  const giveUp = doc.attempts >= MAX_ATTEMPTS;

  await Notification.updateOne(
    { _id: doc._id },
    {
      $set: {
        status: giveUp ? NotificationStatus.FAILED : NotificationStatus.PENDING,
        lastError: error.slice(0, 300),
        nextAttemptAt: backoffFrom(doc.attempts),
        ...(giveUp ? { purgeAt: purgeDate() } : {}),
      },
    },
  );

  if (giveUp) {
    // Audited only on the FINAL failure: one entry per lost message, not one
    // per retry. No recipient here — never PII in the audit trail (§10).
    await recordAudit({
      actorType: "system",
      action: AuditAction.NOTIFICATION_FAILED,
      module: AuditModule.NOTIFICATIONS,
      ...(doc.order ? { targetId: String(doc.order) } : {}),
      after: { type: doc.type, channel: doc.channel, attempts: doc.attempts },
    });
  }
};

export type { EnqueueInput };
export { enqueueNotification, claimNextBatch, markSent, markFailed, MAX_ATTEMPTS };
```

- [ ] **Paso 5:** tests PASS, typecheck y lint limpios. Diff, aprobación, commit.

---

## Tarea 7: Job `dispatchNotifications`

**Depends on:** 6. **Files:** Create `apps/api/src/jobs/dispatchNotifications.ts`; Modify `apps/api/src/jobs/scheduler.ts`; Test `apps/api/tests/integration/dispatchNotifications.test.ts`

- [ ] **Paso 1: Test primero.** Casos (con los adapters stub activos, que es el default en tests):

| Grupo | Casos |
|---|---|
| Camino feliz | 2 correos encolados → `dispatchNotifications()` devuelve `{sent: 2, failed: 0}`, ambos en `sent` con `providerId` y `purgeAt` |
| Canal de equipo | un `TEAM` encolado → se despacha por el `NotificationChannel`, no por el mailer (espiar con `vi.spyOn` sobre el módulo del adapter) |
| Reintento | mailer que lanza → doc vuelve a `pending`, `attempts === 1`, `nextAttemptAt` futuro, `lastError` presente; correrlo otra vez de inmediato **no** lo vuelve a tomar |
| Terminal | doc con `attempts: 5` y mailer que lanza → `failed` + audit `NOTIFICATION_FAILED` |
| Aislamiento | 3 encolados, el del medio falla → los otros dos quedan `sent` (un fallo no detiene el barrido) |
| Vacío | sin pendientes → `{sent: 0, failed: 0}` sin tocar adapters |
| Tipo desconocido | un doc con `payload` inválido para su tipo → `markFailed`, nunca una excepción que escape del job |

- [ ] **Paso 2:** correr → FAIL.

- [ ] **Paso 3: Implementar**

```ts
import { NotificationChannelKind, NotificationType } from "@gira/shared";
import { getMailer } from "../adapters/mailer/index.js";
import { getNotificationChannel } from "../adapters/notification/index.js";
import {
  claimNextBatch,
  markSent,
  markFailed,
} from "../services/notificationService.js";
import {
  renderOrderConfirmation,
  renderOrderPreparing,
  renderOrderShipped,
  type OrderEmailSnapshot,
  type ShippedEmailSnapshot,
  type RenderedMail,
} from "../templates/orderEmails.js";
import {
  renderTeamOrderPaid,
  renderTeamPaymentFailed,
  renderTeamShipmentIncident,
  type TeamOrderSnapshot,
} from "../templates/teamMessages.js";
import type { TeamMessage } from "../adapters/notification/types.js";
import type { NotificationDocument } from "../models/Notification.js";
import { logger } from "../config/logger.js";

/**
 * Drains the outbox. Rendering happens HERE, at delivery time, from the payload
 * snapshot frozen at enqueue time — so a template fix reaches messages that are
 * still queued, while the data they describe never drifts.
 *
 * Exported as a plain async function so tests drive it directly; the scheduler
 * is the only thing that puts it on a timer.
 */

const BATCH = 20;

const renderEmail = (doc: NotificationDocument): RenderedMail => {
  const payload = doc.payload as unknown;
  switch (doc.type) {
    case NotificationType.ORDER_CONFIRMATION:
      return renderOrderConfirmation(payload as OrderEmailSnapshot);
    case NotificationType.ORDER_PREPARING:
      return renderOrderPreparing(payload as OrderEmailSnapshot);
    case NotificationType.ORDER_SHIPPED:
      return renderOrderShipped(payload as ShippedEmailSnapshot);
    default:
      throw new Error(`Tipo de correo no soportado: ${doc.type}`);
  }
};

const renderTeam = (doc: NotificationDocument): TeamMessage => {
  const payload = doc.payload as Record<string, unknown>;
  switch (doc.type) {
    case NotificationType.TEAM_ORDER_PAID:
      return renderTeamOrderPaid(payload as unknown as TeamOrderSnapshot);
    case NotificationType.TEAM_PAYMENT_FAILED:
      return renderTeamPaymentFailed(
        String(payload.publicId),
        payload.reason ? String(payload.reason) : undefined,
      );
    case NotificationType.TEAM_SHIPMENT_INCIDENT:
      return renderTeamShipmentIncident(
        String(payload.publicId),
        String(payload.status),
        String(payload.carrier),
      );
    default:
      throw new Error(`Tipo de aviso no soportado: ${doc.type}`);
  }
};

const deliver = async (doc: NotificationDocument): Promise<void> => {
  if (doc.channel === NotificationChannelKind.EMAIL) {
    const mail = renderEmail(doc);
    const { providerId } = await getMailer().send({ to: doc.to, ...mail });
    await markSent(doc._id, providerId);
    return;
  }

  await getNotificationChannel().notify(renderTeam(doc));
  await markSent(doc._id, "team");
};

const dispatchNotifications = async (): Promise<{ sent: number; failed: number }> => {
  const claimed = await claimNextBatch(BATCH);
  let sent = 0;
  let failed = 0;

  for (const doc of claimed) {
    try {
      await deliver(doc);
      sent += 1;
    } catch (err) {
      // One bad message must not stop the sweep.
      failed += 1;
      const reason = err instanceof Error ? err.message : "Error desconocido";
      logger.error({ err, notification: String(doc._id) }, "No se pudo entregar la notificación");
      await markFailed(doc, reason);
    }
  }

  return { sent, failed };
};

export { dispatchNotifications };
```

- [ ] **Paso 4: `scheduler.ts`** — sumar el job al arreglo de timers

```ts
import { dispatchNotifications } from "./dispatchNotifications.js";

const startJobs = (): void => {
  timers = [
    setInterval(runSafely("expireReservations", expireReservations), EVERY_MINUTE),
    setInterval(runSafely("reconcilePayments", reconcilePayments), EVERY_FIVE_MINUTES),
    setInterval(runSafely("dispatchNotifications", dispatchNotifications), EVERY_MINUTE),
  ];
  for (const timer of timers) timer.unref();
  logger.info("Jobs en background iniciados");
};
```

- [ ] **Paso 5:** tests PASS. Confirmar que `pnpm --filter @gira/api test` no deja el proceso colgado (los jobs siguen sin arrancarse desde `buildApp`). Diff, aprobación, commit.

---

## Tarea 8: Enganchar los eventos de negocio al outbox

**Depends on:** 7. **Files:** Modify `apps/api/src/services/orderPaymentService.ts`, `apps/api/src/services/adminOrderService.ts`; Test `apps/api/tests/integration/orderNotifications.test.ts`

- [ ] **Paso 1: Test primero.** Casos:

| Grupo | Casos |
|---|---|
| Confirmación | `applyPaymentSucceeded(orderId)` → 1 `Notification` `EMAIL/ORDER_CONFIRMATION` `pending` con `to === order.customer.email` y `payload.total === order.total` |
| Aviso al equipo | la misma llamada → 1 `TEAM/TEAM_ORDER_PAID` con `payload.publicId`, y **sin** el correo de la clienta en el payload |
| Idempotencia real | llamar `applyPaymentSucceeded` **dos veces** (webhook + conciliación) → **una sola** notificación de cada tipo |
| Vía webhook | mandar dos veces el mismo evento por `handleProviderEvent` → una sola confirmación encolada |
| Pago fallido | `applyPaymentFailed(orderId, "card_declined")` → `TEAM_PAYMENT_FAILED` encolado; **ningún** correo a la clienta (Stripe ya le avisa en el Element) |
| Preparación | `PATCH /admin/orders/:id/status {status:"processing"}` → `EMAIL/ORDER_PREPARING` encolado |
| No dispara de más | `PATCH` a `delivered` → **no** encola nada (el correo de entrega no está en el alcance) |
| Nunca bloquea | si el encolado falla (mockear `Notification.create` lanzando), la orden **igual** queda en `paid` |

- [ ] **Paso 2:** correr → FAIL.

- [ ] **Paso 3: Implementar en `orderPaymentService.ts`**

Nueva función privada al tope del archivo:

```ts
import { NotificationChannelKind, NotificationType } from "@gira/shared";
import { enqueueNotification } from "./notificationService.js";
import type { OrderDocument } from "../models/Order.js";

/**
 * Notifications are queued, never sent here. Two reasons this is not a detail:
 * a Resend timeout inside applyPaymentSucceeded would delay committing the
 * stock reservation, and this function runs twice by design (webhook +
 * reconciliation job) — the outbox's unique index is what keeps the customer
 * from getting two confirmations.
 *
 * The payload is a FLAT SNAPSHOT of what the email says, frozen now: the order
 * is immutable, but the template must not re-read anything at delivery time.
 */
const queueOrderPaidNotifications = async (order: OrderDocument): Promise<void> => {
  await enqueueNotification({
    channel: NotificationChannelKind.EMAIL,
    type: NotificationType.ORDER_CONFIRMATION,
    to: order.customer.email,
    order: order._id,
    payload: {
      publicId: order.publicId,
      customerName: order.customer.name,
      currency: order.currency,
      subtotal: order.subtotal,
      shippingCost: order.shippingCost,
      total: order.total,
      lines: order.lines.map((line) => ({
        productName: line.productName,
        printName: line.printName,
        qty: line.qty,
        lineTotal: line.lineTotal,
      })),
    },
  });

  // No `order` field: team pings are not subject to the one-per-order index,
  // and the channel id is the recipient, not a person.
  await enqueueNotification({
    channel: NotificationChannelKind.TEAM,
    type: NotificationType.TEAM_ORDER_PAID,
    to: "team",
    payload: {
      publicId: order.publicId,
      total: order.total,
      currency: order.currency,
      itemCount: order.lines.reduce((sum, line) => sum + line.qty, 0),
    },
  });
};
```

> **Cuidado con el índice único y los avisos de equipo:** `TEAM_ORDER_PAID` se encola **sin** `order`, así que el índice parcial no aplica y la idempotencia de esa entrada la da el `if (order.status !== PENDING_PAYMENT) return` que ya existe arriba en la función. Es correcto: si alguna vez ese guard cambia, el que se duplica es un ping interno, no un correo a la clienta.

En `applyPaymentSucceeded`, después de `commitReservation(order._id)` y antes del `recordAudit`:

```ts
  await queueOrderPaidNotifications(order);
```

En `applyPaymentFailed`, después del `order.save()`:

```ts
  await enqueueNotification({
    channel: NotificationChannelKind.TEAM,
    type: NotificationType.TEAM_PAYMENT_FAILED,
    to: "team",
    payload: { publicId: order.publicId, ...(reason ? { reason } : {}) },
  });
```

- [ ] **Paso 4: Implementar en `adminOrderService.ts`** — dentro de `changeOrderStatus`, después del `recordAudit` y antes del `return`

```ts
  // Only PROCESSING triggers a customer email here; SHIPPED belongs to the
  // shipment flow (Tarea 10), which owns the tracking data the email needs.
  if (status === OrderStatus.PROCESSING) {
    await enqueueNotification({
      channel: NotificationChannelKind.EMAIL,
      type: NotificationType.ORDER_PREPARING,
      to: order.customer.email,
      order: order._id,
      payload: {
        publicId: order.publicId,
        customerName: order.customer.name,
        currency: order.currency,
        subtotal: order.subtotal,
        shippingCost: order.shippingCost,
        total: order.total,
        lines: order.lines.map((line) => ({
          productName: line.productName,
          printName: line.printName,
          qty: line.qty,
          lineTotal: line.lineTotal,
        })),
      },
    });
  }
```

- [ ] **Paso 5:** tests PASS; correr **toda** la suite para confirmar que los tests de M3 siguen verdes. Diff, aprobación, commit.

---

## Tarea 9: `shipmentTransitions.ts` (TDD)

**Depends on:** 1. **Files:** Create `apps/api/src/utils/shipmentTransitions.ts`; Test `apps/api/tests/unit/shipmentTransitions.test.ts`

- [ ] **Paso 1: Test primero**

```ts
import { describe, it, expect } from "vitest";
import { ShipmentStatus } from "@gira/shared";
import {
  canTransitionShipment,
  assertShipmentTransition,
} from "../../src/utils/shipmentTransitions.js";

describe("canTransitionShipment", () => {
  it("permite el camino feliz", () => {
    expect(canTransitionShipment(ShipmentStatus.IN_TRANSIT, ShipmentStatus.OUT_FOR_DELIVERY)).toBe(true);
    expect(canTransitionShipment(ShipmentStatus.OUT_FOR_DELIVERY, ShipmentStatus.DELIVERED)).toBe(true);
  });
  it("permite entregar directo desde tránsito", () => {
    expect(canTransitionShipment(ShipmentStatus.IN_TRANSIT, ShipmentStatus.DELIVERED)).toBe(true);
  });
  it("permite marcar devuelto o perdido desde cualquier estado en movimiento", () => {
    for (const from of [ShipmentStatus.IN_TRANSIT, ShipmentStatus.OUT_FOR_DELIVERY]) {
      expect(canTransitionShipment(from, ShipmentStatus.RETURNED)).toBe(true);
      expect(canTransitionShipment(from, ShipmentStatus.LOST)).toBe(true);
    }
  });
  it("prohíbe retroceder", () => {
    expect(canTransitionShipment(ShipmentStatus.OUT_FOR_DELIVERY, ShipmentStatus.IN_TRANSIT)).toBe(false);
  });
  it("prohíbe salir de un estado terminal", () => {
    for (const terminal of [ShipmentStatus.DELIVERED, ShipmentStatus.RETURNED, ShipmentStatus.LOST]) {
      for (const to of Object.values(ShipmentStatus)) {
        expect(canTransitionShipment(terminal, to)).toBe(false);
      }
    }
  });
  it("prohíbe la transición al mismo estado", () => {
    expect(canTransitionShipment(ShipmentStatus.IN_TRANSIT, ShipmentStatus.IN_TRANSIT)).toBe(false);
  });
});

describe("assertShipmentTransition", () => {
  it("lanza 409 con mensaje en español en una transición inválida", () => {
    expect(() =>
      assertShipmentTransition(ShipmentStatus.DELIVERED, ShipmentStatus.IN_TRANSIT),
    ).toThrow(expect.objectContaining({ statusCode: 409 }));
  });
  it("no lanza en una transición válida", () => {
    expect(() =>
      assertShipmentTransition(ShipmentStatus.IN_TRANSIT, ShipmentStatus.DELIVERED),
    ).not.toThrow();
  });
});
```

- [ ] **Paso 2:** correr → FAIL.

- [ ] **Paso 3: Implementar** — mismo molde que `orderTransitions.ts`, para que quien lea uno reconozca el otro

```ts
import { ShipmentStatus } from "@gira/shared";
import { AppError } from "./AppError.js";

/**
 * The single source of truth for the parcel lifecycle. Separate from
 * orderTransitions on purpose: the ORDER is shipped the moment the package
 * leaves, and stays that way, while the PARCEL keeps moving through states the
 * order does not model (out for delivery, returned, lost).
 *
 * There is no "created/pending" state: a Shipment only exists once the admin
 * has the carrier and the tracking number in hand, so it is born IN_TRANSIT.
 */

const TRANSITIONS: Readonly<Record<ShipmentStatus, readonly ShipmentStatus[]>> = Object.freeze({
  [ShipmentStatus.IN_TRANSIT]: [
    ShipmentStatus.OUT_FOR_DELIVERY,
    ShipmentStatus.DELIVERED,
    ShipmentStatus.RETURNED,
    ShipmentStatus.LOST,
  ],
  [ShipmentStatus.OUT_FOR_DELIVERY]: [
    ShipmentStatus.DELIVERED,
    ShipmentStatus.RETURNED,
    ShipmentStatus.LOST,
  ],
  [ShipmentStatus.DELIVERED]: [],
  [ShipmentStatus.RETURNED]: [],
  [ShipmentStatus.LOST]: [],
});

const LABELS: Readonly<Record<ShipmentStatus, string>> = Object.freeze({
  [ShipmentStatus.IN_TRANSIT]: "en tránsito",
  [ShipmentStatus.OUT_FOR_DELIVERY]: "en reparto",
  [ShipmentStatus.DELIVERED]: "entregado",
  [ShipmentStatus.RETURNED]: "devuelto",
  [ShipmentStatus.LOST]: "extraviado",
});

const canTransitionShipment = (from: ShipmentStatus, to: ShipmentStatus): boolean =>
  TRANSITIONS[from].includes(to);

const assertShipmentTransition = (from: ShipmentStatus, to: ShipmentStatus): void => {
  if (!canTransitionShipment(from, to)) {
    throw new AppError(`No se puede pasar un envío de "${LABELS[from]}" a "${LABELS[to]}".`, 409);
  }
};

export { TRANSITIONS, LABELS, canTransitionShipment, assertShipmentTransition };
```

- [ ] **Paso 4:** tests PASS. Diff, aprobación, commit.

---

## Tarea 10: Modelo `Shipment` + `shipmentService` (TDD)

**Depends on:** 8, 9. **Files:** Create `apps/api/src/models/Shipment.ts`, `apps/api/src/services/shipmentService.ts`; Test `apps/api/tests/integration/shipments.test.ts`

- [ ] **Paso 1: Test primero.** Casos a nivel service:

| Grupo | Casos |
|---|---|
| Creación | `createShipment(orderId, {carrier, trackingNumber}, ctx)` sobre una orden `processing` → shipment `in_transit` con **1** evento; orden en `shipped`; audit `SHIPMENT_CREATED` |
| Correo de guía | la misma llamada → `Notification` `EMAIL/ORDER_SHIPPED` con `payload.carrier` y `payload.trackingNumber` |
| Estado inválido | crear envío sobre una orden en `paid` → **409** (`assertAdminTransition` rechaza `paid → shipped`), sin shipment creado |
| Duplicado | crear un segundo envío para la misma orden → **409** por el índice único de `order` |
| Orden inexistente | id que no existe → 404 |
| Evento | `addShipmentEvent(orderId, {status: DELIVERED}, ctx)` → shipment `delivered` con 2 eventos; **orden en `delivered`** |
| Evento intermedio | `OUT_FOR_DELIVERY` → shipment avanza y la **orden sigue en `shipped`** |
| Transición inválida | `DELIVERED` y luego `IN_TRANSIT` → 409, sin evento nuevo |
| Incidencia | `RETURNED` → shipment `returned`, orden **sin cambio**, y `TEAM_SHIPMENT_INCIDENT` encolado |
| Lectura pública | `getPublicTracking(publicId)` → `{status, carrier, trackingNumber, events}`; **sin** `_id`, sin `order`, sin datos de la clienta |
| Lectura pública sin envío | orden real sin envío aún → 404 con mensaje en español |
| Lectura pública, orden falsa | `publicId` inexistente → 404 idéntico (no distingue "no existe" de "sin envío" para no filtrar) |

- [ ] **Paso 2:** correr → FAIL.

- [ ] **Paso 3: Modelo**

```ts
import { Schema, model, type HydratedDocument, type Model, type Types } from "mongoose";
import { ShipmentStatus } from "@gira/shared";

/**
 * The parcel for one order — a sub-resource with its own status enum and its own
 * timestamped event log (BACKEND_ARCHITECTURE_GUIDELINES, "Sub-recurso de estado
 * con historial rastreable").
 *
 * It lives in its own collection instead of inside Order for three reasons: the
 * order stays an immutable purchase snapshot, the event log grows without
 * bloating every order read, and the tracking number gets its own index (the
 * admin WILL search by it when a customer calls).
 *
 * Carrier and tracking number are captured BY HAND (spec decision: no carrier
 * API integration), so nothing here may assume a provider-shaped payload.
 */

interface ShipmentEvent {
  status: ShipmentStatus;
  at: Date;
  note?: string;
}

interface ShipmentAttrs {
  order: Types.ObjectId;
  /** Denormalized so public tracking resolves without loading the order. */
  orderPublicId: string;
  carrier: string;
  trackingNumber: string;
  /** Optional deep link to the carrier's own tracker. */
  trackingUrl?: string;
  status: ShipmentStatus;
  events: ShipmentEvent[];
  createdAt: Date;
  updatedAt: Date;
}

type ShipmentModel = Model<ShipmentAttrs>;
type ShipmentDocument = HydratedDocument<ShipmentAttrs>;

const shipmentEventSchema = new Schema<ShipmentEvent>(
  {
    status: { type: String, enum: Object.values(ShipmentStatus), required: true },
    at: { type: Date, required: true },
    note: { type: String, trim: true, maxlength: 200 },
  },
  { _id: false },
);

const shipmentSchema = new Schema<ShipmentAttrs, ShipmentModel>(
  {
    order: { type: Schema.Types.ObjectId, ref: "Order", required: true },
    orderPublicId: { type: String, required: true },
    carrier: { type: String, required: true, trim: true, maxlength: 60 },
    trackingNumber: { type: String, required: true, trim: true, maxlength: 60 },
    trackingUrl: { type: String, trim: true, maxlength: 500 },
    status: {
      type: String,
      enum: Object.values(ShipmentStatus),
      required: true,
      default: ShipmentStatus.IN_TRANSIT,
    },
    events: { type: [shipmentEventSchema], default: [] },
  },
  { timestamps: true },
);

// One parcel per order — the unique index IS the guard, not a pre-check.
shipmentSchema.index({ order: 1 }, { unique: true });
// Public tracking lookup by the order's capability id.
shipmentSchema.index({ orderPublicId: 1 }, { unique: true });
// "A customer is calling about guide 1234567890."
shipmentSchema.index({ trackingNumber: 1 });

const Shipment = model<ShipmentAttrs, ShipmentModel>("Shipment", shipmentSchema);

export type { ShipmentAttrs, ShipmentDocument, ShipmentEvent };
export { Shipment };
```

- [ ] **Paso 4: Service**

```ts
import type { Types } from "mongoose";
import {
  AuditAction,
  AuditModule,
  NotificationChannelKind,
  NotificationType,
  OrderStatus,
  ShipmentStatus,
} from "@gira/shared";
import { Shipment, type ShipmentDocument, type ShipmentEvent } from "../models/Shipment.js";
import { Order, type OrderDocument } from "../models/Order.js";
import { AppError } from "../utils/AppError.js";
import { assertAdminTransition } from "../utils/orderTransitions.js";
import { assertShipmentTransition } from "../utils/shipmentTransitions.js";
import { enqueueNotification } from "./notificationService.js";
import { recordAudit } from "./auditService.js";
import type { RequestContext } from "../utils/requestContext.js";

/**
 * Manual shipping. Capturing the guide is ONE operation, not two: it creates the
 * parcel, moves the order to `shipped` through assertAdminTransition (the same
 * gate every other status change goes through), and queues the tracking email.
 * Splitting it would allow "order shipped with no guide captured", which is the
 * exact state the customer calls about.
 *
 * The order transition is validated FIRST: a 409 must leave no shipment behind.
 */

interface CreateShipmentInput {
  carrier: string;
  trackingNumber: string;
  trackingUrl?: string;
}

interface PublicTracking {
  status: ShipmentStatus;
  carrier: string;
  trackingNumber: string;
  trackingUrl?: string;
  events: { status: ShipmentStatus; at: Date; note?: string }[];
}

interface AdminShipment extends PublicTracking {
  orderPublicId: string;
  createdAt: Date;
  updatedAt: Date;
}

const toPublicTracking = (doc: ShipmentDocument): PublicTracking => ({
  status: doc.status,
  carrier: doc.carrier,
  trackingNumber: doc.trackingNumber,
  ...(doc.trackingUrl ? { trackingUrl: doc.trackingUrl } : {}),
  events: doc.events.map((event) => ({
    status: event.status,
    at: event.at,
    ...(event.note ? { note: event.note } : {}),
  })),
});

const toAdminShipment = (doc: ShipmentDocument): AdminShipment => ({
  ...toPublicTracking(doc),
  orderPublicId: doc.orderPublicId,
  createdAt: doc.createdAt,
  updatedAt: doc.updatedAt,
});

const isDuplicateKeyError = (err: unknown): boolean =>
  typeof err === "object" &&
  err !== null &&
  "code" in err &&
  (err as { code?: number }).code === 11000;

const queueShippedEmail = async (
  order: OrderDocument,
  shipment: ShipmentDocument,
): Promise<void> => {
  await enqueueNotification({
    channel: NotificationChannelKind.EMAIL,
    type: NotificationType.ORDER_SHIPPED,
    to: order.customer.email,
    order: order._id,
    payload: {
      publicId: order.publicId,
      customerName: order.customer.name,
      currency: order.currency,
      subtotal: order.subtotal,
      shippingCost: order.shippingCost,
      total: order.total,
      lines: order.lines.map((line) => ({
        productName: line.productName,
        printName: line.printName,
        qty: line.qty,
        lineTotal: line.lineTotal,
      })),
      carrier: shipment.carrier,
      trackingNumber: shipment.trackingNumber,
    },
  });
};

const createShipment = async (
  orderId: string,
  input: CreateShipmentInput,
  ctx: RequestContext,
): Promise<AdminShipment> => {
  const order = await Order.findById(orderId);
  if (!order) throw new AppError("La orden no existe.", 404);

  // Validated BEFORE any write: an invalid move must leave nothing behind.
  assertAdminTransition(order.status, OrderStatus.SHIPPED);

  let shipment: ShipmentDocument;
  try {
    shipment = await Shipment.create({
      order: order._id,
      orderPublicId: order.publicId,
      carrier: input.carrier,
      trackingNumber: input.trackingNumber,
      ...(input.trackingUrl ? { trackingUrl: input.trackingUrl } : {}),
      status: ShipmentStatus.IN_TRANSIT,
      events: [{ status: ShipmentStatus.IN_TRANSIT, at: new Date() }],
    });
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      throw new AppError("Esta orden ya tiene un envío registrado.", 409);
    }
    throw err;
  }

  order.status = OrderStatus.SHIPPED;
  order.statusHistory.push({ status: OrderStatus.SHIPPED, at: new Date(), reason: "shipment_created" });
  await order.save();

  await queueShippedEmail(order, shipment);

  await recordAudit({
    actorId: ctx.actorId,
    actorType: "user",
    action: AuditAction.SHIPMENT_CREATED,
    module: AuditModule.SHIPPING,
    targetId: order.publicId,
    // Carrier + guide are operational data, not PII.
    after: { carrier: shipment.carrier, trackingNumber: shipment.trackingNumber },
    ip: ctx.ip,
  });

  return toAdminShipment(shipment);
};

/** Statuses that mean the parcel needs a human right now. */
const INCIDENT_STATUSES = new Set<ShipmentStatus>([ShipmentStatus.RETURNED, ShipmentStatus.LOST]);

const addShipmentEvent = async (
  orderId: string,
  input: { status: ShipmentStatus; note?: string },
  ctx: RequestContext,
): Promise<AdminShipment> => {
  const shipment = await Shipment.findOne({ order: orderId });
  if (!shipment) throw new AppError("Esta orden no tiene un envío registrado.", 404);

  assertShipmentTransition(shipment.status, input.status);
  const before = shipment.status;
  shipment.status = input.status;
  shipment.events.push({
    status: input.status,
    at: new Date(),
    ...(input.note ? { note: input.note } : {}),
  });
  await shipment.save();

  // Delivery is the ONE parcel state the order mirrors. Everything else
  // (out for delivery, returned, lost) is parcel-only: the order stays shipped,
  // and a refund — if it comes — flows through the payment provider as always.
  if (input.status === ShipmentStatus.DELIVERED) {
    const order = await Order.findById(orderId);
    if (order && order.status === OrderStatus.SHIPPED) {
      assertAdminTransition(order.status, OrderStatus.DELIVERED);
      order.status = OrderStatus.DELIVERED;
      order.statusHistory.push({ status: OrderStatus.DELIVERED, at: new Date(), reason: "shipment_delivered" });
      await order.save();
    }
  }

  if (INCIDENT_STATUSES.has(input.status)) {
    await enqueueNotification({
      channel: NotificationChannelKind.TEAM,
      type: NotificationType.TEAM_SHIPMENT_INCIDENT,
      to: "team",
      payload: {
        publicId: shipment.orderPublicId,
        status: input.status,
        carrier: shipment.carrier,
      },
    });
  }

  await recordAudit({
    actorId: ctx.actorId,
    actorType: "user",
    action: AuditAction.SHIPMENT_STATUS_CHANGED,
    module: AuditModule.SHIPPING,
    targetId: shipment.orderPublicId,
    before: { status: before },
    after: { status: input.status },
    ip: ctx.ip,
  });

  return toAdminShipment(shipment);
};

const getAdminShipment = async (orderId: string): Promise<AdminShipment> => {
  const shipment = await Shipment.findOne({ order: orderId });
  if (!shipment) throw new AppError("Esta orden no tiene un envío registrado.", 404);
  return toAdminShipment(shipment);
};

/**
 * Public tracking by the order's capability id. Returns the SAME 404 whether
 * the order does not exist or simply has no shipment yet — distinguishing them
 * would turn this endpoint into an order-existence oracle.
 */
const getPublicTracking = async (orderPublicId: string): Promise<PublicTracking> => {
  const shipment = await Shipment.findOne({ orderPublicId });
  if (!shipment) throw new AppError("Todavía no hay información de envío para este pedido.", 404);
  return toPublicTracking(shipment);
};

export type { CreateShipmentInput, PublicTracking, AdminShipment, ShipmentEvent };
export { createShipment, addShipmentEvent, getAdminShipment, getPublicTracking };
```

- [ ] **Paso 5:** tests PASS, typecheck y lint limpios. Diff, aprobación, commit.

---

## Tarea 11: Rutas de envío (admin) y tracking público

**Depends on:** 10. **Files:** Create `apps/api/src/validators/shipmentValidator.ts`, `apps/api/src/controllers/shipmentController.ts`, `apps/api/src/routes/v1/admin/adminShipmentRoutes.ts`; Modify `apps/api/src/routes/v1/admin/adminOrderRoutes.ts`, `apps/api/src/routes/v1/orderRoutes.ts`, `apps/api/src/middlewares/rateLimit.ts`, `apps/api/src/controllers/orderController.ts`; Test `apps/api/tests/integration/shipmentRoutes.test.ts`

- [ ] **Paso 1: Test primero.** Casos HTTP:

| Grupo | Casos |
|---|---|
| Autorización | anónimo → 401 en las tres rutas admin; cliente autenticado → 403 |
| Creación | `POST /admin/orders/:id/shipment {carrier:"Estafeta", trackingNumber:"123"}` sobre orden `processing` → **201**; el `GET /admin/orders/:id` refleja `shipped` |
| Validación | sin `carrier` → 400; `trackingNumber` vacío → 400; `trackingUrl` no-URL → 400; campo desconocido descartado por `stripUnknown` |
| Origin | `POST` sin cabecera `Origin` de la whitelist → 403 (`verifyOrigin`, herencia de M2) |
| Evento | `PATCH /admin/orders/:id/shipment {status:"delivered"}` → 200; `{status:"wat"}` → 400 |
| Lectura admin | `GET /admin/orders/:id/shipment` → 200 con eventos; orden sin envío → 404 |
| Tracking público | `GET /api/v1/orders/:publicId/tracking` **sin sesión** → 200 con `{status, carrier, trackingNumber, events}` |
| Fuga de datos | esa respuesta **no** contiene `email`, `shipping`, `total`, `_id`, `order` (asertar sobre `JSON.stringify(body)`) |
| No existe | `publicId` inexistente → 404 con el mismo mensaje que "sin envío" |
| Formato de `publicId` | `publicId` con caracteres fuera de base64url → 400 del validador, sin tocar DB |

- [ ] **Paso 2:** correr → FAIL (404 en todas las rutas).

- [ ] **Paso 3: `shipmentValidator.ts`**

```ts
import Joi from "joi";
import { ShipmentStatus } from "@gira/shared";

const createShipmentSchema = Joi.object({
  carrier: Joi.string().trim().min(2).max(60).required().messages({
    "any.required": "Indica la paquetería.",
    "string.empty": "Indica la paquetería.",
  }),
  trackingNumber: Joi.string().trim().min(3).max(60).required().messages({
    "any.required": "Indica el número de guía.",
    "string.empty": "Indica el número de guía.",
  }),
  trackingUrl: Joi.string().trim().uri({ scheme: ["http", "https"] }).max(500).messages({
    "string.uri": "El enlace de seguimiento no es una URL válida.",
  }),
});

const addShipmentEventSchema = Joi.object({
  status: Joi.string()
    .valid(...Object.values(ShipmentStatus))
    .required()
    .messages({ "any.only": "El estado del envío no es válido." }),
  note: Joi.string().trim().max(200),
});

export { createShipmentSchema, addShipmentEventSchema };
```

- [ ] **Paso 4: `shipmentController.ts`**

```ts
import type { Request, Response } from "express";
import type { ShipmentStatus } from "@gira/shared";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendResponse } from "../utils/sendResponse.js";
import { buildContext } from "../utils/requestContext.js";
import {
  createShipment,
  addShipmentEvent,
  getAdminShipment,
} from "../services/shipmentService.js";

/** Nested under /admin/orders/:id — the order id arrives via mergeParams. */

const create = asyncHandler(async (req: Request, res: Response) => {
  const shipment = await createShipment(
    req.params.id as string,
    req.body as { carrier: string; trackingNumber: string; trackingUrl?: string },
    buildContext(req),
  );
  sendResponse(res, 201, "Envío registrado correctamente.", { shipment });
});

const addEvent = asyncHandler(async (req: Request, res: Response) => {
  const shipment = await addShipmentEvent(
    req.params.id as string,
    req.body as { status: ShipmentStatus; note?: string },
    buildContext(req),
  );
  sendResponse(res, 200, "Estado del envío actualizado correctamente.", { shipment });
});

const detail = asyncHandler(async (req: Request, res: Response) => {
  const shipment = await getAdminShipment(req.params.id as string);
  sendResponse(res, 200, "Envío obtenido correctamente.", { shipment });
});

export { create, addEvent, detail };
```

- [ ] **Paso 5: `adminShipmentRoutes.ts`** y su montaje

```ts
import { Router } from "express";
import { validate } from "../../../middlewares/validate.js";
import {
  createShipmentSchema,
  addShipmentEventSchema,
} from "../../../validators/shipmentValidator.js";
import { create, addEvent, detail } from "../../../controllers/shipmentController.js";

// mergeParams: the order id lives in the parent router's path (/orders/:id).
const adminShipmentRouter = Router({ mergeParams: true });

adminShipmentRouter.get("/", detail);
adminShipmentRouter.post("/", validate(createShipmentSchema), create);
adminShipmentRouter.patch("/", validate(addShipmentEventSchema), addEvent);

export { adminShipmentRouter };
```

En [adminOrderRoutes.ts](apps/api/src/routes/v1/admin/adminOrderRoutes.ts), **después** de las rutas existentes:

```ts
adminOrderRouter.use(
  "/:id/shipment",
  validate(objectIdParamSchema, "params"),
  adminShipmentRouter,
);
```

- [ ] **Paso 6: `trackingLimiter`** en `middlewares/rateLimit.ts` (junto a los demás, exportado al final)

```ts
// The tracking link ships in the shipping email and gets opened repeatedly by
// the same customer — looser than orderLookupLimiter, but never absent
// (BACKEND_ARCHITECTURE_GUIDELINES: a public sub-resource always carries its own).
const trackingLimiter = createLimiter({
  windowMs: FIFTEEN_MIN,
  max: 60,
  message: "Demasiadas consultas de seguimiento. Espera unos minutos.",
});
```

- [ ] **Paso 7: Ruta pública** — en `orderController.ts` sumar el handler, y en `orderRoutes.ts` la ruta **antes** de `/:publicId` no hace falta (el path es más específico), pero sí después de `/mine`:

```ts
// orderController.ts
const tracking = asyncHandler(async (req: Request, res: Response) => {
  const shipment = await getPublicTracking(req.params.publicId as string);
  sendResponse(res, 200, "Seguimiento obtenido correctamente.", { tracking: shipment });
});
```

```ts
// orderRoutes.ts
orderRouter.get(
  "/:publicId/tracking",
  trackingLimiter,
  validate(publicIdParamSchema, "params"),
  tracking,
);
```

- [ ] **Paso 8:** tests PASS, typecheck y lint limpios (confirmar que el controller **no** importa models ni adapters — lo verifica ESLint). Diff, aprobación, commit.

---

## Tarea 12: Rate limiter de catálogo público

**Depends on:** 0. **Files:** Modify `apps/api/src/middlewares/rateLimit.ts`, `apps/api/src/routes/v1/catalogRoutes.ts`; Test `apps/api/tests/integration/rateLimits.test.ts`

El catálogo público es hoy el único grupo de rutas anónimas **sin limiter propio** — solo lo cubre `globalLimiter` (1000/15 min), que es un backstop, no una defensa anti-scraping. El estándar pide ~500/15 min para lecturas públicas.

- [ ] **Paso 1: Test primero.** El limiter es no-op fuera de producción, así que el test fija `NODE_ENV=production` temporalmente (los limiters ya lo deciden por request, ver `skip:` en la factory):

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import { buildApp } from "../../src/app.js";

describe("rate limiters públicos", () => {
  const app = buildApp();

  beforeEach(() => {
    process.env.NODE_ENV = "production";
  });
  afterEach(() => {
    process.env.NODE_ENV = "test";
  });

  it("limita el catálogo público tras superar el máximo", async () => {
    // El limiter de catálogo es 500/15min: se comprueba que EXISTE y responde
    // con el mensaje propio, no que se agote el contador 500 veces.
    const res = await request(app).get("/api/v1/catalog/products");
    expect(res.headers).toHaveProperty("ratelimit-limit");
    expect(Number(res.headers["ratelimit-limit"])).toBe(500);
  });

  it("aplica un límite propio y más estricto al seguimiento público", async () => {
    const res = await request(app).get("/api/v1/orders/noexiste/tracking");
    expect(Number(res.headers["ratelimit-limit"])).toBe(60);
  });

  it("no limita las rutas admin", async () => {
    const res = await request(app).get("/api/v1/admin/orders");
    expect(res.headers["ratelimit-limit"]).toBeUndefined();
  });
});
```

- [ ] **Paso 2:** correr → FAIL (el header de catálogo trae 1000, el del backstop global).

- [ ] **Paso 3: Implementar** — en `rateLimit.ts`

```ts
// Public catalog reads: anti-scraping, not anti-abuse. Generous enough that a
// real storefront session never notices, strict enough that a crawler does.
const catalogLimiter = createLimiter({
  windowMs: FIFTEEN_MIN,
  max: 500,
  message: "Demasiadas solicitudes al catálogo. Espera unos minutos.",
});
```

En `catalogRoutes.ts`, al tope del router (una sola línea, todo el router queda cubierto):

```ts
catalogRouter.use(catalogLimiter);
```

- [ ] **Paso 4:** tests PASS. Correr toda la suite: ningún test previo debe romperse por el limiter (siguen en `NODE_ENV=test`, donde es no-op). Diff, aprobación, commit.

---

## Tarea 13: Settings — sección `inventory`

**Depends on:** 1. **Files:** Modify `apps/api/src/models/Settings.ts`, `apps/api/src/services/settingsService.ts`, `apps/api/src/validators/settingsValidator.ts`, `apps/api/src/controllers/settingsController.ts`, `apps/api/src/routes/v1/admin/settingsRoutes.ts`; Test `apps/api/tests/integration/adminSettings.test.ts`

Los stats de inventario necesitan un umbral de "bajo stock". El estándar es explícito: **una vez que existe Settings, ningún umbral de negocio se hardcodea.**

- [ ] **Paso 1: Test primero** — agregar al archivo existente

```ts
describe("PATCH /admin/settings/inventory", () => {
  it("actualiza el umbral de bajo stock", async () => {
    const res = await request(app)
      .patch("/api/v1/admin/settings/inventory")
      .set("Cookie", adminCookie)
      .set("Origin", "http://localhost:3000")
      .send({ lowStockThreshold: 5 });

    expect(res.status).toBe(200);
    expect(res.body.data.settings.inventory.lowStockThreshold).toBe(5);
  });

  it("rechaza un umbral negativo o no entero", async () => {
    for (const value of [-1, 2.5]) {
      const res = await request(app)
        .patch("/api/v1/admin/settings/inventory")
        .set("Cookie", adminCookie)
        .set("Origin", "http://localhost:3000")
        .send({ lowStockThreshold: value });
      expect(res.status).toBe(400);
    }
  });

  it("no altera las otras secciones", async () => {
    const before = await request(app).get("/api/v1/admin/settings").set("Cookie", adminCookie);
    await request(app)
      .patch("/api/v1/admin/settings/inventory")
      .set("Cookie", adminCookie)
      .set("Origin", "http://localhost:3000")
      .send({ lowStockThreshold: 7 });
    const after = await request(app).get("/api/v1/admin/settings").set("Cookie", adminCookie);

    expect(after.body.data.settings.shipping).toEqual(before.body.data.settings.shipping);
    expect(after.body.data.settings.currency).toEqual(before.body.data.settings.currency);
  });

  it("escribe su propia acción de auditoría", async () => {
    await request(app)
      .patch("/api/v1/admin/settings/inventory")
      .set("Cookie", adminCookie)
      .set("Origin", "http://localhost:3000")
      .send({ lowStockThreshold: 4 });

    const entry = await AuditLog.findOne({ action: AuditAction.SETTINGS_INVENTORY_UPDATED });
    expect(entry).not.toBeNull();
  });
});
```

- [ ] **Paso 2:** correr → FAIL (404).

- [ ] **Paso 3: Modelo** — sumar la sección junto a `shipping`/`currency`/`reservation`

```ts
interface InventorySettings {
  /** Available units at or below this count show up as "low stock" in the panel. */
  lowStockThreshold: number;
}
```

```ts
    inventory: {
      lowStockThreshold: { type: Number, required: true, min: 0, max: 1000, default: 3 },
    },
```

Sumar `inventory: InventorySettings` a `SettingsAttrs` y a los `export type`.

- [ ] **Paso 4: Service** — `updateInventorySettings`, calcado de `updateShippingSettings` (asignación campo por campo, nunca spread del payload), con `AuditAction.SETTINGS_INVENTORY_UPDATED`. Incluir `inventory` en `toPublicSettings`.

- [ ] **Paso 5: Validator**

```ts
const updateInventorySchema = Joi.object({
  lowStockThreshold: Joi.number().integer().min(0).max(1000).messages({
    "number.integer": "El umbral debe ser un número entero de unidades.",
    "number.max": "El umbral no puede superar 1000 unidades.",
  }),
})
  .min(1)
  .messages({ "object.min": "Envía al menos un campo para actualizar." });
```

- [ ] **Paso 6: Controller + ruta**

```ts
settingsRouter.patch("/inventory", validate(updateInventorySchema), updateInventory);
```

- [ ] **Paso 7:** tests PASS. Diff, aprobación, commit.

---

## Tarea 14: `parseStatsRange` + stats de órdenes (TDD)

**Depends on:** 1. **Files:** Create `apps/api/src/utils/parseStatsRange.ts`, `apps/api/src/services/orderStatsService.ts`, `apps/api/src/validators/statsValidator.ts`; Modify `apps/api/src/controllers/adminOrderController.ts`, `apps/api/src/routes/v1/admin/adminOrderRoutes.ts`; Test `apps/api/tests/unit/parseStatsRange.test.ts`, `apps/api/tests/integration/orderStats.test.ts`

- [ ] **Paso 1: Tests primero**

```ts
// parseStatsRange.test.ts
import { describe, it, expect } from "vitest";
import { parseStatsRange } from "../../src/utils/parseStatsRange.js";

describe("parseStatsRange", () => {
  it("usa el default del módulo cuando no viene days", () => {
    const range = parseStatsRange({}, 30);
    expect(range.days).toBe(30);
    expect(range.to.getTime()).toBeGreaterThan(range.from.getTime());
  });
  it("respeta un days válido", () => {
    expect(parseStatsRange({ days: "7" }, 30).days).toBe(7);
  });
  it("cae al default con basura, cero o negativo", () => {
    for (const days of ["abc", "0", "-5", "", null, undefined]) {
      expect(parseStatsRange({ days }, 30).days).toBe(30);
    }
  });
  it("topa el rango en 365 días", () => {
    expect(parseStatsRange({ days: "5000" }, 30).days).toBe(365);
  });
  it("la ventana mide exactamente days * 24h", () => {
    const range = parseStatsRange({ days: "2" }, 30);
    expect(range.to.getTime() - range.from.getTime()).toBe(2 * 24 * 60 * 60 * 1000);
  });
});
```

```ts
// orderStats.test.ts — casos
```

| Grupo | Casos |
|---|---|
| Autorización | anónimo → 401; cliente → 403 |
| Período | 3 órdenes `paid` de $100 + 1 `pending_payment` → `revenue` una sola entrada MXN con 30000 (centavos), `paidOrders === 3`; la pendiente **no** cuenta como ingreso |
| Multi-moneda | 1 orden MXN pagada + 1 USD pagada → `revenue` con **dos** entradas, ninguna sumada entre sí |
| Ticket promedio | 2 órdenes de 10000 y 20000 → `averageTicket` 15000 en MXN |
| Ventana | una orden con `createdAt` de hace 60 días con `?days=30` → **fuera** del período |
| Por estado | `byStatus` trae el conteo de cada `OrderStatus` presente |
| Alertas (fuera del rango) | una orden `paid` de hace 3 días con `?days=1` → **sí** aparece en `alerts.awaitingPreparation` (las alertas ignoran la ventana) |
| Alertas | `processing` de hace 5 días → `alerts.stuckInProcessing`; `shipped` de hace 20 días → `alerts.inTransitTooLong`; `disputed` → `alerts.disputed` |
| Vacío | sin órdenes → ceros y arreglos vacíos, nunca `null` ni error |
| Top productos | 3 órdenes con la misma variante → `topProducts[0].units` correcto y a lo más 5 entradas |
| Unidades totales | 7 SKUs distintos vendidos → `unitsSold` cuenta **todas** las unidades del período, no solo las del top-5 |
| Validación | `?days=abc` → 400 del validador (o default, según el schema: **fijar 400** para que la query sea explícita) |

- [ ] **Paso 2:** correr → FAIL.

- [ ] **Paso 3: `parseStatsRange.ts`**

```ts
/**
 * Resolves a stats window ONCE per request so every aggregation in the same
 * endpoint shares identical bounds (BACKEND_ARCHITECTURE_GUIDELINES, "Endpoints
 * de estadísticas/KPIs"). Two aggregations computing `new Date()` separately
 * produce a panel whose numbers do not add up.
 *
 * The default is a PARAMETER, not a constant: each module picks its own
 * (orders: 30 days, inventory: not time-based at all).
 */

const MAX_DAYS = 365;

interface StatsRangeQuery {
  days?: unknown;
}

interface StatsRange {
  from: Date;
  to: Date;
  days: number;
}

const parseStatsRange = (query: StatsRangeQuery, defaultDays: number): StatsRange => {
  const raw = Number(query.days);
  const days =
    Number.isFinite(raw) && raw >= 1 ? Math.min(Math.trunc(raw), MAX_DAYS) : defaultDays;

  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
  return { from, to, days };
};

export type { StatsRange, StatsRangeQuery };
export { parseStatsRange, MAX_DAYS };
```

- [ ] **Paso 4: `orderStatsService.ts`**

```ts
import { Currency, OrderStatus } from "@gira/shared";
import { Order } from "../models/Order.js";
import { parseStatsRange, type StatsRangeQuery } from "../utils/parseStatsRange.js";

/**
 * Operational KPIs for the orders module.
 *
 * Two questions, answered separately on purpose:
 *  - "How did the period go?" -> everything under `period`, bounded by the range.
 *  - "What needs attention NOW?" -> `alerts`, deliberately IGNORING the range.
 *    An order stuck in `processing` for a week is not less stuck because the
 *    admin is looking at yesterday's numbers.
 *
 * Revenue is grouped BY CURRENCY and never summed across them: MXN + USD is a
 * number that means nothing.
 */

const DEFAULT_DAYS = 30;
const TOP_PRODUCTS = 5;
const AWAITING_PREPARATION_HOURS = 24;
const STUCK_PROCESSING_HOURS = 72;
const IN_TRANSIT_DAYS = 14;

/** Statuses where the money is genuinely ours. */
const REVENUE_STATUSES = [
  OrderStatus.PAID,
  OrderStatus.PROCESSING,
  OrderStatus.SHIPPED,
  OrderStatus.DELIVERED,
];

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

interface OrderStats {
  range: { from: Date; to: Date; days: number };
  period: {
    totalOrders: number;
    paidOrders: number;
    revenue: RevenueEntry[];
    unitsSold: number;
    topProducts: TopProduct[];
  };
  byStatus: Record<string, number>;
  alerts: {
    awaitingPreparation: number;
    stuckInProcessing: number;
    inTransitTooLong: number;
    disputed: number;
    pendingPayment: number;
  };
}

const hoursAgo = (hours: number): Date => new Date(Date.now() - hours * 60 * 60 * 1000);

const getOrderStats = async (query: StatsRangeQuery): Promise<OrderStats> => {
  const range = parseStatsRange(query, DEFAULT_DAYS);
  const inRange = { createdAt: { $gte: range.from, $lte: range.to } };

  const [totalOrders, revenueRows, statusRows, unitRows, topRows, alerts] = await Promise.all([
    Order.countDocuments(inRange),

    Order.aggregate<{ _id: Currency; revenue: number; orders: number }>([
      { $match: { ...inRange, status: { $in: REVENUE_STATUSES } } },
      { $group: { _id: "$currency", revenue: { $sum: "$total" }, orders: { $sum: 1 } } },
    ]),

    Order.aggregate<{ _id: OrderStatus; count: number }>([
      { $match: inRange },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),

    // Total units for the WHOLE period — computed on its own, never derived
    // from the top-5 slice below (that would silently under-report).
    Order.aggregate<{ _id: null; units: number }>([
      { $match: { ...inRange, status: { $in: REVENUE_STATUSES } } },
      { $unwind: "$lines" },
      { $group: { _id: null, units: { $sum: "$lines.qty" } } },
    ]),

    Order.aggregate<TopProduct & { _id: string }>([
      { $match: { ...inRange, status: { $in: REVENUE_STATUSES } } },
      { $unwind: "$lines" },
      {
        $group: {
          _id: "$lines.sku",
          productName: { $first: "$lines.productName" },
          printName: { $first: "$lines.printName" },
          units: { $sum: "$lines.qty" },
        },
      },
      { $sort: { units: -1 } },
      { $limit: TOP_PRODUCTS },
    ]),

    // Range-independent by design — see the header comment.
    Promise.all([
      Order.countDocuments({
        status: OrderStatus.PAID,
        paidAt: { $lt: hoursAgo(AWAITING_PREPARATION_HOURS) },
      }),
      Order.countDocuments({
        status: OrderStatus.PROCESSING,
        updatedAt: { $lt: hoursAgo(STUCK_PROCESSING_HOURS) },
      }),
      Order.countDocuments({
        status: OrderStatus.SHIPPED,
        updatedAt: { $lt: hoursAgo(IN_TRANSIT_DAYS * 24) },
      }),
      Order.countDocuments({ status: OrderStatus.DISPUTED }),
      Order.countDocuments({ status: OrderStatus.PENDING_PAYMENT }),
    ]),
  ]);

  const revenue: RevenueEntry[] = revenueRows.map((row) => ({
    currency: row._id,
    revenue: row.revenue,
    orders: row.orders,
    // Integer division: an average ticket of "1499.5 centavos" is not a thing.
    averageTicket: row.orders > 0 ? Math.round(row.revenue / row.orders) : 0,
  }));

  const [awaitingPreparation, stuckInProcessing, inTransitTooLong, disputed, pendingPayment] =
    alerts;

  return {
    range,
    period: {
      totalOrders,
      paidOrders: revenue.reduce((sum, entry) => sum + entry.orders, 0),
      revenue,
      unitsSold: unitRows[0]?.units ?? 0,
      topProducts: topRows.map((row) => ({
        sku: row._id,
        productName: row.productName,
        printName: row.printName,
        units: row.units,
      })),
    },
    byStatus: Object.fromEntries(statusRows.map((row) => [row._id, row.count])),
    alerts: { awaitingPreparation, stuckInProcessing, inTransitTooLong, disputed, pendingPayment },
  };
};

export type { OrderStats, RevenueEntry, TopProduct };
export { getOrderStats, DEFAULT_DAYS };
```

- [ ] **Paso 5: `statsValidator.ts`**

```ts
import Joi from "joi";

/** Shared by every stats endpoint — the window is the only query parameter. */
const statsRangeSchema = Joi.object({
  days: Joi.number().integer().min(1).max(365).messages({
    "number.base": "El rango debe ser un número de días.",
    "number.max": "El rango máximo es de 365 días.",
  }),
});

export { statsRangeSchema };
```

- [ ] **Paso 6: Controller + ruta** — en `adminOrderController.ts`:

```ts
const stats = asyncHandler(async (req: Request, res: Response) => {
  const data = await getOrderStats(req.query);
  sendResponse(res, 200, "Estadísticas de órdenes obtenidas correctamente.", data);
});
```

En `adminOrderRoutes.ts`, **antes** de `GET /:id` o `/stats` cae en el param route:

```ts
adminOrderRouter.get("/stats", validate(statsRangeSchema, "query"), stats);
```

- [ ] **Paso 7:** tests PASS, typecheck y lint limpios. Diff, aprobación, commit.

---

## Tarea 15: Stats de inventario

**Depends on:** 13, 14. **Files:** Create `apps/api/src/services/inventoryStatsService.ts`; Modify `apps/api/src/controllers/variantController.ts`, `apps/api/src/routes/v1/admin/variantRoutes.ts`; Test `apps/api/tests/integration/inventoryStats.test.ts`

- [ ] **Paso 1: Test primero.** Casos:

| Grupo | Casos |
|---|---|
| Autorización | anónimo → 401; cliente → 403 |
| Conteos | 3 variantes activas (10/0, 0/0, 2/0) con umbral 3 → `activeVariants === 3`, `outOfStock === 1`, `lowStock === 1` (la de 2, no la de 0: son categorías excluyentes) |
| Reservado | variante con `onHand 5, reserved 2` → `unitsOnHand` y `unitsReserved` correctos, `unitsAvailable === 3` |
| Umbral desde Settings | subir `lowStockThreshold` a 10 → la variante de 10 disponibles **entra** en `lowStock` (nada hardcodeado) |
| Inactivas | una variante `isActive:false` sin stock → **no** cuenta en ninguna métrica |
| Listado | `lowStockItems` trae hasta 20 entradas con `sku` y `available`, ordenadas ascendente por disponible |
| Vacío | sin variantes → todo en cero, arreglo vacío |

- [ ] **Paso 2:** correr → FAIL.

- [ ] **Paso 3: Implementar**

```ts
import { Variant } from "../models/Variant.js";
import { getSettings } from "./settingsService.js";

/**
 * Stock health. NOT time-bounded: inventory is a snapshot of right now, and a
 * date range on it would be meaningless — which is why this module ignores
 * parseStatsRange entirely instead of accepting a range it would not use.
 *
 * The low-stock threshold comes from Settings, never from a constant here
 * (ECOMMERCE_ARCHITECTURE_GUIDELINES: no hardcoded business threshold once the
 * Settings singleton exists).
 */

const LOW_STOCK_SAMPLE = 20;

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

const getInventoryStats = async (): Promise<InventoryStats> => {
  const settings = await getSettings();
  const threshold = settings.inventory.lowStockThreshold;
  const available = { $subtract: ["$onHand", "$reserved"] };

  const [totals] = await Variant.aggregate<{
    activeVariants: number;
    outOfStock: number;
    lowStock: number;
    unitsOnHand: number;
    unitsReserved: number;
  }>([
    { $match: { isActive: true } },
    {
      $group: {
        _id: null,
        activeVariants: { $sum: 1 },
        outOfStock: { $sum: { $cond: [{ $lte: [available, 0] }, 1, 0] } },
        // Mutually exclusive with outOfStock: "low" means low, not empty.
        lowStock: {
          $sum: {
            $cond: [{ $and: [{ $gt: [available, 0] }, { $lte: [available, threshold] }] }, 1, 0],
          },
        },
        unitsOnHand: { $sum: "$onHand" },
        unitsReserved: { $sum: "$reserved" },
      },
    },
  ]);

  const lowStockItems = await Variant.aggregate<LowStockItem & { _id: unknown }>([
    { $match: { isActive: true } },
    { $addFields: { available } },
    { $match: { available: { $lte: threshold } } },
    { $sort: { available: 1 } },
    { $limit: LOW_STOCK_SAMPLE },
    { $project: { sku: 1, available: 1 } },
  ]);

  const base = totals ?? {
    activeVariants: 0,
    outOfStock: 0,
    lowStock: 0,
    unitsOnHand: 0,
    unitsReserved: 0,
  };

  return {
    lowStockThreshold: threshold,
    ...base,
    unitsAvailable: base.unitsOnHand - base.unitsReserved,
    lowStockItems: lowStockItems.map((item) => ({
      id: String(item._id),
      sku: item.sku,
      available: item.available,
    })),
  };
};

export type { InventoryStats, LowStockItem };
export { getInventoryStats };
```

- [ ] **Paso 4: Controller + ruta** — en `variantController.ts` un handler `stats`, y en `variantRoutes.ts` **antes** de cualquier `/:id`:

```ts
variantRouter.get("/stats", stats);
```

- [ ] **Paso 5:** tests PASS. Diff, aprobación, commit.

---

## Tarea 16: `GET /admin/stats/overview`

**Depends on:** 14, 15. **Files:** Create `apps/api/src/services/overviewService.ts`, `apps/api/src/controllers/statsController.ts`, `apps/api/src/routes/v1/admin/statsRoutes.ts`; Modify `apps/api/src/routes/v1/admin/index.ts`; Test `apps/api/tests/integration/statsOverview.test.ts`

- [ ] **Paso 1: Test primero.** Casos:

| Grupo | Casos |
|---|---|
| Autorización | anónimo → 401; cliente → 403 |
| Composición | con datos sembrados → `orders` e `inventory` presentes y **coincidentes** con lo que devuelven `/admin/orders/stats?days=30` y `/admin/variants/stats` por separado |
| Ventana única | `?days=7` → el `range.days` del bloque de órdenes es 7 |
| Recorte | `orders.topProducts` a lo más 5 entradas; `inventory.lowStockItems` a lo más 5 (recortado respecto al endpoint del módulo, que trae 20) |
| Vacío | base vacía → estructura completa con ceros, sin `null` |

- [ ] **Paso 2:** correr → FAIL.

- [ ] **Paso 3: Implementar**

```ts
import { getOrderStats, type OrderStats } from "./orderStatsService.js";
import { getInventoryStats, type InventoryStats } from "./inventoryStatsService.js";
import type { StatsRangeQuery } from "../utils/parseStatsRange.js";

/**
 * Pure composition (BACKEND_ARCHITECTURE_GUIDELINES, "Endpoint de
 * resumen/overview"): it orchestrates the modules' own stats services in
 * parallel and reimplements NOTHING. If a number here ever disagrees with the
 * module endpoint, the bug is that someone added logic to this file.
 *
 * Heavy payloads get trimmed — an overview is a summary, not a mirror of every
 * listing.
 */

const OVERVIEW_TOP = 5;

interface Overview {
  orders: OrderStats;
  inventory: InventoryStats;
}

const getOverview = async (query: StatsRangeQuery): Promise<Overview> => {
  const [orders, inventory] = await Promise.all([getOrderStats(query), getInventoryStats()]);

  return {
    orders: {
      ...orders,
      period: { ...orders.period, topProducts: orders.period.topProducts.slice(0, OVERVIEW_TOP) },
    },
    inventory: { ...inventory, lowStockItems: inventory.lowStockItems.slice(0, OVERVIEW_TOP) },
  };
};

export type { Overview };
export { getOverview };
```

- [ ] **Paso 4: Controller + router**

```ts
// statsController.ts
const overview = asyncHandler(async (req: Request, res: Response) => {
  const data = await getOverview(req.query);
  sendResponse(res, 200, "Resumen obtenido correctamente.", data);
});
```

```ts
// routes/v1/admin/statsRoutes.ts
const statsRouter = Router();

statsRouter.get("/overview", validate(statsRangeSchema, "query"), overview);

export { statsRouter };
```

En `routes/v1/admin/index.ts`: `adminRouter.use("/stats", statsRouter);`

- [ ] **Paso 5:** tests PASS. Diff, aprobación, commit.

---

## Tarea 17: `GET /admin/audit-logs`

**Depends on:** 1. **Files:** Create `apps/api/src/validators/auditLogValidator.ts`, `apps/api/src/controllers/auditLogController.ts`, `apps/api/src/routes/v1/admin/auditLogRoutes.ts`; Modify `apps/api/src/services/auditService.ts`, `apps/api/src/routes/v1/admin/index.ts`; Test `apps/api/tests/integration/adminAuditLogs.test.ts`

- [ ] **Paso 1: Test primero.** Casos:

| Grupo | Casos |
|---|---|
| Autorización | anónimo → 401; cliente → 403 |
| Listado | 25 entradas, `?limit=10&page=3` → 5 items, `meta.pages === 3`, orden `-createdAt` por default |
| Filtro por módulo | `?module=orders` → solo entradas de ese módulo; `?module=wat` → 400 |
| Filtro por acción | `?action=order_status_changed` → filtra; `?action=wat` → 400 |
| Filtro por actor | `?actorId=<id>` → filtra; id malformado → 400 |
| Ventana | `?days=1` → excluye una entrada de hace 3 días |
| Búsqueda | `?search=<publicId>` → encuentra por `targetId` |
| Tope | `?limit=1000` → 400 (lo impone `listQueryBase`) |
| Solo lectura | no existe ningún `POST`/`PATCH`/`DELETE` bajo `/admin/audit-logs` → 404 |

- [ ] **Paso 2:** correr → FAIL.

- [ ] **Paso 3: `auditService.listAuditLogs`** — sumar al archivo existente, sin tocar `recordAudit`

```ts
import type { ApiMeta } from "@gira/shared";
import { parseListQuery, buildMeta, type ListQueryConfig, type RawListQuery } from "../utils/parseListQuery.js";
import { parseStatsRange } from "../utils/parseStatsRange.js";

/**
 * Read side of the audit trail. Append-only stays append-only: this module
 * exposes create + read, and NOTHING that updates or deletes an entry.
 *
 * Entries are returned as stored. `before`/`after` never carry PII by contract
 * (§10), so no extra redaction layer is needed here — the discipline lives at
 * write time, where it belongs.
 */

const LIST_CONFIG: ListQueryConfig = {
  sortable: ["createdAt", "action", "module"],
  searchable: ["targetId"],
  defaultSort: "-createdAt",
};

interface AuditLogListQuery extends RawListQuery {
  module?: AuditModule;
  action?: AuditAction;
  actorId?: string;
  days?: unknown;
}

interface PublicAuditLog {
  id: string;
  actorId?: string;
  actorType: "user" | "system";
  action: AuditAction;
  module: AuditModule;
  targetId?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  ip?: string;
  createdAt: Date;
}

const listAuditLogs = async (
  query: AuditLogListQuery,
): Promise<{ items: PublicAuditLog[]; meta: ApiMeta }> => {
  const filters: Record<string, unknown> = {};
  if (query.module) filters.module = query.module;
  if (query.action) filters.action = query.action;
  if (query.actorId) filters.actorId = query.actorId;
  if (query.days !== undefined) {
    const { from } = parseStatsRange({ days: query.days }, 30);
    filters.createdAt = { $gte: from };
  }

  const { filter, sort, skip, limit, page } = parseListQuery(query, LIST_CONFIG, filters);
  const [docs, total] = await Promise.all([
    AuditLog.find(filter).sort(sort).skip(skip).limit(limit).lean(),
    AuditLog.countDocuments(filter),
  ]);

  return {
    items: docs.map((doc) => ({
      id: String(doc._id),
      ...(doc.actorId ? { actorId: String(doc.actorId) } : {}),
      actorType: doc.actorType,
      action: doc.action,
      module: doc.module,
      ...(doc.targetId ? { targetId: doc.targetId } : {}),
      ...(doc.before ? { before: doc.before } : {}),
      ...(doc.after ? { after: doc.after } : {}),
      ...(doc.ip ? { ip: doc.ip } : {}),
      createdAt: doc.createdAt,
    })),
    meta: buildMeta(total, { page, limit }),
  };
};
```

Reusar `parseStatsRange` para la ventana — es exactamente la utilidad compartida que el estándar pide extraer "a la primera señal de duplicación".

- [ ] **Paso 4: Validator**

```ts
import Joi from "joi";
import { AuditAction, AuditModule } from "@gira/shared";
import { listQueryBase } from "./listQueryValidator.js";

const auditLogListQuerySchema = listQueryBase.keys({
  module: Joi.string().valid(...Object.values(AuditModule)),
  action: Joi.string().valid(...Object.values(AuditAction)),
  actorId: Joi.string().hex().length(24).messages({
    "string.hex": "El identificador del actor no es válido.",
  }),
  days: Joi.number().integer().min(1).max(365),
});

export { auditLogListQuerySchema };
```

- [ ] **Paso 5: Controller + router**, montado en `admin/index.ts` como `adminRouter.use("/audit-logs", auditLogRouter);`

- [ ] **Paso 6:** tests PASS. Diff, aprobación, commit.

---

## Tarea 18: Barrido de índices y repaso de seguridad

**Depends on:** 17. Esta tarea **no escribe features**: verifica.

- [ ] **Paso 1:** arrancar `pnpm --filter @gira/api dev` contra el Mongo local en replica set y confirmar que **no hay warnings de índice duplicado** de Mongoose en el arranque.

- [ ] **Paso 2:** en `mongosh`, `db.<col>.getIndexes()` sobre `notifications` y `shipments`:
  - `notifications`: `{order:1, type:1}` **unique + partialFilterExpression**, `{status:1, nextAttemptAt:1}`, y `{purgeAt:1}` con `expireAfterSeconds: 0`.
  - `shipments`: `{order:1}` unique, `{orderPublicId:1}` unique, `{trackingNumber:1}`.
  - Reconfirmar que en `stockreservations` el TTL **sigue** solo en `purgeAt` (M3, gotcha #8).

- [ ] **Paso 3:** `explain("executionStats")` sobre las tres consultas calientes nuevas — el claim del dispatcher (`{status, nextAttemptAt}`), el tracking público (`{orderPublicId}`) y la agregación de stats de órdenes (`{createdAt}` + `{status}`) — confirmando `IXSCAN` en las tres. **Pegar la salida real.**

- [ ] **Paso 4: Checklist de arranque de `BACKEND_SECURITY_GUIDELINES.md`, punto por punto.** Este es el pendiente explícito de M1 y M4 en el spec: **los 19 puntos, con evidencia, ninguno "asumido"**.

| # | Punto del checklist | Cómo se verifica en este repo |
|---|---|---|
| 1 | JWT en cookie `httpOnly` + `secure` (prod) + `sameSite:"strict"` | Leer `services/authService.ts` (opciones de cookie) + test de `auth.test.ts` que asierta los flags |
| 2 | bcrypt 12, `password` con `select:false`, login genérico | `models/User.ts` (`select:false`, `SALT_ROUNDS`) + test anti-enumeración existente |
| 3 | 2FA: secreto AES-256-GCM, `select:false`, activación en dos pasos, desactivación con código | `twoFactor.test.ts` completo + `utils/crypto.ts` |
| 4 | `protect` + `restrictTo`, routers admin protegidos con `router.use` al tope | `routes/v1/admin/index.ts:22` + tests 401/403 de **cada** router admin nuevo de M4 |
| 5 | Route guards del frontend contra `/auth/me` | **N/A en el Bloque 1** — anotarlo como diferido al Bloque 2, no marcarlo como hecho |
| 6 | `mongoSanitize` recursivo (body, params, query) + prototype pollution | `tests/unit/mongoSanitize.test.ts` |
| 7 | Joi `validate` con `stripUnknown` en **todo** endpoint de entrada | `grep -rn "router\.\(post\|patch\|put\|delete\)" apps/api/src/routes/` y confirmar que cada línea con body lleva `validate(...)`. **Los endpoints nuevos de M4 incluidos.** |
| 8 | Sanitización XSS recursiva | `tests/unit/sanitizeInput.test.ts` + el escape propio de las plantillas (Tarea 5) |
| 9 | `verifyOrigin` + whitelist única | `config/cors.ts` es la única fuente; test de 403 sin Origin en las rutas nuevas |
| 10 | Rate limiters por acción; admin sin throttling; no-op fuera de prod | `tests/integration/rateLimits.test.ts` (Tarea 12) — cubre catálogo, tracking y la ausencia en admin |
| 11 | Uploads: whitelist MIME + límite de tamaño | `middlewares/upload.ts` + `uploads.test.ts` (M2, sin cambios en M4) |
| 12 | `loadEnv()` fail-fast, `NODE_ENV` válido, secretos ≥48 | `tests/unit/env.test.ts`, ampliado en la Tarea 2 |
| 13 | `.env.*.local` en `.gitignore`, solo `.example` versionado | `git ls-files \| grep -i env` → **solo** `.example` |
| 14 | Sin secretos en código ni `NEXT_PUBLIC_*` | `grep -rn "sk_test\|sk_live\|whsec_\|re_[A-Za-z0-9]\|bot[0-9]*:" apps/api/src/` → cero coincidencias fuera de comentarios |
| 15 | Audit trail append-only (actor, acción, módulo, before/after, IP), best-effort | `services/auditService.ts` (sin update/delete) + `GET /admin/audit-logs` de la Tarea 17 |
| 16 | Error handler global sin stack en prod | `middlewares/errorHandler.ts` + test existente |
| 17 | Logs sin PII ni secretos | **Específico de M4:** confirmar que `stubMailer` loguea hash y asunto pero **no** el destinatario, y que ningún `AppError` de los adapters incluye API key o bot token (tests de las Tareas 3 y 4) |
| 18 | `helmet()` + body limit + orden de middlewares | `app.ts:27-46` — confirmar que el webhook sigue montado **antes** de `express.json` |
| 19 | `npm audit` sin high/critical en producción | Paso 5 |

- [ ] **Paso 5:** `pnpm audit --prod --audit-level=high`
Expected: sin vulnerabilidades high/critical. **M4 no agrega ninguna dependencia** (Resend y Telegram van por `fetch` nativo), así que cualquier hallazgo viene de M1–M3 y hay que resolverlo aquí — es el objetivo explícito del milestone.

- [ ] **Paso 6: Repaso de fugas de datos específico de M4:**
  - `GET /orders/:publicId/tracking` no expone `order`, `_id`, `email`, dirección ni totales.
  - Ninguna entrada de auditoría de M4 contiene correos: `db.auditlogs.find({}, {before:1, after:1})` revisado a ojo tras el recorrido manual.
  - Ninguna notificación de equipo (`channel: "team"`) lleva PII en `payload`.

- [ ] **Paso 7:** diff (si hubo ajustes), aprobación, commit.

---

## Tarea 19: Verificación final

**Depends on:** 18. Nada se declara "hecho" sin la salida real pegada (no-negociable #8).

- [ ] **Paso 1:** `pnpm -r exec tsc --noEmit` → sin errores.
- [ ] **Paso 2:** `pnpm build` → limpio (incluye `@gira/shared`).
- [ ] **Paso 3:** `pnpm lint` → sin errores; confirmar que la regla de layering no reporta nada (ningún controller/route importa models ni adapters — los controllers nuevos de M4 incluidos).
- [ ] **Paso 4:** `pnpm test` → toda la suite verde. Reportar el conteo total (parte de **412**). **Correrlo tres veces** para confirmar que no reapareció flakiness al sumar ~8 archivos de test.
- [ ] **Paso 5:** `pnpm audit --prod --audit-level=high` → limpio.
- [ ] **Paso 6: Recorrido manual end-to-end**, con Mongo local en replica set, `stripe listen --forward-to localhost:4000/api/webhooks/stripe`, y **sin** credenciales de Resend/Telegram la primera vuelta (para ver los stubs), pegando cada salida:
  1. login admin → cookie
  2. `PATCH /admin/settings/inventory {"lowStockThreshold": 5}` → 200
  3. crear catálogo mínimo + stock (recorrido de M2)
  4. `POST /api/v1/orders` como invitada con `Idempotency-Key` → 201
  5. pagar con `4242 4242 4242 4242` → webhook → orden en `paid`
  6. **`db.notifications.find()`** → dos docs `pending`: `order_confirmation` (email) y `team_order_paid` (team)
  7. esperar al job (o invocar `dispatchNotifications` desde `tsx`) → ambos en `sent`; en el log aparecen las líneas del stub **sin** el correo de la clienta
  8. reenviar el evento con `stripe events resend <id>` → **sigue habiendo una sola** `order_confirmation` (el índice único hizo su trabajo)
  9. `PATCH /admin/orders/:id/status {"status":"processing"}` → 200 y una `order_preparing` encolada
  10. `POST /admin/orders/:id/shipment {"carrier":"Estafeta","trackingNumber":"1234567890"}` → 201, orden en `shipped`, `order_shipped` encolada con la guía
  11. `GET /api/v1/orders/:publicId/tracking` **sin sesión** → 200 con estado y eventos, sin datos personales
  12. `PATCH /admin/orders/:id/shipment {"status":"delivered"}` → 200 y orden en `delivered`
  13. `POST` un segundo envío a la misma orden → **409**
  14. `GET /admin/orders/stats?days=30` → ingresos por moneda, `byStatus`, alertas
  15. `GET /admin/variants/stats` → `lowStockThreshold: 5` y los conteos correctos
  16. `GET /admin/stats/overview?days=7` → coincide con los dos anteriores
  17. `GET /admin/audit-logs?module=shipping` → las entradas de `SHIPMENT_CREATED` y `SHIPMENT_STATUS_CHANGED`
  18. **Segunda vuelta con `RESEND_API_KEY` real de prueba**: repetir los pasos 4-7 y confirmar la llegada del correo real; luego apagar la red y confirmar que el doc queda `pending` con `attempts: 1` y `nextAttemptAt` futuro
- [ ] **Paso 7:** pegar el checklist de la Tarea 18 completo, con el resultado real de cada uno de los 19 puntos y la nota de lo que queda diferido al Bloque 2 (route guards de frontend) y a milestones posteriores (rotación de refresh token, Mercado Pago, `POST /orders/quote`).
- [ ] **Paso 8:** mostrar `git status` + `git diff` completos y **esperar aprobación explícita de Manuel** antes de cualquier commit o merge. Confirmar el nombre de la rama con `git branch --show-current` y **leerlo dos veces** antes de escribirlo en un comando de merge.
- [ ] **Paso 9:** escribir la sección **"Pendientes conocidos (post-review)"** al final del plan copiado en `docs/superpowers/plans/`, aunque quede vacía — M3 no la dejó y esta sesión tuvo que reconstruir esa información leyendo el plan entero.

---

## Verificación end-to-end (resumen)

| Qué | Comando / evidencia |
|---|---|
| Tipos | `pnpm -r exec tsc --noEmit` |
| Build | `pnpm build` |
| Lint + layering | `pnpm lint` |
| Tests | `pnpm test` × 3 (unit nuevos: mailerAdapter, notificationAdapter, orderEmails, shipmentTransitions, parseStatsRange · integration nuevos: notifications, dispatchNotifications, orderNotifications, shipments, shipmentRoutes, rateLimits, inventoryStats, statsOverview, adminAuditLogs) |
| Dependencias | `pnpm audit --prod --audit-level=high` — **cero dependencias nuevas en M4** |
| Índices | `getIndexes()`: `notifications` con unique parcial `(order,type)` y TTL solo en `purgeAt`; `shipments` con unique en `order` y `orderPublicId` |
| Anti-duplicado de correos | Mismo evento de Stripe dos veces → **una sola** `order_confirmation` |
| Reintentos | Mailer que falla → `pending` con backoff; al 5º intento → `failed` + audit |
| Envío | Capturar guía mueve la orden a `shipped` y encola el correo; segundo envío → 409 |
| Tracking público | 200 sin sesión, con limiter propio de 60/15min y cero PII |
| Seguridad | Los 19 puntos del checklist de arranque, con evidencia por punto |

---

## Gotchas a recordar durante la ejecución

1. **`@gira/shared` se debe rebuildear** (`pnpm --filter @gira/shared build`) tras editar los enums, o `tsc`, vitest y runtime siguen viendo el paquete de M3.
2. **El índice único de `Notification` es parcial.** Aplica solo cuando existe `order`. Los avisos de equipo se encolan **sin** `order` a propósito; si alguien les pone `order`, el segundo aviso del mismo tipo desaparece en silencio.
3. **Nada de mandar correos en línea.** Si aparece un `await getMailer().send(...)` fuera de `jobs/dispatchNotifications.ts`, se perdió el punto entero del outbox: la idempotencia y los reintentos viven en la cola, no en el llamador.
4. **El TTL va en `purgeAt`, nunca en `nextAttemptAt`.** Misma disciplina que `StockReservation` en M3: el índice TTL es un recolector de basura, jamás el mecanismo que decide algo.
5. **`assertAdminTransition` sigue siendo la única puerta** para mover una orden. `shipmentService` la usa igual que `adminOrderService`; escribir `order.status` sin pasar por ahí es un bug.
6. **Capturar la guía exige la orden en `processing`.** No es un capricho: `paid → shipped` no existe en la tabla de transiciones de M3, y está bien que no exista.
7. **Toda petición mutante en supertest necesita `.set("Origin", "http://localhost:3000")`** o `verifyOrigin` responde 403 (herencia de M2).
8. **`sanitizeInput` escapa XSS en todos los strings**, así que un `carrier` con `<` vuelve escapado. Asertar sobre la salida escapada; las plantillas escapan **otra vez** a propósito (defensa en profundidad, no redundancia a eliminar).
9. **Ningún mensaje de error de los adapters puede contener la API key ni el bot token.** El token de Telegram va en la URL: nunca interpolar la URL en un `AppError` ni en un log.
10. **Los stats de inventario no llevan rango de fechas.** Es un snapshot de ahora. Si alguien le agrega `days`, está midiendo algo que no significa nada.
11. **Los ingresos jamás se suman entre monedas.** Si aparece un `revenue` escalar en vez de un arreglo por moneda, es un bug de negocio, no de formato.
12. **Los jobs no se arrancan en `buildApp()`.** Si un test deja el proceso colgado, alguien movió `startJobs` ahí.
13. **Git:** ninguna tarea ejecuta `git add`/`commit`/`push` sin mostrar el diff y recibir aprobación explícita de Manuel. La rama es `feat/m4-notificaciones-envios` — verificarla con `git branch --show-current` antes de cualquier merge.

---

## Pendientes conocidos (post-review)

### 1. Flakiness residual bajo ejecución paralela completa (no bloqueante, no es de M4)

`pnpm test` se corrió 6 veces de punta a punta durante la verificación final. 2 corridas dieron **547/547 limpio**; las otras 4 fallaron en **exactamente un test**, cada vez en un archivo distinto y siempre de M1–M3 (`adminPrints.test.ts`, `inventory.test.ts`, `catalogPublic.test.ts`, `orderRoutes.test.ts`, `auth.test.ts`, `adminVariants.test.ts`) — **nunca** en un archivo de M4. El síntoma es siempre a nivel de transporte (`socket hang up`) o un `undefined` río abajo de una respuesta que se cortó, nunca una aserción de negocio incorrecta. Cada test fallido pasó 100% al re-ejecutarse aislado.

Esto es la misma clase de problema documentada como pendiente #1 de M2 y "cerrada" en M3 (Tarea 1: `globalSetup` con un solo `MongoMemoryReplSet` + `maxThreads: 4`) — el cierre de M3 redujo la frecuencia pero no la eliminó del todo cuando la máquina está bajo carga externa. Durante esta sesión el `load average` del sistema estuvo en 6.3–7.8 (Spotlight indexando, iCloud, VS Code y otros procesos compitiendo por CPU), fuera del control del proceso de test.

**Acción sugerida:** si vuelve a aparecer con frecuencia, considerar bajar `poolOptions.threads.maxThreads` en `vitest.config.ts` de 4 a 2, a costa de una suite más lenta. No perseguirlo como bug de aplicación — ninguna de las 6 corridas mostró una falla reproducible en aislamiento.

### 2. Bug encontrado y corregido durante el recorrido manual: `_id: null` filtrado en los stats de inventario

`inventoryStatsService.getInventoryStats` construía la respuesta con `...base` (spread del resultado de `Variant.aggregate([...{$group: {_id: null, ...}}])`). El tipo TS de la agregación no declaraba `_id`, pero en tiempo de ejecución Mongo sí lo devuelve, así que el spread filtraba un `"_id": null` hacia `GET /admin/variants/stats` y, por composición, hacia `GET /admin/stats/overview`. Sin impacto de seguridad (no es PII, es un artefacto interno de Mongo), pero sí una fuga de forma de respuesta no intencional.

**Corregido** en la propia Tarea 19: la función ahora arma la respuesta con campos nombrados explícitamente en vez de un spread del resultado crudo de la agregación. Se agregó una aserción de regresión (`expect(res.body.data).not.toHaveProperty("_id")`) en `tests/integration/inventoryStats.test.ts`.

### 3. Nada pendiente de M3

`docs/superpowers/plans/2026-07-28-m3-ordenes-pagos.md` no dejó una sección de pendientes (ver nota en el Context de este mismo plan) — sus dos huecos conocidos, `POST /orders/quote` y la rotación de refresh token, quedan fuera de alcance de M4 por decisión explícita, no por omisión.
