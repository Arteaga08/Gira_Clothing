# Envía Eb — rastreo, "Marcar enviado", correos y retiro de Shipment — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar el flujo manual de `Shipment` por "Marcar enviado" + rastreo de Envía (webhook firmado + polling), con correos de enviado/entregado, y dejar listo el modelo para la tarjeta de logística de M9b.

**Architecture:** La guía ya vive en `order.label` (Ea). Eb agrega `order.tracking/shippedAt/deliveredAt` y la colección `ShipmentTrackingEvent`. Un solo servicio (`shipmentTrackingService.applyTrackingEvents`) recibe eventos del webhook y del polling, los guarda de forma idempotente, avanza `order.tracking` solo hacia adelante y converge el estado de la orden con `applyOrderTransition` (CAS). El dedupe de webhooks se extrae de `webhookService` a `webhookEventService` parametrizado por `provider`.

**Tech Stack:** Node/Express 5 + Mongoose + TS estricto, Vitest + supertest + MongoMemoryReplSet, pnpm monorepo (`packages/shared`, `apps/api`, `apps/web`).

**Reglas del repo (no negociables):** lógica en inglés, copy visible en español; exports al final del archivo; sin features extra; **NO** ejecutar `git add/commit/push` (Manuel los corre: al final de cada tarea se anota el commit sugerido, pero no se ejecuta); nunca correr scripts contra la base de `.env.development.local` (apunta a Atlas); `tests/` está fuera de `tsc`, se verifica corriendo la suite; flake conocido de la suite completa (re-correr aislado antes de investigar).

**Decisiones de diseño ya aprobadas:**
- `paid` + recolección → encadena `paid→processing→shipped` (actor `system`), sin correo "en preparación", con correo "enviado".
- `delivered` sin pasar por shipped → encadena hasta `delivered` y manda **solo** `ORDER_DELIVERED`.
- Disputa `open|lost` → no mueve estado, guarda evento, audita `TRACKING_TRANSITION_BLOCKED`. Orden `refunded|cancelled|expired` → guarda evento, no mueve.
- Firma del webhook: se aceptan hex **y** base64 hasta que Envía confirme cuál usa (mismo HMAC, misma seguridad).

**Comandos base** (desde la raíz `/Users/manuelarteaga/Documents/Gira_Clothing`):
- Test de un archivo: `pnpm --filter @gira/api exec vitest run tests/<ruta>`
- Typecheck: `pnpm --filter @gira/api typecheck`
- Shared: `pnpm --filter @gira/shared build`

---

## Mapa de archivos

**Crear**
- `apps/api/src/utils/webhookSignature.ts` — firma/verificación `v1=` pura.
- `apps/api/src/models/ShipmentTrackingEvent.ts` — eventos de rastreo.
- `apps/api/src/utils/trackingProgress.ts` — rangos y regla de avance (pura).
- `apps/api/src/utils/orderEmailSnapshot.ts` — snapshot plano para correos.
- `apps/api/src/services/webhookEventService.ts` — dedupe/reclamo genérico por provider.
- `apps/api/src/services/shipmentTrackingService.ts` — `applyTrackingEvents`, `markShipped`, lecturas.
- `apps/api/src/services/shippingWebhookService.ts` — entrada del webhook de Envía.
- `apps/api/src/jobs/reconcileTracking.ts` — polling.
- Tests: `tests/unit/webhookSignature.test.ts`, `tests/unit/trackingProgress.test.ts`, `tests/unit/enviaTracking.test.ts`, `tests/integration/markShipped.test.ts`, `tests/integration/enviaWebhook.test.ts`, `tests/integration/trackingConvergence.test.ts`, `tests/integration/reconcileTracking.test.ts`, `tests/integration/orderTrackingReads.test.ts`.

**Modificar**
- `packages/shared/src/{enums/shipping.ts,labels/shipping.ts,types/shipping.ts,types/order.ts,enums/notification.ts,enums/auditAction.ts,index.ts}`
- `apps/api/src/adapters/shipping/{types.ts,stubShippingProvider.ts,enviaShippingProvider.ts,index.ts}`
- `apps/api/src/config/env.ts` (+ `.env.development.example`, `.env.production.example`)
- `apps/api/src/models/Order.ts`, `services/orderTransitionService.ts`, `utils/orderTransitions.ts`
- `apps/api/src/templates/{orderEmails.ts,teamMessages.ts}`, `jobs/{dispatchNotifications.ts,scheduler.ts}`
- `apps/api/src/services/{webhookService.ts,orderService.ts,adminOrderService.ts,orderPaymentService.ts}`
- `apps/api/src/{controllers/webhookController.ts,controllers/orderController.ts,controllers/adminOrderController.ts}`
- `apps/api/src/routes/{webhookRoutes.ts,v1/orderRoutes.ts,v1/admin/adminOrderRoutes.ts,v1/admin/index.ts}`, `middlewares/rateLimit.ts`
- `apps/api/tests/helpers/fakeShippingProvider.ts`
- Web: `StatusChip.tsx`, `styles.ts`, `KitContent.tsx`, `OutboxHealthPanel.tsx`, `Badge.tsx` (comentario), sus tests.
- `docs/SETUP-REQUERIDO.md`

**Borrar** (Task 11): `models/Shipment.ts`, `utils/shipmentTransitions.ts`, `services/shipmentService.ts`, `controllers/shipmentController.ts`, `validators/shipmentValidator.ts`, `routes/v1/admin/adminShipmentRoutes.ts`, `routes/v1/admin/shipmentRoutes.ts`, 4 tests de shipments, y en shared `enums/shipment.ts`, `types/shipment.ts`, `labels/shipmentStatus.ts`.

---

## Task 0: Línea base

**Files:** ninguno.

- [ ] **Step 1: Confirmar rama y árbol limpio**

Run: `git branch --show-current && git status --short`
Expected: `fix/m-envia-b-tracking` y salida vacía.

- [ ] **Step 2: Línea base verde**

Run: `pnpm --filter @gira/shared build && pnpm --filter @gira/api typecheck && pnpm --filter @gira/api test`
Expected: typecheck sin errores; suite 1259/1259 (si hay 1–2 fallos tipo `socket hang up`, re-correr ese archivo aislado).

---

## Task 1: Shared — enums, labels, tipos, audit, notificación (solo aditivo)

Lo que se borra de shared (Shipment) va en Task 11, porque la API aún importa esos símbolos.

**Files:**
- Modify: `packages/shared/src/enums/shipping.ts`
- Modify: `packages/shared/src/labels/shipping.ts`
- Modify: `packages/shared/src/types/shipping.ts`
- Modify: `packages/shared/src/types/order.ts`
- Modify: `packages/shared/src/enums/notification.ts`
- Modify: `packages/shared/src/enums/auditAction.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: `enums/shipping.ts` — agregar el enum antes de la línea `export`**

```ts
/** Normalised parcel progress, owned by us (the provider's own vocabulary stays in its adapter). */
enum ShipmentTrackingStatus {
  LABEL_CREATED = "label_created",
  PICKED_UP = "picked_up",
  IN_TRANSIT = "in_transit",
  OUT_FOR_DELIVERY = "out_for_delivery",
  DELIVERED = "delivered",
  /** Delayed, failed attempt, address problem, damaged: a human may need to act. */
  EXCEPTION = "exception",
  RETURNED = "returned",
  LOST = "lost",
}
```

y cambiar la última línea a:

```ts
export { ShippingProviderName, ShippingCarrier, ShippingLabelStatus, ShipmentTrackingStatus };
```

- [ ] **Step 2: `labels/shipping.ts` — agregar etiquetas en español**

Cambiar el import a `import { ShippingCarrier, ShipmentTrackingStatus } from "../enums/shipping.js";` y, antes del export:

```ts
const SHIPMENT_TRACKING_STATUS_LABELS: Record<ShipmentTrackingStatus, string> = {
  [ShipmentTrackingStatus.LABEL_CREATED]: "Guía generada",
  [ShipmentTrackingStatus.PICKED_UP]: "Recolectado",
  [ShipmentTrackingStatus.IN_TRANSIT]: "En tránsito",
  [ShipmentTrackingStatus.OUT_FOR_DELIVERY]: "En reparto",
  [ShipmentTrackingStatus.DELIVERED]: "Entregado",
  [ShipmentTrackingStatus.EXCEPTION]: "Incidencia en el envío",
  [ShipmentTrackingStatus.RETURNED]: "Devuelto",
  [ShipmentTrackingStatus.LOST]: "Extraviado",
};

export { SHIPPING_CARRIER_LABELS, SHIPMENT_TRACKING_STATUS_LABELS };
```

(y borrar el `export { SHIPPING_CARRIER_LABELS };` anterior.)

- [ ] **Step 3: `types/shipping.ts` — DTOs de rastreo**

Cambiar el import de enums a `import type { ShipmentTrackingStatus, ShippingCarrier, ShippingLabelStatus, ShippingProviderName } from "../enums/shipping.js";` y agregar antes del `export type`:

```ts
/** Parcel progress mirrored on the order. */
interface OrderTrackingAdmin {
  status: ShipmentTrackingStatus;
  lastEventAt?: Date;
  lastSyncedAt?: Date;
}

interface TrackingEventDto {
  status: ShipmentTrackingStatus;
  /** The provider's own status text, kept for support. */
  rawStatus: string;
  description?: string;
  location?: string;
  occurredAt: Date;
}

/** `GET /admin/orders/:id/tracking`: everything the logistics card of M9b needs. */
interface AdminOrderTracking {
  label?: OrderLabelAdmin;
  tracking?: OrderTrackingAdmin;
  shippedAt?: Date;
  deliveredAt?: Date;
  events: TrackingEventDto[];
}

/** What the OWNING customer sees once the order is shipped (never before). */
interface CustomerShipment {
  carrier: ShippingCarrier;
  carrierName: string;
  trackingNumber: string;
  /** The carrier's own tracking page. */
  trackUrl?: string;
  status?: ShipmentTrackingStatus;
  shippedAt?: Date;
  deliveredAt?: Date;
}

/** `GET /orders/:publicId/tracking`. Shaped from the order; the credential is never echoed back. */
interface PublicTracking extends CustomerShipment {
  orderNumber: string;
  events: TrackingEventDto[];
}
```

y agregar `OrderTrackingAdmin, TrackingEventDto, AdminOrderTracking, CustomerShipment, PublicTracking,` a la lista del `export type { ... }`.

**Nombre:** el tipo nuevo se llama `PublicTrackingView` (el `PublicTracking` viejo de `types/shipment.ts` se borra en Task 11 y queda sin reemplazo). Declararlo como `interface PublicTrackingView extends CustomerShipment` en el bloque de arriba y exportar `PublicTrackingView` (no `PublicTracking`) en la lista `export type`.

- [ ] **Step 4: `types/order.ts` — campos en los DTOs**

En el import de `./shipping.js` agregar `CustomerShipment, OrderTrackingAdmin`. Luego:

```ts
interface CustomerOrder extends PublicOrder {
  id: string;
  /** Present only once the order is shipped or delivered. */
  shipment?: CustomerShipment;
}
```

y en `AdminOrder`, después de `label?: OrderLabelAdmin;`:

```ts
  tracking?: OrderTrackingAdmin;
  shippedAt?: Date;
  deliveredAt?: Date;
```

- [ ] **Step 5: `enums/notification.ts` y `enums/auditAction.ts`**

En `NotificationType`, después de `ORDER_SHIPPED = "order_shipped",`:

```ts
  ORDER_DELIVERED = "order_delivered",
```

En `AuditAction`, después de `LABEL_CANCELLED = "label_cancelled",`:

```ts
  ORDER_MARKED_SHIPPED = "order_marked_shipped",
  TRACKING_UPDATED = "tracking_updated",
  /** A parcel event arrived but the order was not moved (open/lost dispute). */
  TRACKING_TRANSITION_BLOCKED = "tracking_transition_blocked",
```

- [ ] **Step 6: `index.ts` — exports**

- Línea 8: `import { ShippingProviderName, ShippingCarrier, ShippingLabelStatus, ShipmentTrackingStatus } from "./enums/shipping.js";`
- En la lista de enums exportados (junto a `ShippingLabelStatus,` línea ~30) agregar `ShipmentTrackingStatus,`.
- En el import de tipos de `./types/shipping.js` (líneas 64-72) agregar `OrderTrackingAdmin, TrackingEventDto, AdminOrderTracking, CustomerShipment, PublicTrackingView,` y lo mismo en la lista `export type` (líneas ~179-186).
- Línea 80: `import { SHIPPING_CARRIER_LABELS, SHIPMENT_TRACKING_STATUS_LABELS } from "./labels/shipping.js";` y agregar `SHIPMENT_TRACKING_STATUS_LABELS,` en el export de valores junto a `SHIPPING_CARRIER_LABELS` (línea ~251).

- [ ] **Step 7: Build y typecheck**

Run: `pnpm --filter @gira/shared build && pnpm --filter @gira/api typecheck`
Expected: ambos sin errores (los cambios son aditivos).

- [ ] **Step 8: Commit sugerido (NO ejecutar)**

`git add packages/shared && git commit -m "FEAT: shared tracking enums, labels and DTOs (Eb)"`

---

## Task 2: Firma de webhook (`utils/webhookSignature.ts`)

**Files:**
- Create: `apps/api/src/utils/webhookSignature.ts`
- Test: `apps/api/tests/unit/webhookSignature.test.ts`

- [ ] **Step 1: Test rojo**

```ts
import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { signWebhook, verifyWebhookSignature } from "../../src/utils/webhookSignature.js";

const SECRET = "whsec_test";
const BODY = '{"type":"tracking.simple","data":{"tracking_number":"T1"}}';
const EVENT = "tracking.simple";
const NOW = 1_700_000_000_000;
const base = { secret: SECRET, event: EVENT, body: Buffer.from(BODY), toleranceMs: 300_000, now: NOW };

const digest = (ts: string) =>
  createHmac("sha256", SECRET).update(`${ts}.${EVENT}.${BODY}`).digest();

describe("verifyWebhookSignature", () => {
  it("acepta una firma v1 en hex", () => {
    const ts = String(NOW);
    expect(verifyWebhookSignature({ ...base, timestamp: ts, signature: `v1=${digest(ts).toString("hex")}` })).toBe("ok");
  });

  it("acepta la misma firma codificada en base64", () => {
    const ts = String(NOW);
    expect(verifyWebhookSignature({ ...base, timestamp: ts, signature: `v1=${digest(ts).toString("base64")}` })).toBe("ok");
  });

  it("rechaza una firma de otro secreto", () => {
    const ts = String(NOW);
    const bad = createHmac("sha256", "otro").update(`${ts}.${EVENT}.${BODY}`).digest("hex");
    expect(verifyWebhookSignature({ ...base, timestamp: ts, signature: `v1=${bad}` })).toBe("bad_signature");
  });

  it("rechaza si el cuerpo cambió", () => {
    const ts = String(NOW);
    expect(
      verifyWebhookSignature({ ...base, body: Buffer.from(BODY + " "), timestamp: ts, signature: `v1=${digest(ts).toString("hex")}` }),
    ).toBe("bad_signature");
  });

  it("rechaza una firma sin el prefijo v1= o vacía", () => {
    const ts = String(NOW);
    expect(verifyWebhookSignature({ ...base, timestamp: ts, signature: digest(ts).toString("hex") })).toBe("bad_signature");
    expect(verifyWebhookSignature({ ...base, timestamp: ts, signature: "v1=" })).toBe("bad_signature");
  });

  it("acepta cualquiera de varias firmas separadas por coma (rotación de secreto)", () => {
    const ts = String(NOW);
    const sig = `v1=deadbeef,v1=${digest(ts).toString("hex")}`;
    expect(verifyWebhookSignature({ ...base, timestamp: ts, signature: sig })).toBe("ok");
  });

  it("rechaza un timestamp fuera de tolerancia (pasado o futuro) y uno no numérico", () => {
    for (const ts of [String(NOW - 300_001), String(NOW + 300_001), "abc"]) {
      expect(verifyWebhookSignature({ ...base, timestamp: ts, signature: `v1=${digest(ts).toString("hex")}` })).toBe("bad_timestamp");
    }
  });

  it("signWebhook produce algo que verifyWebhookSignature acepta", () => {
    const ts = String(NOW);
    const signature = signWebhook({ secret: SECRET, event: EVENT, body: Buffer.from(BODY), timestamp: ts });
    expect(signature.startsWith("v1=")).toBe(true);
    expect(verifyWebhookSignature({ ...base, timestamp: ts, signature })).toBe("ok");
  });
});
```

- [ ] **Step 2: Verlo fallar**

Run: `pnpm --filter @gira/api exec vitest run tests/unit/webhookSignature.test.ts`
Expected: FAIL (`Cannot find module '../../src/utils/webhookSignature.js'`).

- [ ] **Step 3: Implementación**

```ts
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * `X-Webhook-Signature: v1=HMAC-SHA256(ts + "." + event + "." + body, secret)`.
 * The provider's docs do not say whether the digest is hex or base64, so both
 * encodings of the SAME digest are accepted: the secret is what authenticates,
 * not the encoding. Revisit when support confirms (docs/SETUP-REQUERIDO.md).
 */

type SignatureVerdict = "ok" | "bad_signature" | "bad_timestamp";

interface SignInput {
  secret: string;
  event: string;
  body: Buffer;
  /** Unix milliseconds, as sent in X-Webhook-Timestamp. */
  timestamp: string;
}

interface VerifyInput extends SignInput {
  signature: string;
  toleranceMs: number;
  now?: number;
}

const digestOf = ({ secret, event, body, timestamp }: SignInput): Buffer =>
  createHmac("sha256", secret).update(`${timestamp}.${event}.`).update(body).digest();

const signWebhook = (input: SignInput): string => `v1=${digestOf(input).toString("hex")}`;

