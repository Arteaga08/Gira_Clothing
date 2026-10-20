# Milestone Envía · Fase Ea — Cotización, checkout y compra de guía

> **Para agentes:** SUB-SKILL REQUERIDA: `superpowers:subagent-driven-development` (recomendada) o `superpowers:executing-plans`. Los pasos usan casillas `- [ ]`.
>
> **Regla de git de este proyecto (CLAUDE.md global, anula la plantilla):** NO se ejecuta `git add/commit/push`. Cada tarea termina con un *checkpoint* (`git status --short` + `git diff --stat`) y Manuel hace los commits.

**Meta:** Reemplazar la tarifa fija por cotización real de Envía en el checkout y comprar la guía automáticamente al pagar, con reintentos, estado persistido en la orden y cancelación cuando el pedido se reembolsa.

**Arquitectura:** Adapter `ShippingProvider` (Envía real + stub, igual que `adapters/payment`) elegido por `env`. La cotización se guarda en el servidor (`ShippingQuote`, `rateId` opaco, huella del carrito); la orden recibe solo `{quoteId, rateId}` y congela selección + paquete. La guía se compra en segundo plano con reclamo atómico (`label.status`), backoff y `needs_review`; un job cada minuto recoge pendientes. Rama: `fix/m-envia-a-quote-label`. La fase **Eb** (webhook, rastreo, "Marcar enviado", correos, borrar Shipment) va en otro plan.

**Stack:** Node/Express 5, Mongoose 8 (replica set en tests), Joi, Vitest, `fetch` nativo (sin SDK de Envía), `@gira/shared` consumido desde `dist/`.

**Decisiones de contexto (ya aprobadas):** solo México; el cliente elige entre las opciones cotizadas; peso por producto + caja estándar; Envía caído al cotizar → se bloquea; la guía se compra sola al pagar y el cliente la ve hasta que la orden esté *enviada* (Eb); reembolso/contracargo perdido con guía sin recoger → cancelar la guía.

**Comandos base** (desde la raíz del repo):
- Shared: `pnpm --filter @gira/shared build`
- Un archivo de test: `pnpm --filter @gira/api test -- tests/unit/foo.test.ts`
- Typecheck API: `pnpm --filter @gira/api typecheck` (tests/ está FUERA de tsc: se verifican corriendo vitest)
- Suite completa: `pnpm --filter @gira/api test` (flake conocido: 1-2 fallos → re-correr ese archivo aislado)

**Aviso de alcance:** la fase Ea deja `Shipment`/`ShipmentStatus` y su captura manual funcionando sin tocarlos; se eliminan en Eb. Mientras tanto la orden ya tiene `label` pero `processing→shipped` sigue siendo vía `Shipment`.

---

## Mapa de archivos

**Crear (API `apps/api/src/`):**
| Archivo | Responsabilidad |
|---|---|
| `adapters/shipping/types.ts` | Interfaz `ShippingProvider`, `ShippingProviderError`, tipos de dominio (centavos MXN) |
| `adapters/shipping/stubShippingProvider.ts` | Proveedor determinista sin red (dev/test) |
| `adapters/shipping/enviaShippingProvider.ts` | Cliente HTTP de Envía (`fetch`), único archivo que conoce su vocabulario |
| `adapters/shipping/index.ts` | `getShippingProvider()` + `__setShippingProviderForTests` |
| `services/parcelService.ts` | `computeParcel` puro: peso + tara + caja escalada |
| `models/ShippingQuote.ts` | Cotización persistida con TTL |
| `services/shippingQuoteService.ts` | `createShippingQuote`, `resolveQuotedRate`, `buildFingerprint` |
| `controllers/shippingController.ts`, `validators/shippingValidator.ts`, `routes/v1/shippingRoutes.ts` | `POST /api/v1/shipping/quotes` |
| `services/shippingLabelService.ts` | Compra/reintento/cancelación de guía |
| `jobs/processShippingLabels.ts` | Barrido cada minuto |
| `scripts/backfillProductWeight.ts` | Asigna peso a productos existentes (lo corre Manuel) |

**Crear (shared `packages/shared/src/`):** `enums/shipping.ts`, `constants/shipping.ts`, `labels/shipping.ts`, `types/shipping.ts`.

**Crear (tests `apps/api/tests/`):** `unit/shippingAdapter.test.ts`, `unit/enviaProvider.test.ts`, `unit/parcelService.test.ts`, `integration/shippingQuote.test.ts`, `integration/shippingLabel.test.ts`, `integration/shippingLabelCancel.test.ts`, `integration/shippingLabelJob.test.ts`, `helpers/fakeShippingProvider.ts`.

**Modificar:** `config/env.ts`, `.env.development.example`, `.env.production.example`, `models/Settings.ts`, `models/Product.ts`, `models/Order.ts`, `services/settingsService.ts`, `services/productService.ts`, `services/pricingService.ts`, `services/orderService.ts`, `services/adminOrderService.ts`, `services/orderPaymentService.ts`, `validators/{settingsValidator,productValidator,orderValidator}.ts`, `middlewares/rateLimit.ts`, `routes/v1/index.ts`, `jobs/scheduler.ts`, `jobs/dispatchNotifications.ts`, `templates/teamMessages.ts`, `package.json` (script), y los tests/helpers existentes que construyen órdenes (Tarea 9).

---

## Tarea 0: Rama y línea base

- [ ] **Paso 1:** Confirmar rama y árbol limpio.

```bash
git branch --show-current   # fix/m-envia-a-quote-label
git status --short          # (vacío)
pnpm --filter @gira/shared build && pnpm --filter @gira/api typecheck
```
Esperado: sin errores. Si falla, parar (la línea base debe estar verde).

- [ ] **Paso 2:** Correr la suite completa una vez y anotar fallos preexistentes (flake): `pnpm --filter @gira/api test 2>&1 | tail -15`.

---

## Tarea 1: `@gira/shared` — enums, estados, tipos

**Archivos:**
- Crear: `packages/shared/src/enums/shipping.ts`, `constants/shipping.ts`, `labels/shipping.ts`, `types/shipping.ts`
- Modificar: `enums/notification.ts`, `enums/auditAction.ts`, `types/settings.ts`, `types/order.ts`, `index.ts`

- [ ] **Paso 1: Enums** — crear `packages/shared/src/enums/shipping.ts`:

```ts
/** Which adapter produced a rate/label. Stored on the order so a label is never bought from a different provider than the one quoted. */
enum ShippingProviderName {
  STUB = "stub",
  ENVIA = "envia",
}

/**
 * Closed list of carriers the store sells. Anything else the provider returns
 * is dropped at the adapter. Adjust against GET /carrier?country_code=MX in the
 * Envía sandbox before going live.
 */
enum ShippingCarrier {
  ESTAFETA = "estafeta",
  FEDEX = "fedex",
  DHL = "dhl",
  PAQUETEXPRESS = "paquetexpress",
  REDPACK = "redpack",
  UPS = "ups",
}

/** Lifecycle of the purchased label, persisted on the order. */
enum ShippingLabelStatus {
  /** Queued: waiting for the first (or next) purchase attempt. */
  PENDING = "pending",
  /** A purchase attempt is in flight (lease). */
  REQUESTED = "requested",
  READY = "ready",
  /** A retryable failure; `nextAttemptAt` says when the job tries again. */
  FAILED = "failed",
  /** A human must look: retries exhausted, uncertain outcome, or bad setup. */
  NEEDS_REVIEW = "needs_review",
  CANCEL_PENDING = "cancel_pending",
  CANCELLED = "cancelled",
}

export { ShippingProviderName, ShippingCarrier, ShippingLabelStatus };
```

- [ ] **Paso 2: Estados y patrones** — crear `packages/shared/src/constants/shipping.ts` (los códigos son los de 2 letras que Envía usa en `state`; se confirman contra `GET /state?country_code=MX` del sandbox — si difieren, es el ÚNICO lugar a corregir):

```ts
interface MexicanState {
  code: string;
  name: string;
}

const MEXICAN_STATES: readonly MexicanState[] = [
  { code: "AG", name: "Aguascalientes" },
  { code: "BC", name: "Baja California" },
  { code: "BS", name: "Baja California Sur" },
  { code: "CM", name: "Campeche" },
  { code: "CS", name: "Chiapas" },
  { code: "CH", name: "Chihuahua" },
  { code: "CX", name: "Ciudad de México" },
  { code: "CO", name: "Coahuila" },
  { code: "CL", name: "Colima" },
  { code: "DG", name: "Durango" },
  { code: "GT", name: "Guanajuato" },
  { code: "GR", name: "Guerrero" },
  { code: "HG", name: "Hidalgo" },
  { code: "JC", name: "Jalisco" },
  { code: "MX", name: "Estado de México" },
  { code: "MI", name: "Michoacán" },
  { code: "MO", name: "Morelos" },
  { code: "NA", name: "Nayarit" },
  { code: "NL", name: "Nuevo León" },
  { code: "OA", name: "Oaxaca" },
  { code: "PU", name: "Puebla" },
  { code: "QT", name: "Querétaro" },
  { code: "QR", name: "Quintana Roo" },
  { code: "SL", name: "San Luis Potosí" },
  { code: "SI", name: "Sinaloa" },
  { code: "SO", name: "Sonora" },
  { code: "TB", name: "Tabasco" },
  { code: "TM", name: "Tamaulipas" },
  { code: "TL", name: "Tlaxcala" },
  { code: "VE", name: "Veracruz" },
  { code: "YU", name: "Yucatán" },
  { code: "ZA", name: "Zacatecas" },
];

const MEXICAN_STATE_CODES: readonly string[] = MEXICAN_STATES.map((s) => s.code);

const POSTAL_CODE_PATTERN = /^\d{5}$/;
/** Ten digits, no country code: what carriers require for contact. */
const PHONE_PATTERN = /^\d{10}$/;

export type { MexicanState };
export { MEXICAN_STATES, MEXICAN_STATE_CODES, POSTAL_CODE_PATTERN, PHONE_PATTERN };
```

- [ ] **Paso 3: Labels** — `packages/shared/src/labels/shipping.ts`:

```ts
import { ShippingCarrier } from "../enums/shipping.js";

const SHIPPING_CARRIER_LABELS: Record<ShippingCarrier, string> = {
  [ShippingCarrier.ESTAFETA]: "Estafeta",
  [ShippingCarrier.FEDEX]: "FedEx",
  [ShippingCarrier.DHL]: "DHL",
  [ShippingCarrier.PAQUETEXPRESS]: "Paquetexpress",
  [ShippingCarrier.REDPACK]: "Redpack",
  [ShippingCarrier.UPS]: "UPS",
};

export { SHIPPING_CARRIER_LABELS };
```

- [ ] **Paso 4: Tipos** — `packages/shared/src/types/shipping.ts`:

```ts
import type { Currency } from "../enums/money.js";
import type { ShippingCarrier, ShippingLabelStatus, ShippingProviderName } from "../enums/shipping.js";

/** Warehouse the parcels leave from. Business data (not customer PII), edited in Ajustes. */
interface ShippingOrigin {
  name: string;
  phone: string;
  email?: string;
  line1: string;
  district: string;
  city: string;
  /** Code from MEXICAN_STATES. */
  state: string;
  postalCode: string;
}

interface ShippingParcel {
  weightGrams: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
}

/** Standard box + packaging used to derive a parcel from the cart's product weights. */
interface ShippingParcelSettings {
  tareGrams: number;
  boxLengthCm: number;
  boxWidthCm: number;
  boxHeightCm: number;
  /** Height added per garment beyond the first. */
  extraUnitHeightCm: number;
  maxWeightGrams: number;
}

/** What the customer picks at checkout. `amount` is in the requested charge currency. */
interface ShippingRate {
  rateId: string;
  carrier: ShippingCarrier;
  carrierName: string;
  service: string;
  serviceName: string;
  amount: number;
  estimatedDays: number;
}

interface ShippingQuoteResponse {
  quoteId: string;
  currency: Currency;
  /** ISO timestamp. */
  expiresAt: string;
  rates: ShippingRate[];
}

/** The rate the order froze at checkout. Admin-only: carries what the store pays (`costMxn`). */
interface OrderShippingSelection {
  provider: ShippingProviderName;
  carrier: ShippingCarrier;
  service: string;
  serviceName: string;
  estimatedDays: number;
  /** What the customer was charged for shipping, MXN centavos (0 when free). */
  amountMxn: number;
  /** What the provider quoted us, MXN centavos. */
  costMxn: number;
}

/** What the customer may see of the selection (no cost). */
interface PublicShippingSelection {
  carrier: ShippingCarrier;
  serviceName: string;
  estimatedDays: number;
}

interface OrderLabelAdmin {
  status: ShippingLabelStatus;
  attempts: number;
  lastError?: string;
  trackingNumber?: string;
  carrier?: ShippingCarrier;
  labelUrl?: string;
  trackUrl?: string;
  readyAt?: Date;
  cancelledAt?: Date;
}

export type {
  ShippingOrigin,
  ShippingParcel,
  ShippingParcelSettings,
  ShippingRate,
  ShippingQuoteResponse,
  OrderShippingSelection,
  PublicShippingSelection,
  OrderLabelAdmin,
};
```

- [ ] **Paso 5: Notificaciones y auditoría.** En `enums/notification.ts`, dentro de `enum NotificationType`, después de `TEAM_DISPUTE_LOST = "team_dispute_lost",` agregar:

```ts
  /** The label could not be bought (retries exhausted, uncertain outcome or bad setup). One per order. */
  TEAM_SHIPPING_LABEL_FAILED = "team_shipping_label_failed",
  /** The provider refused to cancel a label of a refunded order. One per order. */
  TEAM_SHIPPING_LABEL_CANCEL_FAILED = "team_shipping_label_cancel_failed",
```
En `enums/auditAction.ts`, dentro de `enum AuditAction` antes de `NOTIFICATION_FAILED`:

```ts
  LABEL_REQUESTED = "label_requested",
  LABEL_CREATED = "label_created",
  LABEL_FAILED = "label_failed",
  LABEL_NEEDS_REVIEW = "label_needs_review",
  LABEL_RETRY_REQUESTED = "label_retry_requested",
  LABEL_CANCEL_REQUESTED = "label_cancel_requested",
  LABEL_CANCELLED = "label_cancelled",
```

- [ ] **Paso 6: Tipos existentes.** `types/settings.ts`: reemplazar `ShippingSettings` por

```ts
import type { ShippingOrigin, ShippingParcelSettings } from "./shipping.js";

interface ShippingSettings {
  /** null until the owner fills it in Ajustes: quoting and labels stay disabled. */
  origin: ShippingOrigin | null;
  freeShippingThreshold: number | null;
  parcel: ShippingParcelSettings;
  quoteTtlMinutes: number;
}
```
(el `import type` va arriba del archivo). En `types/order.ts`: añadir `district: string;` a `ShippingAddress` (después de `line2?: string;`), importar `PublicShippingSelection, OrderShippingSelection, OrderLabelAdmin, ShippingParcel` desde `./shipping.js`, agregar a `PublicOrder` el campo `shippingSelection?: PublicShippingSelection;` y a `AdminOrder`:

```ts
  shippingSelection?: OrderShippingSelection;
  parcel?: ShippingParcel;
  label?: OrderLabelAdmin;
```
(`?` porque órdenes viejas de pruebas no los tienen; las nuevas siempre sí.)

- [ ] **Paso 7: Exportar** desde `packages/shared/src/index.ts`: importar y reexportar los 3 enums, `MEXICAN_STATES, MEXICAN_STATE_CODES, POSTAL_CODE_PATTERN, PHONE_PATTERN`, `SHIPPING_CARRIER_LABELS`, y los tipos `ShippingOrigin, ShippingParcel, ShippingParcelSettings, ShippingRate, ShippingQuoteResponse, OrderShippingSelection, PublicShippingSelection, OrderLabelAdmin, MexicanState`, siguiendo el patrón de bloques `import … / export …` del archivo.

- [ ] **Paso 8: Compilar y revisar consumidores.**

```bash
pnpm --filter @gira/shared build
grep -rn "nationalFee\|internationalFee" apps packages --include=*.ts --include=*.tsx -l | grep -v node_modules
```
Esperado: build OK; la lista de `grep` son los archivos que se arreglan en la Tarea 6 (api) — si aparece algo en `apps/web`, anotarlo y corregirlo ahí.

- [ ] **Checkpoint:** `git diff --stat`.

---

## Tarea 2: Configuración de entorno `ENVIA_*`

**Archivos:** `apps/api/src/config/env.ts`, `.env.development.example`, `.env.production.example`, `tests/unit/env.test.ts`.

- [ ] **Paso 1: Tests rojos** — en `tests/unit/env.test.ts`, dentro del `describe("loadEnv")` (al final, antes del `});` de cierre), agregar. El helper `validSource()` ya existe; además, **busca todos los tests que arman un entorno `production` válido y agrega `ENVIA_API_TOKEN: "tok_x"` a esos fixtures** (`grep -n 'production' tests/unit/env.test.ts`), porque ahora es obligatorio allí:

```ts
  describe("Envía", () => {
    it("sin token fuera de producción usa el adapter stub (envia: null)", () => {
      expect(loadEnv(validSource()).envia).toBeNull();
    });

    it("con token arma la configuración con defaults sanos", () => {
      const source = validSource();
      source.ENVIA_API_TOKEN = "tok_sandbox";
      const env = loadEnv(source);
      expect(env.envia).toEqual({
        apiToken: "tok_sandbox",
        environment: "sandbox",
        carriers: ["estafeta", "fedex", "dhl", "paquetexpress", "redpack"],
        webhookSecret: null,
        webhookToleranceMs: 300_000,
      });
    });

    it("acepta paqueterías, secreto y tolerancia propios", () => {
      const source = validSource();
      source.ENVIA_API_TOKEN = "tok";
      source.ENVIA_CARRIERS = "dhl, fedex";
      source.ENVIA_WEBHOOK_SECRET = "whsec_x";
      source.ENVIA_WEBHOOK_TOLERANCE_MS = "60000";
      const env = loadEnv(source);
      expect(env.envia?.carriers).toEqual(["dhl", "fedex"]);
      expect(env.envia?.webhookSecret).toBe("whsec_x");
      expect(env.envia?.webhookToleranceMs).toBe(60_000);
    });

    it("aborta con una paquetería fuera de la lista cerrada", () => {
      const source = validSource();
      source.ENVIA_API_TOKEN = "tok";
      source.ENVIA_CARRIERS = "dhl,paqueteria_falsa";
      expect(() => loadEnv(source)).toThrow(/ENVIA_CARRIERS/);
    });

    it("aborta con un ambiente inválido", () => {
      const source = validSource();
      source.ENVIA_API_TOKEN = "tok";
      source.ENVIA_ENVIRONMENT = "staging";
      expect(() => loadEnv(source)).toThrow(/ENVIA_ENVIRONMENT/);
    });

    it("en producción exige ENVIA_API_TOKEN y el ambiente por defecto es production", () => {
      const source = productionSource(); // ver nota abajo
      delete source.ENVIA_API_TOKEN;
      expect(() => loadEnv(source)).toThrow(/ENVIA_API_TOKEN/);
      source.ENVIA_API_TOKEN = "tok_live";
      expect(loadEnv(source).envia?.environment).toBe("production");
    });
  });
```
Nota: `productionSource()` no existe; crea en el mismo archivo un helper local que copie `validSource()` y ponga lo que los demás tests de producción ya ponen (`NODE_ENV=production`, Stripe, Resend, Telegram, Cloudinary, `COOKIE_SECURE`, `RATE_LIMIT_ENABLED`…) — copia exactamente las asignaciones de un test de producción existente (p. ej. "en producción exige las dos variables de Stripe", línea ~94).

- [ ] **Paso 2: Ver rojo:** `pnpm --filter @gira/api test -- tests/unit/env.test.ts` → falla (`envia` no existe).

- [ ] **Paso 3: Implementar** en `config/env.ts`:
  1. Importar arriba: `import { ShippingCarrier } from "@gira/shared";`
  2. Tras `interface TelegramConfig`:

```ts
interface EnviaConfig {
  apiToken: string;
  /** Sandbox and production use different hosts AND different tokens. */
  environment: "sandbox" | "production";
  /** One rate call is made per carrier in this list. */
  carriers: ShippingCarrier[];
  /** null = the webhook endpoint answers 503 and tracking relies on polling. */
  webhookSecret: string | null;
  webhookToleranceMs: number;
}
```
  3. En `interface Env`, tras `telegram`: 
```ts
  /** null outside production when no token is configured -> stub shipping adapter. */
  envia: EnviaConfig | null;
```
  4. Antes de `if (errors.length > 0) {` de `loadEnv`:

```ts
  // Shipping is a central business flow (no rates = no checkout): required in production.
  const DEFAULT_CARRIERS = "estafeta,fedex,dhl,paquetexpress,redpack";
  let envia: EnviaConfig | null = null;
  const enviaToken =
    nodeEnv === "production"
      ? requireVar(source, "ENVIA_API_TOKEN", errors)
      : source.ENVIA_API_TOKEN?.trim();
  if (enviaToken) {
    const environmentRaw =
      source.ENVIA_ENVIRONMENT?.trim() || (nodeEnv === "production" ? "production" : "sandbox");
    if (environmentRaw !== "sandbox" && environmentRaw !== "production") {
      errors.push("ENVIA_ENVIRONMENT debe ser sandbox o production.");
    }
    const carriers = (source.ENVIA_CARRIERS?.trim() || DEFAULT_CARRIERS)
      .split(",")
      .map((c) => c.trim().toLowerCase())
      .filter(Boolean);
    const allowed = Object.values(ShippingCarrier) as string[];
    const unknown = carriers.filter((c) => !allowed.includes(c));
    if (unknown.length > 0 || carriers.length === 0) {
      errors.push(`ENVIA_CARRIERS inválido (${unknown.join(", ") || "vacío"}). Permitidas: ${allowed.join(", ")}.`);
    }
    const toleranceRaw = source.ENVIA_WEBHOOK_TOLERANCE_MS?.trim();
    const webhookToleranceMs = toleranceRaw ? Number(toleranceRaw) : 300_000;
    if (!Number.isInteger(webhookToleranceMs) || webhookToleranceMs <= 0) {
      errors.push("ENVIA_WEBHOOK_TOLERANCE_MS debe ser un entero positivo de milisegundos.");
    }
    envia = {
      apiToken: enviaToken,
      environment: environmentRaw === "production" ? "production" : "sandbox",
      carriers: carriers as ShippingCarrier[],
      webhookSecret: source.ENVIA_WEBHOOK_SECRET?.trim() || null,
      webhookToleranceMs,
    };
  }
```
  5. Añadir `envia,` al `Object.freeze<Env>({...})` y `EnviaConfig` al `export type {…}`.

- [ ] **Paso 4: Ver verde** (mismo comando) → PASS.

- [ ] **Paso 5: Ejemplos de entorno.** En `apps/api/.env.development.example` y `.env.production.example`, junto al bloque de Stripe, agregar (placeholders, nunca valores reales):

```
# --- Envía (envia.com): cotización, guías y rastreo ---
# Obligatorio en producción; si se omite en dev/test se usa un adapter stub sin red.
# El token de sandbox NO sirve en producción (y viceversa).
ENVIA_API_TOKEN=
# sandbox | production (default: sandbox fuera de producción, production en producción)
ENVIA_ENVIRONMENT=sandbox
# Paqueterías a cotizar (una llamada por cada una). Lista cerrada: estafeta,fedex,dhl,paquetexpress,redpack,ups
ENVIA_CARRIERS=estafeta,fedex,dhl,paquetexpress,redpack
# Opcional: secreto para verificar webhooks (se pide a soporte de Envía). Sin él el rastreo usa polling.
ENVIA_WEBHOOK_SECRET=
ENVIA_WEBHOOK_TOLERANCE_MS=300000
```

- [ ] **Checkpoint:** `git diff --stat`.

---

## Tarea 3: Interfaz del adapter y stub

**Archivos:** crear `adapters/shipping/types.ts`, `stubShippingProvider.ts`, `index.ts`, `tests/unit/shippingAdapter.test.ts`, `tests/helpers/fakeShippingProvider.ts`.

- [ ] **Paso 1: Test rojo** — `tests/unit/shippingAdapter.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { ShippingCarrier } from "@gira/shared";
import { createStubShippingProvider } from "../../src/adapters/shipping/stubShippingProvider.js";
import { ShippingProviderError } from "../../src/adapters/shipping/types.js";
import { getShippingProvider } from "../../src/adapters/shipping/index.js";

const origin = {
  name: "Gira Clothing",
  phone: "5512345678",
  line1: "Av. Reforma 100",
  district: "Juárez",
  city: "Ciudad de México",
  state: "CX",
  postalCode: "06600",
};
const destination = {
  name: "Ana Pérez",
  phone: "5598765432",
  line1: "Calle Falsa 123",
  district: "Centro",
  city: "Monterrey",
  state: "NL",
  postalCode: "64000",
};
const parcel = { weightGrams: 800, lengthCm: 30, widthCm: 25, heightCm: 8 };

describe("stubShippingProvider", () => {
  const stub = createStubShippingProvider();

  it("se identifica como stub", () => {
    expect(stub.name).toBe("stub");
  });

  it("cotiza tarifas deterministas en centavos MXN, solo con paqueterías de la lista", async () => {
    const rates = await stub.getRates({ origin, destination, parcel, declaredValueMxn: 100_000 }, {});
    expect(rates.length).toBeGreaterThanOrEqual(2);
    for (const r of rates) {
      expect(Object.values(ShippingCarrier)).toContain(r.carrier);
      expect(Number.isInteger(r.costMxn)).toBe(true);
      expect(r.costMxn).toBeGreaterThan(0);
    }
    expect(await stub.getRates({ origin, destination, parcel, declaredValueMxn: 100_000 }, {})).toEqual(rates);
  });

  it("compra una guía con número de rastreo determinista por orden", async () => {
    const input = {
      orderRef: "GC-AAAA1111",
      origin,
      destination,
      parcel,
      carrier: ShippingCarrier.ESTAFETA,
      service: "ground",
      declaredValueMxn: 100_000,
    };
    const a = await stub.createLabel(input, {});
    const b = await stub.createLabel(input, {});
    expect(a.trackingNumber).toMatch(/^STUB/);
    expect(a.trackingNumber).toBe(b.trackingNumber);
    expect(a.labelUrl).toMatch(/^https:\/\//);
    expect(a.carrier).toBe(ShippingCarrier.ESTAFETA);
  });

  it("cancela una guía sin error", async () => {
    await expect(
      stub.cancelLabel({ carrier: ShippingCarrier.ESTAFETA, trackingNumber: "STUB123" }, {}),
    ).resolves.toBeUndefined();
  });
});

describe("ShippingProviderError", () => {
  it("lleva su tipo y un mensaje en español", () => {
    const err = new ShippingProviderError("rejected", "Dirección inválida");
    expect(err.kind).toBe("rejected");
    expect(err).toBeInstanceOf(Error);
  });
});

describe("getShippingProvider", () => {
  it("sin ENVIA_API_TOKEN (tests) entrega el stub", () => {
    expect(getShippingProvider().name).toBe("stub");
  });
});
```

- [ ] **Paso 2: Rojo:** `pnpm --filter @gira/api test -- tests/unit/shippingAdapter.test.ts` → falla (módulos inexistentes).

- [ ] **Paso 3: Interfaz** — `adapters/shipping/types.ts`:

```ts
import type { ShippingCarrier, ShippingOrigin, ShippingParcel, ShippingProviderName } from "@gira/shared";

/**
 * Narrow, domain-owned port (BACKEND_ARCHITECTURE_GUIDELINES, "Integraciones
 * externas"): money is MXN centavos, carriers are OUR closed list, errors are
 * Spanish. Nothing carrying a provider's vocabulary leaves its adapter file.
 */

interface ShippingDestination {
  name: string;
  phone: string;
  email?: string;
  line1: string;
  line2?: string;
  district: string;
  city: string;
  /** Code from MEXICAN_STATES. */
  state: string;
  postalCode: string;
}

interface RatesInput {
  origin: ShippingOrigin;
  destination: ShippingDestination;
  parcel: ShippingParcel;
  /** Goods value, MXN centavos (insurance / declared value). */
  declaredValueMxn: number;
}

interface ProviderRate {
  carrier: ShippingCarrier;
  /** Provider service code, needed again to buy the label. */
  service: string;
  serviceName: string;
  costMxn: number;
  estimatedDays: number;
}

interface CreateLabelInput extends RatesInput {
  /** Our human folio, sent as a reference on the label. */
  orderRef: string;
  carrier: ShippingCarrier;
  service: string;
}

interface LabelResult {
  providerShipmentId: string;
  trackingNumber: string;
  carrier: ShippingCarrier;
  labelUrl: string;
  trackUrl: string;
  costMxn: number;
}

interface CancelLabelInput {
  carrier: ShippingCarrier;
  trackingNumber: string;
}

interface CallOptions {
  /** Aborts the call (used by tests; adapters also enforce their own deadlines). */
  signal?: AbortSignal;
}

interface ShippingProvider {
  readonly name: ShippingProviderName;
  getRates(input: RatesInput, options: CallOptions): Promise<ProviderRate[]>;
  createLabel(input: CreateLabelInput, options: CallOptions): Promise<LabelResult>;
  cancelLabel(input: CancelLabelInput, options: CallOptions): Promise<void>;
}

/**
 * - rejected: the provider refused (bad address, no balance, not cancellable).
 *   Nothing was created; retrying the same input will not help until it changes.
 * - unavailable: the call did not go through (rate limit, provider down on a
 *   QUOTE). Safe to retry.
 * - unknown_outcome: the purchase may or may not have happened (timeout / 5xx on
 *   createLabel). The provider has no idempotency key, so this is NEVER retried
 *   automatically.
 */
type ShippingProviderErrorKind = "rejected" | "unavailable" | "unknown_outcome";

class ShippingProviderError extends Error {
  public readonly kind: ShippingProviderErrorKind;

  constructor(kind: ShippingProviderErrorKind, message: string) {
    super(message);
    this.kind = kind;
    Object.setPrototypeOf(this, ShippingProviderError.prototype);
  }
}

export type {
  ShippingDestination,
  RatesInput,
  ProviderRate,
  CreateLabelInput,
  LabelResult,
  CancelLabelInput,
  CallOptions,
  ShippingProvider,
  ShippingProviderErrorKind,
};
export { ShippingProviderError };
```

- [ ] **Paso 4: Stub** — `adapters/shipping/stubShippingProvider.ts`:

```ts
import { createHash } from "node:crypto";
import { ShippingCarrier, ShippingProviderName } from "@gira/shared";
import type { ProviderRate, ShippingProvider } from "./types.js";

/** Fixed catalogue: same input -> same output, so dev and tests are reproducible. */
const STUB_RATES: ProviderRate[] = [
  { carrier: ShippingCarrier.ESTAFETA, service: "ground", serviceName: "Terrestre", costMxn: 12_000, estimatedDays: 5 },
  { carrier: ShippingCarrier.FEDEX, service: "express", serviceName: "Express", costMxn: 15_000, estimatedDays: 3 },
  { carrier: ShippingCarrier.DHL, service: "next_day", serviceName: "Día siguiente", costMxn: 25_000, estimatedDays: 1 },
];

const createStubShippingProvider = (): ShippingProvider => ({
  name: ShippingProviderName.STUB,

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
});

export { createStubShippingProvider };
```

- [ ] **Paso 5: Factory** — `adapters/shipping/index.ts` (la parte real de Envía se conecta en la Tarea 4; por ahora solo el stub):

```ts
import { env } from "../../config/env.js";
import { createStubShippingProvider } from "./stubShippingProvider.js";
import type { ShippingProvider } from "./types.js";

let cached: ShippingProvider | undefined;
let override: ShippingProvider | undefined;

/** Provider chosen by configuration, never by conditionals in business code. */
const getShippingProvider = (): ShippingProvider => {
  if (override) return override;
  cached ??= createStubShippingProvider();
  return cached;
};

/** Tests inject a controllable provider; pass undefined to restore the configured one. */
const __setShippingProviderForTests = (provider: ShippingProvider | undefined): void => {
  override = provider;
};

void env; // wired to env.envia in Task 4

export type {
  ShippingDestination,
  RatesInput,
  ProviderRate,
  CreateLabelInput,
  LabelResult,
  CancelLabelInput,
  CallOptions,
  ShippingProvider,
} from "./types.js";
export { ShippingProviderError } from "./types.js";
export { getShippingProvider, __setShippingProviderForTests };
```

- [ ] **Paso 6: Fake para tests** — `tests/helpers/fakeShippingProvider.ts`:

```ts
import { vi, type Mock } from "vitest";
import { ShippingProviderName } from "@gira/shared";
import { createStubShippingProvider } from "../../src/adapters/shipping/stubShippingProvider.js";
import {
  __setShippingProviderForTests,
  type ShippingProvider,
} from "../../src/adapters/shipping/index.js";

type FakeShippingProvider = ShippingProvider & {
  getRates: Mock<ShippingProvider["getRates"]>;
  createLabel: Mock<ShippingProvider["createLabel"]>;
  cancelLabel: Mock<ShippingProvider["cancelLabel"]>;
};

/**
 * Wraps the real stub in spies so a test can count calls or force a failure
 * (`fake.createLabel.mockRejectedValueOnce(new ShippingProviderError(...))`).
 * Installs itself as the active provider; call `restoreShippingProvider` in afterEach.
 */
const installFakeShippingProvider = (): FakeShippingProvider => {
  const stub = createStubShippingProvider();
  const fake: FakeShippingProvider = {
    name: ShippingProviderName.STUB,
    getRates: vi.fn(stub.getRates),
    createLabel: vi.fn(stub.createLabel),
    cancelLabel: vi.fn(stub.cancelLabel),
  };
  __setShippingProviderForTests(fake);
  return fake;
};

const restoreShippingProvider = (): void => __setShippingProviderForTests(undefined);

export type { FakeShippingProvider };
export { installFakeShippingProvider, restoreShippingProvider };
```

- [ ] **Paso 7: Verde:** `pnpm --filter @gira/api test -- tests/unit/shippingAdapter.test.ts` → PASS. Luego `pnpm --filter @gira/api typecheck`.

- [ ] **Checkpoint:** `git diff --stat`.

---

## Tarea 4: Adapter real de Envía

**Archivos:** crear `adapters/shipping/enviaShippingProvider.ts`, `tests/unit/enviaProvider.test.ts`; modificar `adapters/shipping/index.ts`.

Hechos de la API usados (docs.envia.com, verificados el 2026-10-19): hosts `api-test.envia.com` / `api.envia.com`; `Authorization: Bearer`; `POST /ship/rate/` una paquetería por llamada; `POST /ship/generate/` devuelve `data[0] {carrier, service, shipmentId, trackingNumber, trackUrl, label, totalPrice}` y cobra saldo (402 = saldo insuficiente); `POST /ship/cancel/ {carrier, trackingNumber}`; errores a veces con HTTP 200 y `{"meta":"error","error":{code,message}}`; fallos de autenticación llegan como texto plano. **Sin llave de idempotencia.** Pendiente de confirmar en sandbox (aislado en este archivo): que `destination` acepte datos provisionales en cotización, el código `state` de CDMX y la lista real de paqueterías.

- [ ] **Paso 1: Tests rojos** — `tests/unit/enviaProvider.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { ShippingCarrier } from "@gira/shared";
import { createEnviaShippingProvider } from "../../src/adapters/shipping/enviaShippingProvider.js";
import { ShippingProviderError } from "../../src/adapters/shipping/types.js";

const CONFIG = {
  apiToken: "tok_test",
  environment: "sandbox" as const,
  carriers: [ShippingCarrier.ESTAFETA, ShippingCarrier.FEDEX],
  webhookSecret: null,
  webhookToleranceMs: 300_000,
};

const origin = {
  name: "Gira Clothing", phone: "5512345678", line1: "Av. Reforma 100",
  district: "Juárez", city: "Ciudad de México", state: "CX", postalCode: "06600",
};
const destination = {
  name: "Ana Pérez", phone: "5598765432", line1: "Calle Falsa 123",
  district: "Centro", city: "Monterrey", state: "NL", postalCode: "64000",
};
const parcel = { weightGrams: 850, lengthCm: 30, widthCm: 25, heightCm: 8 };
const rateInput = { origin, destination, parcel, declaredValueMxn: 129_900 };

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const rateEntry = (carrier: string, service: string, totalPrice: number, days = 3) => ({
  carrier, service, serviceDescription: `Servicio ${service}`, totalPrice, currency: "MXN",
  deliveryDate: { dateDifference: days },
});

describe("enviaShippingProvider · getRates", () => {
  it("llama una vez por paquetería, en el host de sandbox y con Bearer", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse({ meta: "rate", data: [rateEntry("estafeta", "ground", 135.5, 4)] })));
    const provider = createEnviaShippingProvider(CONFIG, fetchMock as unknown as typeof fetch);
    await provider.getRates(rateInput, {});
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api-test.envia.com/ship/rate/");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok_test");
    const body = JSON.parse(init.body as string);
    expect(body.packages[0].weight).toBeCloseTo(0.85);
    expect(body.packages[0].weightUnit).toBe("KG");
    expect(body.packages[0].declaredValue).toBe(1299);
    expect(body.destination.state).toBe("NL");
    expect(body.shipment.carrier).toBe("estafeta");
  });

  it("usa el host de producción cuando el ambiente es production", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse({ meta: "rate", data: [] })));
    const provider = createEnviaShippingProvider({ ...CONFIG, environment: "production" }, fetchMock as unknown as typeof fetch);
    await provider.getRates(rateInput, {}).catch(() => undefined);
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe("https://api.envia.com/ship/rate/");
  });

  it("convierte pesos a centavos y mapea paquetería, servicio y días", async () => {
    const fetchMock = vi.fn((_u: string, init: RequestInit) => {
      const carrier = JSON.parse(init.body as string).shipment.carrier as string;
      return Promise.resolve(jsonResponse({ meta: "rate", data: [rateEntry(carrier, "ground", 135.5, 4)] }));
    });
    const provider = createEnviaShippingProvider(CONFIG, fetchMock as unknown as typeof fetch);
    const rates = await provider.getRates(rateInput, {});
    expect(rates).toHaveLength(2);
    expect(rates[0]).toEqual({
      carrier: ShippingCarrier.ESTAFETA, service: "ground", serviceName: "Servicio ground",
      costMxn: 13_550, estimatedDays: 4,
    });
  });

  it("ignora una paquetería que falla y devuelve las demás", async () => {
    const fetchMock = vi.fn((_u: string, init: RequestInit) => {
      const carrier = JSON.parse(init.body as string).shipment.carrier as string;
      return Promise.resolve(
        carrier === "estafeta"
          ? jsonResponse({ meta: "error", error: { code: 400, message: "sin cobertura" } })
          : jsonResponse({ meta: "rate", data: [rateEntry(carrier, "express", 150, 2)] }),
      );
    });
    const provider = createEnviaShippingProvider(CONFIG, fetchMock as unknown as typeof fetch);
    const rates = await provider.getRates(rateInput, {});
    expect(rates.map((r) => r.carrier)).toEqual([ShippingCarrier.FEDEX]);
  });

  it("descarta paqueterías fuera de la lista cerrada", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse({ meta: "rate", data: [rateEntry("paqueteria_rara", "x", 90)] })));
    const provider = createEnviaShippingProvider(CONFIG, fetchMock as unknown as typeof fetch);
    expect(await provider.getRates(rateInput, {})).toEqual([]);
  });

  it("si todas fallan por la dirección lanza rejected; si todas caen, unavailable", async () => {
    const bad = vi.fn(() => Promise.resolve(jsonResponse({ meta: "error", error: { code: 422, message: "CP inválido" } })));
    await expect(createEnviaShippingProvider(CONFIG, bad as unknown as typeof fetch).getRates(rateInput, {}))
      .rejects.toMatchObject({ kind: "rejected" });
    const down = vi.fn(() => Promise.reject(new TypeError("fetch failed")));
    await expect(createEnviaShippingProvider(CONFIG, down as unknown as typeof fetch).getRates(rateInput, {}))
      .rejects.toMatchObject({ kind: "unavailable" });
  });
});

describe("enviaShippingProvider · createLabel", () => {
  const labelInput = { ...rateInput, orderRef: "GC-ABCD1234", carrier: ShippingCarrier.FEDEX, service: "express" };
  const okLabel = {
    meta: "generate",
    data: [{ carrier: "fedex", service: "express", shipmentId: 98765, trackingNumber: "794644790138",
      trackUrl: "https://envia.com/track/794644790138", label: "https://files.envia.com/l.pdf", totalPrice: 150 }],
  };

  it("compra la guía y devuelve nuestro vocabulario", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse(okLabel)));
    const provider = createEnviaShippingProvider(CONFIG, fetchMock as unknown as typeof fetch);
    const result = await provider.createLabel(labelInput, {});
    expect(result).toEqual({
      providerShipmentId: "98765", trackingNumber: "794644790138", carrier: ShippingCarrier.FEDEX,
      labelUrl: "https://files.envia.com/l.pdf", trackUrl: "https://envia.com/track/794644790138", costMxn: 15_000,
    });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api-test.envia.com/ship/generate/");
    const body = JSON.parse(init.body as string);
    expect(body.shipment.service).toBe("express");
    expect(body.settings.printFormat).toBe("PDF");
  });

  it("402 (saldo insuficiente) y errores de negocio son rejected", async () => {
    const f402 = vi.fn(() => Promise.resolve(jsonResponse({ meta: "error", error: { code: 402, message: "saldo" } }, 402)));
    await expect(createEnviaShippingProvider(CONFIG, f402 as unknown as typeof fetch).createLabel(labelInput, {}))
      .rejects.toMatchObject({ kind: "rejected", message: expect.stringContaining("saldo") });
    const f200 = vi.fn(() => Promise.resolve(jsonResponse({ meta: "error", error: { code: 400, message: "dirección" } })));
    await expect(createEnviaShippingProvider(CONFIG, f200 as unknown as typeof fetch).createLabel(labelInput, {}))
      .rejects.toMatchObject({ kind: "rejected" });
  });

  it("un fallo de red, timeout o 5xx es unknown_outcome (nunca se reintenta solo)", async () => {
    const net = vi.fn(() => Promise.reject(new TypeError("fetch failed")));
    await expect(createEnviaShippingProvider(CONFIG, net as unknown as typeof fetch).createLabel(labelInput, {}))
      .rejects.toMatchObject({ kind: "unknown_outcome" });
    const f503 = vi.fn(() => Promise.resolve(new Response("oops", { status: 503 })));
    await expect(createEnviaShippingProvider(CONFIG, f503 as unknown as typeof fetch).createLabel(labelInput, {}))
      .rejects.toMatchObject({ kind: "unknown_outcome" });
  });

  it("429 es unavailable (no se procesó) y 401 con texto plano es rejected", async () => {
    const f429 = vi.fn(() => Promise.resolve(new Response("slow down", { status: 429 })));
    await expect(createEnviaShippingProvider(CONFIG, f429 as unknown as typeof fetch).createLabel(labelInput, {}))
      .rejects.toMatchObject({ kind: "unavailable" });
    const f401 = vi.fn(() => Promise.resolve(new Response("Unauthorized", { status: 401 })));
    await expect(createEnviaShippingProvider(CONFIG, f401 as unknown as typeof fetch).createLabel(labelInput, {}))
      .rejects.toMatchObject({ kind: "rejected" });
  });

  it("una respuesta 200 sin guía es unknown_outcome", async () => {
    const empty = vi.fn(() => Promise.resolve(jsonResponse({ meta: "generate", data: [] })));
    await expect(createEnviaShippingProvider(CONFIG, empty as unknown as typeof fetch).createLabel(labelInput, {}))
      .rejects.toBeInstanceOf(ShippingProviderError);
  });
});

describe("enviaShippingProvider · cancelLabel", () => {
  it("cancela con paquetería y guía", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse({ meta: "cancel", data: { balanceReturned: true } })));
    const provider = createEnviaShippingProvider(CONFIG, fetchMock as unknown as typeof fetch);
    await provider.cancelLabel({ carrier: ShippingCarrier.FEDEX, trackingNumber: "794644790138" }, {});
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api-test.envia.com/ship/cancel/");
    expect(JSON.parse(init.body as string)).toEqual({ carrier: "fedex", trackingNumber: "794644790138" });
  });

  it("una guía ya escaneada es rejected; una caída es unavailable", async () => {
    const no = vi.fn(() => Promise.resolve(jsonResponse({ meta: "error", error: { code: 400, message: "ya recolectado" } })));
    await expect(createEnviaShippingProvider(CONFIG, no as unknown as typeof fetch).cancelLabel({ carrier: ShippingCarrier.DHL, trackingNumber: "1" }, {}))
      .rejects.toMatchObject({ kind: "rejected" });
    const down = vi.fn(() => Promise.reject(new TypeError("fetch failed")));
    await expect(createEnviaShippingProvider(CONFIG, down as unknown as typeof fetch).cancelLabel({ carrier: ShippingCarrier.DHL, trackingNumber: "1" }, {}))
      .rejects.toMatchObject({ kind: "unavailable" });
  });
});
```