const safeEqual = (a: Buffer, b: Buffer): boolean => a.length === b.length && timingSafeEqual(a, b);

const verifyWebhookSignature = (input: VerifyInput): SignatureVerdict => {
  const sentAt = Number(input.timestamp);
  const now = input.now ?? Date.now();
  if (!Number.isFinite(sentAt) || Math.abs(now - sentAt) > input.toleranceMs) return "bad_timestamp";

  const expected = digestOf(input);
  const candidates = input.signature
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.startsWith("v1="))
    .map((part) => part.slice(3))
    .filter((value) => value.length > 0);

  for (const candidate of candidates) {
    const asHex = /^[0-9a-fA-F]+$/.test(candidate) ? Buffer.from(candidate, "hex") : null;
    const asBase64 = Buffer.from(candidate, "base64");
    if ((asHex && safeEqual(asHex, expected)) || safeEqual(asBase64, expected)) return "ok";
  }
  return "bad_signature";
};

export type { SignatureVerdict, SignInput, VerifyInput };
export { signWebhook, verifyWebhookSignature };
```

- [ ] **Step 4: Verlo pasar**

Run: `pnpm --filter @gira/api exec vitest run tests/unit/webhookSignature.test.ts`
Expected: 8 passed.

- [ ] **Step 5: Commit sugerido (NO ejecutar)**

`git add apps/api/src/utils/webhookSignature.ts apps/api/tests/unit/webhookSignature.test.ts && git commit -m "FEAT: v1 HMAC webhook signature helper"`

---

## Task 3: Puerto del adapter, stub, env y fake de tests

**Files:**
- Modify: `apps/api/src/adapters/shipping/types.ts`, `stubShippingProvider.ts`, `index.ts`
- Modify: `apps/api/src/config/env.ts`, `.env.development.example`, `.env.production.example`
- Modify: `apps/api/tests/helpers/fakeShippingProvider.ts`
- Test: `apps/api/tests/unit/stubTracking.test.ts`, `apps/api/tests/unit/env.test.ts`

- [ ] **Step 1: Test rojo del stub** (`tests/unit/stubTracking.test.ts`)

```ts
import { describe, it, expect } from "vitest";
import { ShipmentTrackingStatus } from "@gira/shared";
import { createStubShippingProvider } from "../../src/adapters/shipping/stubShippingProvider.js";
import { signWebhook } from "../../src/utils/webhookSignature.js";

const SECRET = "stub_secret";
const body = (status: string, tracking = "STUB1") =>
  Buffer.from(JSON.stringify({ type: "tracking.simple", created_at: "2026-10-19T10:00:00Z",
    data: { tracking_number: tracking, status, status_description: "Desc", location: "CDMX" } }));
const headers = (b: Buffer, ts = String(Date.now()), id = "evt_1", secret = SECRET) => ({
  "x-webhook-event": "tracking.simple",
  "x-webhook-id": id,
  "x-webhook-timestamp": ts,
  "x-webhook-signature": signWebhook({ secret, event: "tracking.simple", body: b, timestamp: ts }),
});

describe("stub · webhook", () => {
  it("no acepta webhooks sin secreto", () => {
    expect(createStubShippingProvider().acceptsWebhooks).toBe(false);
  });

  it("verifica la firma y entrega el evento normalizado", () => {
    const stub = createStubShippingProvider({ webhookSecret: SECRET });
    const b = body("delivered");
    const parsed = stub.verifyAndParseWebhook(b, headers(b));
    expect(parsed.deliveryId).toBe("evt_1");
    expect(parsed.eventType).toBe("tracking.simple");
    expect(parsed.events).toEqual([
      expect.objectContaining({ trackingNumber: "STUB1", status: ShipmentTrackingStatus.DELIVERED, rawStatus: "delivered" }),
    ]);
  });

  it("lanza 400 con firma inválida, sin cabeceras o timestamp viejo", () => {
    const stub = createStubShippingProvider({ webhookSecret: SECRET });
    const b = body("delivered");
    expect(() => stub.verifyAndParseWebhook(b, headers(b, undefined, "e", "otro"))).toThrow(/firma/i);
    expect(() => stub.verifyAndParseWebhook(b, {})).toThrow(/cabeceras/i);
    expect(() => stub.verifyAndParseWebhook(b, headers(b, String(Date.now() - 10 * 60_000)))).toThrow(/vigente|fecha/i);
  });

  it("getTracking responde un evento determinista por guía", async () => {
    const stub = createStubShippingProvider();
    const out = await stub.getTracking(["STUB1", "STUB2"], {});
    expect(out.map((e) => e.trackingNumber)).toEqual(["STUB1", "STUB2"]);
    expect(out.every((e) => e.status === ShipmentTrackingStatus.LABEL_CREATED)).toBe(true);
  });
});
```

Run: `pnpm --filter @gira/api exec vitest run tests/unit/stubTracking.test.ts` → FAIL (`acceptsWebhooks` no existe).

- [ ] **Step 2: `adapters/shipping/types.ts` — ampliar el puerto**

Cambiar el import a `import type { ShipmentTrackingStatus, ShippingCarrier, ShippingOrigin, ShippingParcel, ShippingProviderName } from "@gira/shared";`. Antes de `interface ShippingProvider` agregar:

```ts
/** One parcel status change, in OUR vocabulary. */
interface TrackingEvent {
  trackingNumber: string;
  status: ShipmentTrackingStatus;
  /** The provider's own status text/id, kept for support. */
  rawStatus: string;
  description?: string;
  location?: string;
  occurredAt: Date;
}

/** Lower-cased header map as Express exposes it. */
type WebhookHeaders = Record<string, string | string[] | undefined>;

interface ParsedWebhook {
  /** The provider's unique delivery id: the dedupe key. */
  deliveryId: string;
  eventType: string;
  /** Empty when the event type is not one we act on. */
  events: TrackingEvent[];
}
```

Y reemplazar la interfaz del puerto por:

```ts
interface ShippingProvider {
  readonly name: ShippingProviderName;
  /** false when no webhook secret is configured: the endpoint then answers 503 and polling covers tracking. */
  readonly acceptsWebhooks: boolean;
  getRates(input: RatesInput, options: CallOptions): Promise<ProviderRate[]>;
  createLabel(input: CreateLabelInput, options: CallOptions): Promise<LabelResult>;
  cancelLabel(input: CancelLabelInput, options: CallOptions): Promise<void>;
  /** Latest events for these tracking numbers (polling / reconciliation). */
  getTracking(trackingNumbers: string[], options: CallOptions): Promise<TrackingEvent[]>;
  /**
   * Verifies the signature and timestamp of a raw webhook and normalises it.
   * Throws AppError(400) on a bad signature, a stale timestamp or missing headers.
   */
  verifyAndParseWebhook(rawBody: Buffer, headers: WebhookHeaders): ParsedWebhook;
}
```

En el `export type { ... }` agregar `TrackingEvent, WebhookHeaders, ParsedWebhook,`.

- [ ] **Step 3: Parser de webhook compartido** — para no duplicar entre stub y Envía, el parseo del cuerpo `tracking.simple` vive en `webhookSignature`'s vecino. Crear `apps/api/src/adapters/shipping/webhookEnvelope.ts`:

```ts
import { AppError } from "../../utils/AppError.js";
import { verifyWebhookSignature } from "../../utils/webhookSignature.js";
import type { WebhookHeaders } from "./types.js";

interface Envelope {
  deliveryId: string;
  eventType: string;
  body: Record<string, unknown>;
}

const header = (headers: WebhookHeaders, name: string): string | undefined => {
  const value = headers[name];
  return Array.isArray(value) ? value[0] : value;
};

/**
 * Header + signature + JSON checks shared by every adapter that speaks the
 * `v1=` signed-webhook scheme. Throws AppError(400); never reveals which part failed beyond a generic reason.
 */
const openEnvelope = (
  rawBody: Buffer,
  headers: WebhookHeaders,
  secret: string,
  toleranceMs: number,
): Envelope => {
  const deliveryId = header(headers, "x-webhook-id");
  const eventType = header(headers, "x-webhook-event");
  const timestamp = header(headers, "x-webhook-timestamp");
  const signature = header(headers, "x-webhook-signature");
  if (!deliveryId || !eventType || !timestamp || !signature) {
    throw new AppError("Faltan cabeceras del webhook.", 400);
  }

  const verdict = verifyWebhookSignature({ secret, event: eventType, body: rawBody, timestamp, signature, toleranceMs });
  if (verdict === "bad_signature") throw new AppError("Firma de webhook inválida.", 400);
  if (verdict === "bad_timestamp") throw new AppError("El webhook no tiene una fecha vigente.", 400);

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody.toString("utf8"));
  } catch {
    throw new AppError("Cuerpo de webhook inválido.", 400);
  }
  if (typeof parsed !== "object" || parsed === null) throw new AppError("Cuerpo de webhook inválido.", 400);
  return { deliveryId, eventType, body: parsed as Record<string, unknown> };
};

export type { Envelope };
export { openEnvelope };
```

- [ ] **Step 4: Stub** — reemplazar `stubShippingProvider.ts` completo:

```ts
import { createHash } from "node:crypto";
import { ShipmentTrackingStatus, ShippingCarrier, ShippingProviderName } from "@gira/shared";
import type { ProviderRate, ShippingProvider, TrackingEvent } from "./types.js";
import { openEnvelope } from "./webhookEnvelope.js";

/** Fixed catalogue: same input -> same output, so dev and tests are reproducible. */
const STUB_RATES: ProviderRate[] = [
  { carrier: ShippingCarrier.ESTAFETA, service: "ground", serviceName: "Terrestre", costMxn: 12_000, estimatedDays: 5 },
  { carrier: ShippingCarrier.FEDEX, service: "express", serviceName: "Express", costMxn: 15_000, estimatedDays: 3 },
  { carrier: ShippingCarrier.DHL, service: "next_day", serviceName: "Día siguiente", costMxn: 25_000, estimatedDays: 1 },
];

const STUB_TOLERANCE_MS = 300_000;
const STATUS_VALUES = new Set<string>(Object.values(ShipmentTrackingStatus));

interface StubOptions {
  /** null/absent = the stub rejects webhooks like an unconfigured production would. */
  webhookSecret?: string | null;
}

const createStubShippingProvider = (options: StubOptions = {}): ShippingProvider => {
  const secret = options.webhookSecret ?? null;
  return {
    name: ShippingProviderName.STUB,
    acceptsWebhooks: secret !== null,

    getRates: () => Promise.resolve(STUB_RATES.map((r) => ({ ...r }))),

    createLabel: (input) => {
      const digest = createHash("sha256").update(input.orderRef).digest("hex").slice(0, 12).toUpperCase();
      const rate = STUB_RATES.find((r) => r.carrier === input.carrier && r.service === input.service);
      return Promise.resolve({
        providerShipmentId: `stub-shipment-${digest}`,
        trackingNumber: `STUB${digest}`,
        carrier: input.carrier,
        labelUrl: `https://stub.invalid/labels/${digest}.pdf`,
        trackUrl: `https://stub.invalid/track/STUB${digest}`,
        costMxn: rate?.costMxn ?? 0,
      });
    },

    cancelLabel: () => Promise.resolve(),

    getTracking: (trackingNumbers) =>
      Promise.resolve(
        trackingNumbers.map(
          (trackingNumber): TrackingEvent => ({
            trackingNumber,
            status: ShipmentTrackingStatus.LABEL_CREATED,
            rawStatus: "created",
            occurredAt: new Date(0),
          }),
        ),
      ),

    verifyAndParseWebhook: (rawBody, headers) => {
      if (secret === null) throw new Error("Stub webhook secret is not configured.");
      const { deliveryId, eventType, body } = openEnvelope(rawBody, headers, secret, STUB_TOLERANCE_MS);
      if (eventType !== "tracking.simple") return { deliveryId, eventType, events: [] };
      const data = (body.data ?? {}) as Record<string, unknown>;
      const rawStatus = String(data.status ?? "");
      if (!data.tracking_number || !STATUS_VALUES.has(rawStatus)) return { deliveryId, eventType, events: [] };
      const createdAt = typeof body.created_at === "string" ? new Date(body.created_at) : new Date();
      return {
        deliveryId,
        eventType,
        events: [
          {
            trackingNumber: String(data.tracking_number),
            status: rawStatus as ShipmentTrackingStatus,
            rawStatus,
            ...(typeof data.status_description === "string" ? { description: data.status_description } : {}),
            ...(typeof data.location === "string" ? { location: data.location } : {}),
            occurredAt: Number.isNaN(createdAt.getTime()) ? new Date() : createdAt,
          },
        ],
      };
    },
  };
};

export type { StubOptions };
export { createStubShippingProvider };
```

- [ ] **Step 5: `index.ts` del adapter** — el stub recibe el secreto de `env`:

Reemplazar la línea de `cached ??=` por:

```ts
  cached ??= env.envia
    ? createEnviaShippingProvider(env.envia)
    : createStubShippingProvider({ webhookSecret: env.stubShippingWebhookSecret });
```

y agregar a los `export type { ... }` re-exportados `TrackingEvent, WebhookHeaders, ParsedWebhook,`.

- [ ] **Step 6: `config/env.ts` — variable del stub (prohibida en producción)**

En `interface Env`, después de `envia: EnviaConfig | null;`:

```ts
  /** Dev/test only: lets the stub shipping adapter accept signed webhooks. Forbidden in production. */
  stubShippingWebhookSecret: string | null;
```

Antes de `if (errors.length > 0) {`:

```ts
  const stubShippingWebhookSecret = source.STUB_SHIPPING_WEBHOOK_SECRET?.trim() || null;
  if (stubShippingWebhookSecret && nodeEnv === "production") {
    errors.push("STUB_SHIPPING_WEBHOOK_SECRET no puede usarse en producción.");
  }
```

y en el `Object.freeze<Env>({ ... envia, })` agregar `stubShippingWebhookSecret,` junto a `envia,`.

En `.env.development.example` (después del bloque ENVIA):

```
# Solo desarrollo: permite probar el webhook de rastreo contra el stub (firmado con este secreto).
STUB_SHIPPING_WEBHOOK_SECRET=
```

(No agregarlo a `.env.production.example`.)

Tests en `tests/unit/env.test.ts` (dentro del bloque donde se usa `productionSource()`):

```ts
    it("en producción rechaza STUB_SHIPPING_WEBHOOK_SECRET", () => {
      const source = productionSource();
      source.TELEGRAM_BOT_TOKEN = "123:abc";
      source.TELEGRAM_CHAT_ID = "-100";
      source.STUB_SHIPPING_WEBHOOK_SECRET = "x";
      expect(() => loadEnv(source)).toThrow(/STUB_SHIPPING_WEBHOOK_SECRET/);
    });
```

- [ ] **Step 7: Fake de tests** — reemplazar `tests/helpers/fakeShippingProvider.ts`:

```ts
import { vi, type Mock } from "vitest";
import { ShippingProviderName } from "@gira/shared";
import { createStubShippingProvider } from "../../src/adapters/shipping/stubShippingProvider.js";
import {
  __setShippingProviderForTests,
  type ShippingProvider,
} from "../../src/adapters/shipping/index.js";
import { signWebhook } from "../../src/utils/webhookSignature.js";

type FakeShippingProvider = ShippingProvider & {
  getRates: Mock<ShippingProvider["getRates"]>;
  createLabel: Mock<ShippingProvider["createLabel"]>;
  cancelLabel: Mock<ShippingProvider["cancelLabel"]>;
  getTracking: Mock<ShippingProvider["getTracking"]>;
  verifyAndParseWebhook: Mock<ShippingProvider["verifyAndParseWebhook"]>;
};

const FAKE_WEBHOOK_SECRET = "fake_webhook_secret";

/**
 * Wraps the real stub in spies so a test can count calls or force a failure
 * (`fake.createLabel.mockRejectedValueOnce(new ShippingProviderError(...))`).
 * The webhook secret is configured so the endpoint is live; pass `{ webhookSecret: null }`
 * to test the 503 path. Installs itself as the active provider; call
 * `restoreShippingProvider` in afterEach.
 */
const installFakeShippingProvider = (
  options: { webhookSecret?: string | null } = {},
): FakeShippingProvider => {
  const secret = options.webhookSecret === undefined ? FAKE_WEBHOOK_SECRET : options.webhookSecret;
  const stub = createStubShippingProvider({ webhookSecret: secret });
  const fake: FakeShippingProvider = {
    name: ShippingProviderName.STUB,
    acceptsWebhooks: stub.acceptsWebhooks,
    getRates: vi.fn(stub.getRates),
    createLabel: vi.fn(stub.createLabel),
    cancelLabel: vi.fn(stub.cancelLabel),
    getTracking: vi.fn(stub.getTracking),
    verifyAndParseWebhook: vi.fn(stub.verifyAndParseWebhook),
  };
  __setShippingProviderForTests(fake);
  return fake;
};

const restoreShippingProvider = (): void => __setShippingProviderForTests(undefined);

/** Raw body + headers of a signed `tracking.simple` delivery, as the provider would send it. */
const signedTrackingWebhook = (
  input: { trackingNumber: string; status: string; id?: string; createdAt?: string; secret?: string; timestamp?: string; eventType?: string },
): { body: Buffer; headers: Record<string, string> } => {
  const eventType = input.eventType ?? "tracking.simple";
  const body = Buffer.from(
    JSON.stringify({
      type: eventType,
      created_at: input.createdAt ?? new Date().toISOString(),
      data: { tracking_number: input.trackingNumber, status: input.status, status_description: "Descripción", location: "CDMX" },
    }),
  );
  const timestamp = input.timestamp ?? String(Date.now());
  return {
    body,
    headers: {
      "content-type": "application/json",
      "x-webhook-event": eventType,
      "x-webhook-id": input.id ?? `evt_${Math.random().toString(36).slice(2)}`,
      "x-webhook-timestamp": timestamp,
      "x-webhook-signature": signWebhook({ secret: input.secret ?? FAKE_WEBHOOK_SECRET, event: eventType, body, timestamp }),
    },
  };
};

export type { FakeShippingProvider };
export { installFakeShippingProvider, restoreShippingProvider, signedTrackingWebhook, FAKE_WEBHOOK_SECRET };
```

- [ ] **Step 8: Verde**

Run: `pnpm --filter @gira/api typecheck` (fallará en `enviaShippingProvider.ts` porque el objeto devuelto no cumple el puerto: es esperado, se arregla en Task 4) — para este paso correr solo: `pnpm --filter @gira/api exec vitest run tests/unit/stubTracking.test.ts tests/unit/env.test.ts`
Expected: pasan.

> Nota: el typecheck queda roto hasta terminar Task 4. No avanzar a Task 5 con typecheck rojo.

---

## Task 4: Adapter de Envía — mapeo de estados, `getTracking`, `verifyAndParseWebhook`

**Files:**
- Modify: `apps/api/src/adapters/shipping/enviaShippingProvider.ts`
- Test: `apps/api/tests/unit/enviaTracking.test.ts`

- [ ] **Step 1: Test rojo**

```ts
import { describe, it, expect, vi } from "vitest";
import { ShipmentTrackingStatus, ShippingCarrier } from "@gira/shared";
import { createEnviaShippingProvider, mapEnviaStatus } from "../../src/adapters/shipping/enviaShippingProvider.js";
import { ShippingProviderError } from "../../src/adapters/shipping/types.js";
import { signWebhook } from "../../src/utils/webhookSignature.js";

const CONFIG = {
  apiToken: "tok_test",
  environment: "sandbox" as const,
  carriers: [ShippingCarrier.ESTAFETA],
  webhookSecret: "whsec_envia",
  webhookToleranceMs: 300_000,
};
const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("mapEnviaStatus", () => {
  it.each([
    ["created", ShipmentTrackingStatus.LABEL_CREATED],
    ["Picked Up", ShipmentTrackingStatus.PICKED_UP],
    ["picked_up", ShipmentTrackingStatus.PICKED_UP],
    ["shipped", ShipmentTrackingStatus.IN_TRANSIT],
    ["in transit", ShipmentTrackingStatus.IN_TRANSIT],
    ["Out for Delivery", ShipmentTrackingStatus.OUT_FOR_DELIVERY],
    ["delivered", ShipmentTrackingStatus.DELIVERED],
    ["Lost", ShipmentTrackingStatus.LOST],
    ["returned", ShipmentTrackingStatus.RETURNED],
    ["Delayed", ShipmentTrackingStatus.EXCEPTION],
    ["Address error", ShipmentTrackingStatus.EXCEPTION],
    [8, ShipmentTrackingStatus.PICKED_UP],
    [3, ShipmentTrackingStatus.DELIVERED],
    ["9", ShipmentTrackingStatus.OUT_FOR_DELIVERY],
    [22, ShipmentTrackingStatus.EXCEPTION],
  ])("%s -> %s", (raw, expected) => {
    expect(mapEnviaStatus(raw)).toBe(expected);
  });

  it.each(["canceled", "N/A", "information", "algo raro", 4, 6, 999, undefined, null])(
    "descarta %s",
    (raw) => {
      expect(mapEnviaStatus(raw)).toBeNull();
    },
  );
});

describe("enviaShippingProvider · verifyAndParseWebhook", () => {
  const provider = createEnviaShippingProvider(CONFIG);
  const make = (status: string, over: { secret?: string; ts?: string; event?: string } = {}) => {
    const event = over.event ?? "tracking.simple";
    const body = Buffer.from(JSON.stringify({
      type: event, created_at: "2026-10-19T12:00:00Z",
      data: { shipment_id: 1, tracking_number: "T123", carrier_name: "estafeta", status, status_description: "Paquete recolectado", location: "Mexico City, MX" },
    }));
    const ts = over.ts ?? String(Date.now());
    return { body, headers: {
      "x-webhook-event": event, "x-webhook-id": "d1", "x-webhook-timestamp": ts,
      "x-webhook-signature": signWebhook({ secret: over.secret ?? CONFIG.webhookSecret, event, body, timestamp: ts }),
    } };
  };

  it("reporta que acepta webhooks solo con secreto", () => {
    expect(provider.acceptsWebhooks).toBe(true);
    expect(createEnviaShippingProvider({ ...CONFIG, webhookSecret: null }).acceptsWebhooks).toBe(false);
  });

  it("normaliza un tracking.simple firmado", () => {
    const { body, headers } = make("picked up");
    const parsed = provider.verifyAndParseWebhook(body, headers);
    expect(parsed.deliveryId).toBe("d1");
    expect(parsed.events).toEqual([{
      trackingNumber: "T123", status: ShipmentTrackingStatus.PICKED_UP, rawStatus: "picked up",
      description: "Paquete recolectado", location: "Mexico City, MX", occurredAt: new Date("2026-10-19T12:00:00Z"),
    }]);
  });

  it("devuelve sin eventos para un estado que no usamos o un tipo ajeno", () => {
    const a = make("canceled");
    expect(provider.verifyAndParseWebhook(a.body, a.headers).events).toEqual([]);
    const b = make("delivered", { event: "surcharge" });
    expect(provider.verifyAndParseWebhook(b.body, b.headers).events).toEqual([]);
  });

  it("lanza 400 con firma de otro secreto o timestamp viejo", () => {
    const bad = make("delivered", { secret: "otro" });
    expect(() => provider.verifyAndParseWebhook(bad.body, bad.headers)).toThrow(/firma/i);
    const old = make("delivered", { ts: String(Date.now() - 3_600_000) });
    expect(() => provider.verifyAndParseWebhook(old.body, old.headers)).toThrow(/vigente/i);
  });
});

describe("enviaShippingProvider · getTracking", () => {
  const entry = (trackingNumber: string, status: string, at = "2026-10-19T12:00:00Z") => ({
    trackingNumber, status, statusDescription: "ok", location: "CDMX", date: at,
  });

  it("llama a generaltrack por lotes de 50 y normaliza la respuesta", async () => {
    const numbers = Array.from({ length: 51 }, (_, i) => `T${String(i)}`);
    const fetchMock = vi.fn((_u: string, init?: RequestInit) => {
      const sent = (JSON.parse(String(init?.body)) as { trackingNumbers: string[] }).trackingNumbers;
      return Promise.resolve(json({ meta: "tracking", data: sent.map((n) => entry(n, "Delivered")) }));
    });
    const out = await createEnviaShippingProvider(CONFIG, fetchMock as unknown as typeof fetch).getTracking(numbers, {});
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]![0]).toBe("https://api-test.envia.com/ship/generaltrack/");
    expect(out).toHaveLength(51);
    expect(out[0]).toMatchObject({ trackingNumber: "T0", status: ShipmentTrackingStatus.DELIVERED });
  });

  it("ignora entradas sin estado reconocible o sin guía", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(json({ data: [entry("A", "mystery"), { status: "delivered" }, entry("B", "In Transit")] })));
    const out = await createEnviaShippingProvider(CONFIG, fetchMock as unknown as typeof fetch).getTracking(["A", "B"], {});
    expect(out.map((e) => e.trackingNumber)).toEqual(["B"]);
  });

  it("meta:error con HTTP 200, 5xx y red caída -> unavailable", async () => {
    for (const make of [
      () => Promise.resolve(json({ meta: "error", error: { message: "boom" } })),
      () => Promise.resolve(json({}, 503)),
      () => Promise.reject(new Error("socket")),
    ]) {
      const provider = createEnviaShippingProvider(CONFIG, vi.fn(make) as unknown as typeof fetch);
      await expect(provider.getTracking(["T1"], {})).rejects.toMatchObject({ kind: "unavailable" });
    }
    await expect(
      createEnviaShippingProvider(CONFIG, vi.fn(() => Promise.resolve(json({}, 503))) as unknown as typeof fetch).getTracking(["T1"], {}),
    ).rejects.toBeInstanceOf(ShippingProviderError);
  });
});
```

Run: `pnpm --filter @gira/api exec vitest run tests/unit/enviaTracking.test.ts` → FAIL.

- [ ] **Step 2: Implementación en `enviaShippingProvider.ts`**

Agregar imports: `ShipmentTrackingStatus` (de `@gira/shared`), `TrackingEvent` (de `./types.js`), `openEnvelope` de `./webhookEnvelope.js`.

Antes de `const createEnviaShippingProvider`, agregar la tabla y el mapeo:

```ts
const TRACKING_BATCH = 50;
const TRACK_TIMEOUT_MS = 15_000;

/**
 * Envía status ids (docs.envia.com, "Track Shipments": 1–28) and the lower-cased
 * names its webhook/tracking use. One table: ids and names map to the same value.
 * Unknown or non-actionable statuses (canceled, information, N/A) map to null and are dropped.
 */
const STATUS_BY_ID: Record<number, ShipmentTrackingStatus> = {
  1: ShipmentTrackingStatus.LABEL_CREATED, // Created
  2: ShipmentTrackingStatus.IN_TRANSIT, // Shipped
  3: ShipmentTrackingStatus.DELIVERED,
  7: ShipmentTrackingStatus.LABEL_CREATED, // Pending
  8: ShipmentTrackingStatus.PICKED_UP,
  9: ShipmentTrackingStatus.OUT_FOR_DELIVERY,
  10: ShipmentTrackingStatus.LOST,
  11: ShipmentTrackingStatus.RETURNED,
  12: ShipmentTrackingStatus.EXCEPTION, // Pickup at office
  13: ShipmentTrackingStatus.RETURNED, // Delivered at origin
  14: ShipmentTrackingStatus.EXCEPTION, // Damaged
  15: ShipmentTrackingStatus.IN_TRANSIT, // Redirected
  16: ShipmentTrackingStatus.LABEL_CREATED, // Out for pickup
  17: ShipmentTrackingStatus.EXCEPTION,
  18: ShipmentTrackingStatus.EXCEPTION,
  19: ShipmentTrackingStatus.EXCEPTION,
  20: ShipmentTrackingStatus.EXCEPTION, // Return problem
  21: ShipmentTrackingStatus.EXCEPTION, // Address error
  22: ShipmentTrackingStatus.EXCEPTION, // Undeliverable
  23: ShipmentTrackingStatus.EXCEPTION, // Delayed
  24: ShipmentTrackingStatus.EXCEPTION, // Rejected
  25: ShipmentTrackingStatus.LABEL_CREATED, // 1 pickup attempt
  26: ShipmentTrackingStatus.IN_TRANSIT, // Partially shipped
  27: ShipmentTrackingStatus.EXCEPTION, // Partially delivered
  28: ShipmentTrackingStatus.EXCEPTION, // Delivery attempt
};

const STATUS_BY_NAME: Record<string, ShipmentTrackingStatus> = {
  created: ShipmentTrackingStatus.LABEL_CREATED,
  pending: ShipmentTrackingStatus.LABEL_CREATED,
  "label created": ShipmentTrackingStatus.LABEL_CREATED,
  "out for pickup": ShipmentTrackingStatus.LABEL_CREATED,
  "picked up": ShipmentTrackingStatus.PICKED_UP,
  picked_up: ShipmentTrackingStatus.PICKED_UP,
  pickedup: ShipmentTrackingStatus.PICKED_UP,
  shipped: ShipmentTrackingStatus.IN_TRANSIT,
  "in transit": ShipmentTrackingStatus.IN_TRANSIT,
  in_transit: ShipmentTrackingStatus.IN_TRANSIT,
  intransit: ShipmentTrackingStatus.IN_TRANSIT,
  redirected: ShipmentTrackingStatus.IN_TRANSIT,
  "out for delivery": ShipmentTrackingStatus.OUT_FOR_DELIVERY,
  out_for_delivery: ShipmentTrackingStatus.OUT_FOR_DELIVERY,
  delivered: ShipmentTrackingStatus.DELIVERED,
  lost: ShipmentTrackingStatus.LOST,
  returned: ShipmentTrackingStatus.RETURNED,
  "delivered at origin": ShipmentTrackingStatus.RETURNED,
  damaged: ShipmentTrackingStatus.EXCEPTION,
  delayed: ShipmentTrackingStatus.EXCEPTION,
  rejected: ShipmentTrackingStatus.EXCEPTION,
  undeliverable: ShipmentTrackingStatus.EXCEPTION,
  "address error": ShipmentTrackingStatus.EXCEPTION,
  "return problem": ShipmentTrackingStatus.EXCEPTION,
  "pickup at office": ShipmentTrackingStatus.EXCEPTION,
  "delivery attempt": ShipmentTrackingStatus.EXCEPTION,
  "1 delivery attempt": ShipmentTrackingStatus.EXCEPTION,
  "2 delivery attempts": ShipmentTrackingStatus.EXCEPTION,
  "3 delivery attempts": ShipmentTrackingStatus.EXCEPTION,
  exception: ShipmentTrackingStatus.EXCEPTION,
};

/** Maps a provider status (id or text) to ours; null = not actionable. */
const mapEnviaStatus = (raw: unknown): ShipmentTrackingStatus | null => {
  if (typeof raw === "number") return STATUS_BY_ID[raw] ?? null;
  if (typeof raw !== "string") return null;
  const text = raw.trim().toLowerCase();
  if (/^\d+$/.test(text)) return STATUS_BY_ID[Number(text)] ?? null;
  return STATUS_BY_NAME[text] ?? null;
};

const toDate = (value: unknown): Date => {
  const date = typeof value === "string" || typeof value === "number" ? new Date(value) : new Date(NaN);
  return Number.isNaN(date.getTime()) ? new Date() : date;
};

const toTrackingEvent = (entry: Record<string, unknown>): TrackingEvent | null => {
  const trackingNumber = entry.trackingNumber ?? entry.tracking_number;
  const rawStatus = entry.status;
  const status = mapEnviaStatus(rawStatus);
  if (!trackingNumber || !status) return null;
  const description = entry.statusDescription ?? entry.status_description;
  const location = entry.location;
  return {
    trackingNumber: String(trackingNumber),
    status,
    rawStatus: String(rawStatus),
    ...(typeof description === "string" && description ? { description } : {}),
    ...(typeof location === "string" && location ? { location } : {}),
    occurredAt: toDate(entry.date ?? entry.eventDate ?? entry.updatedAt),
  };
};
```

Dentro de `createEnviaShippingProvider`, antes del `return`, agregar:

```ts
  /**
   * The response shape of /ship/generaltrack/ is NOT documented: this accepts the
   * common envelopes defensively (data[] or data.shipments[]; entries may carry
   * a history[] of events). Confirm against the sandbox (docs/SETUP-REQUERIDO.md).
   */
  const getTracking: ShippingProvider["getTracking"] = async (trackingNumbers, options) => {
    const events: TrackingEvent[] = [];
    for (let i = 0; i < trackingNumbers.length; i += TRACKING_BATCH) {
      const batch = trackingNumbers.slice(i, i + TRACKING_BATCH);
      let res: RawResponse;
      try {
        res = await post("/ship/generaltrack/", { trackingNumbers: batch }, TRACK_TIMEOUT_MS, options);
      } catch {
        throw new ShippingProviderError("unavailable", "Envía no respondió al consultar el rastreo.");
      }
      const unwrapped = unwrap(res);
      if (unwrapped.failed) {
        throw new ShippingProviderError("unavailable", unwrapped.message);
      }
      const data = unwrapped.data as unknown;
      const list = Array.isArray(data)
        ? data
        : Array.isArray((data as { shipments?: unknown } | undefined)?.shipments)
          ? ((data as { shipments: unknown[] }).shipments)
          : [];
      for (const raw of list as Array<Record<string, unknown>>) {
        const history = Array.isArray(raw.history) ? (raw.history as Array<Record<string, unknown>>) : [];
        const carrierTracking = raw.trackingNumber ?? raw.tracking_number;
        const candidates = history.length > 0 ? history.map((h) => ({ trackingNumber: carrierTracking, ...h })) : [raw];
        for (const candidate of candidates) {
          const event = toTrackingEvent(candidate);
          if (event) events.push(event);
        }
      }
    }
    return events;
  };

  const verifyAndParseWebhook: ShippingProvider["verifyAndParseWebhook"] = (rawBody, headers) => {
    if (!config.webhookSecret) throw new Error("ENVIA_WEBHOOK_SECRET is not configured.");
    const { deliveryId, eventType, body } = openEnvelope(rawBody, headers, config.webhookSecret, config.webhookToleranceMs);
    if (eventType !== "tracking.simple") return { deliveryId, eventType, events: [] };
    const data = (body.data ?? {}) as Record<string, unknown>;
    const event = toTrackingEvent({ ...data, date: body.created_at });
    return { deliveryId, eventType, events: event ? [event] : [] };
  };
```

Y el `return` final pasa a:

```ts
  return {
    name: ShippingProviderName.ENVIA,
    acceptsWebhooks: config.webhookSecret !== null,
    getRates,
    createLabel,
    cancelLabel,
    getTracking,
    verifyAndParseWebhook,
  };
```

y el export final a `export { createEnviaShippingProvider, mapEnviaStatus };`.

- [ ] **Step 3: Verde**

Run: `pnpm --filter @gira/api exec vitest run tests/unit/enviaTracking.test.ts tests/unit/enviaProvider.test.ts tests/unit/stubTracking.test.ts && pnpm --filter @gira/api typecheck`
Expected: todo pasa; typecheck limpio.

- [ ] **Step 4: Commit sugerido (NO ejecutar)**

`git add apps/api packages/shared && git commit -m "FEAT: shipping adapter tracking port (stub + Envía) and signature verification"`

---

## Task 5: Modelo — `Order.tracking/shippedAt/deliveredAt`, `ShipmentTrackingEvent`, `where` en la transición, reglas de avance

**Files:**
- Modify: `apps/api/src/models/Order.ts`, `services/orderTransitionService.ts`, `utils/orderTransitions.ts`
- Create: `apps/api/src/models/ShipmentTrackingEvent.ts`, `apps/api/src/utils/trackingProgress.ts`
- Test: `apps/api/tests/unit/trackingProgress.test.ts`, `apps/api/tests/unit/orderTransitions.test.ts` (ajuste de mensaje)

- [ ] **Step 1: Test rojo de `trackingProgress`**

```ts
import { describe, it, expect } from "vitest";
import { ShipmentTrackingStatus as S } from "@gira/shared";
import { canAdvanceTracking } from "../../src/utils/trackingProgress.js";