- [ ] **Paso 2: Rojo:** `pnpm --filter @gira/api test -- tests/unit/enviaProvider.test.ts` → falla (módulo inexistente).

- [ ] **Paso 3: Implementar** `adapters/shipping/enviaShippingProvider.ts`:

```ts
import { ShippingCarrier, ShippingProviderName } from "@gira/shared";
import type { EnviaConfig } from "../../config/env.js";
import {
  ShippingProviderError,
  type CallOptions,
  type CancelLabelInput,
  type CreateLabelInput,
  type LabelResult,
  type ProviderRate,
  type RatesInput,
  type ShippingDestination,
  type ShippingProvider,
} from "./types.js";
import type { ShippingOrigin } from "@gira/shared";

/**
 * Envía (envia.com) adapter. The ONLY file that knows its endpoints, field names
 * and quirks: money crossing the boundary is MXN centavos, carriers are ours.
 *
 * Quirks handled here: errors may arrive as HTTP 200 + {meta:"error"}; auth
 * failures are plain text; the rate endpoint takes one carrier per call; and
 * there is NO idempotency key on label purchase, so an ambiguous purchase
 * (timeout / 5xx / network) is reported as `unknown_outcome` and never retried.
 */

const HOSTS = {
  sandbox: "https://api-test.envia.com",
  production: "https://api.envia.com",
} as const;

const QUOTE_TIMEOUT_MS = 8_000;
const LABEL_TIMEOUT_MS = 30_000;
const CANCEL_TIMEOUT_MS = 15_000;

const KNOWN_CARRIERS = new Set<string>(Object.values(ShippingCarrier));

type FetchLike = typeof fetch;

interface EnviaError {
  kind: "http" | "business";
  status: number;
  message: string;
}

interface CallResult {
  data: unknown;
}

const toKg = (grams: number): number => Math.max(0.1, Math.round(grams / 10) / 100);
const toPesos = (centavos: number): number => Math.round(centavos) / 100;
const toCentavos = (pesos: unknown): number => Math.round(Number(pesos) * 100);

const toAddress = (a: ShippingOrigin | ShippingDestination): Record<string, unknown> => ({
  name: a.name,
  phone: a.phone,
  ...(a.email ? { email: a.email } : {}),
  street: a.line1,
  district: a.district,
  city: a.city,
  state: a.state,
  country: "MX",
  postalCode: a.postalCode,
  ...("line2" in a && a.line2 ? { reference: a.line2 } : {}),
});

const toPackage = (input: RatesInput): Record<string, unknown> => ({
  type: "box",
  content: "Ropa",
  amount: 1,
  declaredValue: toPesos(input.declaredValueMxn),
  lengthUnit: "CM",
  weightUnit: "KG",
  weight: toKg(input.parcel.weightGrams),
  dimensions: {
    length: input.parcel.lengthCm,
    width: input.parcel.widthCm,
    height: input.parcel.heightCm,
  },
});

const createEnviaShippingProvider = (
  config: EnviaConfig,
  fetchImpl: FetchLike = fetch,
): ShippingProvider => {
  const baseUrl = HOSTS[config.environment];

  /** One POST. Throws a plain Error on transport trouble, returns the parsed body otherwise. */
  const post = async (
    path: string,
    body: unknown,
    timeoutMs: number,
    options: CallOptions,
  ): Promise<{ status: number; json: unknown; text: string }> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    options.signal?.addEventListener("abort", () => controller.abort(), { once: true });
    try {
      const response = await fetchImpl(`${baseUrl}${path}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${config.apiToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const text = await response.text();
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        json = undefined; // auth failures come back as plain text
      }
      return { status: response.status, json, text };
    } finally {
      clearTimeout(timer);
    }
  };

  /** Normalises "HTTP error" and "HTTP 200 + meta:error" into one shape, or returns the data. */
  const unwrap = (res: { status: number; json: unknown; text: string }): CallResult | EnviaError => {
    const json = res.json as { meta?: string; error?: { message?: string; description?: string }; data?: unknown } | undefined;
    if (json?.meta === "error") {
      return {
        kind: "business",
        status: res.status,
        message: json.error?.message ?? json.error?.description ?? "Envía rechazó la solicitud.",
      };
    }
    if (res.status >= 400) {
      return { kind: "http", status: res.status, message: json?.error?.message ?? res.text.slice(0, 200) };
    }
    return { data: json?.data };
  };

  const isError = (r: CallResult | EnviaError): r is EnviaError => "kind" in r;

  const getRates: ShippingProvider["getRates"] = async (input, options) => {
    const perCarrier = await Promise.allSettled(
      config.carriers.map(async (carrier) => {
        const res = await post(
          "/ship/rate/",
          {
            origin: toAddress(input.origin),
            destination: toAddress(input.destination),
            packages: [toPackage(input)],
            shipment: { carrier, type: 1 },
            settings: { currency: "MXN" },
          },
          QUOTE_TIMEOUT_MS,
          options,
        );
        const unwrapped = unwrap(res);
        if (isError(unwrapped)) {
          throw new ShippingProviderError(
            unwrapped.status >= 500 || unwrapped.status === 429 ? "unavailable" : "rejected",
            unwrapped.message,
          );
        }
        return unwrapped.data;
      }),
    );

    const rates: ProviderRate[] = [];
    for (const outcome of perCarrier) {
      if (outcome.status !== "fulfilled" || !Array.isArray(outcome.value)) continue;
      for (const entry of outcome.value as Array<Record<string, unknown>>) {
        const carrier = String(entry.carrier ?? "").toLowerCase();
        if (!KNOWN_CARRIERS.has(carrier)) continue;
        const cost = toCentavos(entry.totalPrice);
        if (!Number.isFinite(cost) || cost <= 0) continue;
        const days = (entry.deliveryDate as { dateDifference?: number } | undefined)?.dateDifference;
        rates.push({
          carrier: carrier as ShippingCarrier,
          service: String(entry.service),
          serviceName: String(entry.serviceDescription ?? entry.service),
          costMxn: cost,
          estimatedDays: typeof days === "number" && days >= 0 ? days : 0,
        });
      }
    }

    if (rates.length === 0) {
      const failures = perCarrier.filter((o): o is PromiseRejectedResult => o.status === "rejected");
      // Every carrier failed: tell WHY (bad address vs provider down). Otherwise just "no rates".
      if (failures.length === perCarrier.length) {
        const kinds = failures.map((f) => (f.reason instanceof ShippingProviderError ? f.reason.kind : "unavailable"));
        if (kinds.every((k) => k === "rejected")) {
          throw new ShippingProviderError("rejected", (failures[0]!.reason as Error).message);
        }
        throw new ShippingProviderError("unavailable", "Envía no está disponible por ahora.");
      }
    }
    return rates;
  };

  const createLabel: ShippingProvider["createLabel"] = async (input: CreateLabelInput, options) => {
    let res: { status: number; json: unknown; text: string };
    try {
      res = await post(
        "/ship/generate/",
        {
          origin: toAddress(input.origin),
          destination: toAddress(input.destination),
          packages: [{ ...toPackage(input), content: `Ropa ${input.orderRef}` }],
          shipment: { carrier: input.carrier, service: input.service, type: 1 },
          settings: { printFormat: "PDF", printSize: "PAPER_4X6", currency: "MXN" },
        },
        LABEL_TIMEOUT_MS,
        options,
      );
    } catch {
      // Timeout / network: the purchase may have gone through. No idempotency key exists.
      throw new ShippingProviderError("unknown_outcome", "No se pudo confirmar si Envía generó la guía.");
    }

    if (res.status >= 500) {
      throw new ShippingProviderError("unknown_outcome", "Envía respondió con un error al generar la guía.");
    }
    if (res.status === 429) {
      throw new ShippingProviderError("unavailable", "Envía pidió esperar antes de generar la guía.");
    }
    const unwrapped = unwrap(res);
    if (isError(unwrapped)) {
      const message =
        res.status === 402 ? "Saldo insuficiente en Envía para generar la guía." : unwrapped.message;
      throw new ShippingProviderError("rejected", message);
    }

    const entry = Array.isArray(unwrapped.data) ? (unwrapped.data[0] as Record<string, unknown> | undefined) : undefined;
    if (!entry?.trackingNumber || !entry.shipmentId || !entry.label) {
      throw new ShippingProviderError("unknown_outcome", "Envía respondió sin los datos de la guía.");
    }
    const result: LabelResult = {
      providerShipmentId: String(entry.shipmentId),
      trackingNumber: String(entry.trackingNumber),
      carrier: input.carrier,
      labelUrl: String(entry.label),
      trackUrl: String(entry.trackUrl ?? ""),
      costMxn: toCentavos(entry.totalPrice),
    };
    return result;
  };

  const cancelLabel: ShippingProvider["cancelLabel"] = async (input: CancelLabelInput, options) => {
    let res: { status: number; json: unknown; text: string };
    try {
      res = await post(
        "/ship/cancel/",
        { carrier: input.carrier, trackingNumber: input.trackingNumber },
        CANCEL_TIMEOUT_MS,
        options,
      );
    } catch {
      throw new ShippingProviderError("unavailable", "Envía no respondió al cancelar la guía.");
    }
    if (res.status >= 500 || res.status === 429) {
      throw new ShippingProviderError("unavailable", "Envía no pudo procesar la cancelación ahora.");
    }
    const unwrapped = unwrap(res);
    if (isError(unwrapped)) throw new ShippingProviderError("rejected", unwrapped.message);
  };

  return { name: ShippingProviderName.ENVIA, getRates, createLabel, cancelLabel };
};

export { createEnviaShippingProvider };
```
Nota de importación: mueve `import type { ShippingOrigin } from "@gira/shared";` junto al primer import de `@gira/shared` (un solo import).

- [ ] **Paso 4: Conectar la factory** — en `adapters/shipping/index.ts` reemplazar el cuerpo de `getShippingProvider` y quitar `void env`:

```ts
import { createEnviaShippingProvider } from "./enviaShippingProvider.js";
...
const getShippingProvider = (): ShippingProvider => {
  if (override) return override;
  cached ??= env.envia ? createEnviaShippingProvider(env.envia) : createStubShippingProvider();
  return cached;
};
```

- [ ] **Paso 5: Verde:** `pnpm --filter @gira/api test -- tests/unit/enviaProvider.test.ts tests/unit/shippingAdapter.test.ts` → PASS; `pnpm --filter @gira/api typecheck`.

- [ ] **Checkpoint:** `git diff --stat`.

---

## Tarea 5: Peso por producto

**Archivos:** `models/Product.ts`, `validators/productValidator.ts`, `services/productService.ts`, `packages/shared/src/types/catalog.ts`, `services/pricingService.ts` (solo `ResolvedLine`), `scripts/backfillProductWeight.ts`, `package.json`, `tests/integration/adminProducts.test.ts`, `tests/helpers/orders.ts`.

- [ ] **Paso 1: Tests rojos** — en `tests/integration/adminProducts.test.ts` agrega (copiando el patrón de login/Origin del archivo, que ya usa `loginAsAdmin`):

```ts
  it("exige weightGrams al crear un producto y lo devuelve en el DTO", async () => {
    const { cookie } = await loginAsAdmin(app);
    const category = await request(app).post("/api/v1/admin/product-categories")
      .set("Origin", ORIGIN).set("Cookie", cookie).send({ name: "Bolsas peso" });
    const categoryId = category.body.data.category.id as string;

    const missing = await request(app).post("/api/v1/admin/products")
      .set("Origin", ORIGIN).set("Cookie", cookie)
      .send({ name: "Sin peso", category: categoryId, basePrice: 10000 });
    expect(missing.status).toBe(400);

    const ok = await request(app).post("/api/v1/admin/products")
      .set("Origin", ORIGIN).set("Cookie", cookie)
      .send({ name: "Con peso", category: categoryId, basePrice: 10000, weightGrams: 450 });
    expect(ok.status).toBe(201);
    expect(ok.body.data.product.weightGrams).toBe(450);
  });

  it("rechaza pesos fuera de 1–20000 g", async () => {
    const { cookie } = await loginAsAdmin(app);
    const category = await request(app).post("/api/v1/admin/product-categories")
      .set("Origin", ORIGIN).set("Cookie", cookie).send({ name: "Bolsas peso 2" });
    for (const weightGrams of [0, 20_001, 12.5]) {
      const res = await request(app).post("/api/v1/admin/products")
        .set("Origin", ORIGIN).set("Cookie", cookie)
        .send({ name: `P ${weightGrams}`, category: category.body.data.category.id, basePrice: 1, weightGrams });
      expect(res.status).toBe(400);
    }
  });
```
(Ajusta `app`, `ORIGIN`, `loginAsAdmin` a los nombres exactos ya importados en ese archivo.)

- [ ] **Paso 2: Rojo:** `pnpm --filter @gira/api test -- tests/integration/adminProducts.test.ts`.

- [ ] **Paso 3: Modelo** — `models/Product.ts`: en `ProductAttrs` tras `basePrice`:

```ts
  /** Packed weight of ONE unit, grams. Drives the shipping parcel; every size weighs about the same. */
  weightGrams: number;
```
En el schema tras `basePrice`:

```ts
    weightGrams: {
      type: Number,
      required: true,
      min: 1,
      max: 20_000,
      validate: { validator: Number.isInteger, message: "El peso debe ser un entero en gramos." },
    },
```
- [ ] **Paso 4: Validator** — `productValidator.ts`: junto a `basePrice`:

```ts
const weightGrams = Joi.number().integer().min(1).max(20_000).messages({
  "number.base": "El peso debe ser un número en gramos.",
  "number.integer": "El peso debe ser un entero en gramos.",
  "number.min": "El peso mínimo es 1 g.",
  "number.max": "El peso máximo es 20,000 g.",
  "any.required": "El peso es obligatorio.",
});
```
y en `createProductSchema` `weightGrams: weightGrams.required(),`; en `updateProductSchema` `weightGrams,`.

- [ ] **Paso 5: Servicio y DTO** — en `productService.createProduct` agrega `weightGrams: input.weightGrams,` tras `basePrice`; en `updateProduct` (busca el bloque que asigna `basePrice` con `if (input.basePrice !== undefined)`) agrega la asignación equivalente `if (input.weightGrams !== undefined) product.weightGrams = input.weightGrams;`; en el mapper del DTO público/admin del producto (`grep -n "basePrice" src/services/productService.ts`) agrega `weightGrams: p.weightGrams` y en `packages/shared/src/types/catalog.ts` `Product` agrega `weightGrams: number;`. Extiende los tipos `CreateProductInput`/`UpdateProductInput` del servicio con el campo. `pnpm --filter @gira/shared build`.

- [ ] **Paso 6: `ResolvedLine` con peso** — en `pricingService.ts`: `ProductRef` agrega `weightGrams?: number;`; el populate pasa a `.populate("product", "name basePrice weightGrams isActive")`; `ResolvedLine` agrega `weightGrams: number;` y el `return` de `resolveOrderLines` agrega `weightGrams: product.weightGrams ?? 0,` (0 = sin peso configurado; `computeParcel` lo rechaza con mensaje claro).

- [ ] **Paso 7: Helper de tests** — `tests/helpers/orders.ts`, en `seedCatalogVariant` el POST de `/products` incluye `weightGrams: 400`.

- [ ] **Paso 8: Script de relleno** — `src/scripts/backfillProductWeight.ts`:

```ts
import mongoose from "mongoose";
import { env } from "../config/env.js";
import { Product } from "../models/Product.js";

/**
 * One-off: gives every product that has no weight a default (existing catalog
 * predates the field). DRY-RUN by default. It prints which database it points
 * at BEFORE doing anything so a wrong .env never touches the wrong cluster.
 *
 *   pnpm --filter @gira/api backfill:product-weight -- --grams 450          (dry-run)
 *   pnpm --filter @gira/api backfill:product-weight -- --grams 450 --apply
 */
const parseArgs = (argv: string[]): { grams: number; apply: boolean } => {
  const i = argv.indexOf("--grams");
  const grams = i >= 0 ? Number(argv[i + 1]) : Number.NaN;
  if (!Number.isInteger(grams) || grams < 1 || grams > 20_000) {
    throw new Error("Usa --grams <entero 1-20000>.");
  }
  return { grams, apply: argv.includes("--apply") };
};

const main = async (): Promise<void> => {
  const { grams, apply } = parseArgs(process.argv.slice(2));
  await mongoose.connect(env.mongoUri);
  const host = mongoose.connection.host;
  const db = mongoose.connection.name;
  console.log(`Base de datos: ${db} @ ${host}`);

  const filter = { $or: [{ weightGrams: { $exists: false } }, { weightGrams: null }] };
  const pending = await Product.collection.countDocuments(filter);
  console.log(`Productos sin peso: ${pending}`);

  if (!apply) {
    console.log(`Dry-run: no se escribió nada. Agrega --apply para asignar ${grams} g.`);
  } else {
    const result = await Product.collection.updateMany(filter, { $set: { weightGrams: grams } });
    console.log(`Actualizados: ${result.modifiedCount}`);
  }
  await mongoose.disconnect();
};

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
```
En `apps/api/package.json` scripts: `"backfill:product-weight": "tsx src/scripts/backfillProductWeight.ts",`.

- [ ] **Paso 9: Verde:** `pnpm --filter @gira/api test -- tests/integration/adminProducts.test.ts` y `pnpm --filter @gira/api typecheck`. (No correr el script.)

- [ ] **Checkpoint:** `git diff --stat`.

---

## Tarea 6: `Settings.shipping` (origen, paquete, TTL) y `quoteTotals`

**Archivos:** `models/Settings.ts`, `services/settingsService.ts`, `validators/settingsValidator.ts`, `services/pricingService.ts`, `tests/integration/adminSettings.test.ts`, `tests/integration/pricing.test.ts`.

- [ ] **Paso 1: Tests rojos.** En `tests/integration/pricing.test.ts` reemplaza los bloques que prueban tarifa nacional/internacional/umbral (líneas ~181-275, `grep -n "nationalFee\|internationalFee" tests/integration/pricing.test.ts`) por pruebas de la nueva firma. Nueva firma: `quoteTotals(lines, { currency, shippingMxn })` — el monto ya lo decidió la cotización. Ejemplo (adapta `lines` al helper que ese archivo ya usa para armar `ResolvedLine`, que ahora incluye `weightGrams`):

```ts
  it("suma el envío (MXN) tal cual al total en MXN", async () => {
    const quote = await quoteTotals(lines, { currency: Currency.MXN, shippingMxn: 12_000 });
    expect(quote.shippingCost).toBe(12_000);
    expect(quote.total).toBe(quote.subtotal + 12_000);
  });

  it("convierte el envío a USD con el mismo tipo de cambio y redondeo que los precios", async () => {
    const quote = await quoteTotals(lines, { currency: Currency.USD, shippingMxn: 18_000 });
    // 18 000 centavos MXN a 18.00 MXN/USD = 1 000 centavos USD
    expect(quote.shippingCost).toBe(1_000);
    expect(quote.total).toBe(quote.subtotal + 1_000);
  });

  it("envío gratis (0) no agrega nada", async () => {
    const quote = await quoteTotals(lines, { currency: Currency.MXN, shippingMxn: 0 });
    expect(quote.shippingCost).toBe(0);
  });
```
En `tests/integration/adminSettings.test.ts`, reemplaza los tests de `PATCH /admin/settings/shipping` que mandan `nationalFee/internationalFee` por:

```ts
  it("guarda origen, paquete y TTL por sección, y rechaza un estado/CP/teléfono inválido", async () => {
    const { cookie } = await loginAsAdmin(app);
    const origin = {
      name: "Gira Clothing", phone: "5512345678", email: "bodega@giraclothing.mx",
      line1: "Av. Reforma 100", district: "Juárez", city: "Ciudad de México", state: "CX", postalCode: "06600",
    };
    const ok = await request(app).patch("/api/v1/admin/settings/shipping")
      .set("Origin", ORIGIN).set("Cookie", cookie)
      .send({ origin, freeShippingThreshold: 150_000, quoteTtlMinutes: 45,
              parcel: { tareGrams: 200, boxLengthCm: 32, boxWidthCm: 26, boxHeightCm: 6, extraUnitHeightCm: 3, maxWeightGrams: 15_000 } });
    expect(ok.status).toBe(200);
    expect(ok.body.data.settings.shipping.origin.postalCode).toBe("06600");
    expect(ok.body.data.settings.shipping.parcel.tareGrams).toBe(200);
    expect(ok.body.data.settings.shipping.quoteTtlMinutes).toBe(45);

    for (const bad of [{ state: "ZZ" }, { postalCode: "123" }, { phone: "55" }]) {
      const res = await request(app).patch("/api/v1/admin/settings/shipping")
        .set("Origin", ORIGIN).set("Cookie", cookie).send({ origin: { ...origin, ...bad } });
      expect(res.status).toBe(400);
    }
  });

  it("un PATCH parcial del paquete no pisa el origen guardado", async () => {
    // guarda origen, luego manda solo { quoteTtlMinutes } y verifica que origin sigue ahí
  });