const t0 = new Date("2026-10-19T10:00:00Z");
const t1 = new Date("2026-10-19T11:00:00Z");

describe("canAdvanceTracking", () => {
  it("avanza desde nada", () => {
    expect(canAdvanceTracking(undefined, { status: S.PICKED_UP, occurredAt: t0 })).toBe(true);
  });
  it("avanza hacia adelante y permite igual rango (in_transit <-> exception)", () => {
    expect(canAdvanceTracking({ status: S.PICKED_UP, lastEventAt: t0 }, { status: S.IN_TRANSIT, occurredAt: t1 })).toBe(true);
    expect(canAdvanceTracking({ status: S.IN_TRANSIT, lastEventAt: t0 }, { status: S.EXCEPTION, occurredAt: t1 })).toBe(true);
    expect(canAdvanceTracking({ status: S.EXCEPTION, lastEventAt: t0 }, { status: S.IN_TRANSIT, occurredAt: t1 })).toBe(true);
  });
  it("no retrocede", () => {
    expect(canAdvanceTracking({ status: S.OUT_FOR_DELIVERY, lastEventAt: t0 }, { status: S.IN_TRANSIT, occurredAt: t1 })).toBe(false);
  });
  it("no acepta un evento más viejo que el último", () => {
    expect(canAdvanceTracking({ status: S.IN_TRANSIT, lastEventAt: t1 }, { status: S.OUT_FOR_DELIVERY, occurredAt: t0 })).toBe(false);
  });
  it("un estado terminal no se mueve", () => {
    for (const s of [S.DELIVERED, S.RETURNED, S.LOST]) {
      expect(canAdvanceTracking({ status: s, lastEventAt: t0 }, { status: S.EXCEPTION, occurredAt: t1 })).toBe(false);
    }
  });
});
```

Run → FAIL (módulo inexistente).

- [ ] **Step 2: `utils/trackingProgress.ts`**

```ts
import { ShipmentTrackingStatus as S } from "@gira/shared";

/** Forward-only ladder. Equal rank may swap (in_transit <-> exception); rank 4 is terminal. */
const RANK: Record<S, number> = {
  [S.LABEL_CREATED]: 0,
  [S.PICKED_UP]: 1,
  [S.IN_TRANSIT]: 2,
  [S.EXCEPTION]: 2,
  [S.OUT_FOR_DELIVERY]: 3,
  [S.DELIVERED]: 4,
  [S.RETURNED]: 4,
  [S.LOST]: 4,
};

const TERMINAL_RANK = 4;

interface CurrentTracking {
  status: S;
  lastEventAt?: Date | undefined;
}

interface IncomingTracking {
  status: S;
  occurredAt: Date;
}

/** Whether an event may overwrite `order.tracking`. Out-of-order or replayed events must not roll it back. */
const canAdvanceTracking = (current: CurrentTracking | undefined, incoming: IncomingTracking): boolean => {
  if (!current) return true;
  if (RANK[current.status] >= TERMINAL_RANK) return false;
  if (RANK[incoming.status] < RANK[current.status]) return false;
  if (current.lastEventAt && incoming.occurredAt.getTime() < current.lastEventAt.getTime()) return false;
  return true;
};

export type { CurrentTracking, IncomingTracking };
export { canAdvanceTracking, RANK };
```

Run → 5 passed.

- [ ] **Step 3: `Order.ts` — campos e índice**

Importar `ShipmentTrackingStatus` en el import de `@gira/shared`. Agregar tras `interface OrderLabel`:

```ts
interface OrderTracking {
  status: ShipmentTrackingStatus;
  lastEventAt?: Date;
  /** Last time the polling job asked the provider about this parcel. */
  lastSyncedAt?: Date;
}
```

En `OrderAttrs`, después de `label?: OrderLabel;`:

```ts
  /** Parcel progress mirrored from the carrier (webhook + polling). */
  tracking?: OrderTracking;
  /** When the parcel left: set once by "Marcar enviado" or by the carrier's first scan. */
  shippedAt?: Date;
  deliveredAt?: Date;
```

Schema (junto a `orderLabelSchema`):

```ts
const orderTrackingSchema = new Schema<OrderTracking>(
  {
    status: { type: String, enum: Object.values(ShipmentTrackingStatus), required: true },
    lastEventAt: { type: Date },
    lastSyncedAt: { type: Date },
  },
  { _id: false },
);
```

En `orderSchema`, junto al campo `label:` agregar:

```ts
    tracking: { type: orderTrackingSchema },
    shippedAt: { type: Date },
    deliveredAt: { type: Date },
```

Índice (después del de `label.trackingNumber`):

```ts
// Tracking poll: parcels with a ready label that are still in flight, oldest sync first.
orderSchema.index(
  { status: 1, "tracking.lastSyncedAt": 1 },
  { partialFilterExpression: { "label.status": "ready" } },
);
```

Exportar el tipo: agregar `OrderTracking` a `export type { ... }`.

- [ ] **Step 4: `models/ShipmentTrackingEvent.ts`**

```ts
import { Schema, model, type HydratedDocument, type Types } from "mongoose";
import { ShipmentTrackingStatus } from "@gira/shared";

/**
 * One carrier status change. Append-only history for the logistics card and for
 * support; `Order.tracking` is the derived "current" value. The unique
 * (provider, providerEventId) index is the idempotency guarantee: a webhook
 * redelivery and a polling run that sees the same fact insert only once.
 */
interface ShipmentTrackingEventAttrs {
  order: Types.ObjectId;
  provider: string;
  providerEventId: string;
  trackingNumber: string;
  status: ShipmentTrackingStatus;
  rawStatus: string;
  description?: string;
  location?: string;
  occurredAt: Date;
  createdAt: Date;
}

const shipmentTrackingEventSchema = new Schema<ShipmentTrackingEventAttrs>(
  {
    order: { type: Schema.Types.ObjectId, ref: "Order", required: true },
    provider: { type: String, required: true },
    providerEventId: { type: String, required: true },
    trackingNumber: { type: String, required: true },
    status: { type: String, enum: Object.values(ShipmentTrackingStatus), required: true },
    rawStatus: { type: String, required: true, maxlength: 200 },
    description: { type: String, maxlength: 500 },
    location: { type: String, maxlength: 200 },
    occurredAt: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

shipmentTrackingEventSchema.index({ provider: 1, providerEventId: 1 }, { unique: true });
shipmentTrackingEventSchema.index({ order: 1, occurredAt: 1 });

const ShipmentTrackingEvent = model<ShipmentTrackingEventAttrs>("ShipmentTrackingEvent", shipmentTrackingEventSchema);

type ShipmentTrackingEventDocument = HydratedDocument<ShipmentTrackingEventAttrs>;

export type { ShipmentTrackingEventAttrs, ShipmentTrackingEventDocument };
export { ShipmentTrackingEvent };
```

- [ ] **Step 5: `applyOrderTransition` con `where`**

En `orderTransitionService.ts`, en `TransitionInput` agregar:

```ts
  /** Extra conditions for the SAME atomic filter (e.g. the label is still ready). */
  where?: Record<string, unknown>;
```

y en la función: `const { orderId, from, to, actor, reason, set, session, where } = input;` y el filtro pasa a `{ ...where, _id: orderId, status: from }`.

- [ ] **Step 6: Mensaje 403 de `assertAdminTransition`** (en `utils/orderTransitions.ts`, el texto que hoy dice "Este estado se marca desde el envío…"):

Reemplazarlo por: `"Usa «Marcar enviado»; la entrega la marca la paquetería."`

Actualizar el test que lo asserte en `tests/unit/orderTransitions.test.ts:147-156` al nuevo texto (`toThrow(/Marcar enviado/)`).

- [ ] **Step 7: Verde**

Run: `pnpm --filter @gira/api typecheck && pnpm --filter @gira/api exec vitest run tests/unit/trackingProgress.test.ts tests/unit/orderTransitions.test.ts`
Expected: typecheck limpio; tests pasan.

- [ ] **Step 8: Commit sugerido (NO ejecutar)**

`git add apps/api && git commit -m "FEAT: order tracking fields, tracking events model, forward-only rules"`

---

## Task 6: Correos — snapshot, enviado, entregado, incidencia

**Files:**
- Create: `apps/api/src/utils/orderEmailSnapshot.ts`
- Modify: `apps/api/src/templates/orderEmails.ts`, `templates/teamMessages.ts`, `jobs/dispatchNotifications.ts`, `services/orderPaymentService.ts`, `services/adminOrderService.ts`
- Test: `apps/api/tests/unit/orderEmails.test.ts`, `tests/unit/teamMessages.test.ts`

- [ ] **Step 1: Tests rojos** — agregar a `tests/unit/orderEmails.test.ts` (importar `renderOrderShipped, renderOrderDelivered`):

```ts
const shipped = {
  ...snapshot,
  carrierName: "Estafeta",
  trackingNumber: "794644790138",
  trackUrl: "https://envia.test/track/794644790138",
};

describe("renderOrderShipped", () => {
  const mail = renderOrderShipped(shipped);
  it("usa el folio en el asunto y nunca el publicId", () => {
    expect(mail.subject).toBe("Tu pedido GC-7KQ2M9XA va en camino");
    expect(mail.subject).not.toContain("abc123");
  });
  it("muestra paquetería por nombre, guía y el enlace de rastreo de la paquetería", () => {
    expect(mail.html).toContain("Estafeta");
    expect(mail.html).toContain("794644790138");
    expect(mail.html).toContain("https://envia.test/track/794644790138");
    expect(mail.text).toContain("https://envia.test/track/794644790138");
  });
  it("el publicId solo aparece en el enlace propio", () => {
    expect(mail.html).toContain("/orden/abc123/seguimiento");
    expect(mail.html.replace("/orden/abc123/seguimiento", "")).not.toContain("abc123");
  });
  it("omite el enlace de la paquetería si no hay trackUrl y escapa el HTML", () => {
    const m = renderOrderShipped({ ...shipped, trackUrl: undefined, carrierName: "<b>x</b>" });
    expect(m.html).not.toContain("<b>x</b>");
    expect(m.html).not.toContain("undefined");
  });
});

describe("renderOrderDelivered", () => {
  const mail = renderOrderDelivered(shipped);
  it("avisa que llegó, con folio y guía", () => {
    expect(mail.subject).toBe("Tu pedido GC-7KQ2M9XA llegó");
    expect(mail.html).toContain("794644790138");
    expect(mail.text).toContain("Folio: GC-7KQ2M9XA");
  });
  it("no filtra el publicId fuera del enlace", () => {
    expect(mail.html.replace("/orden/abc123", "")).not.toContain("abc123");
  });
});
```

(Si el archivo ya tenía un `describe("renderOrderShipped"...)` viejo con `carrier:`, reemplazarlo.) En `tests/unit/teamMessages.test.ts:37` ajustar la expectativa de `renderTeamShipmentIncident("GC-1", "lost", "Estafeta")` a `lines` que contienen `"Estado: Extraviado"` (la función recibirá la **etiqueta ya traducida**; ver Step 4).

Run → FAIL.

- [ ] **Step 2: `utils/orderEmailSnapshot.ts`**

```ts
import { SHIPPING_CARRIER_LABELS } from "@gira/shared";
import type { OrderDocument } from "../models/Order.js";
import type { OrderEmailSnapshot, ShippedEmailSnapshot } from "../templates/orderEmails.js";

/**
 * The flat payload every customer email is rendered from, frozen at enqueue time.
 * One builder for confirmation, preparing, shipped and delivered so the shape cannot drift.
 */
const toOrderEmailSnapshot = (order: OrderDocument): OrderEmailSnapshot => ({
  publicId: order.publicId,
  orderNumber: order.orderNumber,
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
});

/** Shipped/delivered emails carry the parcel. Null when the order has no usable label. */
const toShipmentEmailSnapshot = (order: OrderDocument): ShippedEmailSnapshot | null => {
  const label = order.label;
  if (!label?.trackingNumber || !label.carrier) return null;
  return {
    ...toOrderEmailSnapshot(order),
    carrierName: SHIPPING_CARRIER_LABELS[label.carrier],
    trackingNumber: label.trackingNumber,
    ...(label.trackUrl ? { trackUrl: label.trackUrl } : {}),
  };
};

export { toOrderEmailSnapshot, toShipmentEmailSnapshot };
```

- [ ] **Step 3: Sustituir los payloads inline** por el builder:
- `orderPaymentService.ts` (`queueOrderPaidNotifications`): `payload: toOrderEmailSnapshot(order) as unknown as Record<string, unknown>,` (el tipo `payload` es `Record<string, unknown>`; el cast es seguro porque es un objeto plano). Agregar el import.
- `adminOrderService.ts` (rama `OrderStatus.PROCESSING`): mismo reemplazo. Actualizar el comentario de arriba a: `// Only PROCESSING triggers a customer email here; SHIPPED/DELIVERED belong to "Marcar enviado" and the carrier's tracking.`

- [ ] **Step 4: `templates/orderEmails.ts`**

Reemplazar `ShippedEmailSnapshot`:

```ts
interface ShippedEmailSnapshot extends OrderEmailSnapshot {
  /** Display name ("Estafeta"), resolved at enqueue time. */
  carrierName: string;
  trackingNumber: string;
  /** The carrier's own tracking page; absent if the provider gave none. */
  trackUrl?: string | undefined;
}
```

Reemplazar `renderOrderShipped` y agregar `renderOrderDelivered`:

```ts
const parcelHtml = (s: ShippedEmailSnapshot): string =>
  `<p>Paquetería: <strong>${escapeHtml(s.carrierName)}</strong><br>` +
  `Número de guía: <strong>${escapeHtml(s.trackingNumber)}</strong></p>` +
  (s.trackUrl ? `<p><a href="${escapeHtml(s.trackUrl)}">Rastrear con la paquetería</a></p>` : "");

const parcelText = (s: ShippedEmailSnapshot): string =>
  `Paquetería: ${s.carrierName}\nNúmero de guía: ${s.trackingNumber}` +
  (s.trackUrl ? `\nRastrear con la paquetería: ${s.trackUrl}` : "");

const renderOrderShipped = (snapshot: ShippedEmailSnapshot): RenderedMail => ({
  subject: `Tu pedido ${snapshot.orderNumber} va en camino`,
  html: layout(
    `${snapshot.customerName}, tu pedido ya salió`,
    folioHtml(snapshot) +
      parcelHtml(snapshot) +
      `<p><a href="${trackingUrl(snapshot.publicId)}">Seguir mi envío</a></p>`,
  ),
  text:
    `${snapshot.customerName}, tu pedido ya salió.\nFolio: ${snapshot.orderNumber}\n\n` +
    `${parcelText(snapshot)}\n\nSeguir mi envío: ${trackingUrl(snapshot.publicId)}`,
});

const renderOrderDelivered = (snapshot: ShippedEmailSnapshot): RenderedMail => ({
  subject: `Tu pedido ${snapshot.orderNumber} llegó`,
  html: layout(
    `${snapshot.customerName}, ¡tu pedido llegó!`,
    `<p>La paquetería marcó tu pedido como entregado. Esperamos que lo disfrutes.</p>` +
      folioHtml(snapshot) +
      parcelHtml(snapshot) +
      `<p><a href="${orderUrl(snapshot.publicId)}">Ver mi pedido</a></p>`,
  ),
  text:
    `${snapshot.customerName}, ¡tu pedido llegó!\nFolio: ${snapshot.orderNumber}\n\n` +
    `${parcelText(snapshot)}\n\nVer mi pedido: ${orderUrl(snapshot.publicId)}`,
});
```

y exportar `renderOrderDelivered` en la lista de valores.

**`templates/teamMessages.ts`** — `renderTeamShipmentIncident(orderNumber, statusLabel, carrierName)` queda con la misma firma (ya recibe strings). La traducción se hace al encolar (Task 7) con `SHIPMENT_TRACKING_STATUS_LABELS`. Ajustar solo el texto de línea: `Estado: ${status}` se mantiene.

- [ ] **Step 5: `jobs/dispatchNotifications.ts`**

Agregar `renderOrderDelivered` al import y, tras el `case ORDER_SHIPPED`:

```ts
    case NotificationType.ORDER_DELIVERED:
      return renderOrderDelivered(payload as ShippedEmailSnapshot);
```

El `case TEAM_SHIPMENT_INCIDENT` queda como está (payload `{orderNumber, status, carrier}`).

- [ ] **Step 6: Web — etiqueta de ORDER_DELIVERED** (obligatoria: `NOTIFICATION_TYPE_LABELS` es un `Record` y el build falla sin ella). En `apps/web/src/components/resumen/OutboxHealthPanel.tsx`, junto a la línea de `ORDER_SHIPPED`:

```ts
  [NotificationType.ORDER_DELIVERED]: "correo de pedido entregado",
```

(Seguir el estilo de las etiquetas vecinas; ajustar el texto para que coincida con ellas.)

- [ ] **Step 7: Verde**

Run: `pnpm --filter @gira/api typecheck && pnpm --filter @gira/api exec vitest run tests/unit/orderEmails.test.ts tests/unit/teamMessages.test.ts tests/integration/dispatchNotifications.test.ts tests/integration/adminOrderStatus.test.ts` (si algún nombre de archivo no existe, usar `pnpm --filter @gira/api exec vitest run tests/integration -t "preparando|confirmación"`).
Expected: pasan. El typecheck de la API **aún** fallará en `shipmentService.ts` (usa `carrier` en el snapshot viejo): se resuelve borrándolo en Task 11; hasta entonces ignorar solo ese error.

- [ ] **Step 8: Commit sugerido (NO ejecutar)**

---

## Task 7: `shipmentTrackingService` — núcleo (tests rojos primero)

**Files:**
- Create: `apps/api/src/services/shipmentTrackingService.ts`
- Test: `apps/api/tests/integration/trackingConvergence.test.ts`, `apps/api/tests/integration/markShipped.test.ts`

Helper de estos tests (copiar al inicio de ambos archivos):

```ts
import { beforeEach, afterEach, describe, it, expect } from "vitest";
import { DisputeStatus, NotificationType, OrderStatus, ShipmentTrackingStatus as S, ShippingLabelStatus } from "@gira/shared";
import { buildApp } from "../../src/app.js";
import { Order, type OrderDocument } from "../../src/models/Order.js";
import { Notification } from "../../src/models/Notification.js";
import { AuditLog } from "../../src/models/AuditLog.js";
import { ShipmentTrackingEvent } from "../../src/models/ShipmentTrackingEvent.js";
import { settleLabelWork } from "../../src/services/shippingLabelService.js";
import { applyPaymentSucceeded } from "../../src/services/orderPaymentService.js";
import { installFakeShippingProvider, restoreShippingProvider } from "../helpers/fakeShippingProvider.js";
import { loginAsAdmin } from "../helpers/auth.js";
import { createPendingOrder, seedCatalogVariant } from "../helpers/orders.js";

const app = buildApp();
let variantId: string;

beforeEach(async () => {
  installFakeShippingProvider();
  const cookie = await loginAsAdmin(app);
  variantId = await seedCatalogVariant(app, cookie, "TRACK", 200);
});
afterEach(restoreShippingProvider);

/** An order that is PAID with a READY label, optionally advanced to `status`. */
const paidOrderWithLabel = async (status: OrderStatus = OrderStatus.PAID): Promise<OrderDocument> => {
  const order = await createPendingOrder(variantId);
  await applyPaymentSucceeded(order._id);
  await settleLabelWork();
  if (status !== OrderStatus.PAID) await Order.updateOne({ _id: order._id }, { $set: { status } });
  const fresh = await Order.findById(order._id);
  if (fresh?.label?.status !== ShippingLabelStatus.READY) throw new Error("label not ready in fixture");
  return fresh;
};

const ev = (order: OrderDocument, status: S, minute = 0, id = `e-${status}-${String(minute)}`) => ({
  trackingNumber: order.label!.trackingNumber!,
  status,
  rawStatus: status,
  occurredAt: new Date(Date.UTC(2026, 9, 19, 10, minute)),
  providerEventId: id,
});

const notifications = (order: OrderDocument, type: NotificationType) =>
  Notification.find({ order: order._id, type }).lean();
```

> Los nombres reales de helper pueden diferir ligeramente (`createPendingOrder(variantId)` ya devuelve el documento; `applyPaymentSucceeded` mueve a paid y encola la guía). Verificar con `tests/integration/shippingLabel.test.ts` y copiar su armado exacto si algo no coincide.

- [ ] **Step 1: Tests rojos de convergencia** (`trackingConvergence.test.ts`)

```ts
import { applyTrackingEvents } from "../../src/services/shipmentTrackingService.js";

const PROVIDER = "stub";

describe("applyTrackingEvents · convergencia", () => {
  it("processing + picked_up -> shipped, shippedAt y un solo correo", async () => {
    const order = await paidOrderWithLabel(OrderStatus.PROCESSING);
    await applyTrackingEvents(PROVIDER, [ev(order, S.PICKED_UP)]);
    await applyTrackingEvents(PROVIDER, [ev(order, S.IN_TRANSIT, 5)]);
    const fresh = await Order.findById(order._id).lean();
    expect(fresh?.status).toBe(OrderStatus.SHIPPED);
    expect(fresh?.shippedAt).toBeInstanceOf(Date);
    expect(fresh?.tracking?.status).toBe(S.IN_TRANSIT);
    expect(await notifications(order, NotificationType.ORDER_SHIPPED)).toHaveLength(1);
    const history = fresh?.statusHistory.map((h) => h.status);
    expect(history?.at(-1)).toBe(OrderStatus.SHIPPED);
    expect(fresh?.statusHistory.at(-1)?.actorType).toBe("system");
  });

  it("paid + in_transit -> encadena a shipped sin correo 'en preparación'", async () => {
    const order = await paidOrderWithLabel(OrderStatus.PAID);
    await applyTrackingEvents(PROVIDER, [ev(order, S.IN_TRANSIT)]);
    const fresh = await Order.findById(order._id).lean();
    expect(fresh?.status).toBe(OrderStatus.SHIPPED);
    expect(fresh?.statusHistory.map((h) => h.status)).toEqual(
      expect.arrayContaining([OrderStatus.PROCESSING, OrderStatus.SHIPPED]),
    );
    expect(await notifications(order, NotificationType.ORDER_PREPARING)).toHaveLength(0);
    expect(await notifications(order, NotificationType.ORDER_SHIPPED)).toHaveLength(1);
  });

  it("delivered desde processing -> delivered con SOLO el correo de entregado", async () => {
    const order = await paidOrderWithLabel(OrderStatus.PROCESSING);
    await applyTrackingEvents(PROVIDER, [ev(order, S.DELIVERED)]);
    const fresh = await Order.findById(order._id).lean();
    expect(fresh?.status).toBe(OrderStatus.DELIVERED);
    expect(fresh?.deliveredAt).toBeInstanceOf(Date);
    expect(fresh?.shippedAt).toBeInstanceOf(Date);
    expect(await notifications(order, NotificationType.ORDER_DELIVERED)).toHaveLength(1);
    expect(await notifications(order, NotificationType.ORDER_SHIPPED)).toHaveLength(0);
  });

  it("delivered desde shipped -> delivered, un correo de entregado y no repite shipped", async () => {
    const order = await paidOrderWithLabel(OrderStatus.PROCESSING);
    await applyTrackingEvents(PROVIDER, [ev(order, S.PICKED_UP)]);
    await applyTrackingEvents(PROVIDER, [ev(order, S.DELIVERED, 30)]);
    expect((await Order.findById(order._id).lean())?.status).toBe(OrderStatus.DELIVERED);
    expect(await notifications(order, NotificationType.ORDER_SHIPPED)).toHaveLength(1);
    expect(await notifications(order, NotificationType.ORDER_DELIVERED)).toHaveLength(1);
  });

  it("el mismo evento dos veces (webhook + polling) deja un evento y una transición", async () => {
    const order = await paidOrderWithLabel(OrderStatus.PROCESSING);
    const same = ev(order, S.PICKED_UP, 0, "dup-1");
    await Promise.all([applyTrackingEvents(PROVIDER, [same]), applyTrackingEvents(PROVIDER, [same])]);
    expect(await ShipmentTrackingEvent.countDocuments({ order: order._id })).toBe(1);
    expect((await Order.findById(order._id).lean())?.statusHistory.filter((h) => h.status === OrderStatus.SHIPPED)).toHaveLength(1);
  });

  it("un evento viejo no retrocede order.tracking pero sí queda guardado", async () => {
    const order = await paidOrderWithLabel(OrderStatus.PROCESSING);
    await applyTrackingEvents(PROVIDER, [ev(order, S.OUT_FOR_DELIVERY, 30)]);
    await applyTrackingEvents(PROVIDER, [ev(order, S.IN_TRANSIT, 10)]);
    expect((await Order.findById(order._id).lean())?.tracking?.status).toBe(S.OUT_FOR_DELIVERY);
    expect(await ShipmentTrackingEvent.countDocuments({ order: order._id })).toBe(2);
  });

  it("disputa abierta o perdida: no mueve el estado y audita el bloqueo", async () => {
    for (const dispute of [DisputeStatus.OPEN, DisputeStatus.LOST]) {
      const order = await paidOrderWithLabel(OrderStatus.PROCESSING);
      await Order.updateOne({ _id: order._id }, { $set: { disputeStatus: dispute, disputedAt: new Date() } });
      await applyTrackingEvents(PROVIDER, [ev(order, S.PICKED_UP)]);
      const fresh = await Order.findById(order._id).lean();
      expect(fresh?.status).toBe(OrderStatus.PROCESSING);
      expect(fresh?.tracking?.status).toBe(S.PICKED_UP);
      expect(await AuditLog.countDocuments({ action: "tracking_transition_blocked", targetId: String(order._id) })).toBe(1);
    }
  });

  it("orden refunded: guarda el evento y no la mueve", async () => {
    const order = await paidOrderWithLabel(OrderStatus.REFUNDED);
    await applyTrackingEvents(PROVIDER, [ev(order, S.DELIVERED)]);
    expect((await Order.findById(order._id).lean())?.status).toBe(OrderStatus.REFUNDED);
    expect(await ShipmentTrackingEvent.countDocuments({ order: order._id })).toBe(1);
  });

  it("incidencias: un solo aviso al equipo por orden, con order", async () => {
    const order = await paidOrderWithLabel(OrderStatus.PROCESSING);
    await applyTrackingEvents(PROVIDER, [ev(order, S.EXCEPTION, 1), ev(order, S.LOST, 2)]);
    await applyTrackingEvents(PROVIDER, [ev(order, S.EXCEPTION, 3, "other")]);
    const sent = await notifications(order, NotificationType.TEAM_SHIPMENT_INCIDENT);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.payload).toMatchObject({ orderNumber: order.orderNumber });
  });

  it("ignora una guía que no pertenece a ninguna orden", async () => {
    await expect(
      applyTrackingEvents(PROVIDER, [{ trackingNumber: "NOPE", status: S.DELIVERED, rawStatus: "x", occurredAt: new Date(), providerEventId: "z" }]),
    ).resolves.toBeUndefined();
    expect(await ShipmentTrackingEvent.countDocuments()).toBe(0);
  });
});
```

- [ ] **Step 2: Tests rojos de `markShipped`** (`markShipped.test.ts`)

```ts
import request from "supertest";
import { ORIGIN } from "../helpers/auth.js";
import { loginAsCustomer } from "../helpers/auth.js";

let adminCookie: string;
beforeEach(async () => { adminCookie = await loginAsAdmin(app); });

const ship = (id: unknown, c = adminCookie) =>
  request(app).post(`/api/v1/admin/orders/${String(id)}/ship`).set("Origin", ORIGIN).set("Cookie", c);

describe("POST /admin/orders/:id/ship", () => {
  it("processing + guía lista -> shipped, correo ORDER_SHIPPED y audit", async () => {
    const order = await paidOrderWithLabel(OrderStatus.PROCESSING);
    const res = await ship(order._id);
    expect(res.status).toBe(200);
    expect(res.body.data.order.status).toBe(OrderStatus.SHIPPED);
    const fresh = await Order.findById(order._id).lean();
    expect(fresh?.shippedAt).toBeInstanceOf(Date);
    expect(fresh?.statusHistory.at(-1)?.actorType).toBe("user");
    expect(await notifications(order, NotificationType.ORDER_SHIPPED)).toHaveLength(1);
    expect(await AuditLog.countDocuments({ action: "order_marked_shipped", targetId: String(order._id) })).toBe(1);
  });

  it("409 si la orden está en paid (falta 'en preparación')", async () => {
    const order = await paidOrderWithLabel(OrderStatus.PAID);
    expect((await ship(order._id)).status).toBe(409);
  });

  it("409 si no hay guía lista", async () => {
    const order = await paidOrderWithLabel(OrderStatus.PROCESSING);
    await Order.updateOne({ _id: order._id }, { $set: { "label.status": ShippingLabelStatus.CANCEL_PENDING } });
    expect((await ship(order._id)).status).toBe(409);
    expect((await Order.findById(order._id).lean())?.status).toBe(OrderStatus.PROCESSING);
  });

  it("409 con disputa abierta o perdida", async () => {
    const order = await paidOrderWithLabel(OrderStatus.PROCESSING);
    await Order.updateOne({ _id: order._id }, { $set: { disputeStatus: DisputeStatus.OPEN } });
    expect((await ship(order._id)).status).toBe(409);
  });

  it("dos clics a la vez: uno 200 y otro 409, un solo correo", async () => {
    const order = await paidOrderWithLabel(OrderStatus.PROCESSING);
    const [a, b] = await Promise.all([ship(order._id), ship(order._id)]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect(await notifications(order, NotificationType.ORDER_SHIPPED)).toHaveLength(1);
  });

  it("404 si no existe; 401 sin sesión; 403 siendo cliente", async () => {
    expect((await ship("64b000000000000000000000")).status).toBe(404);
    const order = await paidOrderWithLabel(OrderStatus.PROCESSING);
    expect((await request(app).post(`/api/v1/admin/orders/${String(order._id)}/ship`).set("Origin", ORIGIN)).status).toBe(401);
    expect((await ship(order._id, await loginAsCustomer(app))).status).toBe(403);
  });
});
```

Run ambos: FAIL (módulo/ruta inexistentes).

- [ ] **Step 3: Implementación `services/shipmentTrackingService.ts`**

```ts
import { createHash } from "node:crypto";
import type { Types } from "mongoose";
import {
  AuditAction,
  AuditModule,
  DisputeStatus,
  NotificationChannelKind,
  NotificationType,
  OrderStatus,
  SHIPMENT_TRACKING_STATUS_LABELS,
  SHIPPING_CARRIER_LABELS,
  ShipmentTrackingStatus as S,
  ShippingLabelStatus,
  type AdminOrder,
  type AdminOrderTracking,
  type PublicTrackingView,
  type TrackingEventDto,
} from "@gira/shared";
import { Order, type OrderDocument } from "../models/Order.js";
import { ShipmentTrackingEvent } from "../models/ShipmentTrackingEvent.js";
import type { TrackingEvent } from "../adapters/shipping/types.js";
import { AppError } from "../utils/AppError.js";
import { assertShipmentDrivenTransition } from "../utils/orderTransitions.js";
import { canAdvanceTracking } from "../utils/trackingProgress.js";
import { toShipmentEmailSnapshot } from "../utils/orderEmailSnapshot.js";
import type { RequestContext } from "../utils/requestContext.js";
import { applyOrderTransition } from "./orderTransitionService.js";
import { enqueueNotification } from "./notificationService.js";
import { recordAudit } from "./auditService.js";
import { getAdminOrder } from "./adminOrderService.js";
import { logger } from "../config/logger.js";

/**
 * Single writer of parcel progress. Webhook and polling both end here, so they
 * cannot disagree: events are stored idempotently, `Order.tracking` only moves
 * forward, and the order's status converges through `applyOrderTransition`
 * (CAS), which makes a webhook/poll/"Marcar enviado" race harmless — the loser
 * gets `null` and re-reads.
 */

/** A provider event plus the idempotency key it arrived with. */
interface IncomingTrackingEvent extends TrackingEvent {
  providerEventId?: string;
}

const BLOCKING_DISPUTES: ReadonlySet<DisputeStatus> = new Set([DisputeStatus.OPEN, DisputeStatus.LOST]);
const DEAD_STATUSES: ReadonlySet<OrderStatus> = new Set([OrderStatus.REFUNDED, OrderStatus.CANCELLED, OrderStatus.EXPIRED]);
const IN_MOTION: ReadonlySet<S> = new Set([S.PICKED_UP, S.IN_TRANSIT, S.OUT_FOR_DELIVERY]);
const INCIDENTS: ReadonlySet<S> = new Set([S.EXCEPTION, S.RETURNED, S.LOST]);
const MAX_ADMIN_EVENTS = 100;

const isDuplicateKeyError = (err: unknown): boolean =>
  typeof err === "object" && err !== null && (err as { code?: number }).code === 11000;

/** Polling has no delivery id: a stable hash makes repeated runs insert once. */
const syntheticEventId = (e: TrackingEvent): string =>
  createHash("sha256").update(`${e.trackingNumber}|${e.rawStatus}|${e.occurredAt.toISOString()}`).digest("hex").slice(0, 32);

const SYSTEM = { type: "system" as const };

const queueShipmentEmail = async (order: OrderDocument, type: NotificationType): Promise<void> => {
  const snapshot = toShipmentEmailSnapshot(order);
  if (!snapshot) {
    logger.warn({ orderId: String(order._id), type }, "Orden sin guía utilizable: no se encoló el correo");
    return;
  }
  await enqueueNotification({
    channel: NotificationChannelKind.EMAIL,
    type,
    to: order.customer.email,
    order: order._id,
    payload: snapshot as unknown as Record<string, unknown>,
  });
};

/** paid -> processing (skipped if already there) -> shipped. Null when someone else moved the order meanwhile. */
const advanceToShipped = async (order: OrderDocument, firstScanAt: Date): Promise<OrderDocument | null> => {
  let current: OrderDocument | null = order;
  if (current.status === OrderStatus.PAID) {
    current = await applyOrderTransition({
      orderId: current._id, from: OrderStatus.PAID, to: OrderStatus.PROCESSING,
      actor: SYSTEM, reason: "carrier_picked_up",
    });
    if (!current) return null;
  }
  assertShipmentDrivenTransition(OrderStatus.PROCESSING, OrderStatus.SHIPPED);
  return applyOrderTransition({
    orderId: current._id, from: OrderStatus.PROCESSING, to: OrderStatus.SHIPPED,
    actor: SYSTEM, reason: "carrier_picked_up", set: { shippedAt: firstScanAt },
  });
};

const advanceToDelivered = async (order: OrderDocument, at: Date): Promise<OrderDocument | null> => {
  const shippedNow = order.status !== OrderStatus.SHIPPED;
  const shipped = shippedNow ? await advanceToShipped(order, at) : order;
  if (!shipped) return null;
  assertShipmentDrivenTransition(OrderStatus.SHIPPED, OrderStatus.DELIVERED);
  return applyOrderTransition({
    orderId: shipped._id, from: OrderStatus.SHIPPED, to: OrderStatus.DELIVERED,
    actor: SYSTEM, reason: "carrier_delivered", set: { deliveredAt: at },
  });
};

/** Moves the order to match a parcel event. Never throws on a lost race. */
const converge = async (orderId: Types.ObjectId, event: TrackingEvent): Promise<void> => {
  const order = await Order.findById(orderId);
  if (!order) return;

  if (INCIDENTS.has(event.status)) {
    await enqueueNotification({
      channel: NotificationChannelKind.TEAM,
      type: NotificationType.TEAM_SHIPMENT_INCIDENT,
      to: "team",
      order: order._id,
      payload: {
        orderNumber: order.orderNumber,
        status: SHIPMENT_TRACKING_STATUS_LABELS[event.status],
        carrier: order.label?.carrier ? SHIPPING_CARRIER_LABELS[order.label.carrier] : "—",
      },
    });
    return;
  }

  const wantsShipped = IN_MOTION.has(event.status);
  const wantsDelivered = event.status === S.DELIVERED;
  if (!wantsShipped && !wantsDelivered) return;
  if (DEAD_STATUSES.has(order.status)) return;

  if (order.disputeStatus && BLOCKING_DISPUTES.has(order.disputeStatus)) {
    await recordAudit({
      actorType: "system", action: AuditAction.TRACKING_TRANSITION_BLOCKED, module: AuditModule.SHIPPING,
      targetId: String(order._id), after: { tracking: event.status, dispute: order.disputeStatus },
    });
    return;
  }

  if (wantsShipped) {
    if (order.status !== OrderStatus.PAID && order.status !== OrderStatus.PROCESSING) return;
    const moved = await advanceToShipped(order, event.occurredAt);
    if (moved) await queueShipmentEmail(moved, NotificationType.ORDER_SHIPPED);
    return;
  }

  if (order.status === OrderStatus.DELIVERED) return;
  if (![OrderStatus.PAID, OrderStatus.PROCESSING, OrderStatus.SHIPPED].includes(order.status)) return;
  const moved = await advanceToDelivered(order, event.occurredAt);
  if (moved) await queueShipmentEmail(moved, NotificationType.ORDER_DELIVERED);
};

/** Stores one event and advances `Order.tracking` if it is newer. Returns false for a duplicate. */
const recordEvent = async (provider: string, order: OrderDocument, event: IncomingTrackingEvent): Promise<boolean> => {
  try {
    await ShipmentTrackingEvent.create({
      order: order._id, provider,
      providerEventId: event.providerEventId ?? syntheticEventId(event),
      trackingNumber: event.trackingNumber, status: event.status, rawStatus: event.rawStatus.slice(0, 200),
      ...(event.description ? { description: event.description.slice(0, 500) } : {}),
      ...(event.location ? { location: event.location.slice(0, 200) } : {}),
      occurredAt: event.occurredAt,
    });
  } catch (err) {
    if (isDuplicateKeyError(err)) return false;
    throw err;
  }

  const current = order.tracking ? { status: order.tracking.status, lastEventAt: order.tracking.lastEventAt } : undefined;
  if (!canAdvanceTracking(current, event)) return true;

  // CAS on the exact tracking we read: a concurrent writer that advanced it first wins.
  const guard = order.tracking
    ? { "tracking.status": order.tracking.status, ...(order.tracking.lastEventAt ? { "tracking.lastEventAt": order.tracking.lastEventAt } : { "tracking.lastEventAt": { $exists: false } }) }
    : { tracking: { $exists: false } };
  const advanced = await Order.updateOne(
    { _id: order._id, ...guard },
    { $set: { "tracking.status": event.status, "tracking.lastEventAt": event.occurredAt } },
  );
  if (advanced.modifiedCount > 0) {
    await recordAudit({
      actorType: "system", action: AuditAction.TRACKING_UPDATED, module: AuditModule.SHIPPING,
      targetId: String(order._id), before: { tracking: order.tracking?.status ?? null }, after: { tracking: event.status },
    });
  }
  return true;
};

/**
 * Webhook and polling entry. Each event runs on a fresh read of the order so a
 * batch of events for one parcel sees the effect of the previous one.
 */
const applyTrackingEvents = async (provider: string, events: IncomingTrackingEvent[]): Promise<void> => {
  const ordered = [...events].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
  for (const event of ordered) {
    const order = await Order.findOne({ "label.trackingNumber": event.trackingNumber });
    if (!order) {
      logger.warn({ provider, status: event.status }, "Evento de rastreo sin orden");
      continue;
    }
    const stored = await recordEvent(provider, order, event);
    if (!stored) continue;
    await converge(order._id, event);
  }
};

/** "Marcar enviado": the owner confirms the parcel left, using the label already bought. */
const markShipped = async (orderId: string, ctx: RequestContext): Promise<AdminOrder> => {
  const order = await Order.findById(orderId);
  if (!order) throw new AppError("La orden no existe.", 404);
  if (order.status !== OrderStatus.PROCESSING) {
    throw new AppError("Primero marca el pedido «en preparación».", 409);
  }
  if (order.label?.status !== ShippingLabelStatus.READY || !order.label.trackingNumber) {
    throw new AppError("La guía todavía no está lista para este pedido.", 409);
  }
  if (order.disputeStatus && BLOCKING_DISPUTES.has(order.disputeStatus)) {
    throw new AppError("El pedido tiene una disputa; resuélvela antes de enviarlo.", 409);
  }

  assertShipmentDrivenTransition(OrderStatus.PROCESSING, OrderStatus.SHIPPED);
  const moved = await applyOrderTransition({
    orderId: order._id, from: OrderStatus.PROCESSING, to: OrderStatus.SHIPPED,
    actor: { type: "user", id: ctx.actorId },
    reason: "marked_shipped",
    set: { shippedAt: new Date() },
    where: {
      "label.status": ShippingLabelStatus.READY,
      "label.trackingNumber": order.label.trackingNumber,
      disputeStatus: { $nin: [...BLOCKING_DISPUTES] },
    },
  });
  if (!moved) {
    throw new AppError("El pedido cambió mientras lo editabas. Recarga e intenta de nuevo.", 409);
  }

  await queueShipmentEmail(moved, NotificationType.ORDER_SHIPPED);
  await recordAudit({
    actorId: ctx.actorId, actorType: "user", action: AuditAction.ORDER_MARKED_SHIPPED,
    module: AuditModule.SHIPPING, targetId: String(moved._id), ip: ctx.ip,
  });
  return getAdminOrder(String(moved._id));
};

const toEventDto = (e: { status: S; rawStatus: string; description?: string | undefined; location?: string | undefined; occurredAt: Date }): TrackingEventDto => ({
  status: e.status, rawStatus: e.rawStatus,
  ...(e.description ? { description: e.description } : {}),
  ...(e.location ? { location: e.location } : {}),
  occurredAt: e.occurredAt,
});

const loadEvents = async (orderId: Types.ObjectId, limit: number): Promise<TrackingEventDto[]> => {
  const rows = await ShipmentTrackingEvent.find({ order: orderId }).sort({ occurredAt: -1 }).limit(limit).lean();
  return rows.reverse().map(toEventDto);
};

/** `GET /admin/orders/:id/tracking`. */
const getAdminTracking = async (orderId: string): Promise<AdminOrderTracking> => {
  const order = await Order.findById(orderId).lean();
  if (!order) throw new AppError("La orden no existe.", 404);
  const admin = await getAdminOrder(orderId);
  return {
    ...(admin.label ? { label: admin.label } : {}),
    ...(admin.tracking ? { tracking: admin.tracking } : {}),
    ...(admin.shippedAt ? { shippedAt: admin.shippedAt } : {}),
    ...(admin.deliveredAt ? { deliveredAt: admin.deliveredAt } : {}),
    events: await loadEvents(order._id, MAX_ADMIN_EVENTS),
  };
};

/**
 * Public tracking by capability id. The SAME 404 whether the order does not exist
 * or has not shipped yet: distinguishing them would be an order-existence oracle.
 */
const getPublicTracking = async (publicId: string): Promise<PublicTrackingView> => {
  const order = await Order.findOne({ publicId }).lean();
  const visible = order && (order.status === OrderStatus.SHIPPED || order.status === OrderStatus.DELIVERED);
  if (!visible || !order.label?.trackingNumber || !order.label.carrier) {
    throw new AppError("Todavía no hay información de envío para este pedido.", 404);
  }
  return {
    orderNumber: order.orderNumber,
    carrier: order.label.carrier,
    carrierName: SHIPPING_CARRIER_LABELS[order.label.carrier],
    trackingNumber: order.label.trackingNumber,
    ...(order.label.trackUrl ? { trackUrl: order.label.trackUrl } : {}),
    ...(order.tracking ? { status: order.tracking.status } : {}),
    ...(order.shippedAt ? { shippedAt: order.shippedAt } : {}),
    ...(order.deliveredAt ? { deliveredAt: order.deliveredAt } : {}),
    events: await loadEvents(order._id, MAX_ADMIN_EVENTS),
  };
};

export type { IncomingTrackingEvent };
export { applyTrackingEvents, markShipped, getAdminTracking, getPublicTracking };
```

> `TrackingEvent` no trae `providerEventId`; se añade como campo opcional en `IncomingTrackingEvent`. El webhook lo setea con `deliveryId`; el polling lo omite (hash sintético).
> `getAdminOrder` importa de `adminOrderService`, que a su vez no importa este archivo: sin ciclo.

- [ ] **Step 4: Controller + ruta de `/ship` y `/tracking` admin**

`controllers/adminOrderController.ts` (junto a `retryOrderLabel`):

```ts
const shipOrder = asyncHandler(async (req, res) => {
  const order = await markShipped(req.params.id as string, buildContext(req));
  sendResponse(res, 200, "Pedido marcado como enviado.", { order });
});

const orderTracking = asyncHandler(async (req, res) => {
  const tracking = await getAdminTracking(req.params.id as string);
  sendResponse(res, 200, "Seguimiento obtenido correctamente.", { tracking });
});
```

(importar `markShipped, getAdminTracking` de `../services/shipmentTrackingService.js` y agregarlos al `export {}`.)

`routes/v1/admin/adminOrderRoutes.ts`, junto a la ruta de `label/retry`:

```ts
adminOrderRouter.post("/:id/ship", validate(objectIdParamSchema, "params"), shipOrder);
adminOrderRouter.get("/:id/tracking", validate(objectIdParamSchema, "params"), orderTracking);
```

- [ ] **Step 5: `toAdminOrder` — campos de rastreo** (`adminOrderService.ts`, dentro del objeto devuelto, tras el spread de `label`):

```ts
  ...(doc.tracking
    ? {
        tracking: {
          status: doc.tracking.status,
          ...(doc.tracking.lastEventAt ? { lastEventAt: doc.tracking.lastEventAt } : {}),
          ...(doc.tracking.lastSyncedAt ? { lastSyncedAt: doc.tracking.lastSyncedAt } : {}),
        },
      }
    : {}),
  ...(doc.shippedAt ? { shippedAt: doc.shippedAt } : {}),
  ...(doc.deliveredAt ? { deliveredAt: doc.deliveredAt } : {}),
```

- [ ] **Step 6: Verde**

Run: `pnpm --filter @gira/api exec vitest run tests/integration/trackingConvergence.test.ts tests/integration/markShipped.test.ts`
Expected: todos pasan. Si una prueba de carrera falla, revisar el `where`/guard antes de tocar el test.

- [ ] **Step 7: Commit sugerido (NO ejecutar)**

---

## Task 8: Webhook de Envía — dedupe parametrizado, controller, ruta, limiter

**Files:**
- Create: `apps/api/src/services/webhookEventService.ts`, `apps/api/src/services/shippingWebhookService.ts`
- Modify: `apps/api/src/services/webhookService.ts`, `controllers/webhookController.ts`, `routes/webhookRoutes.ts`, `middlewares/rateLimit.ts`, `tests/integration/rateLimits.test.ts`
- Test: `apps/api/tests/integration/enviaWebhook.test.ts`

- [ ] **Step 1: Red de seguridad antes de refactorizar** — correr y guardar el resultado actual:

Run: `pnpm --filter @gira/api exec vitest run tests/integration/stripeWebhook.test.ts tests/integration/webhookRetry.test.ts`
Expected: verde (línea base del refactor).

- [ ] **Step 2: `services/webhookEventService.ts`** — mueve `isDuplicateKeyError`, `purgeDate`, `claimEvent`, `markEvent` y el patrón de `handleProviderEvent`, sin `"stripe"` fijo:

```ts
import { WebhookEvent, PURGE_AFTER_DAYS } from "../models/WebhookEvent.js";
import { logger } from "../config/logger.js";
import { AppError } from "../utils/AppError.js";

/**
 * Provider-agnostic exactly-once claim for webhook deliveries. The dedupe insert
 * IS the guarantee (unique index on provider+eventId). A failed claim is retaken
 * once by a redelivery; a fresh `processing` row means "in flight" (409).
 */

const STALE_PROCESSING_MS = 5 * 60 * 1000;
const MAX_ERROR_LENGTH = 500;

const isDuplicateKeyError = (err: unknown): boolean =>
  typeof err === "object" && err !== null && "code" in err && (err as { code?: number }).code === 11000;

const purgeDate = (): Date => new Date(Date.now() + PURGE_AFTER_DAYS * 24 * 60 * 60 * 1000);

interface WebhookDelivery {
  /** The provider's unique id for this delivery. */
  id: string;
  type: string;
  /** Type we do not act on: stored as `ignored`, no effect run. */
  ignored?: boolean;
}

type Claim = { kind: "claimed"; attempt: number } | { kind: "duplicate" } | { kind: "in_flight" };

const claimEvent = async (provider: string, delivery: WebhookDelivery): Promise<Claim> => {
  try {
    await WebhookEvent.create({
      provider,
      eventId: delivery.id,
      type: delivery.type,
      status: delivery.ignored ? "ignored" : "processing",
      purgeAt: purgeDate(),
    });
    return { kind: "claimed", attempt: 1 };
  } catch (err) {
    if (!isDuplicateKeyError(err)) throw err;
  }

  const reclaimed = await WebhookEvent.findOneAndUpdate(
    {
      provider,
      eventId: delivery.id,
      $or: [
        { status: "failed" },
        { status: "processing", updatedAt: { $lt: new Date(Date.now() - STALE_PROCESSING_MS) } },
      ],
    },
    { $set: { status: "processing" }, $unset: { error: 1 }, $inc: { attempts: 1 } },
    { new: true },
  );
  if (reclaimed) return { kind: "claimed", attempt: reclaimed.attempts };

  const existing = await WebhookEvent.findOne({ provider, eventId: delivery.id }).select("status").lean();
  return existing?.status === "processing" ? { kind: "in_flight" } : { kind: "duplicate" };
};

const markEvent = async (
  provider: string,
  eventId: string,
  status: "processed" | "failed" | "ignored",
  attempt: number,
  extra: { orderId?: string; error?: string } = {},
): Promise<void> => {
  // Pinned to THIS attempt: a slow attempt already taken over must not overwrite the replacement's outcome.
  await WebhookEvent.updateOne(
    { provider, eventId, status: "processing", attempts: attempt },
    { $set: { status, ...extra } },
  );
};

/**
 * Claims the delivery, runs `effect`, records the outcome.
 * - duplicate -> "duplicate"; in flight -> 409; ignored type -> "processed".
 * - `effect` returns the resolved order id (or null when none applies).
 * - A 4xx AppError is deterministic: terminal `ignored`, acked.
 * - Anything else is `failed` and rethrown so the provider redelivers.
 */
const runWebhookEvent = async (
  provider: string,
  delivery: WebhookDelivery,
  effect: () => Promise<string | null>,
): Promise<"processed" | "duplicate"> => {
  const claim = await claimEvent(provider, delivery);
  if (claim.kind === "duplicate") return "duplicate";
  if (claim.kind === "in_flight") throw new AppError("El evento se está procesando.", 409);
  if (delivery.ignored) return "processed";
  const { attempt } = claim;

  try {
    const orderId = await effect();
    await markEvent(provider, delivery.id, "processed", attempt, orderId ? { orderId } : {});
    return "processed";
  } catch (err) {
    if (err instanceof AppError && err.statusCode >= 400 && err.statusCode < 500) {
      logger.warn({ err, eventId: delivery.id, type: delivery.type, provider }, "Webhook rechazado por regla de negocio");
      await markEvent(provider, delivery.id, "ignored", attempt, { error: err.message.slice(0, MAX_ERROR_LENGTH) });
      return "processed";
    }
    const message = (err instanceof Error ? err.message : String(err)).slice(0, MAX_ERROR_LENGTH);
    logger.error({ err, eventId: delivery.id, type: delivery.type, provider }, "Falló el efecto de un webhook");
    await markEvent(provider, delivery.id, "failed", attempt, { error: message }).catch((markErr: unknown) => {
      logger.error({ err: markErr, eventId: delivery.id }, "No se pudo marcar el webhook como fallido");
    });
    throw err;
  }
};

export type { WebhookDelivery };
export { runWebhookEvent };
```

- [ ] **Step 3: Reescribir `webhookService.ts` sobre `runWebhookEvent`** — conserva `resolveOrderId`, `dispatchEffect`, `handleStripeWebhook`; elimina `claimEvent/markEvent/isDuplicateKeyError/purgeDate/constantes`:

```ts
const handleProviderEvent = async (event: ProviderEvent): Promise<"processed" | "duplicate"> =>
  runWebhookEvent(
    "stripe",
    { id: event.id, type: event.type, ignored: event.type === ProviderEventType.IGNORED },
    async () => {
      const orderId = await resolveOrderId(event);
      if (!orderId) {
        logger.warn({ eventId: event.id, type: event.type }, "Webhook sin orden resoluble");
        return null; // unknown order: ack, do not retry forever
      }
      await dispatchEffect(event, orderId);
      return String(orderId);
    },
  );
```

Limpiar imports no usados (`WebhookEvent`, `PURGE_AFTER_DAYS`, `AppError` si ya no se usa) y agregar `import { runWebhookEvent } from "./webhookEventService.js";`.

Run: `pnpm --filter @gira/api exec vitest run tests/integration/stripeWebhook.test.ts tests/integration/webhookRetry.test.ts`
Expected: **mismo verde que en el Step 1** (refactor sin cambio de comportamiento).

- [ ] **Step 4: Tests rojos del webhook de Envía** (`enviaWebhook.test.ts`)

```ts
import { beforeEach, afterEach, describe, it, expect } from "vitest";
import request from "supertest";
import { NotificationType, OrderStatus, ShipmentTrackingStatus as S, ShippingLabelStatus } from "@gira/shared";
import { buildApp } from "../../src/app.js";
import { Order } from "../../src/models/Order.js";
import { Notification } from "../../src/models/Notification.js";
import { WebhookEvent } from "../../src/models/WebhookEvent.js";
import { ShipmentTrackingEvent } from "../../src/models/ShipmentTrackingEvent.js";
import { settleLabelWork } from "../../src/services/shippingLabelService.js";
import { applyPaymentSucceeded } from "../../src/services/orderPaymentService.js";
import { resetRateLimitStores } from "../../src/middlewares/rateLimit.js";
import {
  installFakeShippingProvider, restoreShippingProvider, signedTrackingWebhook,
} from "../helpers/fakeShippingProvider.js";
import { loginAsAdmin } from "../helpers/auth.js";
import { createPendingOrder, seedCatalogVariant } from "../helpers/orders.js";

const app = buildApp();
let variantId: string;

beforeEach(async () => {
  installFakeShippingProvider();
  variantId = await seedCatalogVariant(app, await loginAsAdmin(app), "WH", 200);
});
afterEach(restoreShippingProvider);

const processingOrder = async () => {
  const order = await createPendingOrder(variantId);
  await applyPaymentSucceeded(order._id);
  await settleLabelWork();
  await Order.updateOne({ _id: order._id }, { $set: { status: OrderStatus.PROCESSING } });
  const fresh = await Order.findById(order._id);
  if (fresh?.label?.status !== ShippingLabelStatus.READY) throw new Error("label not ready");
  return fresh;
};

const post = (w: { body: Buffer; headers: Record<string, string> }) => {
  const r = request(app).post("/api/webhooks/envia");
  for (const [k, v] of Object.entries(w.headers)) r.set(k, v);
  return r.send(w.body);
};

describe("POST /api/webhooks/envia", () => {
  it("firmado y válido: 200, evento guardado, orden a shipped, un correo", async () => {
    const order = await processingOrder();
    const res = await post(signedTrackingWebhook({ trackingNumber: order.label!.trackingNumber!, status: "picked_up", id: "d-1" }));
    expect(res.status).toBe(200);
    expect((await Order.findById(order._id).lean())?.status).toBe(OrderStatus.SHIPPED);
    expect(await ShipmentTrackingEvent.countDocuments({ order: order._id })).toBe(1);
    expect(await Notification.countDocuments({ order: order._id, type: NotificationType.ORDER_SHIPPED })).toBe(1);
    const row = await WebhookEvent.findOne({ provider: "stub", eventId: "d-1" }).lean();
    expect(row?.status).toBe("processed");
  });

  it("redelivery con el mismo X-Webhook-Id: 200 'ya procesado' sin duplicar", async () => {
    const order = await processingOrder();
    const w = signedTrackingWebhook({ trackingNumber: order.label!.trackingNumber!, status: "picked_up", id: "d-2" });
    await post(w);
    const again = await post(w);
    expect(again.status).toBe(200);
    expect(again.body.message).toMatch(/ya procesado/i);
    expect(await ShipmentTrackingEvent.countDocuments({ order: order._id })).toBe(1);
  });

  it("firma inválida o timestamp viejo: 400 y no toca nada", async () => {
    const order = await processingOrder();
    const bad = await post(signedTrackingWebhook({ trackingNumber: order.label!.trackingNumber!, status: "delivered", secret: "otro" }));
    expect(bad.status).toBe(400);
    const old = await post(signedTrackingWebhook({ trackingNumber: order.label!.trackingNumber!, status: "delivered", timestamp: String(Date.now() - 3_600_000) }));
    expect(old.status).toBe(400);
    expect((await Order.findById(order._id).lean())?.status).toBe(OrderStatus.PROCESSING);
  });

  it("sin cabeceras: 400", async () => {
    const res = await request(app).post("/api/webhooks/envia").set("content-type", "application/json").send("{}");
    expect(res.status).toBe(400);
  });

  it("sin secreto configurado: 503", async () => {
    installFakeShippingProvider({ webhookSecret: null });
    const res = await post(signedTrackingWebhook({ trackingNumber: "X", status: "delivered" }));
    expect(res.status).toBe(503);
  });

  it("tipo de evento que no usamos: 200 y queda como ignored", async () => {
    const res = await post(signedTrackingWebhook({ trackingNumber: "X", status: "delivered", id: "d-3", eventType: "surcharge" }));
    expect(res.status).toBe(200);
    expect((await WebhookEvent.findOne({ provider: "stub", eventId: "d-3" }).lean())?.status).toBe("ignored");
  });

  it("guía desconocida: 200 (no se reintenta eternamente)", async () => {
    const res = await post(signedTrackingWebhook({ trackingNumber: "NADIE", status: S.DELIVERED, id: "d-4" }));
    expect(res.status).toBe(200);
  });

  it("el efecto falla -> 500 y la redelivery lo reintenta", async () => {
    const order = await processingOrder();
    const original = Order.findOne.bind(Order);
    let boom = true;
    // First delivery: simulate a DB failure inside the effect, then recover.
    const spy = (await import("vitest")).vi.spyOn(Order, "findOne").mockImplementation(((...args: Parameters<typeof Order.findOne>) => {
      if (boom) { boom = false; throw new Error("db down"); }
      return original(...args);
    }) as typeof Order.findOne);
    const w = signedTrackingWebhook({ trackingNumber: order.label!.trackingNumber!, status: "picked_up", id: "d-5" });
    expect((await post(w)).status).toBe(500);
    spy.mockRestore();
    expect((await WebhookEvent.findOne({ provider: "stub", eventId: "d-5" }).lean())?.status).toBe("failed");
    expect((await post(w)).status).toBe(200);
    expect((await Order.findById(order._id).lean())?.status).toBe(OrderStatus.SHIPPED);
  });
});

describe("limiter propio del webhook de Envía", () => {
  it("expone su propio tope (1000) y no comparte bucket con Stripe", async () => {
    process.env.RATE_LIMIT_ENABLED = "true";
    resetRateLimitStores();
    const res = await request(app).post("/api/webhooks/envia").set("content-type", "application/json").send("{}");
    expect(res.headers["ratelimit-limit"]).toBe("1000");
    process.env.RATE_LIMIT_ENABLED = "false";
  });
});
```

Run → FAIL (ruta 404).

- [ ] **Step 5: `rateLimit.ts`** — después de `webhookLimiter`:

```ts
// Envía's webhook has its own bucket so a burst of tracking events can never
// starve (or be starved by) the payment webhook. Signature verification is the real barrier.
const enviaWebhookLimiter = createLimiter({
  windowMs: FIFTEEN_MIN,
  limit: 1000,
  message: "Demasiadas solicitudes.",
});
```

y agregar `enviaWebhookLimiter,` al `export {}`.

- [ ] **Step 6: `services/shippingWebhookService.ts`**

```ts
import { getShippingProvider } from "../adapters/shipping/index.js";
import type { WebhookHeaders } from "../adapters/shipping/types.js";
import { AppError } from "../utils/AppError.js";
import { runWebhookEvent } from "./webhookEventService.js";
import { applyTrackingEvents } from "./shipmentTrackingService.js";
import { Order } from "../models/Order.js";

/**
 * Entry point for the carrier-tracking webhook. Verification and parsing live in
 * the adapter; dedupe in `runWebhookEvent`; the business effect in
 * `shipmentTrackingService`. Only DB work happens before answering (the provider
 * gives 5 s).
 */
const handleShippingWebhook = async (
  rawBody: Buffer,
  headers: WebhookHeaders,
): Promise<"processed" | "duplicate"> => {
  const provider = getShippingProvider();
  if (!provider.acceptsWebhooks) {
    throw new AppError("El rastreo por webhook no está configurado.", 503);
  }

  // Throws AppError(400) on a bad signature, stale timestamp or missing headers.
  const parsed = provider.verifyAndParseWebhook(rawBody, headers);

  return runWebhookEvent(
    provider.name,
    { id: parsed.deliveryId, type: parsed.eventType, ignored: parsed.events.length === 0 },
    async () => {
      await applyTrackingEvents(
        provider.name,
        parsed.events.map((e) => ({ ...e, providerEventId: `${parsed.deliveryId}:${e.trackingNumber}` })),
      );
      const first = parsed.events[0];
      if (!first) return null;
      const order = await Order.findOne({ "label.trackingNumber": first.trackingNumber }).select("_id").lean();
      return order ? String(order._id) : null;
    },
  );
};

export { handleShippingWebhook };
```

> `provider.name` (`"stub"`/`"envia"`) es el `provider` del dedupe y del evento: dos adapters nunca colisionan.

- [ ] **Step 7: Controller y ruta**

`controllers/webhookController.ts`:

```ts
import { handleShippingWebhook } from "../services/shippingWebhookService.js";

const enviaWebhook = asyncHandler(async (req: Request, res: Response) => {
  const outcome = await handleShippingWebhook(req.body as Buffer, req.headers);
  sendResponse(res, 200, outcome === "duplicate" ? "Evento ya procesado." : "Evento procesado.");
});

export { stripeWebhook, enviaWebhook };
```

`routes/webhookRoutes.ts`:

```ts
import { webhookLimiter, enviaWebhookLimiter } from "../middlewares/rateLimit.js";
import { stripeWebhook, enviaWebhook } from "../controllers/webhookController.js";
// ...
webhookRouter.post("/envia", enviaWebhookLimiter, raw({ type: "application/json", limit: "256kb" }), enviaWebhook);
```

Si `express.raw` deja `req.body` como `{}` cuando el `content-type` no es JSON, `Buffer.isBuffer` es falso: en `handleShippingWebhook` no se llega a verificar porque falta la cabecera y devuelve 400 antes; aun así, en el controller agregar `if (!Buffer.isBuffer(req.body)) throw new AppError("Cuerpo de webhook inválido.", 400);` (importar `AppError`).

- [ ] **Step 8: Verde**

Run: `pnpm --filter @gira/api exec vitest run tests/integration/enviaWebhook.test.ts tests/integration/stripeWebhook.test.ts tests/integration/webhookRetry.test.ts tests/integration/rateLimits.test.ts`
Expected: todos pasan.

- [ ] **Step 9: Commit sugerido (NO ejecutar)**

---

## Task 9: Lecturas del cliente — rastreo público y "mis pedidos"

**Files:**
- Modify: `apps/api/src/controllers/orderController.ts`, `services/orderService.ts`
- Test: `apps/api/tests/integration/orderTrackingReads.test.ts`

- [ ] **Step 1: Tests rojos**

```ts
// mismo encabezado/helpers que markShipped.test.ts (paidOrderWithLabel, app, variantId, restoreShippingProvider)
import request from "supertest";
import { loginCustomer, createCustomer, ORIGIN } from "../helpers/auth.js";

const track = (publicId: string) => request(app).get(`/api/v1/orders/${publicId}/tracking`);

describe("GET /orders/:publicId/tracking", () => {
  it("404 igual para inexistente y para pedido aún no enviado", async () => {
    const order = await paidOrderWithLabel(OrderStatus.PROCESSING);
    const notShipped = await track(order.publicId);
    const unknown = await track("x".repeat(40));
    expect(notShipped.status).toBe(404);
    expect(unknown.status).toBe(404);
    expect(notShipped.body.message).toBe(unknown.body.message);
  });

  it("enviado: devuelve folio, paquetería, guía, trackUrl y eventos, sin publicId", async () => {
    const order = await paidOrderWithLabel(OrderStatus.PROCESSING);
    await applyTrackingEvents("stub", [ev(order, S.PICKED_UP)]);
    const res = await track(order.publicId);
    expect(res.status).toBe(200);
    const t = res.body.data.tracking;
    expect(t).toMatchObject({ orderNumber: order.orderNumber, trackingNumber: order.label!.trackingNumber, carrierName: "Estafeta" });
    expect(t.events).toHaveLength(1);
    expect(JSON.stringify(res.body)).not.toContain(order.publicId);
  });
});

describe("GET /orders/mine", () => {
  it("incluye shipment solo cuando la orden ya está enviada", async () => {
    // ver createCustomer/loginCustomer en tests/helpers/auth.ts; la orden debe pertenecer al cliente
    const { cookie, userId } = await customerWithOrder();
    const before = await request(app).get("/api/v1/orders/mine").set("Cookie", cookie);
    expect(before.body.data.orders[0].shipment).toBeUndefined();
    await Order.updateOne({ user: userId }, { $set: { status: OrderStatus.SHIPPED, shippedAt: new Date() } });
    const after = await request(app).get("/api/v1/orders/mine").set("Cookie", cookie);
    expect(after.body.data.orders[0].shipment).toMatchObject({ carrierName: "Estafeta" });
    expect(after.body.data.orders[0].shipment.trackingNumber).toBeTruthy();
  });
});
```

`customerWithOrder`: crear el cliente con `createCustomer`/`loginCustomer` (ver `tests/helpers/auth.ts`), crear la orden con `createOrderWithQuote` pasando ese cliente en el contexto (patrón de `tests/integration/myOrders.test.ts`), pagarla con `applyPaymentSucceeded` + `settleLabelWork`. Copiar el armado exacto de ese test existente; no inventar helpers nuevos.

Run → FAIL.

- [ ] **Step 2: Implementación**

`orderController.ts`: cambiar el import de `getPublicTracking` a `../services/shipmentTrackingService.js` (el de `shipmentService` se borra en Task 11). El handler `tracking` queda igual.

`orderService.ts`: `OrderLean` ya trae `status`, `label`, `tracking`, `shippedAt`, `deliveredAt` al ser `lean()` del modelo; asegurar que su interfaz los incluya (agregar `label?`, `tracking?`, `shippedAt?`, `deliveredAt?` al tipo si `OrderLean` es una interfaz propia). Reemplazar `toCustomerOrder`:

```ts
const toCustomerShipment = (doc: OrderLean): CustomerShipment | undefined => {
  const shipped = doc.status === OrderStatus.SHIPPED || doc.status === OrderStatus.DELIVERED;
  if (!shipped || !doc.label?.trackingNumber || !doc.label.carrier) return undefined;
  return {
    carrier: doc.label.carrier,
    carrierName: SHIPPING_CARRIER_LABELS[doc.label.carrier],
    trackingNumber: doc.label.trackingNumber,
    ...(doc.label.trackUrl ? { trackUrl: doc.label.trackUrl } : {}),
    ...(doc.tracking ? { status: doc.tracking.status } : {}),
    ...(doc.shippedAt ? { shippedAt: doc.shippedAt } : {}),
    ...(doc.deliveredAt ? { deliveredAt: doc.deliveredAt } : {}),
  };
};

const toCustomerOrder = (doc: OrderLean): CustomerOrder => {
  const shipment = toCustomerShipment(doc);
  return { id: String(doc._id), ...toPublicOrder(doc), ...(shipment ? { shipment } : {}) };
};
```

(importar `OrderStatus, SHIPPING_CARRIER_LABELS, CustomerShipment` de `@gira/shared`.) `toPublicOrder` (lookup por `publicId` y respuesta del checkout) **no** cambia: la guía nunca sale por ahí.

> Cuidado: `adminOrderService` reutiliza `toCustomerOrder`, así que `AdminOrder` también hereda `shipment`; es válido (extiende `CustomerOrder`).

- [ ] **Step 3: Verde**

Run: `pnpm --filter @gira/api exec vitest run tests/integration/orderTrackingReads.test.ts tests/integration/myOrders.test.ts`
Expected: pasan.

- [ ] **Step 4: Commit sugerido (NO ejecutar)**

---

## Task 10: Polling de reconciliación

**Files:**
- Create: `apps/api/src/jobs/reconcileTracking.ts`
- Modify: `apps/api/src/jobs/scheduler.ts`
- Test: `apps/api/tests/integration/reconcileTracking.test.ts`

- [ ] **Step 1: Test rojo**

```ts
// encabezado/helpers de trackingConvergence.test.ts
import { reconcileTracking } from "../../src/jobs/reconcileTracking.js";
import { ShippingProviderError } from "../../src/adapters/shipping/index.js";

describe("reconcileTracking", () => {
  it("consulta las guías pendientes, aplica los eventos y marca lastSyncedAt", async () => {
    const fake = installFakeShippingProvider();
    const order = await paidOrderWithLabel(OrderStatus.PROCESSING);
    fake.getTracking.mockResolvedValueOnce([
      { trackingNumber: order.label!.trackingNumber!, status: S.PICKED_UP, rawStatus: "Picked Up", occurredAt: new Date() },
    ]);
    await reconcileTracking();
    expect(fake.getTracking).toHaveBeenCalledWith([order.label!.trackingNumber], expect.anything());
    const fresh = await Order.findById(order._id).lean();
    expect(fresh?.status).toBe(OrderStatus.SHIPPED);
    expect(fresh?.tracking?.lastSyncedAt).toBeInstanceOf(Date);
  });

  it("no consulta lo sincronizado hace menos de 30 min, ni guías viejas (>30 días), ni órdenes entregadas", async () => {
    const fake = installFakeShippingProvider();
    const fresh = await paidOrderWithLabel(OrderStatus.PROCESSING);
    await Order.updateOne({ _id: fresh._id }, { $set: { "tracking.status": S.LABEL_CREATED, "tracking.lastSyncedAt": new Date() } });
    const old = await paidOrderWithLabel(OrderStatus.PROCESSING);
    await Order.updateOne({ _id: old._id }, { $set: { "label.readyAt": new Date(Date.now() - 31 * 86_400_000) } });
    const done = await paidOrderWithLabel(OrderStatus.DELIVERED);
    await reconcileTracking();
    expect(fake.getTracking).not.toHaveBeenCalled();
    void done;
  });

  it("un provider caído no rompe la corrida ni marca lastSyncedAt", async () => {
    const fake = installFakeShippingProvider();
    const order = await paidOrderWithLabel(OrderStatus.PROCESSING);
    fake.getTracking.mockRejectedValueOnce(new ShippingProviderError("unavailable", "caído"));
    await expect(reconcileTracking()).resolves.toBeUndefined();
    expect((await Order.findById(order._id).lean())?.tracking?.lastSyncedAt).toBeUndefined();
  });

  it("dos corridas con el mismo estado no duplican eventos", async () => {
    const fake = installFakeShippingProvider();
    const order = await paidOrderWithLabel(OrderStatus.PROCESSING);
    const same = { trackingNumber: order.label!.trackingNumber!, status: S.IN_TRANSIT, rawStatus: "Shipped", occurredAt: new Date("2026-10-19T10:00:00Z") };
    fake.getTracking.mockResolvedValue([same]);
    await reconcileTracking();
    await Order.updateOne({ _id: order._id }, { $unset: { "tracking.lastSyncedAt": 1 } });
    await reconcileTracking();
    expect(await ShipmentTrackingEvent.countDocuments({ order: order._id })).toBe(1);
  });
});
```

Run → FAIL.

- [ ] **Step 2: `jobs/reconcileTracking.ts`**

```ts
import { OrderStatus, ShippingLabelStatus } from "@gira/shared";
import { Order } from "../models/Order.js";
import { getShippingProvider } from "../adapters/shipping/index.js";
import { applyTrackingEvents } from "../services/shipmentTrackingService.js";
import { logger } from "../config/logger.js";

/**
 * Safety net for the carrier webhook (missing secret, dropped deliveries):
 * every ~30 min asks the provider about parcels still in flight. Same service
 * as the webhook, so the two can never disagree. Events carry no delivery id
 * here: the service derives a stable one, so repeated runs insert once.
 */

const SYNC_EVERY_MS = 30 * 60 * 1000;
const MAX_PARCEL_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const BATCH = 200;
const TRACKABLE = [OrderStatus.PAID, OrderStatus.PROCESSING, OrderStatus.SHIPPED];

const reconcileTracking = async (): Promise<void> => {
  const now = Date.now();
  const due = await Order.find({
    status: { $in: TRACKABLE },
    "label.status": ShippingLabelStatus.READY,
    "label.trackingNumber": { $exists: true },
    "label.readyAt": { $gte: new Date(now - MAX_PARCEL_AGE_MS) },
    $or: [
      { "tracking.lastSyncedAt": { $exists: false } },
      { "tracking.lastSyncedAt": { $lt: new Date(now - SYNC_EVERY_MS) } },
    ],
  })
    .sort({ "tracking.lastSyncedAt": 1, createdAt: 1 })
    .limit(BATCH)
    .select("_id label.trackingNumber tracking")
    .lean();
  if (due.length === 0) return;

  const provider = getShippingProvider();
  const numbers = due.map((o) => o.label!.trackingNumber!);

  let events;
  try {
    events = await provider.getTracking(numbers, {});
  } catch (err) {
    logger.error({ err }, "No se pudo consultar el rastreo; se reintenta en la próxima corrida");
    return;
  }

  await applyTrackingEvents(provider.name, events);

  // Only parcels actually asked about are marked as synced.
  await Order.updateMany(
    { _id: { $in: due.map((o) => o._id) } },
    [{ $set: { "tracking.lastSyncedAt": new Date(), "tracking.status": { $ifNull: ["$tracking.status", "label_created"] } } }],
  );
};

export { reconcileTracking };
```

> La actualización con pipeline conserva `tracking.status` si ya existe y lo inicializa en `label_created` si no (el esquema exige `status` dentro de `tracking`). `updateMany` con pipeline no pasa por validadores de Mongoose: es intencional y seguro porque el valor es de nuestro enum.

- [ ] **Step 3: `scheduler.ts`**

```ts
import { reconcileTracking } from "./reconcileTracking.js";
const EVERY_THIRTY_MINUTES = 30 * 60 * 1000;
// ...
    setInterval(runSafely("reconcileTracking", reconcileTracking), EVERY_THIRTY_MINUTES),
```

- [ ] **Step 4: Verde**

Run: `pnpm --filter @gira/api exec vitest run tests/integration/reconcileTracking.test.ts`
Expected: 4 passed.

- [ ] **Step 5: Commit sugerido (NO ejecutar)**

---

## Task 11: Retiro de Shipment (API, tests, shared, web)

Es una poda mecánica: se hace **después** de que lo nuevo está verde para que cada paso sea verificable.

**Files:** ver "Borrar" en el mapa.

- [ ] **Step 1: Desmontar rutas**
  - `routes/v1/admin/adminOrderRoutes.ts`: borrar el import de `adminShipmentRouter` (línea ~25) y el `adminOrderRouter.use("/:id/shipment", ...)` (~líneas 63-67).
  - `routes/v1/admin/index.ts`: borrar el import de `shipmentRouter` (línea ~15) y `adminRouter.use("/shipments", shipmentRouter)` (línea ~40).

- [ ] **Step 2: Borrar archivos de la API**

```bash
cd /Users/manuelarteaga/Documents/Gira_Clothing/apps/api
rm src/models/Shipment.ts src/utils/shipmentTransitions.ts src/services/shipmentService.ts \
   src/controllers/shipmentController.ts src/validators/shipmentValidator.ts \
   src/routes/v1/admin/adminShipmentRoutes.ts src/routes/v1/admin/shipmentRoutes.ts \
   tests/integration/shipments.test.ts tests/integration/shipmentRoutes.test.ts \
   tests/integration/adminShipments.test.ts tests/unit/shipmentTransitions.test.ts
```

- [ ] **Step 3: Ajustes de tests que tocaban Shipment**
  - `tests/unit/orderTransitions.test.ts`: quitar el import/uso de `shipmentTransitions` si lo hubiera; las secciones de `assertShipmentDrivenTransition` se **mantienen** (la función sigue en `utils/orderTransitions.ts`).
  - `tests/unit/wireContract.test.ts:5-6,26-27`: quitar `AdminShipment`/`AdminShipmentListItem` (import y los dos `assertShape`). Agregar `assertShape<AdminOrderTracking>({} as AdminOrderTracking);` y `assertShape<PublicTrackingView>({} as PublicTrackingView);` importando ambos de `@gira/shared`.
  - `tests/integration/rateLimits.test.ts:26` y `tests/integration/logRedaction.test.ts:66`: siguen pegándole a `/orders/:publicId/tracking`; con la orden inexistente devuelven 404 (el limiter y la redacción se prueban igual). Verificar que sus aserciones no esperan 200; si lo hacen, cambiarlas a 404.

- [ ] **Step 4: Shared — borrar y limpiar**

```bash
cd /Users/manuelarteaga/Documents/Gira_Clothing/packages/shared/src
rm enums/shipment.ts types/shipment.ts labels/shipmentStatus.ts
```

En `index.ts`: quitar el import/export de `ShipmentStatus` (líneas 7 y 27), de `ShipmentEvent, PublicTracking, AdminShipment, AdminShipmentListItem` (82-86 y 188-191) y de `SHIPMENT_STATUS_LABELS` (149 y 248). En `enums/auditAction.ts` borrar `SHIPMENT_CREATED` y `SHIPMENT_STATUS_CHANGED`. En `enums/notification.ts` **no** se toca `TEAM_SHIPMENT_INCIDENT` (se sigue usando).

- [ ] **Step 5: `orderPaymentService.ts`** — renombrar la variable local `beforeShipment` (líneas ~454-529) a `beforePickup`; es solo un nombre, comportamiento idéntico.

- [ ] **Step 6: Web**
  - `components/ui/styles.ts`: borrar `SHIPMENT_STATUS_BG` y su import de `ShipmentStatus`.
  - `components/ui/StatusChip.tsx`: quedar solo con la rama `status: OrderStatus` (props `{ status: OrderStatus; className?: string }`), sin `shipmentStatus`, `SHIPMENT_STATUS_LABELS` ni `data-ship`.
  - `app/(admin)/kit/KitContent.tsx`: borrar el import de `ShipmentStatus`, el texto "+ los 5 de envío" (ajustar el hint) y el `Object.values(ShipmentStatus).map(...)`.
  - `components/ui/Badge.tsx:15`: actualizar el comentario ("five shipment statuses").
  - `apps/web/tests/components/StatusChip.test.tsx` y `styles.test.ts`: quitar los casos de `shipmentStatus`/`SHIPMENT_STATUS_BG`.
  - Dejar `styles/tokens.css` (`--ship-*`) y `lib/navigation.ts` (Envíos `available:false`) para M9b.
  - `OutboxHealthPanel.tsx`: ya tiene `ORDER_DELIVERED` (Task 6); `TEAM_SHIPMENT_INCIDENT` se queda.

- [ ] **Step 7: Sin restos**

Run:
```bash
cd /Users/manuelarteaga/Documents/Gira_Clothing
pnpm --filter @gira/shared build
grep -rIn "ShipmentStatus\|SHIPMENT_STATUS\|orderPublicId\|AdminShipment\|shipmentService\|models/Shipment\b\|SHIPMENT_CREATED\|SHIPMENT_STATUS_CHANGED" apps/api/src apps/api/tests packages/shared/src apps/web/src apps/web/tests
```
Expected: sin salida (los falsos positivos de `providerShipmentId` no matchean estos patrones).

- [ ] **Step 8: Typecheck completo y suites afectadas**

Run: `pnpm --filter @gira/api typecheck && pnpm --filter @gira/web typecheck`
Expected: limpios.

- [ ] **Step 9: Commit sugerido (NO ejecutar)**

---

## Task 12: Documentación y ejemplos de entorno

**Files:**
- Modify: `docs/SETUP-REQUERIDO.md`, `apps/api/.env.development.example` (ya hecho en Task 3), `apps/api/.env.production.example`

- [ ] **Step 1: `docs/SETUP-REQUERIDO.md` — sección "Envía (envíos y rastreo)"** (usar el estilo de las secciones existentes; leer el archivo antes de editar). Contenido:

1. **Cuenta:** crear cuenta en Envía y completar el trámite fiscal; cargar **saldo** (cada guía se cobra al comprarse; sin saldo la guía queda en revisión).
2. **Token:** generar el token del ambiente (sandbox y producción son distintos) → `ENVIA_API_TOKEN`, `ENVIA_ENVIRONMENT=sandbox|production`, `ENVIA_CARRIERS`.
3. **Origen:** capturar la dirección de la bodega en Ajustes (`PATCH /admin/settings/shipping`).
4. **Webhook de rastreo (tipo 3 `tracking.simple`):** registrar con `POST https://queries.test.envia.com/webhooks` (sandbox) o el host de producción con `{ "type_id": 3, "url": "https://<api>/api/webhooks/envia", "active": 1 }`; guardar el `data.id`. Responder 2xx < 5 s ya está cubierto.
5. **Secreto y firma — pedir a soporte de Envía:** (a) de dónde sale el secreto de firma → `ENVIA_WEBHOOK_SECRET`; (b) si la firma `v1=` va en hex o base64 (hoy se aceptan ambas); (c) tolerancia de timestamp recomendada → `ENVIA_WEBHOOK_TOLERANCE_MS` (default 300000); (d) la lista de valores de `status` de `tracking.simple`; (e) la forma de la respuesta de `POST /ship/generaltrack/` y su límite de guías por llamada; (f) si `X-Webhook-Id` se conserva en los reintentos.
6. **Sin secreto:** el endpoint responde 503 y el polling (cada 30 min) cubre el rastreo.
7. **Antes de desplegar Eb:** borrar la colección `shipments` (`db.shipments.drop()`) y crear los índices nuevos (`shipmenttrackingevents`, `orders` `{status, tracking.lastSyncedAt}` parcial).
8. **Desarrollo con stub:** `STUB_SHIPPING_WEBHOOK_SECRET` permite firmar webhooks de prueba; prohibido en producción.

- [ ] **Step 2: `.env.production.example`** — sin cambios de variables nuevas (`ENVIA_WEBHOOK_SECRET` ya existe); verificar que el comentario diga "Sin él el rastreo usa polling" (ya lo dice).

- [ ] **Step 3: Nota en el plan maestro** — agregar al final de `~/.claude/plans/pasted-content-id-f154-contexto-proyect-parsed-sphinx.md`: "Eb implementada: la captura manual de guía/Shipment quedó reemplazada por «Marcar enviado» + rastreo de Envía."

---

## Task 13: Verificación completa, code review y cierre

- [ ] **Step 1: Suites**

Run, en orden:
```bash
cd /Users/manuelarteaga/Documents/Gira_Clothing
pnpm --filter @gira/shared build
pnpm --filter @gira/api typecheck
pnpm --filter @gira/api lint
pnpm --filter @gira/api test
pnpm --filter @gira/web typecheck
pnpm --filter @gira/web test
NEXT_PUBLIC_API_URL=http://localhost:4000 pnpm --filter @gira/web build
pnpm audit
```
Expected: todo verde. Si la suite de la API falla 1–2 tests con `socket hang up`/`TypeError: Cannot read properties of undefined`, re-correr **ese archivo** aislado antes de investigar (flake conocido).

- [ ] **Step 2: Code review** — invocar la skill `requesting-code-review` sobre `git diff main...HEAD`. Puntos a pedir explícitamente: carreras entre webhook, polling y `/ship`; el guard CAS de `recordEvent`; que `publicId` no salga en ninguna respuesta nueva ni en logs; límites del body del webhook; que Stripe se comporte igual tras el refactor.

- [ ] **Step 3: Aplicar correcciones del review** con `receiving-code-review` (verificar cada hallazgo contra el código antes de cambiar nada) y re-correr Step 1.

- [ ] **Step 4: `verification-before-completion`** — pegar la salida real de los comandos del Step 1 en el reporte final; nada de "debería funcionar".

- [ ] **Step 5: Entregar a Manuel (NO ejecutar git)**: `git status`, `git diff --stat main...HEAD`, y los comandos:

```bash
git add -A
git commit -m "FEAT: Envía Eb (rastreo, Marcar enviado, correos y retiro de Shipment)"
git checkout main && git merge --no-ff fix/m-envia-b-tracking -m "Merge: Envía Eb tracking"
```
más las acciones previas al deploy (drop `shipments`, índices, `ENVIA_WEBHOOK_SECRET`, registrar el webhook).

- [ ] **Step 6: Memorias** — actualizar `project_milestone_status`, `project_standards_debt` y `project_envia_shipping` (Eb hecha, sigue M9b; resueltos: correo de entregado, carrier en lista cerrada, rate limit propio del webhook de Envía, Shipment deja de ser desviación; pendientes de sandbox: secreto del webhook, hex vs base64, forma de `generaltrack`, strings de `status`, estabilidad de `X-Webhook-Id`, e idempotencia de la guía en `needs_review`).

---

## Autorrevisión del plan

**Cobertura del alcance (1–8 del brief):**
1. `/ship` → Task 7 (+ `where` en Task 5). 2. `ShipmentTrackingEvent` único y avance solo hacia adelante → Tasks 5 y 7. 3. Webhook raw/HMAC/tolerancia/`X-Webhook-Id`/limiter/503 + `webhookService` parametrizado → Tasks 2, 4 y 8. 4. Polling + interfaz del adapter (stub y Envía) → Tasks 3, 4 y 10. 5. Convergencia, disputa, incidencias con `order` → Task 7. 6. Correos enviado/entregado con folio y `trackUrl` → Task 6. 7. Lecturas (`/orders/:publicId/tracking`, "mis pedidos", admin) → Tasks 7 y 9. 8. Retiro de Shipment, DTOs, tests, web y `SETUP-REQUERIDO` → Tasks 11 y 12.

**Consistencia de nombres:** `ShipmentTrackingStatus`, `TrackingEvent`, `IncomingTrackingEvent` (+`providerEventId`), `applyTrackingEvents(provider, events)`, `markShipped(orderId, ctx)`, `getAdminTracking`, `getPublicTracking` (nuevo, en `shipmentTrackingService`), `PublicTrackingView` (el viejo `PublicTracking` se borra en Task 11), `runWebhookEvent(provider, delivery, effect)`, `handleShippingWebhook`, `reconcileTracking`, `enviaWebhookLimiter`, `signWebhook/verifyWebhookSignature`, `openEnvelope`, `installFakeShippingProvider({webhookSecret})`, `signedTrackingWebhook`, `STUB_SHIPPING_WEBHOOK_SECRET` ↔ `env.stubShippingWebhookSecret`.

**Riesgos conocidos y cómo se cubren:**
- Typecheck de la API roto entre Task 3 y Task 4, y por `shipmentService` hasta Task 11: se anota en los pasos; no se hace commit en ese intervalo.
- El shape de `generaltrack` y los `status` de `tracking.simple` no están documentados: parseo defensivo + tests con ambas formas + pendiente explícito en `SETUP-REQUERIDO`.
- Los helpers de test (`createPendingOrder`, `applyPaymentSucceeded`, `customerWithOrder`) se copian de tests existentes (`shippingLabel.test.ts`, `myOrders.test.ts`) en vez de inventarlos.