```
(Completa el segundo test con el mismo patrón: primer PATCH con `origin`, segundo con `{ quoteTtlMinutes: 20 }`, y `expect(res.body.data.settings.shipping.origin.name).toBe("Gira Clothing")`.)

- [ ] **Paso 2: Rojo:** `pnpm --filter @gira/api test -- tests/integration/pricing.test.ts tests/integration/adminSettings.test.ts`.

- [ ] **Paso 3: Modelo** — `models/Settings.ts`: reemplazar `ShippingSettings` (interface) por

```ts
import type { ShippingOrigin, ShippingParcelSettings } from "@gira/shared";

interface ShippingSettings {
  /** undefined until the owner fills it in Ajustes: quoting and labels stay disabled. */
  origin?: ShippingOrigin;
  /** null disables free shipping entirely. Compared against the MXN subtotal. */
  freeShippingThreshold: number | null;
  parcel: ShippingParcelSettings;
  /** How long a quote stays valid at checkout. */
  quoteTtlMinutes: number;
}
```
(el `import type` va con los demás imports de `@gira/shared` de ese archivo). Reemplazar el bloque `shipping:` del schema por:

```ts
    shipping: {
      origin: {
        type: new Schema(
          {
            name: { type: String, required: true, trim: true, maxlength: 120 },
            phone: { type: String, required: true, trim: true },
            email: { type: String, trim: true, lowercase: true },
            line1: { type: String, required: true, trim: true, maxlength: 200 },
            district: { type: String, required: true, trim: true, maxlength: 120 },
            city: { type: String, required: true, trim: true, maxlength: 120 },
            state: { type: String, required: true, trim: true },
            postalCode: { type: String, required: true, trim: true },
          },
          { _id: false },
        ),
      },
      freeShippingThreshold: { type: Number, min: 0, default: null },
      parcel: {
        tareGrams: { type: Number, required: true, min: 0, max: 5_000, default: 150 },
        boxLengthCm: { type: Number, required: true, min: 1, max: 200, default: 30 },
        boxWidthCm: { type: Number, required: true, min: 1, max: 200, default: 25 },
        boxHeightCm: { type: Number, required: true, min: 1, max: 200, default: 5 },
        extraUnitHeightCm: { type: Number, required: true, min: 0, max: 100, default: 3 },
        maxWeightGrams: { type: Number, required: true, min: 1, max: 70_000, default: 20_000 },
      },
      quoteTtlMinutes: { type: Number, required: true, min: 5, max: 240, default: 30 },
    },
```
- [ ] **Paso 4: Validator** — `settingsValidator.ts`: importar `MEXICAN_STATE_CODES, PHONE_PATTERN, POSTAL_CODE_PATTERN` de `@gira/shared` y reemplazar `updateShippingSchema`:

```ts
const originSchema = Joi.object({
  name: Joi.string().trim().min(2).max(120).required(),
  phone: Joi.string().trim().pattern(PHONE_PATTERN).required().messages({
    "string.pattern.base": "El teléfono debe tener 10 dígitos.",
  }),
  email: Joi.string().trim().lowercase().email().max(160).allow(""),
  line1: Joi.string().trim().min(3).max(200).required(),
  district: Joi.string().trim().min(2).max(120).required(),
  city: Joi.string().trim().min(2).max(120).required(),
  state: Joi.string().valid(...MEXICAN_STATE_CODES).required().messages({
    "any.only": "Elige un estado válido.",
  }),
  postalCode: Joi.string().trim().pattern(POSTAL_CODE_PATTERN).required().messages({
    "string.pattern.base": "El código postal debe tener 5 dígitos.",
  }),
});

const parcelSettingsSchema = Joi.object({
  tareGrams: Joi.number().integer().min(0).max(5_000),
  boxLengthCm: Joi.number().integer().min(1).max(200),
  boxWidthCm: Joi.number().integer().min(1).max(200),
  boxHeightCm: Joi.number().integer().min(1).max(200),
  extraUnitHeightCm: Joi.number().integer().min(0).max(100),
  maxWeightGrams: Joi.number().integer().min(1).max(70_000),
}).min(1);

const updateShippingSchema = Joi.object({
  origin: originSchema,
  freeShippingThreshold: money.allow(null),
  parcel: parcelSettingsSchema,
  quoteTtlMinutes: Joi.number().integer().min(5).max(240),
})
  .min(1)
  .messages({ "object.min": "Envía al menos un campo para actualizar." });
```
- [ ] **Paso 5: Servicio** — `settingsService.updateShippingSettings` (explícito, sin spread):

```ts
  if (input.origin !== undefined) {
    settings.shipping.origin = {
      name: input.origin.name,
      phone: input.origin.phone,
      ...(input.origin.email ? { email: input.origin.email } : {}),
      line1: input.origin.line1,
      district: input.origin.district,
      city: input.origin.city,
      state: input.origin.state,
      postalCode: input.origin.postalCode,
    };
  }
  if (input.freeShippingThreshold !== undefined) {
    settings.shipping.freeShippingThreshold = input.freeShippingThreshold;
  }
  if (input.parcel !== undefined) {
    const p = input.parcel;
    if (p.tareGrams !== undefined) settings.shipping.parcel.tareGrams = p.tareGrams;
    if (p.boxLengthCm !== undefined) settings.shipping.parcel.boxLengthCm = p.boxLengthCm;
    if (p.boxWidthCm !== undefined) settings.shipping.parcel.boxWidthCm = p.boxWidthCm;
    if (p.boxHeightCm !== undefined) settings.shipping.parcel.boxHeightCm = p.boxHeightCm;
    if (p.extraUnitHeightCm !== undefined) settings.shipping.parcel.extraUnitHeightCm = p.extraUnitHeightCm;
    if (p.maxWeightGrams !== undefined) settings.shipping.parcel.maxWeightGrams = p.maxWeightGrams;
  }
  if (input.quoteTtlMinutes !== undefined) settings.shipping.quoteTtlMinutes = input.quoteTtlMinutes;
```
El parámetro pasa a tipo `UpdateShippingInput = { origin?: ShippingOrigin; freeShippingThreshold?: number | null; parcel?: Partial<ShippingParcelSettings>; quoteTtlMinutes?: number }` (definirlo arriba del servicio). Quitar las dos líneas de `nationalFee/internationalFee`. `toPublicSettings` ya devuelve `doc.shipping`; asegúrate de que el DTO exponga `origin: doc.shipping.origin ?? null` (la `PublicSettings.shipping` debe cumplir el `ShippingSettings` de shared): 

```ts
  shipping: {
    origin: doc.shipping.origin ?? null,
    freeShippingThreshold: doc.shipping.freeShippingThreshold,
    parcel: { ...doc.shipping.parcel },
    quoteTtlMinutes: doc.shipping.quoteTtlMinutes,
  },
```
(tipar `PublicSettings.shipping` con el `ShippingSettings` de `@gira/shared`.) El snapshot `before` del audit: `JSON.parse(JSON.stringify(settings.shipping.toObject?.() ?? settings.shipping))` no hace falta — usar `before = { origin: settings.shipping.origin ? { ...settings.shipping.origin } : null, freeShippingThreshold: ..., parcel: { ...settings.shipping.parcel }, quoteTtlMinutes: ... }` y el mismo armado para `after`, para no guardar subdocumentos de Mongoose.

- [ ] **Paso 6: `quoteTotals`** — en `pricingService.ts`:
  - `QuoteInput` pasa a `{ currency: Currency; shippingMxn: number }`.
  - Eliminar `destinationCountry` y todo el bloque `const { nationalFee, ... } = settings.shipping; ... shippingCost`, reemplazándolo por:

```ts
  // The shipping amount was decided by the stored quote (already 0 when free).
  const shippingCost = convertFromMxn(input.shippingMxn, input.currency, mxnPerUsdCents, rounding);
```
  - Actualizar el docblock del archivo (quitar el párrafo del umbral gratis: ahora lo aplica `shippingQuoteService`).

- [ ] **Paso 7: Verde:** `pnpm --filter @gira/api test -- tests/integration/pricing.test.ts tests/integration/adminSettings.test.ts`. El typecheck de `orderService.ts` fallará hasta la Tarea 9 (usa `destinationCountry`): es esperado, no lo arregles aún.

- [ ] **Checkpoint:** `git diff --stat`.

---

## Tarea 7: `parcelService`

**Archivos:** crear `services/parcelService.ts`, `tests/unit/parcelService.test.ts`.

- [ ] **Paso 1: Test rojo** — `tests/unit/parcelService.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { computeParcel } from "../../src/services/parcelService.js";

const cfg = {
  tareGrams: 150, boxLengthCm: 30, boxWidthCm: 25, boxHeightCm: 5,
  extraUnitHeightCm: 3, maxWeightGrams: 20_000,
};

describe("computeParcel", () => {
  it("una prenda: su peso + tara y la caja estándar", () => {
    expect(computeParcel([{ weightGrams: 400, qty: 1 }], cfg)).toEqual({
      weightGrams: 550, lengthCm: 30, widthCm: 25, heightCm: 5,
    });
  });

  it("suma pesos por cantidad y crece la altura por cada prenda extra", () => {
    expect(computeParcel([{ weightGrams: 400, qty: 2 }, { weightGrams: 300, qty: 1 }], cfg)).toEqual({
      weightGrams: 1_250, lengthCm: 30, widthCm: 25, heightCm: 11,
    });
  });

  it("rechaza un artículo sin peso configurado (422)", () => {
    expect(() => computeParcel([{ weightGrams: 0, qty: 1 }], cfg)).toThrowError(
      expect.objectContaining({ statusCode: 422 }),
    );
  });

  it("rechaza un paquete que excede el máximo (422)", () => {
    expect(() => computeParcel([{ weightGrams: 5_000, qty: 5 }], cfg)).toThrowError(
      expect.objectContaining({ statusCode: 422 }),
    );
  });
});
```
- [ ] **Paso 2: Rojo:** `pnpm --filter @gira/api test -- tests/unit/parcelService.test.ts`.

- [ ] **Paso 3: Implementar** `services/parcelService.ts`:

```ts
import type { ShippingParcel, ShippingParcelSettings } from "@gira/shared";
import { AppError } from "../utils/AppError.js";

/**
 * Pure: derives the single parcel of an order from product weights and the
 * standard box in Settings. No I/O, so the arithmetic is pinned in unit tests
 * (the same resolver feeds the quote and the order, so both see the same parcel).
 */

interface ParcelLine {
  weightGrams: number;
  qty: number;
}

const computeParcel = (lines: ParcelLine[], cfg: ShippingParcelSettings): ShippingParcel => {
  if (lines.some((l) => l.weightGrams < 1)) {
    throw new AppError("No pudimos calcular el envío de uno de los artículos.", 422);
  }

  const units = lines.reduce((sum, l) => sum + l.qty, 0);
  const weightGrams = lines.reduce((sum, l) => sum + l.weightGrams * l.qty, 0) + cfg.tareGrams;
  if (weightGrams > cfg.maxWeightGrams) {
    throw new AppError(
      "Tu pedido pesa demasiado para un solo envío. Divide la compra en dos pedidos.",
      422,
    );
  }

  return {
    weightGrams,
    lengthCm: cfg.boxLengthCm,
    widthCm: cfg.boxWidthCm,
    heightCm: cfg.boxHeightCm + Math.max(0, units - 1) * cfg.extraUnitHeightCm,
  };
};

export type { ParcelLine };
export { computeParcel };
```
- [ ] **Paso 4: Verde** (mismo comando).

- [ ] **Checkpoint:** `git diff --stat`.

---

## Tarea 8: Modelo `ShippingQuote`, servicio y ruta de cotización

**Archivos:** crear `models/ShippingQuote.ts`, `services/shippingQuoteService.ts`, `controllers/shippingController.ts`, `validators/shippingValidator.ts`, `routes/v1/shippingRoutes.ts`, `tests/integration/shippingQuote.test.ts`; modificar `middlewares/rateLimit.ts`, `routes/v1/index.ts`, `services/orderService.ts` (solo exportar `takeCartLines`), `tests/helpers/orders.ts`.

- [ ] **Paso 1: Helpers de test (usados por ésta y las siguientes tareas)** — en `tests/helpers/orders.ts`:
  - `validShipping` → `{ recipient: "Ana Pérez", line1: "Calle Falsa 123", district: "Juárez", city: "Ciudad de México", state: "CX", postalCode: "01000", country: "MX" }`.
  - `validCustomer` → `{ email: "cliente@example.com", name: "Ana Pérez", phone: "5512345678" }`.
  - Nuevo helper (importar `Settings, SINGLETON_KEY` de `../../src/models/Settings.js`):

```ts
const validOrigin = {
  name: "Gira Clothing", phone: "5587654321", line1: "Av. Reforma 100",
  district: "Juárez", city: "Ciudad de México", state: "CX", postalCode: "06600",
};

/** Settings.shipping.origin is empty on a fresh database: quoting needs it. Idempotent. */
const seedShippingOrigin = async (): Promise<void> => {
  await Settings.findOneAndUpdate(
    { key: SINGLETON_KEY },
    { $set: { "shipping.origin": validOrigin }, $setOnInsert: { key: SINGLETON_KEY } },
    { upsert: true, setDefaultsOnInsert: true },
  );
};
```
  (la función `createPendingOrder` y `quoteRateFor` se completan en la Tarea 9.)

- [ ] **Paso 2: Tests rojos** — `tests/integration/shippingQuote.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterEach } from "vitest";
import request from "supertest";
import { Currency } from "@gira/shared";
import { buildApp } from "../../src/app.js";
import { ShippingQuote } from "../../src/models/ShippingQuote.js";
import { Settings, SINGLETON_KEY } from "../../src/models/Settings.js";
import { ShippingProviderError } from "../../src/adapters/shipping/index.js";
import { loginAsAdmin, ORIGIN } from "../helpers/auth.js";
import { seedCatalogVariant, seedShippingOrigin } from "../helpers/orders.js";
import { installFakeShippingProvider, restoreShippingProvider } from "../helpers/fakeShippingProvider.js";

const app = buildApp();
const destination = { postalCode: "64000", state: "NL", city: "Monterrey" };

let variantId: string;
beforeAll(async () => {
  const { cookie } = await loginAsAdmin(app);
  variantId = await seedCatalogVariant(app, cookie, "QUOTE");
});
afterEach(() => restoreShippingProvider());

const quote = (body: Record<string, unknown>) =>
  request(app).post("/api/v1/shipping/quotes").set("Origin", ORIGIN).send(body);

describe("POST /shipping/quotes", () => {
  it("cotiza con el stub, guarda la cotización y no expone costos internos", async () => {
    await seedShippingOrigin();
    const res = await quote({ lines: [{ variantId, qty: 2 }], destination });
    expect(res.status).toBe(200);
    const q = res.body.data.quote;
    expect(q.rates.length).toBeGreaterThanOrEqual(2);
    expect(q.rates[0]).toEqual(expect.objectContaining({
      rateId: expect.any(String), carrier: "estafeta", carrierName: "Estafeta",
      serviceName: "Terrestre", amount: 12_000, estimatedDays: 5,
    }));
    expect(q.rates[0]).not.toHaveProperty("costMxn");
    expect(new Date(q.expiresAt).getTime()).toBeGreaterThan(Date.now());
    const stored = await ShippingQuote.findOne({ quoteId: q.quoteId }).lean();
    expect(stored?.rates).toHaveLength(q.rates.length);
    expect(stored?.parcel.weightGrams).toBe(400 * 2 + 150);
  });

  it("aplica envío gratis cuando el subtotal alcanza el umbral (el costo real se conserva)", async () => {
    await seedShippingOrigin();
    await Settings.updateOne({ key: SINGLETON_KEY }, { $set: { "shipping.freeShippingThreshold": 1 } });
    const res = await quote({ lines: [{ variantId, qty: 1 }], destination });
    expect(res.body.data.quote.rates.every((r: { amount: number }) => r.amount === 0)).toBe(true);
    const stored = await ShippingQuote.findOne({ quoteId: res.body.data.quote.quoteId }).lean();
    expect(stored?.rates[0]?.costMxn).toBeGreaterThan(0);
    expect(stored?.rates[0]?.amountMxn).toBe(0);
    await Settings.updateOne({ key: SINGLETON_KEY }, { $set: { "shipping.freeShippingThreshold": null } });
  });

  it("convierte el monto a USD cuando se pide esa moneda", async () => {
    await seedShippingOrigin();
    const res = await quote({ lines: [{ variantId, qty: 1 }], destination, currency: Currency.USD });
    expect(res.status).toBe(200);
    expect(res.body.data.quote.currency).toBe("USD");
    expect(res.body.data.quote.rates[0].amount).toBeLessThan(12_000);
  });

  it("503 si el origen no está configurado", async () => {
    await Settings.updateOne({ key: SINGLETON_KEY }, { $unset: { "shipping.origin": "" } });
    const res = await quote({ lines: [{ variantId, qty: 1 }], destination });
    expect(res.status).toBe(503);
  });

  it("422 fuera de México / estado o CP inválidos", async () => {
    await seedShippingOrigin();
    for (const bad of [{ state: "ZZ" }, { postalCode: "123" }, { country: "US" }]) {
      const res = await quote({ lines: [{ variantId, qty: 1 }], destination: { ...destination, ...bad } });
      expect([400, 422]).toContain(res.status);
    }
  });

  it("bloquea (502) cuando Envía está caído y 422 cuando rechaza la dirección", async () => {
    await seedShippingOrigin();
    const fake = installFakeShippingProvider();
    fake.getRates.mockRejectedValueOnce(new ShippingProviderError("unavailable", "caído"));
    expect((await quote({ lines: [{ variantId, qty: 1 }], destination })).status).toBe(502);
    fake.getRates.mockRejectedValueOnce(new ShippingProviderError("rejected", "CP inválido"));
    expect((await quote({ lines: [{ variantId, qty: 1 }], destination })).status).toBe(422);
    fake.getRates.mockResolvedValueOnce([]);
    expect((await quote({ lines: [{ variantId, qty: 1 }], destination })).status).toBe(422);
  });

  it("useCart sin sesión es 401", async () => {
    const res = await quote({ useCart: true, destination });
    expect(res.status).toBe(401);
  });

  it("no acepta lines y useCart juntos ni líneas repetidas", async () => {
    const res = await quote({ lines: [{ variantId, qty: 1 }], useCart: true, destination });
    expect(res.status).toBe(400);
  });
});
```
Agrega también un test unit-style para `resolveQuotedRate` en el mismo archivo (importa `createShippingQuote, resolveQuotedRate, buildFingerprint` del servicio) — cubre: quote inexistente → 409 `SHIPPING_QUOTE_INVALID`; vencida (`ShippingQuote.updateOne({ quoteId }, { expiresAt: new Date(0) })`) → 409; rateId ajeno → 409; huella distinta (otra cantidad) → 409 `CART_CHANGED`; moneda distinta → 409; cotización de un usuario usada por otro → 409; caso feliz devuelve `{ rate, parcel }` con `amountMxn`.

- [ ] **Paso 3: Rojo:** `pnpm --filter @gira/api test -- tests/integration/shippingQuote.test.ts`.

- [ ] **Paso 4: Modelo** — `models/ShippingQuote.ts`:

```ts
import { Schema, model, type HydratedDocument, type Model, type Types } from "mongoose";
import { Currency, ShippingCarrier, ShippingProviderName } from "@gira/shared";

/**
 * A quote kept on the SERVER: the client never sends a shipping amount, only
 * {quoteId, rateId}. `rateId` is our own opaque id (the provider's ids never
 * reach the client). `fingerprint` ties the quote to the exact cart + postal
 * code + currency it was made for. A TTL index purges it a day after it expires.
 */

interface QuotedRate {
  rateId: string;
  carrier: ShippingCarrier;
  service: string;
  serviceName: string;
  estimatedDays: number;
  /** What the provider charges us, MXN centavos. */
  costMxn: number;
  /** What the customer pays, MXN centavos (0 when free shipping applies). */
  amountMxn: number;
}

interface ShippingQuoteAttrs {
  quoteId: string;
  user?: Types.ObjectId;
  fingerprint: string;
  currency: Currency;
  provider: ShippingProviderName;
  parcel: { weightGrams: number; lengthCm: number; widthCm: number; heightCm: number };
  rates: QuotedRate[];
  expiresAt: Date;
  purgeAt: Date;
}

type ShippingQuoteModel = Model<ShippingQuoteAttrs>;
type ShippingQuoteDocument = HydratedDocument<ShippingQuoteAttrs>;

const rateSchema = new Schema<QuotedRate>(
  {
    rateId: { type: String, required: true },
    carrier: { type: String, enum: Object.values(ShippingCarrier), required: true },
    service: { type: String, required: true },
    serviceName: { type: String, required: true },
    estimatedDays: { type: Number, required: true, min: 0 },
    costMxn: { type: Number, required: true, min: 0 },
    amountMxn: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const shippingQuoteSchema = new Schema<ShippingQuoteAttrs, ShippingQuoteModel>(
  {
    quoteId: { type: String, required: true },
    user: { type: Schema.Types.ObjectId, ref: "User" },
    fingerprint: { type: String, required: true },
    currency: { type: String, enum: Object.values(Currency), required: true },
    provider: { type: String, enum: Object.values(ShippingProviderName), required: true },
    parcel: {
      weightGrams: { type: Number, required: true },
      lengthCm: { type: Number, required: true },
      widthCm: { type: Number, required: true },
      heightCm: { type: Number, required: true },
    },
    rates: { type: [rateSchema], required: true },
    expiresAt: { type: Date, required: true },
    purgeAt: { type: Date, required: true },
  },
  { timestamps: true },
);

shippingQuoteSchema.index({ quoteId: 1 }, { unique: true });
// Garbage collection only: validity is decided by `expiresAt` in the service.
shippingQuoteSchema.index({ purgeAt: 1 }, { expireAfterSeconds: 0 });

const ShippingQuote = model<ShippingQuoteAttrs, ShippingQuoteModel>("ShippingQuote", shippingQuoteSchema);

export type { QuotedRate, ShippingQuoteAttrs, ShippingQuoteDocument };
export { ShippingQuote };
```
- [ ] **Paso 5: Servicio** — `services/shippingQuoteService.ts`:

```ts
import { createHash, randomBytes } from "node:crypto";
import type { Types } from "mongoose";
import {
  Currency,
  SHIPPING_CARRIER_LABELS,
  type ShippingParcel,
  type ShippingQuoteResponse,
} from "@gira/shared";
import { getShippingProvider, ShippingProviderError } from "../adapters/shipping/index.js";
import { ShippingQuote, type QuotedRate } from "../models/ShippingQuote.js";
import { AppError } from "../utils/AppError.js";
import { convertFromMxn } from "../utils/money.js";
import { computeParcel } from "./parcelService.js";
import { resolveOrderLines, type RequestedLine, type ResolvedLine } from "./pricingService.js";
import { getSettings } from "./settingsService.js";

const PURGE_AFTER_EXPIRY_MS = 24 * 60 * 60 * 1000;

interface QuoteDestination {
  postalCode: string;
  state: string;
  city: string;
}

interface CreateQuoteInput {
  lines: RequestedLine[];
  currency: Currency;
  destination: QuoteDestination;
}

interface QuoteContext {
  userId?: Types.ObjectId | undefined;
}

const buildFingerprint = (
  lines: Array<{ variantId: string; qty: number }>,
  postalCode: string,
  currency: Currency,
): string =>
  createHash("sha256")
    .update(
      JSON.stringify({
        lines: [...lines].sort((a, b) => a.variantId.localeCompare(b.variantId)),
        postalCode,
        currency,
      }),
    )
    .digest("hex");

const fingerprintOf = (resolved: ResolvedLine[], postalCode: string, currency: Currency): string =>
  buildFingerprint(
    resolved.map((l) => ({ variantId: String(l.variant), qty: l.qty })),
    postalCode,
    currency,
  );

const createShippingQuote = async (
  input: CreateQuoteInput,
  ctx: QuoteContext,
): Promise<ShippingQuoteResponse> => {
  const settings = await getSettings();
  const origin = settings.shipping.origin;
  if (!origin) throw new AppError("El envío no está disponible por ahora.", 503);
  if (!settings.currency.supported.includes(input.currency)) {
    throw new AppError("La moneda seleccionada no está disponible.", 400);
  }

  const resolved = await resolveOrderLines(input.lines);
  const parcel = computeParcel(
    resolved.map((l) => ({ weightGrams: l.weightGrams, qty: l.qty })),
    settings.shipping.parcel,
  );
  const subtotalMxn = resolved.reduce((sum, l) => sum + l.unitPriceMxn * l.qty, 0);

  const provider = getShippingProvider();
  let providerRates;
  try {
    providerRates = await provider.getRates(
      {
        origin: {
          name: origin.name, phone: origin.phone, ...(origin.email ? { email: origin.email } : {}),
          line1: origin.line1, district: origin.district, city: origin.city,
          state: origin.state, postalCode: origin.postalCode,
        },
        // The full address is not known yet: carriers only price by postal code.
        destination: {
          name: "Cliente Gira", phone: origin.phone, line1: "Domicilio conocido",
          district: "Centro", city: input.destination.city,
          state: input.destination.state, postalCode: input.destination.postalCode,
        },
        parcel,
        declaredValueMxn: subtotalMxn,
      },
      {},
    );
  } catch (err) {
    if (err instanceof ShippingProviderError && err.kind === "rejected") {
      throw new AppError("No pudimos cotizar el envío con ese código postal. Revísalo.", 422);
    }
    throw new AppError("No pudimos cotizar el envío. Intenta de nuevo en unos minutos.", 502);
  }
  if (providerRates.length === 0) {
    throw new AppError("No hay paquetería disponible para ese código postal.", 422);
  }

  const threshold = settings.shipping.freeShippingThreshold;
  const free = threshold !== null && subtotalMxn >= threshold;
  const { mxnPerUsdCents, rounding } = settings.currency;

  const rates: QuotedRate[] = providerRates
    .map((r) => ({
      rateId: randomBytes(12).toString("hex"),
      carrier: r.carrier,
      service: r.service,
      serviceName: r.serviceName,
      estimatedDays: r.estimatedDays,
      costMxn: r.costMxn,
      amountMxn: free ? 0 : r.costMxn,
    }))
    .sort((a, b) => a.amountMxn - b.amountMxn || a.estimatedDays - b.estimatedDays);

  const expiresAt = new Date(Date.now() + settings.shipping.quoteTtlMinutes * 60_000);
  const quoteId = randomBytes(24).toString("base64url");
  await ShippingQuote.create({
    quoteId,
    ...(ctx.userId ? { user: ctx.userId } : {}),
    fingerprint: fingerprintOf(resolved, input.destination.postalCode, input.currency),
    currency: input.currency,
    provider: provider.name,
    parcel,
    rates,
    expiresAt,
    purgeAt: new Date(expiresAt.getTime() + PURGE_AFTER_EXPIRY_MS),
  });

  return {
    quoteId,
    currency: input.currency,
    expiresAt: expiresAt.toISOString(),
    rates: rates.map((r) => ({
      rateId: r.rateId,
      carrier: r.carrier,
      carrierName: SHIPPING_CARRIER_LABELS[r.carrier],
      service: r.service,
      serviceName: r.serviceName,
      amount: convertFromMxn(r.amountMxn, input.currency, mxnPerUsdCents, rounding),
      estimatedDays: r.estimatedDays,
    })),
  };
};

interface ResolveRateInput {
  quoteId: string;
  rateId: string;
  resolved: ResolvedLine[];
  postalCode: string;
  currency: Currency;
  userId?: Types.ObjectId | undefined;
}

interface ResolvedRate {
  rate: QuotedRate & { provider: string };
  parcel: ShippingParcel;
}

/** Validates a stored quote against what the order is actually being created for. */
const resolveQuotedRate = async (input: ResolveRateInput): Promise<ResolvedRate> => {
  const quote = await ShippingQuote.findOne({ quoteId: input.quoteId }).lean();
  const invalid = (message: string): AppError => new AppError(message, 409);

  if (!quote || quote.expiresAt.getTime() <= Date.now()) {
    throw invalid("La cotización de envío venció. Vuelve a elegir tu envío.");
  }
  if (quote.user && String(quote.user) !== String(input.userId ?? "")) {
    throw invalid("La cotización de envío no es válida. Vuelve a elegir tu envío.");
  }
  if (quote.currency !== input.currency) {
    throw invalid("La moneda cambió. Vuelve a elegir tu envío.");
  }
  if (quote.fingerprint !== fingerprintOf(input.resolved, input.postalCode, input.currency)) {
    throw invalid("Tu carrito o tu código postal cambió. Vuelve a elegir tu envío.");
  }
  const rate = quote.rates.find((r) => r.rateId === input.rateId);
  if (!rate) throw invalid("La opción de envío no es válida. Vuelve a elegir tu envío.");

  return { rate: { ...rate, provider: quote.provider }, parcel: quote.parcel };
};

export type { CreateQuoteInput, QuoteContext, ResolvedRate };
export { createShippingQuote, resolveQuotedRate, buildFingerprint };
```

- [ ] **Paso 6: Validator** — `validators/shippingValidator.ts`:

```ts
import Joi from "joi";
import { Currency, MEXICAN_STATE_CODES, POSTAL_CODE_PATTERN } from "@gira/shared";
import { objectId } from "./commonValidator.js";

const quoteLineSchema = Joi.object({
  variantId: objectId.required(),
  qty: Joi.number().integer().min(1).max(20).required(),
});

const createQuoteSchema = Joi.object({
  lines: Joi.array().items(quoteLineSchema).min(1).max(30),
  useCart: Joi.boolean(),
  currency: Joi.string().valid(...Object.values(Currency)).default(Currency.MXN),
  destination: Joi.object({
    postalCode: Joi.string().trim().pattern(POSTAL_CODE_PATTERN).required().messages({
      "string.pattern.base": "El código postal debe tener 5 dígitos.",
    }),
    state: Joi.string().valid(...MEXICAN_STATE_CODES).required().messages({
      "any.only": "Elige un estado válido.",
    }),
    city: Joi.string().trim().min(2).max(120).required(),
  }).required(),
})
  .xor("lines", "useCart")
  .messages({ "object.xor": "Envía las líneas del carrito o usa useCart, no ambos." });

export { createQuoteSchema };
```
(`country` ≠ MX: como `destination` no admite `country`, `stripUnknown` lo descarta; el test de "US" se cubre en `createOrderSchema` — ajusta el test de la Tarea 8 para que `{ country: "US" }` se omita aquí y se pruebe en la Tarea 9.)

- [ ] **Paso 7: Controller, limiter y ruta.**
  - `middlewares/rateLimit.ts`: antes del `export type`, agregar y exportar:

```ts
// Each quote fans out to one call per carrier at the provider: cheaper than checkout, tighter than catalog.
const shippingQuoteLimiter = createLimiter({
  windowMs: FIFTEEN_MIN,
  limit: 30,
  message: "Demasiadas cotizaciones de envío. Espera unos minutos.",
});
```
  - `services/orderService.ts`: añadir `takeCartLines` al `export { … }` final.
  - `controllers/shippingController.ts`:

```ts
import type { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendResponse } from "../utils/sendResponse.js";
import { AppError } from "../utils/AppError.js";
import { takeCartLines } from "../services/orderService.js";
import { createShippingQuote } from "../services/shippingQuoteService.js";
import type { RequestedLine } from "../services/pricingService.js";
import type { Currency } from "@gira/shared";

interface QuoteBody {
  lines?: RequestedLine[];
  useCart?: boolean;
  currency: Currency;
  destination: { postalCode: string; state: string; city: string };
}

const createQuote = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as QuoteBody;
  let lines = body.lines ?? [];
  if (body.useCart) {
    if (!req.user) throw new AppError("Inicia sesión para cotizar con tu carrito.", 401);
    lines = await takeCartLines(req.user._id);
    if (lines.length === 0) throw new AppError("Tu carrito está vacío.", 400);
  }
  const quote = await createShippingQuote(
    { lines, currency: body.currency, destination: body.destination },
    { userId: req.user?._id },
  );
  sendResponse(res, 200, "Cotización de envío calculada correctamente.", { quote });
});

export { createQuote };
```
  - `routes/v1/shippingRoutes.ts`:

```ts
import { Router } from "express";
import { optionalAuth } from "../../middlewares/protect.js";
import { validate } from "../../middlewares/validate.js";
import { shippingQuoteLimiter } from "../../middlewares/rateLimit.js";
import { createQuoteSchema } from "../../validators/shippingValidator.js";
import { createQuote } from "../../controllers/shippingController.js";

const shippingRouter = Router();

// Open to guests like checkout; the quote is bound to the account when there is one.
shippingRouter.post("/quotes", shippingQuoteLimiter, optionalAuth, validate(createQuoteSchema), createQuote);

export { shippingRouter };
```
  - `routes/v1/index.ts`: `import { shippingRouter } from "./shippingRoutes.js";` y `v1Router.use("/shipping", shippingRouter);` tras `/orders`.

- [ ] **Paso 8: Verde:** `pnpm --filter @gira/api test -- tests/integration/shippingQuote.test.ts`. Corrige en el test de CP/estado el caso `country`.

- [ ] **Checkpoint:** `git diff --stat`.

---

## Tarea 9: La orden congela envío, paquete y dirección completa

**Archivos:** `models/Order.ts`, `validators/orderValidator.ts`, `services/orderService.ts`, `services/adminOrderService.ts` (`toAdminOrder`), `tests/helpers/orders.ts`, `tests/helpers/seedOrder.ts`, tests existentes de órdenes.

- [ ] **Paso 1: Tests rojos** — nuevo archivo `tests/integration/orderShipping.test.ts`:

```ts
import { describe, it, expect, beforeAll } from "vitest";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { Currency } from "@gira/shared";
import { buildApp } from "../../src/app.js";
import { createOrder } from "../../src/services/orderService.js";
import { createShippingQuote } from "../../src/services/shippingQuoteService.js";
import { Order } from "../../src/models/Order.js";
import { ShippingQuote } from "../../src/models/ShippingQuote.js";
import { loginAsAdmin, ORIGIN } from "../helpers/auth.js";
import { seedCatalogVariant, seedShippingOrigin, validCustomer, validShipping } from "../helpers/orders.js";

const app = buildApp();
let variantId: string;
beforeAll(async () => {
  const { cookie } = await loginAsAdmin(app);
  variantId = await seedCatalogVariant(app, cookie, "ORDSHIP");
});

const quoteFor = async (qty = 1, currency = Currency.MXN) => {
  await seedShippingOrigin();
  const quote = await createShippingQuote(
    { lines: [{ variantId, qty }], currency,
      destination: { postalCode: validShipping.postalCode, state: validShipping.state, city: validShipping.city } },
    {},
  );
  return quote;
};

const build = (over: Record<string, unknown> = {}) => ({
  lines: [{ variantId, qty: 1 }],
  currency: Currency.MXN,
  customer: validCustomer,
  shipping: validShipping,
  idempotencyKey: randomUUID(),
  termsAccepted: true,
  ...over,
});

describe("createOrder con cotización de envío", () => {
  it("congela selección, paquete y costo; el total incluye el envío elegido", async () => {
    const q = await quoteFor();
    const rate = q.rates[1]!; // la 2ª opción, no la más barata
    const { order } = await createOrder(build({ shippingQuote: { quoteId: q.quoteId, rateId: rate.rateId } }), {});
    expect(order.shippingCost).toBe(rate.amount);
    expect(order.total).toBe(order.subtotal + rate.amount);
    expect(order.shippingSelection).toEqual({ carrier: rate.carrier, serviceName: rate.serviceName, estimatedDays: rate.estimatedDays });
    const doc = await Order.findOne({ publicId: order.publicId }).lean();
    expect(doc?.shippingSelection?.provider).toBe("stub");
    expect(doc?.shippingSelection?.costMxn).toBeGreaterThan(0);
    expect(doc?.parcel?.weightGrams).toBe(550);
    expect(doc?.shipping.district).toBe("Juárez");
  });

  it("rechaza sin cotización (400 de validación) y con cotización vencida (409)", async () => {
    await expect(createOrder(build(), {})).rejects.toBeTruthy();
    const q = await quoteFor();
    await ShippingQuote.updateOne({ quoteId: q.quoteId }, { expiresAt: new Date(0) });
    await expect(
      createOrder(build({ shippingQuote: { quoteId: q.quoteId, rateId: q.rates[0]!.rateId } }), {}),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("409 si cambia la cantidad, el CP o la moneda respecto a la cotización", async () => {
    const q = await quoteFor(1);
    const sel = { quoteId: q.quoteId, rateId: q.rates[0]!.rateId };
    await expect(createOrder(build({ lines: [{ variantId, qty: 2 }], shippingQuote: sel }), {})).rejects.toMatchObject({ statusCode: 409 });
    await expect(createOrder(build({ shipping: { ...validShipping, postalCode: "99999" }, shippingQuote: sel }), {})).rejects.toMatchObject({ statusCode: 409 });
    await expect(createOrder(build({ currency: Currency.USD, shippingQuote: sel }), {})).rejects.toMatchObject({ statusCode: 409 });
  });

  it("no reserva stock cuando la cotización es inválida", async () => {
    const before = await (await import("../../src/models/Variant.js")).Variant.findById(variantId).lean();
    await expect(createOrder(build({ shippingQuote: { quoteId: "nope", rateId: "x" } }), {})).rejects.toBeTruthy();
    const after = await (await import("../../src/models/Variant.js")).Variant.findById(variantId).lean();
    expect(after?.reserved).toBe(before?.reserved);
  });
});

describe("POST /orders · validación del checkout", () => {
  const post = (body: Record<string, unknown>) =>
    request(app).post("/api/v1/orders").set("Origin", ORIGIN).set("Idempotency-Key", randomUUID()).send(body);

  it("exige colonia, estado válido, CP de 5 dígitos, país MX y teléfono de 10 dígitos", async () => {
    const q = await quoteFor();
    const base = {
      lines: [{ variantId, qty: 1 }], currency: "MXN", customer: validCustomer, termsAccepted: true,
      shipping: validShipping, shippingQuote: { quoteId: q.quoteId, rateId: q.rates[0]!.rateId },
    };
    const cases: Array<Record<string, unknown>> = [
      { shipping: { ...validShipping, district: undefined } },
      { shipping: { ...validShipping, state: "Atlantis" } },
      { shipping: { ...validShipping, postalCode: "1234" } },
      { shipping: { ...validShipping, country: "US" } },
      { customer: { ...validCustomer, phone: undefined } },
      { customer: { ...validCustomer, phone: "123" } },
      { shippingQuote: undefined },
    ];
    for (const over of cases) {
      expect((await post({ ...base, ...over })).status).toBe(400);
    }
  });

  it("normaliza el teléfono (acepta espacios y guiones)", async () => {
    const q = await quoteFor();
    const res = await post({
      lines: [{ variantId, qty: 1 }], currency: "MXN", termsAccepted: true,
      customer: { ...validCustomer, phone: "55 1234-5678" }, shipping: validShipping,
      shippingQuote: { quoteId: q.quoteId, rateId: q.rates[0]!.rateId },
    });
    expect(res.status).toBe(201);
    expect(res.body.data.order.customer.phone).toBe("5512345678");
  });
});
```

- [ ] **Paso 2: Rojo:** `pnpm --filter @gira/api test -- tests/integration/orderShipping.test.ts`.

- [ ] **Paso 3: Modelo `Order`** — `models/Order.ts`:
  1. Importar de `@gira/shared`: `ShippingCarrier, ShippingLabelStatus, ShippingProviderName`.
  2. `ShippingAddress` agrega `district: string;` tras `line2?: string;` y `shippingAddressSchema` agrega `district: { type: String, required: true, trim: true },`.
  3. `OrderCustomer.phone` pasa a obligatorio: `phone: string;` y en `orderCustomerSchema` `phone: { type: String, required: true, trim: true },`.
  4. Nuevas interfaces (tras `OrderPayment`):

```ts
interface ShippingSelectionAttrs {
  provider: ShippingProviderName;
  carrier: ShippingCarrier;
  service: string;
  serviceName: string;
  estimatedDays: number;
  /** Charged to the customer, MXN centavos (0 when free). */
  amountMxn: number;
  /** Quoted to us by the provider, MXN centavos. */
  costMxn: number;
}

interface ParcelAttrs {
  weightGrams: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
}

interface OrderLabel {
  status: ShippingLabelStatus;
  attempts: number;
  nextAttemptAt?: Date;
  requestedAt?: Date;
  providerShipmentId?: string;
  trackingNumber?: string;
  carrier?: ShippingCarrier;
  labelUrl?: string;
  trackUrl?: string;
  /** What the provider charged us for the label, MXN centavos. */
  costMxn?: number;
  lastError?: string;
  readyAt?: Date;
  cancelAttempts: number;
  cancelledAt?: Date;
  /** Cancel the current label and buy a fresh one (address corrected). */
  requeueAfterCancel?: boolean;
}
```
  5. En `OrderAttrs` tras `shippingCost`: `shippingSelection: ShippingSelectionAttrs; parcel: ParcelAttrs;` y tras `paidEffectsAt?`: `label?: OrderLabel;`.
  6. Schemas y campos:

```ts
const shippingSelectionSchema = new Schema<ShippingSelectionAttrs>(
  {
    provider: { type: String, enum: Object.values(ShippingProviderName), required: true },
    carrier: { type: String, enum: Object.values(ShippingCarrier), required: true },
    service: { type: String, required: true },
    serviceName: { type: String, required: true },
    estimatedDays: { type: Number, required: true, min: 0 },
    amountMxn: { type: Number, required: true, min: 0 },
    costMxn: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const parcelSchema = new Schema<ParcelAttrs>(
  {
    weightGrams: { type: Number, required: true, min: 1 },
    lengthCm: { type: Number, required: true, min: 1 },
    widthCm: { type: Number, required: true, min: 1 },
    heightCm: { type: Number, required: true, min: 1 },
  },
  { _id: false },
);

const orderLabelSchema = new Schema<OrderLabel>(
  {
    status: { type: String, enum: Object.values(ShippingLabelStatus), required: true },
    attempts: { type: Number, required: true, min: 0, default: 0 },
    nextAttemptAt: { type: Date },
    requestedAt: { type: Date },
    providerShipmentId: { type: String },
    trackingNumber: { type: String },
    carrier: { type: String, enum: Object.values(ShippingCarrier) },
    labelUrl: { type: String },
    trackUrl: { type: String },
    costMxn: { type: Number, min: 0 },
    lastError: { type: String, maxlength: 500 },
    readyAt: { type: Date },
    cancelAttempts: { type: Number, required: true, min: 0, default: 0 },
    cancelledAt: { type: Date },
    requeueAfterCancel: { type: Boolean },
  },
  { _id: false },
);
```
  y en `orderSchema`: `shippingSelection: { type: shippingSelectionSchema, required: true },`, `parcel: { type: parcelSchema, required: true },` y `label: { type: orderLabelSchema },`.
  7. Índices (junto a los demás):

```ts
// Label job: due purchases and cancellations. Partial: most orders never have a pending label.
orderSchema.index(
  { "label.status": 1, "label.nextAttemptAt": 1 },
  { partialFilterExpression: { "label.status": { $type: "string" } } },
);
// A tracking number belongs to exactly one order (also guards a duplicate purchase).
orderSchema.index(
  { "label.trackingNumber": 1 },
  { unique: true, partialFilterExpression: { "label.trackingNumber": { $type: "string" } } },
);
```
  8. Exportar los tipos nuevos (`ShippingSelectionAttrs, ParcelAttrs, OrderLabel`).

- [ ] **Paso 4: Validator** — `orderValidator.ts`: importar `MEXICAN_STATE_CODES, PHONE_PATTERN, POSTAL_CODE_PATTERN` y reemplazar `shippingAddressSchema` y el bloque `customer`/`shipping` de `createOrderSchema`:

```ts
const shippingAddressSchema = Joi.object({
  recipient: Joi.string().trim().min(2).max(120).required(),
  line1: Joi.string().trim().min(3).max(200).required(),
  line2: Joi.string().trim().max(200).allow(""),
  district: Joi.string().trim().min(2).max(120).required().messages({
    "any.required": "Escribe tu colonia.",
  }),
  city: Joi.string().trim().min(2).max(120).required(),
  state: Joi.string().valid(...MEXICAN_STATE_CODES).required().messages({
    "any.only": "Elige un estado válido.",
  }),
  postalCode: Joi.string().trim().pattern(POSTAL_CODE_PATTERN).required().messages({
    "string.pattern.base": "El código postal debe tener 5 dígitos.",
  }),
  // Mexico only for now: international needs customs data we do not collect.
  country: Joi.string().trim().uppercase().valid("MX").required().messages({
    "any.only": "Por ahora solo enviamos dentro de México.",
  }),
});

/** Digits only, ten of them: carriers reject anything else. Accepts "55 1234-5678". */
const phone = Joi.string()
  .trim()
  .custom((value: string, helpers) => {
    const digits = value.replace(/\D/g, "");
    return PHONE_PATTERN.test(digits) ? digits : helpers.error("string.pattern.base");
  })
  .required()
  .messages({
    "string.pattern.base": "El teléfono debe tener 10 dígitos.",
    "any.required": "El teléfono es obligatorio.",
    "string.empty": "El teléfono es obligatorio.",
  });
```
  En `createOrderSchema`: `customer: Joi.object({ email…, name…, phone }).required(),` (sustituye la línea de `phone` anterior) y agrega

```ts
  shippingQuote: Joi.object({
    quoteId: Joi.string().trim().min(10).max(80).required(),
    rateId: Joi.string().trim().min(10).max(40).required(),
  }).required().messages({ "any.required": "Elige una opción de envío." }),
```
  Actualiza el docblock ("no hay `shippingCost` aquí…") para mencionar que el envío viene de la cotización guardada.

- [ ] **Paso 5: `createOrder`** — en `services/orderService.ts`:
  1. `CreateOrderInput` agrega `shippingQuote: { quoteId: string; rateId: string };` y `customer.phone` obligatorio (revisa la interfaz).
  2. Importar `resolveQuotedRate` de `./shippingQuoteService.js`.
  3. Reemplazar el bloque `const resolved … const quote = await quoteTotals(...)` por:

```ts
  const resolved = await resolveOrderLines(requested);
  // Before reserving anything: an invalid/expired quote must cost no stock.
  const { rate, parcel } = await resolveQuotedRate({
    quoteId: input.shippingQuote.quoteId,
    rateId: input.shippingQuote.rateId,
    resolved,
    postalCode: input.shipping.postalCode,
    currency: input.currency,
    userId: ctx.userId,
  });
  const quote = await quoteTotals(resolved, {
    currency: input.currency,
    shippingMxn: rate.amountMxn,
  });
```
  4. En `Order.create({...})` tras `shippingCost: quote.shippingCost,` agregar:

```ts
        shippingSelection: {
          provider: rate.provider,
          carrier: rate.carrier,
          service: rate.service,
          serviceName: rate.serviceName,
          estimatedDays: rate.estimatedDays,
          amountMxn: rate.amountMxn,
          costMxn: rate.costMxn,
        },
        parcel,
```
  5. `toPublicOrder` agrega (tras `shippingCost`):

```ts
  shippingSelection: {
    carrier: doc.shippingSelection.carrier,
    serviceName: doc.shippingSelection.serviceName,
    estimatedDays: doc.shippingSelection.estimatedDays,
  },
```
  (`OrderLean` ya se deriva del modelo; si es un tipo manual, agrega los campos.) El tipo `provider` de `rate` es `string`: castea `rate.provider as ShippingProviderName` o tipa `ResolvedRate.rate.provider` como `ShippingProviderName` en el servicio.

- [ ] **Paso 6: DTO admin** — `adminOrderService.toAdminOrder` (y el tipo `AdminOrderLean` con los campos nuevos) agrega al final del objeto, antes de `updatedAt`:

```ts
  shippingSelection: { ...doc.shippingSelection },
  parcel: { ...doc.parcel },
  ...(doc.label
    ? {
        label: {
          status: doc.label.status,
          attempts: doc.label.attempts,
          ...(doc.label.lastError ? { lastError: doc.label.lastError } : {}),
          ...(doc.label.trackingNumber ? { trackingNumber: doc.label.trackingNumber } : {}),
          ...(doc.label.carrier ? { carrier: doc.label.carrier } : {}),
          ...(doc.label.labelUrl ? { labelUrl: doc.label.labelUrl } : {}),
          ...(doc.label.trackUrl ? { trackUrl: doc.label.trackUrl } : {}),
          ...(doc.label.readyAt ? { readyAt: doc.label.readyAt } : {}),
          ...(doc.label.cancelledAt ? { cancelledAt: doc.label.cancelledAt } : {}),
        },
      }
    : {}),
```
  y ajusta `listOrders`' proyección si usa `.select(...)` para incluir `shippingSelection parcel label`.

- [ ] **Paso 7: Helpers** — `tests/helpers/orders.ts`: completar

```ts
import { createShippingQuote } from "../../src/services/shippingQuoteService.js";

/** A real stored quote for the cart; returns the cheapest rate in the form the checkout sends. */
const quoteRateFor = async (
  variantId: string,
  qty = 1,
  currency: Currency = Currency.MXN,
): Promise<{ quoteId: string; rateId: string }> => {
  await seedShippingOrigin();
  const quote = await createShippingQuote(
    { lines: [{ variantId, qty }], currency,
      destination: { postalCode: validShipping.postalCode, state: validShipping.state, city: validShipping.city } },
    {},
  );
  return { quoteId: quote.quoteId, rateId: quote.rates[0]!.rateId };
};
```
  y en `createPendingOrder` agrega `shippingQuote: await quoteRateFor(variantId, qty),` al input de `createOrder`. Exporta `quoteRateFor, seedShippingOrigin, validOrigin`.
  `tests/helpers/seedOrder.ts`: en `shipping` agrega `district: "Juárez"` y `state: "CX"`; en `customer` el teléfono siempre (`phone: opts.phone ?? "5512345678"`); y a nivel orden: 

```ts
    shippingSelection: {
      provider: "stub", carrier: "estafeta", service: "ground", serviceName: "Terrestre",
      estimatedDays: 5, amountMxn: 0, costMxn: 12_000,
    },
    parcel: { weightGrams: 550, lengthCm: 30, widthCm: 25, heightCm: 5 },
```

- [ ] **Paso 8: Reparar tests existentes.** `tests/` está fuera de `tsc`: se arreglan corriendo la suite.

```bash
pnpm --filter @gira/api test -- tests/integration/orderShipping.test.ts
grep -rln "POST /orders\|/api/v1/orders\"\|createOrder(\|shipping:" apps/api/tests | sort
pnpm --filter @gira/api test 2>&1 | tail -40
```
Para cada archivo que arme un body de checkout a mano (`orderRoutes`, `orderCreate`, `cart`, `orderDtos`, `stripeWebhook`, `webhookRetry`, `reservation`, `inventory*`, etc.): usar `validShipping`/`validCustomer` del helper y agregar `shippingQuote: await quoteRateFor(variantId, qty)`; los tests que usaban `createOrder` directo ya pasan por `createPendingOrder`. Reglas de reparación: nunca relajar un assert de negocio; si un test dependía de `shippingCost` fijo 15000/60000, reescríbelo contra el monto del stub (12_000/15_000/25_000). Repetir hasta que la suite quede verde (re-correr aislado cualquier fallo de flake).

- [ ] **Paso 9: Typecheck:** `pnpm --filter @gira/api typecheck` → 0 errores (la Tarea 6 dejó `orderService.ts` roto hasta aquí). Actualiza `tests/unit/wireContract.test.ts` solo si el compilador lo pide.

- [ ] **Checkpoint:** `git diff --stat`.

---

## Tarea 10: Mensajes de equipo y servicio de guía (compra)

**Archivos:** `templates/teamMessages.ts`, `jobs/dispatchNotifications.ts`, `tests/unit/teamMessages.test.ts`, crear `services/shippingLabelService.ts`, `tests/integration/shippingLabel.test.ts`.

- [ ] **Paso 1: Mensajes de equipo.** En `tests/unit/teamMessages.test.ts` agrega:

```ts
  it("renderTeamShippingLabelFailed usa el folio y explica el motivo", () => {
    const msg = renderTeamShippingLabelFailed("GC-ABCD1234", "origen_no_configurado");
    expect(msg.title).toContain("guía");
    expect(msg.lines.join("\n")).toContain("GC-ABCD1234");
    expect(msg.lines.join("\n")).toContain("origen_no_configurado");
  });

  it("renderTeamShippingLabelCancelFailed pide cancelar la guía a mano", () => {
    const msg = renderTeamShippingLabelCancelFailed("GC-ABCD1234");
    expect(msg.lines.join("\n")).toContain("GC-ABCD1234");
  });
```
En `templates/teamMessages.ts`, antes de `export type`:

```ts
const renderTeamShippingLabelFailed = (orderNumber: string, reason: string): TeamMessage => ({
  title: "🏷️ No se pudo generar la guía",
  lines: [
    `Folio: ${orderNumber}`,
    `Motivo: ${reason}`,
    "Revisa el pedido en el panel y reintenta la guía.",
  ],
});

const renderTeamShippingLabelCancelFailed = (orderNumber: string): TeamMessage => ({
  title: "🏷️ No se pudo cancelar la guía",
  lines: [
    `Folio: ${orderNumber}`,
    "El pedido se reembolsó, pero Envía no dejó cancelar la guía. Cancélala desde el portal de Envía para recuperar el saldo.",
  ],
});
```
y exportarlas. En `jobs/dispatchNotifications.ts` `renderTeam`, antes del `default:`:

```ts
    case NotificationType.TEAM_SHIPPING_LABEL_FAILED:
      return renderTeamShippingLabelFailed(String(payload.orderNumber), String(payload.reason));
    case NotificationType.TEAM_SHIPPING_LABEL_CANCEL_FAILED:
      return renderTeamShippingLabelCancelFailed(String(payload.orderNumber));
```
(importar ambas funciones.) Verde: `pnpm --filter @gira/api test -- tests/unit/teamMessages.test.ts`.

- [ ] **Paso 2: Tests rojos del servicio** — `tests/integration/shippingLabel.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { OrderStatus, NotificationType, DisputeStatus } from "@gira/shared";
import { buildApp } from "../../src/app.js";
import { Order } from "../../src/models/Order.js";
import { Notification } from "../../src/models/Notification.js";
import { Settings, SINGLETON_KEY } from "../../src/models/Settings.js";
import { ShippingProviderError } from "../../src/adapters/shipping/index.js";
import { applyPaymentSucceeded } from "../../src/services/orderPaymentService.js";
import { purchaseLabelForOrder, settleLabelWork } from "../../src/services/shippingLabelService.js";
import { loginAsAdmin } from "../helpers/auth.js";
import { createPendingOrder, seedCatalogVariant } from "../helpers/orders.js";
import { installFakeShippingProvider, restoreShippingProvider } from "../helpers/fakeShippingProvider.js";

const app = buildApp();
let variantId: string;
beforeAll(async () => {
  const { cookie } = await loginAsAdmin(app);
  variantId = await seedCatalogVariant(app, cookie, "LABEL", 200);
});
afterEach(() => restoreShippingProvider());

const payOrder = async () => {
  const order = await createPendingOrder(variantId);
  await applyPaymentSucceeded(order._id);
  await settleLabelWork();
  return order._id;
};
const labelOf = async (id: unknown) => (await Order.findById(id).lean())?.label;

describe("compra de guía al pagar", () => {
  it("al pagar queda una guía lista (stub) con paquetería y número de rastreo", async () => {
    const id = await payOrder();
    const label = await labelOf(id);
    expect(label?.status).toBe("ready");
    expect(label?.trackingNumber).toMatch(/^STUB/);
    expect(label?.carrier).toBe("estafeta");
    expect(label?.labelUrl).toMatch(/^https:/);
    expect(label?.attempts).toBe(1);
    expect(label?.lastError).toBeUndefined();
  });

  it("re-ejecutar los efectos del pago no compra una segunda guía", async () => {
    const fake = installFakeShippingProvider();
    const id = await payOrder();
    await applyPaymentSucceeded(id);
    await settleLabelWork();
    expect(fake.createLabel).toHaveBeenCalledTimes(1);
  });

  it("dos compras simultáneas de la misma orden: solo una llega al proveedor", async () => {
    const fake = installFakeShippingProvider();
    const order = await createPendingOrder(variantId);
    await Order.updateOne({ _id: order._id }, { $set: { status: OrderStatus.PAID,
      label: { status: "pending", attempts: 0, cancelAttempts: 0, nextAttemptAt: new Date() } } });
    const results = await Promise.all([purchaseLabelForOrder(order._id), purchaseLabelForOrder(order._id)]);
    expect(results.filter((r) => r === "purchased")).toHaveLength(1);
    expect(fake.createLabel).toHaveBeenCalledTimes(1);
  });

  it("un fallo reintentable deja la guía en failed con backoff y vuelve a intentarse", async () => {
    const fake = installFakeShippingProvider();
    fake.createLabel.mockRejectedValueOnce(new ShippingProviderError("unavailable", "Envía pidió esperar"));
    const id = await payOrder();
    const failed = await labelOf(id);
    expect(failed?.status).toBe("failed");
    expect(failed?.attempts).toBe(1);
    expect(failed?.lastError).toContain("esperar");
    expect(failed?.nextAttemptAt!.getTime()).toBeGreaterThan(Date.now() + 4 * 60_000);

    await Order.updateOne({ _id: id }, { $set: { "label.nextAttemptAt": new Date(Date.now() - 1000) } });
    expect(await purchaseLabelForOrder(id)).toBe("purchased");
    expect((await labelOf(id))?.status).toBe("ready");
    expect((await labelOf(id))?.attempts).toBe(2);
  });

  it("agotados los 5 intentos pasa a needs_review y avisa al equipo una sola vez", async () => {
    const fake = installFakeShippingProvider();
    fake.createLabel.mockRejectedValue(new ShippingProviderError("unavailable", "caído"));
    const id = await payOrder();
    for (let i = 0; i < 4; i += 1) {
      await Order.updateOne({ _id: id }, { $set: { "label.nextAttemptAt": new Date(Date.now() - 1000) } });
      await purchaseLabelForOrder(id);
    }
    expect((await labelOf(id))?.status).toBe("needs_review");
    expect((await labelOf(id))?.attempts).toBe(5);
    expect(await Notification.countDocuments({ order: id, type: NotificationType.TEAM_SHIPPING_LABEL_FAILED })).toBe(1);
  });

  it("un resultado incierto (timeout) va directo a needs_review y NO se recompra", async () => {
    const fake = installFakeShippingProvider();
    fake.createLabel.mockRejectedValueOnce(new ShippingProviderError("unknown_outcome", "sin confirmación"));
    const id = await payOrder();
    expect((await labelOf(id))?.status).toBe("needs_review");
    await Order.updateOne({ _id: id }, { $set: { "label.nextAttemptAt": new Date(Date.now() - 1000) } });
    expect(await purchaseLabelForOrder(id)).toBe("skipped");
    expect(fake.createLabel).toHaveBeenCalledTimes(1);
  });

  it("un rechazo del proveedor (saldo, dirección) va a needs_review sin reintentos", async () => {
    const fake = installFakeShippingProvider();
    fake.createLabel.mockRejectedValueOnce(new ShippingProviderError("rejected", "Saldo insuficiente"));
    const id = await payOrder();
    const label = await labelOf(id);
    expect(label?.status).toBe("needs_review");
    expect(label?.lastError).toContain("Saldo");
  });

  it("sin origen configurado la guía va a needs_review con el motivo", async () => {
    const order = await createPendingOrder(variantId);
    await Settings.updateOne({ key: SINGLETON_KEY }, { $unset: { "shipping.origin": "" } });
    await applyPaymentSucceeded(order._id);
    await settleLabelWork();
    const label = await labelOf(order._id);
    expect(label?.status).toBe("needs_review");
    expect(label?.lastError).toBe("origin_not_configured");
  });

  it("no compra guía si hay una disputa abierta", async () => {
    const fake = installFakeShippingProvider();
    const order = await createPendingOrder(variantId);
    await Order.updateOne({ _id: order._id }, { $set: { disputeStatus: DisputeStatus.OPEN } });
    await applyPaymentSucceeded(order._id);
    await settleLabelWork();
    expect(fake.createLabel).not.toHaveBeenCalled();
    expect((await labelOf(order._id))?.status).toBe("pending");
  });

  it("un éxito tardío (tras el lease) igualmente se guarda: el dinero ya se gastó", async () => {
    const fake = installFakeShippingProvider();
    let release!: () => void;
    fake.createLabel.mockImplementationOnce(
      (input, opts) => new Promise((resolve) => { release = () => resolve({
        providerShipmentId: "late-1", trackingNumber: "LATE123", carrier: input.carrier,
        labelUrl: "https://stub.invalid/l.pdf", trackUrl: "https://stub.invalid/t", costMxn: 12_000 }); void opts; }),
    );
    const order = await createPendingOrder(variantId);
    await Order.updateOne({ _id: order._id }, { $set: { status: OrderStatus.PAID,
      label: { status: "pending", attempts: 0, cancelAttempts: 0, nextAttemptAt: new Date() } } });
    const inFlight = purchaseLabelForOrder(order._id);
    await new Promise((r) => setTimeout(r, 20));
    await Order.updateOne({ _id: order._id }, { $set: { "label.status": "needs_review" } }); // lease job gave up
    release();
    await inFlight;
    const label = await labelOf(order._id);
    expect(label?.status).toBe("ready");
    expect(label?.trackingNumber).toBe("LATE123");
  });
});
```

- [ ] **Paso 3: Rojo:** `pnpm --filter @gira/api test -- tests/integration/shippingLabel.test.ts`.

- [ ] **Paso 4: Implementar `services/shippingLabelService.ts`** (compra; la cancelación se agrega en la Tarea 12 en este mismo archivo):

```ts
import type { Types } from "mongoose";
import {
  AuditAction,
  AuditModule,
  DisputeStatus,
  NotificationChannelKind,
  NotificationType,
  OrderStatus,
  ShippingLabelStatus,
} from "@gira/shared";
import { getShippingProvider, ShippingProviderError } from "../adapters/shipping/index.js";
import { Order, type OrderDocument } from "../models/Order.js";
import { logger } from "../config/logger.js";
import { AppError } from "../utils/AppError.js";
import type { RequestContext } from "../utils/requestContext.js";
import { recordAudit } from "./auditService.js";
import { enqueueNotification } from "./notificationService.js";
import { getSettings } from "./settingsService.js";

/**
 * Buys, retries and cancels the shipping label of an order.
 *
 * Money rules: the provider has NO idempotency key, so the only guard against a
 * double purchase is OUR atomic claim (`pending|failed` -> `requested`, which
 * also bumps `attempts`) plus never retrying an uncertain outcome. Results are
 * written fenced on (requestedAt, attempts): a late reply from an old attempt
 * cannot overwrite a newer one — except a late SUCCESS, which is always kept
 * because the label was already paid for.
 */

const LABEL_MAX_ATTEMPTS = 5;
const LABEL_BACKOFF_BASE_MS = 5 * 60 * 1000;
/** A `requested` label older than this lost its worker; the job sends it to review. */
const LABEL_LEASE_MS = 10 * 60 * 1000;

/** The parcel can still be labelled only while it has not left. */
const LABELABLE = [OrderStatus.PAID, OrderStatus.PROCESSING];
/** An open or lost chargeback freezes shipping decisions. */
const BLOCKING_DISPUTES = [DisputeStatus.OPEN, DisputeStatus.LOST];
const DEAD_STATUSES = [OrderStatus.REFUNDED, OrderStatus.CANCELLED, OrderStatus.EXPIRED];

const backoffDate = (attempt: number): Date =>
  new Date(Date.now() + LABEL_BACKOFF_BASE_MS * 2 ** Math.max(0, attempt - 1));

/** Tests await the fire-and-forget purchases through this registry. */
const inflight = new Set<Promise<unknown>>();
const settleLabelWork = async (): Promise<void> => {
  while (inflight.size > 0) await Promise.allSettled([...inflight]);
};

const fence = (o: OrderDocument) => ({
  _id: o._id,
  "label.status": ShippingLabelStatus.REQUESTED,
  "label.requestedAt": o.label?.requestedAt,
  "label.attempts": o.label?.attempts,
});

const claimLabel = (orderId: Types.ObjectId | string): Promise<OrderDocument | null> =>
  Order.findOneAndUpdate(
    {
      _id: orderId,
      status: { $in: LABELABLE },
      disputeStatus: { $nin: BLOCKING_DISPUTES },
      "label.status": { $in: [ShippingLabelStatus.PENDING, ShippingLabelStatus.FAILED] },
      "label.nextAttemptAt": { $lte: new Date() },
    },
    {
      $set: { "label.status": ShippingLabelStatus.REQUESTED, "label.requestedAt": new Date() },
      $inc: { "label.attempts": 1 },
    },
    { new: true },
  );

/** One alert per order: the outbox's unique (order, type) index is the dedupe. */
const alertNeedsReview = async (order: { _id: Types.ObjectId; orderNumber: string }, reason: string): Promise<void> => {
  await enqueueNotification({
    channel: NotificationChannelKind.TEAM,
    type: NotificationType.TEAM_SHIPPING_LABEL_FAILED,
    to: "team",
    order: order._id,
    payload: { orderNumber: order.orderNumber, reason },
  });
  await recordAudit({
    actorType: "system",
    action: AuditAction.LABEL_NEEDS_REVIEW,
    module: AuditModule.SHIPPING,
    targetId: String(order._id),
    after: { reason },
  });
};

const failLabel = async (claimed: OrderDocument, message: string, terminal: boolean): Promise<void> => {
  const attempts = claimed.label?.attempts ?? 1;
  const toReview = terminal || attempts >= LABEL_MAX_ATTEMPTS;
  const text = message.slice(0, 500);
  const result = await Order.updateOne(
    fence(claimed),
    {
      $set: toReview
        ? { "label.status": ShippingLabelStatus.NEEDS_REVIEW, "label.lastError": text }
        : {
            "label.status": ShippingLabelStatus.FAILED,
            "label.lastError": text,
            "label.nextAttemptAt": backoffDate(attempts),
          },
    },
  );
  if (result.modifiedCount === 0) return; // superseded: a newer state owns the label now
  await recordAudit({
    actorType: "system",
    action: AuditAction.LABEL_FAILED,
    module: AuditModule.SHIPPING,
    targetId: String(claimed._id),
    after: { attempts, reason: text },
  });
  if (toReview) await alertNeedsReview(claimed, text);
};

const recordReady = async (
  claimed: OrderDocument,
  result: Awaited<ReturnType<ReturnType<typeof getShippingProvider>["createLabel"]>>,
): Promise<void> => {
  const set = {
    "label.status": ShippingLabelStatus.READY,
    "label.providerShipmentId": result.providerShipmentId,
    "label.trackingNumber": result.trackingNumber,
    "label.carrier": result.carrier,
    "label.labelUrl": result.labelUrl,
    "label.trackUrl": result.trackUrl,
    "label.costMxn": result.costMxn,
    "label.readyAt": new Date(),
  };
  const unset = { "label.lastError": "", "label.nextAttemptAt": "" };

  let written = await Order.updateOne(fence(claimed), { $set: set, $unset: unset });
  if (written.modifiedCount === 0) {
    // The lease job gave up on this attempt while the provider was still working:
    // the money is spent, so keep the label as long as the order has none yet.
    written = await Order.updateOne(
      {
        _id: claimed._id,
        "label.trackingNumber": { $exists: false },
        "label.status": {
          $in: [ShippingLabelStatus.NEEDS_REVIEW, ShippingLabelStatus.FAILED, ShippingLabelStatus.PENDING],
        },
      },
      { $set: set, $unset: unset },
    );
  }
  if (written.modifiedCount === 0) {
    // A second purchase landed on an order that already has a label: flag it.
    await alertNeedsReview(claimed, `duplicate_label:${result.trackingNumber}`);
    return;
  }
  await recordAudit({
    actorType: "system",
    action: AuditAction.LABEL_CREATED,
    module: AuditModule.SHIPPING,
    targetId: String(claimed._id),
    after: { carrier: result.carrier },
  });
  // The order may have died (refund) while the purchase was in flight.
  await cancelIfOrderDead(claimed._id);
};

const toDestination = (o: OrderDocument) => ({
  name: o.shipping.recipient,
  phone: o.customer.phone,
  email: o.customer.email,
  line1: o.shipping.line1,
  ...(o.shipping.line2 ? { line2: o.shipping.line2 } : {}),
  district: o.shipping.district,
  city: o.shipping.city,
  state: o.shipping.state,
  postalCode: o.shipping.postalCode,
});

type PurchaseOutcome = "purchased" | "failed" | "skipped";

const purchaseLabelForOrder = async (orderId: Types.ObjectId | string): Promise<PurchaseOutcome> => {
  const claimed = await claimLabel(orderId);
  if (!claimed) return "skipped";

  const settings = await getSettings();
  const origin = settings.shipping.origin;
  if (!origin) {
    await failLabel(claimed, "origin_not_configured", true);
    return "failed";
  }
  const provider = getShippingProvider();
  if (claimed.shippingSelection.provider !== provider.name) {
    await failLabel(claimed, "provider_mismatch", true);
    return "failed";
  }

  try {
    const result = await provider.createLabel(
      {
        orderRef: claimed.orderNumber,
        origin: {
          name: origin.name, phone: origin.phone, ...(origin.email ? { email: origin.email } : {}),
          line1: origin.line1, district: origin.district, city: origin.city,
          state: origin.state, postalCode: origin.postalCode,
        },
        destination: toDestination(claimed),
        parcel: { ...claimed.parcel },
        declaredValueMxn: claimed.lines.reduce((sum, l) => sum + l.unitPriceMxn * l.qty, 0),
        carrier: claimed.shippingSelection.carrier,
        service: claimed.shippingSelection.service,
      },
      {},
    );
    await recordReady(claimed, result);
    return "purchased";
  } catch (err) {
    if (err instanceof ShippingProviderError) {
      await failLabel(claimed, err.message, err.kind !== "unavailable");
    } else {
      logger.error({ err, orderId: String(claimed._id) }, "Error inesperado al comprar la guía");
      await failLabel(claimed, "unexpected_error", true);
    }
    return "failed";
  }
};

/** Fire-and-forget: a slow carrier must never delay the payment flow that triggered it. */
const triggerLabelPurchase = (orderId: Types.ObjectId | string): void => {
  const work = purchaseLabelForOrder(orderId)
    .catch((err: unknown) => logger.error({ err, orderId: String(orderId) }, "No se pudo disparar la compra de guía"))
    .finally(() => inflight.delete(work));
  inflight.add(work);
};

/** Idempotent: queues a label for a paid order that has none, then tries right away. */
const enqueueLabel = async (orderId: Types.ObjectId | string): Promise<void> => {
  await Order.updateOne(
    { _id: orderId, status: { $in: LABELABLE }, label: { $exists: false } },
    {
      $set: {
        label: {
          status: ShippingLabelStatus.PENDING,
          attempts: 0,
          cancelAttempts: 0,
          nextAttemptAt: new Date(),
        },
      },
    },
  );
  await recordAudit({
    actorType: "system",
    action: AuditAction.LABEL_REQUESTED,
    module: AuditModule.SHIPPING,
    targetId: String(orderId),
  });
  triggerLabelPurchase(orderId);
};

/** Admin: put a failed / needs_review label (never one with a guide) back in the queue. */
const retryLabel = async (orderId: string, ctx: RequestContext): Promise<void> => {
  const updated = await Order.findOneAndUpdate(
    {
      _id: orderId,
      status: { $in: LABELABLE },
      "label.status": { $in: [ShippingLabelStatus.FAILED, ShippingLabelStatus.NEEDS_REVIEW] },
      "label.trackingNumber": { $exists: false },
    },
    {
      $set: { "label.status": ShippingLabelStatus.PENDING, "label.attempts": 0, "label.nextAttemptAt": new Date() },
      $unset: { "label.lastError": "" },
    },
    { new: true },
  );
  if (!updated) {
    if (!(await Order.exists({ _id: orderId }))) throw new AppError("La orden no existe.", 404);
    throw new AppError("La guía de esta orden no se puede reintentar en este estado.", 409);
  }
  await recordAudit({
    actorId: ctx.actorId,
    actorType: "user",
    action: AuditAction.LABEL_RETRY_REQUESTED,
    module: AuditModule.SHIPPING,
    targetId: String(updated._id),
    ip: ctx.ip,
  });
  triggerLabelPurchase(updated._id);
};

// Placeholder wired in Task 12 (cancellation lives in this same module).
const cancelIfOrderDead = async (_orderId: Types.ObjectId): Promise<void> => undefined;

export type { PurchaseOutcome };
export {
  LABEL_MAX_ATTEMPTS,
  LABEL_LEASE_MS,
  LABELABLE,
  DEAD_STATUSES,
  purchaseLabelForOrder,
  triggerLabelPurchase,
  enqueueLabel,
  retryLabel,
  settleLabelWork,
};
```
Nota: `cancelIfOrderDead` se reemplaza por la real en la Tarea 12 (el stub deja compilar y que estos tests pasen). `DEAD_STATUSES` se usará allí.

- [ ] **Paso 5: Enganchar al pago** — `services/orderPaymentService.ts`: importar `enqueueLabel` de `./shippingLabelService.js` y en `runPaidEffects`, justo ANTES del `await Order.updateOne({ _id: order._id, paidEffectsAt: { $exists: false } }, …)` final:

```ts
  // The label is part of "payment effects" so the reconciler retries it if we die
  // here; the purchase itself runs in the background and has its own retries.
  await enqueueLabel(order._id);
```
- [ ] **Paso 6: Verde:** `pnpm --filter @gira/api test -- tests/integration/shippingLabel.test.ts tests/unit/teamMessages.test.ts`. Luego un barrido de regresión: `pnpm --filter @gira/api test -- tests/integration/stripeWebhook.test.ts tests/integration/jobs.test.ts` (los pagos ahora disparan una compra de guía con el stub; si algún test cuenta notificaciones o `Order` exactos, ajusta el assert, no el código).

- [ ] **Checkpoint:** `git diff --stat`.

---

## Tarea 11: Reintento admin y job de guías

**Archivos:** crear `jobs/processShippingLabels.ts`, `tests/integration/shippingLabelJob.test.ts`; modificar `jobs/scheduler.ts`, `routes/v1/admin/adminOrderRoutes.ts`, `controllers/adminOrderController.ts` (nombre real: `grep -rn "bulk-status" src/routes`), `tests/integration/adminOrders.test.ts` (o archivo nuevo `adminOrderLabel.test.ts`).

- [ ] **Paso 1: Tests rojos** — `tests/integration/shippingLabelJob.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { OrderStatus, NotificationType } from "@gira/shared";
import { buildApp } from "../../src/app.js";
import { Order } from "../../src/models/Order.js";
import { Notification } from "../../src/models/Notification.js";
import { processShippingLabels } from "../../src/jobs/processShippingLabels.js";
import { loginAsAdmin } from "../helpers/auth.js";
import { createPendingOrder, seedCatalogVariant } from "../helpers/orders.js";
import { installFakeShippingProvider, restoreShippingProvider } from "../helpers/fakeShippingProvider.js";
import { settleLabelWork } from "../../src/services/shippingLabelService.js";

const app = buildApp();
let variantId: string;
beforeAll(async () => {
  const { cookie } = await loginAsAdmin(app);
  variantId = await seedCatalogVariant(app, cookie, "LABELJOB", 200);
});
afterEach(() => restoreShippingProvider());

const paidOrderWithLabel = async (label: Record<string, unknown>) => {
  const order = await createPendingOrder(variantId);
  await Order.updateOne({ _id: order._id }, { $set: { status: OrderStatus.PAID, label: { attempts: 0, cancelAttempts: 0, ...label } } });
  return order._id;
};

describe("processShippingLabels", () => {
  it("compra las guías vencidas y deja intactas las que aún no les toca", async () => {
    const due = await paidOrderWithLabel({ status: "pending", nextAttemptAt: new Date(Date.now() - 1000) });
    const later = await paidOrderWithLabel({ status: "failed", nextAttemptAt: new Date(Date.now() + 3_600_000) });
    await processShippingLabels();
    expect((await Order.findById(due).lean())?.label?.status).toBe("ready");
    expect((await Order.findById(later).lean())?.label?.status).toBe("failed");
  });

  it("manda a needs_review una guía 'requested' con el lease vencido y avisa una vez", async () => {
    const id = await paidOrderWithLabel({ status: "requested", attempts: 1, requestedAt: new Date(Date.now() - 11 * 60_000) });
    const fresh = await paidOrderWithLabel({ status: "requested", attempts: 1, requestedAt: new Date() });
    await processShippingLabels();
    await processShippingLabels();
    expect((await Order.findById(id).lean())?.label?.status).toBe("needs_review");
    expect((await Order.findById(id).lean())?.label?.lastError).toBe("lease_expired");
    expect((await Order.findById(fresh).lean())?.label?.status).toBe("requested");
    expect(await Notification.countDocuments({ order: id, type: NotificationType.TEAM_SHIPPING_LABEL_FAILED })).toBe(1);
  });

  it("un fallo de una orden no detiene al resto del lote", async () => {
    const fake = installFakeShippingProvider();
    const a = await paidOrderWithLabel({ status: "pending", nextAttemptAt: new Date(Date.now() - 1000) });
    const b = await paidOrderWithLabel({ status: "pending", nextAttemptAt: new Date(Date.now() - 1000) });
    fake.createLabel.mockRejectedValueOnce(new Error("boom"));
    await processShippingLabels();
    await settleLabelWork();
    const statuses = [(await Order.findById(a).lean())?.label?.status, (await Order.findById(b).lean())?.label?.status];
    expect(statuses.sort()).toEqual(["needs_review", "ready"]);
  });
});
```
Más un archivo `tests/integration/adminOrderLabel.test.ts` para la ruta de reintento:

```ts
import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { OrderStatus } from "@gira/shared";
import { buildApp } from "../../src/app.js";
import { Order } from "../../src/models/Order.js";
import { settleLabelWork } from "../../src/services/shippingLabelService.js";
import { loginAsAdmin, loginAsCustomer, ORIGIN } from "../helpers/auth.js";
import { createPendingOrder, seedCatalogVariant } from "../helpers/orders.js";

const app = buildApp();
let cookie: string;
let variantId: string;
beforeAll(async () => {
  ({ cookie } = await loginAsAdmin(app));
  variantId = await seedCatalogVariant(app, cookie, "RETRY", 200);
});

const retry = (id: unknown, c = cookie) =>
  request(app).post(`/api/v1/admin/orders/${String(id)}/label/retry`).set("Origin", ORIGIN).set("Cookie", c);

describe("POST /admin/orders/:id/label/retry", () => {
  it("devuelve a la cola una guía en needs_review y la compra", async () => {
    const order = await createPendingOrder(variantId);
    await Order.updateOne({ _id: order._id }, { $set: { status: OrderStatus.PAID,
      label: { status: "needs_review", attempts: 5, cancelAttempts: 0, lastError: "x" } } });
    const res = await retry(order._id);
    expect(res.status).toBe(200);
    await settleLabelWork();
    const label = (await Order.findById(order._id).lean())?.label;
    expect(label?.status).toBe("ready");
    expect(label?.attempts).toBe(1);
  });

  it("409 si ya tiene guía o está en otro estado; 404 si no existe; 401/403 sin permisos", async () => {
    const order = await createPendingOrder(variantId);
    await Order.updateOne({ _id: order._id }, { $set: { status: OrderStatus.PAID,
      label: { status: "ready", attempts: 1, cancelAttempts: 0, trackingNumber: "T1" } } });
    expect((await retry(order._id)).status).toBe(409);
    expect((await retry("64b000000000000000000000")).status).toBe(404);
    expect((await request(app).post(`/api/v1/admin/orders/${String(order._id)}/label/retry`).set("Origin", ORIGIN)).status).toBe(401);
    const customer = await loginAsCustomer(app);
    expect((await retry(order._id, customer.cookie)).status).toBe(403);
  });
});
```
(Ajusta las firmas de `loginAsCustomer` y la forma `{ cookie }` a como las exponen `tests/helpers/auth.ts`.)

- [ ] **Paso 2: Rojo:** ambos archivos.

- [ ] **Paso 3: Job** — `jobs/processShippingLabels.ts`:

```ts
import { ShippingLabelStatus } from "@gira/shared";
import { Order } from "../models/Order.js";
import { logger } from "../config/logger.js";
import { LABELABLE, LABEL_LEASE_MS, purchaseLabelForOrder } from "../services/shippingLabelService.js";
import { failStaleLease, processLabelCancellation } from "../services/shippingLabelService.js";

/**
 * Per-minute sweep over the labels:
 *   1. purchases whose time came (pending / failed with nextAttemptAt due),
 *   2. `requested` labels whose worker died (lease expired) -> needs_review: the
 *      outcome is UNKNOWN, so they are never re-bought automatically,
 *   3. pending cancellations.
 * Exported as a plain async function so tests drive it directly.
 */
const BATCH = 20;

const processShippingLabels = async (): Promise<void> => {
  const now = new Date();

  const stale = await Order.find({
    "label.status": ShippingLabelStatus.REQUESTED,
    "label.requestedAt": { $lt: new Date(now.getTime() - LABEL_LEASE_MS) },
  }).limit(BATCH);
  for (const order of stale) await failStaleLease(order);

  const due = await Order.find({
    status: { $in: LABELABLE },
    "label.status": { $in: [ShippingLabelStatus.PENDING, ShippingLabelStatus.FAILED] },
    "label.nextAttemptAt": { $lte: now },
  })
    .select("_id")
    .limit(BATCH)
    .lean();
  for (const { _id } of due) {
    try {
      await purchaseLabelForOrder(_id);
    } catch (err) {
      logger.error({ err, orderId: String(_id) }, "Falló la compra de guía en el job");
    }
  }

  const cancels = await Order.find({
    "label.status": ShippingLabelStatus.CANCEL_PENDING,
    "label.nextAttemptAt": { $lte: now },
  })
    .select("_id")
    .limit(BATCH)
    .lean();
  for (const { _id } of cancels) {
    try {
      await processLabelCancellation(_id);
    } catch (err) {
      logger.error({ err, orderId: String(_id) }, "Falló la cancelación de guía en el job");
    }
  }
};

export { processShippingLabels };
```
Unifica los dos imports de `shippingLabelService.js` en uno. En `services/shippingLabelService.ts` agrega y exporta:

```ts
/** A `requested` label whose worker is gone: outcome unknown -> a human decides. */
const failStaleLease = async (order: OrderDocument): Promise<void> => {
  const moved = await Order.updateOne(
    fence(order),
    { $set: { "label.status": ShippingLabelStatus.NEEDS_REVIEW, "label.lastError": "lease_expired" } },
  );
  if (moved.modifiedCount > 0) await alertNeedsReview(order, "lease_expired");
};
```
(`processLabelCancellation` llega en la Tarea 12; mientras tanto declara en el servicio `const processLabelCancellation = async (_id: Types.ObjectId | string): Promise<void> => undefined;` y expórtala — se reemplaza en la Tarea 12.)

- [ ] **Paso 4: Scheduler** — `jobs/scheduler.ts`: importar `processShippingLabels` y agregar al arreglo `timers`: `setInterval(runSafely("processShippingLabels", processShippingLabels), EVERY_MINUTE),`.

- [ ] **Paso 5: Ruta admin.** En el router de órdenes admin (`routes/v1/admin/adminOrderRoutes.ts`), junto a las rutas `/:id/...`, agregar `adminOrderRouter.post("/:id/label/retry", validate(objectIdParamSchema, "params"), retryOrderLabel);` (mirror del estilo de las rutas vecinas; las rutas admin ya van detrás de `protect + restrictTo(ADMIN)` y `verifyOrigin`). Controller (en el archivo de controladores de órdenes admin, mismo patrón que `updatePriority`):

```ts
const retryOrderLabel = asyncHandler(async (req: Request, res: Response) => {
  await retryLabel(req.params.id as string, buildContext(req));
  sendResponse(res, 200, "Reintentamos generar la guía. Revisa el pedido en unos segundos.");
});
```
con `import { retryLabel } from "../services/shippingLabelService.js";`.

- [ ] **Paso 6: Verde:** `pnpm --filter @gira/api test -- tests/integration/shippingLabelJob.test.ts tests/integration/adminOrderLabel.test.ts`; `pnpm --filter @gira/api typecheck`.

- [ ] **Checkpoint:** `git diff --stat`.

---

## Tarea 12: Cancelación de guía (reembolso, contracargo perdido, corrección de dirección)

**Archivos:** `services/shippingLabelService.ts`, `services/orderPaymentService.ts`, `services/adminOrderService.ts`, `tests/integration/shippingLabelCancel.test.ts`, `tests/integration/adminOrderAddress.test.ts`.

- [ ] **Paso 1: Tests rojos** — `tests/integration/shippingLabelCancel.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { DisputeStatus, NotificationType, OrderStatus } from "@gira/shared";
import { buildApp } from "../../src/app.js";
import { Order } from "../../src/models/Order.js";
import { Notification } from "../../src/models/Notification.js";
import { ShippingProviderError } from "../../src/adapters/shipping/index.js";
import { applyDisputeClosed, applyPaymentSucceeded, applyRefund } from "../../src/services/orderPaymentService.js";
import {
  processLabelCancellation, requestLabelCancellation, settleLabelWork,
} from "../../src/services/shippingLabelService.js";
import { loginAsAdmin } from "../helpers/auth.js";
import { createPendingOrder, seedCatalogVariant } from "../helpers/orders.js";
import { installFakeShippingProvider, restoreShippingProvider } from "../helpers/fakeShippingProvider.js";

const app = buildApp();
let variantId: string;
beforeAll(async () => {
  const { cookie } = await loginAsAdmin(app);
  variantId = await seedCatalogVariant(app, cookie, "CANCEL", 300);
});
afterEach(() => restoreShippingProvider());

const paidWithLabel = async () => {
  const order = await createPendingOrder(variantId);
  await applyPaymentSucceeded(order._id);
  await settleLabelWork();
  return order;
};
const labelOf = async (id: unknown) => (await Order.findById(id).lean())?.label;

describe("cancelación de guía", () => {
  it("un reembolso total de un pedido pagado cancela la guía en el proveedor", async () => {
    const fake = installFakeShippingProvider();
    const order = await paidWithLabel();
    const tracking = (await labelOf(order._id))?.trackingNumber;
    await applyRefund(order._id, order.total);
    await settleLabelWork();
    expect(fake.cancelLabel).toHaveBeenCalledWith({ carrier: "estafeta", trackingNumber: tracking }, expect.anything());
    const label = await labelOf(order._id);
    expect(label?.status).toBe("cancelled");
    expect(label?.cancelledAt).toBeInstanceOf(Date);
  });

  it("un reembolso PARCIAL no toca la guía", async () => {
    const fake = installFakeShippingProvider();
    const order = await paidWithLabel();
    await applyRefund(order._id, 100);
    await settleLabelWork();
    expect(fake.cancelLabel).not.toHaveBeenCalled();
    expect((await labelOf(order._id))?.status).toBe("ready");
  });

  it("si el pedido ya salió (enviado) no se intenta cancelar", async () => {
    const fake = installFakeShippingProvider();
    const order = await paidWithLabel();
    await Order.updateOne({ _id: order._id }, { $set: { status: OrderStatus.SHIPPED } });
    await applyRefund(order._id, order.total);
    await settleLabelWork();
    expect(fake.cancelLabel).not.toHaveBeenCalled();
  });

  it("un contracargo perdido cancela la guía de un pedido que no ha salido", async () => {
    const fake = installFakeShippingProvider();
    const order = await paidWithLabel();
    await applyDisputeClosed(order._id, DisputeStatus.LOST);
    await settleLabelWork();
    expect(fake.cancelLabel).toHaveBeenCalledTimes(1);
    expect((await labelOf(order._id))?.status).toBe("cancelled");
  });

  it("si el proveedor rechaza (ya escaneada) pasa a needs_review y avisa una vez", async () => {
    const fake = installFakeShippingProvider();
    fake.cancelLabel.mockRejectedValue(new ShippingProviderError("rejected", "ya recolectado"));
    const order = await paidWithLabel();
    await applyRefund(order._id, order.total);
    await settleLabelWork();
    expect((await labelOf(order._id))?.status).toBe("needs_review");
    expect(await Notification.countDocuments({ order: order._id, type: NotificationType.TEAM_SHIPPING_LABEL_CANCEL_FAILED })).toBe(1);
  });

  it("una caída del proveedor se reintenta con backoff y a los 3 intentos va a revisión", async () => {
    const fake = installFakeShippingProvider();
    fake.cancelLabel.mockRejectedValue(new ShippingProviderError("unavailable", "caído"));
    const order = await paidWithLabel();
    await applyRefund(order._id, order.total);
    await settleLabelWork();
    expect((await labelOf(order._id))?.status).toBe("cancel_pending");
    for (let i = 0; i < 2; i += 1) {
      await Order.updateOne({ _id: order._id }, { $set: { "label.nextAttemptAt": new Date(Date.now() - 1000) } });
      await processLabelCancellation(order._id);
    }
    expect((await labelOf(order._id))?.status).toBe("needs_review");
    expect(fake.cancelLabel).toHaveBeenCalledTimes(3);
  });

  it("una guía que aún no se compró (pending/failed) se cierra sin llamar al proveedor", async () => {
    const fake = installFakeShippingProvider();
    const order = await createPendingOrder(variantId);
    await Order.updateOne({ _id: order._id }, { $set: { status: OrderStatus.PAID,
      label: { status: "failed", attempts: 2, cancelAttempts: 0, nextAttemptAt: new Date() } } });
    expect(await requestLabelCancellation(order._id)).toBe("closed");
    expect(fake.cancelLabel).not.toHaveBeenCalled();
    expect((await labelOf(order._id))?.status).toBe("cancelled");
  });

  it("una compra en vuelo cuando se reembolsa cancela la guía en cuanto llega", async () => {
    const fake = installFakeShippingProvider();
    let release!: () => void;
    fake.createLabel.mockImplementationOnce(
      (input) => new Promise((resolve) => { release = () => resolve({
        providerShipmentId: "s1", trackingNumber: "RACE1", carrier: input.carrier,
        labelUrl: "https://stub.invalid/l", trackUrl: "https://stub.invalid/t", costMxn: 12_000 }); }),
    );
    const order = await createPendingOrder(variantId);
    await applyPaymentSucceeded(order._id); // dispara la compra, queda en vuelo
    await new Promise((r) => setTimeout(r, 20));
    await applyRefund(order._id, order.total);
    release();
    await settleLabelWork();
    expect(fake.cancelLabel).toHaveBeenCalledWith({ carrier: "estafeta", trackingNumber: "RACE1" }, expect.anything());
  });
});
```

Y en `tests/integration/adminOrderAddress.test.ts` agrega (siguiendo cómo ese archivo ya llama `PATCH /:id/shipping-address` con `validShipping`):

```ts
  it("con guía lista y mismo CP: cancela la guía vieja y compra una nueva", async () => {
    // pagar → label ready (T1) → PATCH con otra calle, mismo postalCode
    // esperado: 200, tras settleLabelWork el label.status === "ready" y trackingNumber distinto del original
  });
  it("con guía lista y otro CP: 409 y la dirección no cambia", async () => { /* … */ });
  it("con una compra de guía en vuelo (requested): 409", async () => { /* … */ });
  it("exige colonia y estado válido en la corrección", async () => { /* 400 */ });
```
Escríbelos completos con el mismo armado que el test de cancelación (pagar con `applyPaymentSucceeded` + `settleLabelWork`); el trackingNumber del stub depende de `orderNumber`, así que para asegurar que cambia, haz que `fake.createLabel` devuelva `trackingNumber` distinto por llamada (`mockResolvedValueOnce` con dos valores).

- [ ] **Paso 2: Rojo:** `pnpm --filter @gira/api test -- tests/integration/shippingLabelCancel.test.ts tests/integration/adminOrderAddress.test.ts`.

- [ ] **Paso 3: Implementar la cancelación** en `services/shippingLabelService.ts`. Reemplazar el stub de `cancelIfOrderDead` y el stub de `processLabelCancellation`; agregar:

```ts
const CANCEL_MAX_ATTEMPTS = 3;
const CANCEL_LEASE_MS = 10 * 60 * 1000;

type CancelRequestOutcome = "cancelling" | "closed" | "in_flight" | "needs_review" | "noop";

/**
 * Starts the cancellation of an order's label.
 *  - ready            -> cancel_pending (the provider call runs next)
 *  - pending / failed -> nothing was bought: closed locally, no provider call
 *  - requested        -> a purchase is in flight: `recordReady` cancels it on arrival
 *  - needs_review     -> a human already has the alert; never auto-resolved
 */
const requestLabelCancellation = async (
  orderId: Types.ObjectId | string,
  opts: { requeue?: boolean } = {},
): Promise<CancelRequestOutcome> => {
  const ready = await Order.findOneAndUpdate(
    { _id: orderId, "label.status": ShippingLabelStatus.READY },
    {
      $set: {
        "label.status": ShippingLabelStatus.CANCEL_PENDING,
        "label.cancelAttempts": 0,
        "label.nextAttemptAt": new Date(),
        ...(opts.requeue ? { "label.requeueAfterCancel": true } : {}),
      },
    },
    { new: true },
  );
  if (ready) {
    await recordAudit({
      actorType: "system",
      action: AuditAction.LABEL_CANCEL_REQUESTED,
      module: AuditModule.SHIPPING,
      targetId: String(ready._id),
    });
    const work = processLabelCancellation(ready._id)
      .catch((err: unknown) => logger.error({ err, orderId: String(ready._id) }, "No se pudo cancelar la guía"))
      .finally(() => inflight.delete(work));
    inflight.add(work);
    return "cancelling";
  }

  if (opts.requeue) return "noop"; // nothing bought yet: the pending purchase will use the new address

  const closed = await Order.updateOne(
    { _id: orderId, "label.status": { $in: [ShippingLabelStatus.PENDING, ShippingLabelStatus.FAILED] } },
    { $set: { "label.status": ShippingLabelStatus.CANCELLED, "label.cancelledAt": new Date() }, $unset: { "label.nextAttemptAt": "" } },
  );
  if (closed.modifiedCount > 0) return "closed";

  const current = await Order.findById(orderId).select("label.status").lean();
  if (current?.label?.status === ShippingLabelStatus.REQUESTED) return "in_flight";
  if (current?.label?.status === ShippingLabelStatus.NEEDS_REVIEW) return "needs_review";
  return "noop";
};

const cancelFailureAlert = async (order: { _id: Types.ObjectId; orderNumber: string }): Promise<void> => {
  await enqueueNotification({
    channel: NotificationChannelKind.TEAM,
    type: NotificationType.TEAM_SHIPPING_LABEL_CANCEL_FAILED,
    to: "team",
    order: order._id,
    payload: { orderNumber: order.orderNumber },
  });
};

/** One cancellation attempt for a `cancel_pending` label. Idempotent and safe to race. */
const processLabelCancellation = async (orderId: Types.ObjectId | string): Promise<void> => {
  const now = new Date();
  // The claim pushes nextAttemptAt out by a lease, so a concurrent run skips it.
  const claimed = await Order.findOneAndUpdate(
    { _id: orderId, "label.status": ShippingLabelStatus.CANCEL_PENDING, "label.nextAttemptAt": { $lte: now } },
    { $inc: { "label.cancelAttempts": 1 }, $set: { "label.nextAttemptAt": new Date(now.getTime() + CANCEL_LEASE_MS) } },
    { new: true },
  );
  if (!claimed?.label?.trackingNumber || !claimed.label.carrier) return;

  const attempts = claimed.label.cancelAttempts;
  try {
    await getShippingProvider().cancelLabel(
      { carrier: claimed.label.carrier, trackingNumber: claimed.label.trackingNumber },
      {},
    );
  } catch (err) {
    const kind = err instanceof ShippingProviderError ? err.kind : "rejected";
    const giveUp = kind !== "unavailable" || attempts >= CANCEL_MAX_ATTEMPTS;
    const message = (err instanceof Error ? err.message : "unexpected_error").slice(0, 500);
    if (giveUp) {
      await Order.updateOne(
        { _id: claimed._id, "label.status": ShippingLabelStatus.CANCEL_PENDING },
        { $set: { "label.status": ShippingLabelStatus.NEEDS_REVIEW, "label.lastError": message } },
      );
      await cancelFailureAlert(claimed);
      await recordAudit({
        actorType: "system", action: AuditAction.LABEL_NEEDS_REVIEW, module: AuditModule.SHIPPING,
        targetId: String(claimed._id), after: { reason: message },
      });
    } else {
      await Order.updateOne(
        { _id: claimed._id, "label.status": ShippingLabelStatus.CANCEL_PENDING },
        { $set: { "label.nextAttemptAt": backoffDate(attempts), "label.lastError": message } },
      );
    }
    return;
  }

  if (claimed.label.requeueAfterCancel) {
    // Address corrected: the old guide is void, buy a fresh one for the new address.
    await Order.updateOne(
      { _id: claimed._id, "label.status": ShippingLabelStatus.CANCEL_PENDING },
      {
        $set: {
          "label.status": ShippingLabelStatus.PENDING,
          "label.attempts": 0,
          "label.cancelAttempts": 0,
          "label.nextAttemptAt": new Date(),
        },
        $unset: {
          "label.providerShipmentId": "", "label.trackingNumber": "", "label.carrier": "",
          "label.labelUrl": "", "label.trackUrl": "", "label.costMxn": "", "label.readyAt": "",
          "label.lastError": "", "label.requeueAfterCancel": "",
        },
      },
    );
    await recordAudit({ actorType: "system", action: AuditAction.LABEL_CANCELLED, module: AuditModule.SHIPPING, targetId: String(claimed._id), after: { requeued: true } });
    triggerLabelPurchase(claimed._id);
    return;
  }

  await Order.updateOne(
    { _id: claimed._id, "label.status": ShippingLabelStatus.CANCEL_PENDING },
    { $set: { "label.status": ShippingLabelStatus.CANCELLED, "label.cancelledAt": new Date() }, $unset: { "label.nextAttemptAt": "", "label.lastError": "" } },
  );
  await recordAudit({ actorType: "system", action: AuditAction.LABEL_CANCELLED, module: AuditModule.SHIPPING, targetId: String(claimed._id) });
};

/** After a purchase lands: if the order died while it was in flight, void the label now. */
const cancelIfOrderDead = async (orderId: Types.ObjectId): Promise<void> => {
  const order = await Order.findById(orderId).select("status disputeStatus").lean();
  if (!order) return;
  if (DEAD_STATUSES.includes(order.status) || order.disputeStatus === DisputeStatus.LOST) {
    await requestLabelCancellation(orderId);
  }
};
```
Reordena para que `cancelIfOrderDead`/`requestLabelCancellation`/`processLabelCancellation` estén definidas antes de usarse donde corresponda (todas son `const` de módulo y se invocan en tiempo de ejecución, no de carga, así que el orden entre ellas no importa, pero `inflight` debe estar arriba). Exportar `requestLabelCancellation` y `processLabelCancellation`; borrar los stubs de las Tareas 10/11.

- [ ] **Paso 4: Reembolso y contracargo** — `services/orderPaymentService.ts`:
  - Importar `requestLabelCancellation` de `./shippingLabelService.js`.
  - En `refundPaidOrder`: declarar `let beforeShipment = false;` junto a las demás variables, resetearlo dentro del callback (`beforeShipment = false;`) y, tras `const started = fulfillmentStarted(before);`, `beforeShipment = before.status === OrderStatus.PAID || before.status === OrderStatus.PROCESSING;`. Después del `await recordAudit({ … PAYMENT_REFUNDED … })` (antes del bloque `unaccountedStock`):

```ts
  // The parcel never left: void its label so the balance comes back. Best-effort:
  // a failure here must not undo a refund that already happened.
  if (beforeShipment) {
    await requestLabelCancellation(orderId).catch((err: unknown) =>
      logger.error({ err, orderId: String(orderId) }, "No se pudo iniciar la cancelación de la guía"),
    );
  }
```
  - En `applyDisputeClosed`, dentro de `if (order?.disputeStatus === DisputeStatus.LOST) { … }` después del `enqueueNotification`:

```ts
    if (order.status === OrderStatus.PAID || order.status === OrderStatus.PROCESSING) {
      await requestLabelCancellation(order._id).catch((err: unknown) =>
        logger.error({ err, orderId: String(order._id) }, "No se pudo iniciar la cancelación de la guía"),
      );
    }
```
  (si `order` es `OrderDocument | null`, el `?.` previo ya garantiza no nulo dentro del `if`).

- [ ] **Paso 5: Corrección de dirección** — `services/adminOrderService.updateShippingAddress` (reemplaza el cuerpo conservando firma y auditoría). Importar `requestLabelCancellation` y `ShippingLabelStatus`:

```ts
const updateShippingAddress = async (
  id: string,
  address: ShippingAddress,
  ctx: RequestContext,
): Promise<AdminOrder> => {
  const current = await Order.findById(id).select("status shipping.postalCode label.status").lean();
  if (!current) throw new AppError("La orden no existe.", 404);

  // The quote (and the carrier's price) were made for ONE postal code: a different
  // one means a different price, which a correction cannot silently absorb.
  if (current.shipping.postalCode !== address.postalCode) {
    throw new AppError(
      "No se puede cambiar el código postal: cambia el costo del envío. Cancela el pedido y créalo de nuevo.",
      409,
    );
  }
  if (current.label?.status === ShippingLabelStatus.REQUESTED) {
    throw new AppError("Se está generando la guía. Intenta de nuevo en un minuto.", 409);
  }

  // The status/label guards live IN THE FILTER, not in a read-then-write: a purchase
  // or shipment landing between the check and the update could otherwise redirect a
  // parcel already on its way.
  const updated = await Order.findOneAndUpdate(
    {
      _id: id,
      status: { $in: ADDRESS_EDITABLE_STATUSES },
      "shipping.postalCode": address.postalCode,
      "label.status": { $ne: ShippingLabelStatus.REQUESTED },
    },
    { $set: { shipping: address } },
    { new: true, runValidators: true },
  ).lean();

  if (!updated) {
    throw new AppError(
      "La dirección ya no se puede corregir: la orden está enviada o cerrada, o se está generando la guía.",
      409,
    );
  }

  // A label bought for the old address is void: cancel it and buy a fresh one.
  if (current.label?.status === ShippingLabelStatus.READY) {
    await requestLabelCancellation(updated._id, { requeue: true });
  }

  await recordAudit({
    actorId: ctx.actorId,
    actorType: "user",
    action: AuditAction.ORDER_SHIPPING_ADDRESS_UPDATED,
    module: AuditModule.ORDERS,
    targetId: id,
    ip: ctx.ip,
  });
  return toAdminOrder(updated);
};
```
  La validación de colonia/estado/CP/país de la nueva dirección ya viene de `shippingAddressSchema` (Tarea 9). Importante: la guía `needs_review` o `failed` no se toca (el reintento usará la dirección corregida).

- [ ] **Paso 6: Verde:** `pnpm --filter @gira/api test -- tests/integration/shippingLabelCancel.test.ts tests/integration/adminOrderAddress.test.ts tests/integration/shippingLabel.test.ts`; `pnpm --filter @gira/api typecheck`.

- [ ] **Checkpoint:** `git diff --stat`.

---

## Tarea 13: Verificación de la fase Ea

- [ ] **Paso 1:** `pnpm --filter @gira/shared build && pnpm --filter @gira/api typecheck && pnpm --filter @gira/api build` → 0 errores.
- [ ] **Paso 2:** Suite completa: `pnpm --filter @gira/api test 2>&1 | tail -30`. Fallos: re-correr cada archivo aislado (flake conocido); un fallo que persiste aislado es regresión real → `systematic-debugging`.
- [ ] **Paso 3:** Web: `pnpm --filter @gira/web typecheck` y `NEXT_PUBLIC_API_URL=http://localhost:4000 pnpm --filter @gira/web build`. Arreglar tipos rotos por el cambio de `ShippingSettings`/`ShippingAddress` (no se agrega UI nueva).
- [ ] **Paso 4:** `pnpm audit --prod` → sin vulnerabilidades nuevas.
- [ ] **Paso 5:** Revisión de código: invocar `requesting-code-review` sobre el diff de la rama (foco: carreras de reclamo/cerco de la guía, doble compra, éxito tardío, cancelación vs compra en vuelo, validación de la cotización en `createOrder`, que ningún monto salga del cliente, secretos fuera de logs/DTOs).
- [ ] **Paso 6:** Humo en dev con stub (sin Atlas: confirmar a qué base apunta `.env.development.local` ANTES de arrancar): cotizar → crear orden → pago stub → `label: ready`. Si la base es Atlas, **no** correr; dejarlo a Manuel.
- [ ] **Paso 7:** Entregar a Manuel `git status` + `git diff --stat` + comandos de commit/merge (sin ejecutarlos).
- [ ] **Paso 8:** Actualizar memorias `project_milestone_status` (Ea implementada, rama, qué falta: Eb) y `project_envia_shipping` (decisiones Ea).

**Antes de desplegar Ea (lo corre Manuel):** `pnpm --filter @gira/api backfill:product-weight -- --grams N` (dry-run primero); capturar el origen en Ajustes (`PATCH /admin/settings/shipping`); borrar órdenes de prueba y la colección `shippingquotes`/`notifications` de pruebas; nuevos índices (`orders.label.*`, `orders.label.trackingNumber` único parcial, `shippingquotes` único + TTL); `ENVIA_API_TOKEN` en producción (obligatorio) y saldo en la cuenta de Envía.

---

## Autorrevisión del plan

**Cobertura del alcance (ítems 1–6 del encargo, en lo que toca a Ea):** (1) adapter + stub → T3–T4; (2) cotización y datos de paquete → T5–T9; (3) generar guía, reintentos y estado persistido → T10–T11; cancelación y devoluciones → T12; (4) rastreo, webhook y firma → **Eb**; (5) Shipment/captura manual/`orderPublicId`/carrier en lista cerrada → lista cerrada en T1, eliminación en **Eb**; (6) correos con folio y datos para M9b → DTO admin con `shippingSelection/parcel/label` en T9, correos en **Eb**.

**Consistencia de nombres:** `ShippingProvider` {`getRates`, `createLabel`, `cancelLabel`}; `ProviderRate.costMxn`; `QuotedRate.{costMxn, amountMxn}`; `Order.shippingSelection.{amountMxn, costMxn, provider}`; `Order.label.{status, attempts, cancelAttempts, nextAttemptAt, requestedAt, trackingNumber, carrier, labelUrl, trackUrl, costMxn, requeueAfterCancel}`; funciones `purchaseLabelForOrder`, `triggerLabelPurchase`, `enqueueLabel`, `retryLabel`, `requestLabelCancellation`, `processLabelCancellation`, `failStaleLease`, `settleLabelWork`; helpers de test `quoteRateFor`, `seedShippingOrigin`, `installFakeShippingProvider`.

**Riesgos conocidos que el plan acepta (a revisar en el code review):** (a) el sandbox puede contradecir los códigos de estado, el uso de datos provisionales en cotización o la lista de paqueterías — todo aislado en `MEXICAN_STATES` y `enviaShippingProvider.ts`; (b) tras `needs_review` por resultado incierto, "reintentar" puede comprar una segunda guía si la primera sí existía: M9b debe advertirlo en el botón; (c) la alerta de equipo es una por orden y tipo (el índice único `(order, type)` descarta una segunda alerta del mismo tipo tras un reintento posterior).
