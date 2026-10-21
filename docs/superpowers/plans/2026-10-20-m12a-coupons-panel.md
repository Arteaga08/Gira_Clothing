# M12a Cupones de campaña Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Regla del proyecto:** NO ejecutar `git add/commit/push`. Cada «Checkpoint» muestra `git status`/`git diff` y espera a Manuel. Código/schemas/comentarios en inglés, UI en español, exports al final, un solo botón amarillo por pantalla, todo select usa `SelectField` (`onChange(value)`; en tests `chooseOption` de `tests/helpers/select.ts`), en `beforeEach` de Vitest no devolver el mock (usar llaves).

**Goal:** Panel de Cupones (lista, crear, editar, retirar/reactivar) más el motor de cupones en el API (modelo, canje atómico en checkout, descuento congelado en la orden).

**Architecture:** Espejo de M11c: servicio CRUD + DTO de admin por agregación + rutas bajo `/admin/coupons`; en la web, una página con tabla + `Modal` abierto por `?cupon=`. El descuento se calcula solo en el servidor (`quoteTotals`), el canje se reclama en una transacción Mongo entre `reserveStock` y `Order.create`, y se libera junto con la reserva.

**Tech Stack:** Express + Mongoose + Joi + Vitest/supertest (`apps/api`), Next.js 15 + React + Tailwind v4 + Vitest/Testing Library (`apps/web`), `@gira/shared`.

Spec: `docs/superpowers/specs/2026-10-20-m12a-coupons-panel-design.md`. Mockup elegido: opción A (scratchpad `cupones-mockups/a.html`).

## File map
**Shared** (`packages/shared/src`): create `enums/coupon.ts`, `types/coupon.ts`, `constants/coupon.ts`; modify `enums/auditAction.ts`, `constants/index?` y `index.ts` (exports).
**API** (`apps/api/src`): create `models/Coupon.ts`, `models/CouponRedemption.ts`, `utils/mongoErrors.ts`, `utils/couponDiscount.ts`, `services/couponRulesService.ts`, `services/couponRedemptionService.ts`, `services/couponService.ts`, `services/adminCouponService.ts`, `validators/couponValidator.ts`, `controllers/couponController.ts`, `routes/v1/admin/couponRoutes.ts`; modify `models/Order.ts`, `services/pricingService.ts`, `services/orderService.ts`, `services/reservationService.ts`, `validators/orderValidator.ts`, `routes/v1/admin/index.ts`.
**API tests** (`apps/api/tests`): `unit/couponDiscount.test.ts`, `integration/couponRedemption.test.ts`, `integration/couponCheckout.test.ts`, `integration/adminCoupons.test.ts`, `integration/adminCouponsDto.test.ts`.
**Web** (`apps/web/src`): create `lib/coupons/{panelCoupon,filters,couponForm,money,dates}.ts`, `lib/api/adminCoupons.ts`, `hooks/useCouponList.ts`, `hooks/useCouponSave.ts`, `components/coupons/{CouponsPage,CouponFilters,CouponTable,CouponModal,CouponForm,RetireCouponSection,CouponEmpty,NewCouponButton}.tsx`, `app/(admin)/cupones/{page,loading}.tsx`; modify `lib/navigation.ts`, `lib/api/paths.ts`.
**Web tests** (`apps/web/tests`): `helpers/coupons.ts`, `lib/coupons/*.test.ts`, `components/coupons/*.test.tsx`, `app/couponsPage.test.tsx`.

---

## Task 0: Rama y línea base
- [ ] `git checkout main && git checkout -b feat/m12a-coupons-panel` (ya creada; verificar con `git branch --show-current`).
- [ ] Línea base: `pnpm --filter @gira/shared build && pnpm --filter @gira/api exec tsc --noEmit` → sin errores.

## Task 1: Tipos, enums y límites compartidos

**Files:** create `packages/shared/src/enums/coupon.ts`, `types/coupon.ts`, `constants/coupon.ts`; modify `enums/auditAction.ts`, `index.ts`.

- [ ] **Step 1: enums y constantes**

```ts
// packages/shared/src/enums/coupon.ts
enum CouponDiscountType {
  PERCENT = "percent",
  FIXED = "fixed",
}

/** Computed by the server from isActive, dates and counters; never stored. */
enum CouponStatus {
  ACTIVE = "active",
  SCHEDULED = "scheduled",
  EXPIRED = "expired",
  EXHAUSTED = "exhausted",
  RETIRED = "retired",
}

export { CouponDiscountType, CouponStatus };
```

```ts
// packages/shared/src/constants/coupon.ts
const COUPON_CODE_MIN = 4;
const COUPON_CODE_MAX = 24;
/** Uppercase letters, digits and hyphens. */
const COUPON_CODE_PATTERN = /^[A-Z0-9-]+$/;
const COUPON_NAME_MIN = 2;
const COUPON_NAME_MAX = 80;
const COUPON_PERCENT_MIN = 1;
const COUPON_PERCENT_MAX = 100;
/** MXN centavos: from $1.00 to $100,000.00. */
const COUPON_AMOUNT_MIN = 100;
const COUPON_AMOUNT_MAX = 10_000_000;
/** MXN centavos. */
const COUPON_MIN_SUBTOTAL_MAX = 10_000_000;
const COUPON_MAX_REDEMPTIONS_MAX = 1_000_000;
/** The panel keys the duplicate-code error to the Código field by this exact message. */
const COUPON_CODE_TAKEN_MESSAGE = "Ya existe un cupón con este código.";

export {
  COUPON_CODE_MIN, COUPON_CODE_MAX, COUPON_CODE_PATTERN, COUPON_NAME_MIN, COUPON_NAME_MAX,
  COUPON_PERCENT_MIN, COUPON_PERCENT_MAX, COUPON_AMOUNT_MIN, COUPON_AMOUNT_MAX,
  COUPON_MIN_SUBTOTAL_MAX, COUPON_MAX_REDEMPTIONS_MAX, COUPON_CODE_TAKEN_MESSAGE,
};
```

- [ ] **Step 2: DTOs**

```ts
// packages/shared/src/types/coupon.ts
import type { CouponDiscountType, CouponStatus } from "../enums/coupon.js";

interface AdminCoupon {
  id: string;
  code: string;
  name: string;
  discountType: CouponDiscountType;
  /** Whole percent, 1-100. Present when discountType is percent. */
  percentOff?: number;
  /** MXN centavos. Present when discountType is fixed. */
  amountOffMxn?: number;
  /** MXN centavos; 0 = no minimum. */
  minSubtotalMxn: number;
  startsAt?: string;
  endsAt?: string;
  /** Absent = unlimited. */
  maxRedemptions?: number;
  redeemedCount: number;
  isActive: boolean;
  status: CouponStatus;
  createdAt: string;
  updatedAt: string;
}

/** Frozen on the order: what this customer got, whatever the campaign becomes later. */
interface OrderCoupon {
  code: string;
  discountType: CouponDiscountType;
  /** Percent (1-100) or MXN centavos, by discountType. */
  value: number;
}

export type { AdminCoupon, OrderCoupon };
```

- [ ] **Step 3: audit enums.** En `enums/auditAction.ts` agregar `COUPONS = "coupons"` a `AuditModule` y `COUPON_CREATED = "coupon_created"`, `COUPON_UPDATED = "coupon_updated"`, `COUPON_DEACTIVATED = "coupon_deactivated"`, `COUPON_REACTIVATED = "coupon_reactivated"` a `AuditAction`.
- [ ] **Step 4: exports.** En `packages/shared/src/index.ts` importar y re-exportar (los enums en el bloque de valores, `AdminCoupon`/`OrderCoupon` en el de tipos y en `Wire`-mapped como los demás DTOs) todo lo anterior, incluidas las 12 constantes. Seguir el estilo de los imports existentes.
- [ ] **Step 5:** `pnpm --filter @gira/shared build` → compila. **Checkpoint:** `git status` y `git diff --stat`.

## Task 2: Modelos y campos de la orden

**Files:** create `models/Coupon.ts`, `models/CouponRedemption.ts`; modify `models/Order.ts`; test `tests/integration/couponRedemption.test.ts` (modelo e índices).

- [ ] **Step 1: test de índices (falla)**

```ts
// tests/integration/couponRedemption.test.ts (parte 1)
import { describe, it, expect } from "vitest";
import mongoose from "mongoose";
import { CouponDiscountType } from "@gira/shared";
import { Coupon } from "../../src/models/Coupon.js";
import { CouponRedemption } from "../../src/models/CouponRedemption.js";

const makeCoupon = (overrides: Record<string, unknown> = {}) =>
  Coupon.create({
    code: "TESTCODE",
    name: "Cupón de prueba",
    discountType: CouponDiscountType.PERCENT,
    percentOff: 10,
    ...overrides,
  });

describe("Coupon · modelo", () => {
  it("guarda el código en mayúsculas y rechaza duplicados", async () => {
    await Coupon.syncIndexes();
    await makeCoupon({ code: "verano10" });
    await expect(makeCoupon({ code: "VERANO10" })).rejects.toMatchObject({ code: 11000 });
  });

  it("rechaza un porcentaje sin percentOff", async () => {
    await expect(makeCoupon({ percentOff: undefined })).rejects.toThrow();
  });

  it("CouponRedemption: un solo canje por cliente y cupón", async () => {
    await CouponRedemption.syncIndexes();
    const coupon = await makeCoupon();
    const user = new mongoose.Types.ObjectId();
    const base = { coupon: coupon._id, user, discount: 100 };
    await CouponRedemption.create({ ...base, order: new mongoose.Types.ObjectId() });
    await expect(
      CouponRedemption.create({ ...base, order: new mongoose.Types.ObjectId() }),
    ).rejects.toMatchObject({ code: 11000 });
  });
});
```

- [ ] **Step 2:** `pnpm --filter @gira/api exec vitest run tests/integration/couponRedemption.test.ts` → FAIL (módulos no existen).
- [ ] **Step 3: modelos**

```ts
// models/Coupon.ts
import { Schema, model, type HydratedDocument, type Model } from "mongoose";
import {
  CouponDiscountType, COUPON_AMOUNT_MAX, COUPON_CODE_MAX, COUPON_MIN_SUBTOTAL_MAX, COUPON_NAME_MAX,
  COUPON_PERCENT_MAX,
} from "@gira/shared";

interface CouponAttrs {
  code: string;
  name: string;
  discountType: CouponDiscountType;
  percentOff?: number;
  amountOffMxn?: number;
  minSubtotalMxn: number;
  startsAt: Date | null;
  endsAt: Date | null;
  /** null = unlimited. */
  maxRedemptions: number | null;
  redeemedCount: number;
  isActive: boolean;
}

type CouponModel = Model<CouponAttrs>;
type CouponDocument = HydratedDocument<CouponAttrs>;

const couponSchema = new Schema<CouponAttrs, CouponModel>(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true, maxlength: COUPON_CODE_MAX },
    name: { type: String, required: true, trim: true, maxlength: COUPON_NAME_MAX },
    discountType: { type: String, enum: Object.values(CouponDiscountType), required: true },
    percentOff: {
      type: Number, min: 1, max: COUPON_PERCENT_MAX,
      validate: { validator: Number.isInteger, message: "percentOff must be an integer" },
      required: [function (this: CouponAttrs) { return this.discountType === CouponDiscountType.PERCENT; }, "percentOff is required"],
    },
    amountOffMxn: {
      type: Number, min: 1, max: COUPON_AMOUNT_MAX,
      validate: { validator: Number.isInteger, message: "amountOffMxn must be an integer" },
      required: [function (this: CouponAttrs) { return this.discountType === CouponDiscountType.FIXED; }, "amountOffMxn is required"],
    },
    minSubtotalMxn: { type: Number, min: 0, max: COUPON_MIN_SUBTOTAL_MAX, default: 0 },
    startsAt: { type: Date, default: null },
    endsAt: { type: Date, default: null },
    maxRedemptions: { type: Number, min: 1, default: null },
    redeemedCount: { type: Number, min: 0, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

couponSchema.index({ isActive: 1, endsAt: 1 });
couponSchema.index({ createdAt: -1 });

const Coupon = model<CouponAttrs, CouponModel>("Coupon", couponSchema);

export type { CouponAttrs, CouponDocument };
export { Coupon };
```

```ts
// models/CouponRedemption.ts
import { Schema, model, type Model, type Types } from "mongoose";

interface CouponRedemptionAttrs {
  coupon: Types.ObjectId;
  user: Types.ObjectId;
  order: Types.ObjectId;
  /** Discount in the order's currency (minor units), for reports. */
  discount: number;
}

type CouponRedemptionModel = Model<CouponRedemptionAttrs>;

const couponRedemptionSchema = new Schema<CouponRedemptionAttrs, CouponRedemptionModel>(
  {
    coupon: { type: Schema.Types.ObjectId, ref: "Coupon", required: true },
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    order: { type: Schema.Types.ObjectId, ref: "Order", required: true },
    discount: { type: Number, required: true, min: 0 },
  },
  { timestamps: true },
);

// One redemption per customer per coupon, and one per order: invariants live in the database.
couponRedemptionSchema.index({ coupon: 1, user: 1 }, { unique: true });
couponRedemptionSchema.index({ order: 1 }, { unique: true });

const CouponRedemption = model<CouponRedemptionAttrs, CouponRedemptionModel>(
  "CouponRedemption",
  couponRedemptionSchema,
);

export type { CouponRedemptionAttrs };
export { CouponRedemption };
```

- [ ] **Step 4: Order.** En `models/Order.ts` agregar a `OrderAttrs` (junto a `discount`, línea ~149): `couponId?: Types.ObjectId; coupon?: OrderCoupon;` (importar `OrderCoupon` de `@gira/shared`), y al schema (línea ~356) `couponId: { type: Schema.Types.ObjectId, ref: "Coupon" }`, `coupon: { type: new Schema({ code: { type: String, required: true }, discountType: { type: String, enum: Object.values(CouponDiscountType), required: true }, value: { type: Number, required: true, min: 1 } }, { _id: false }) }`.
- [ ] **Step 5:** correr el test → PASS; `pnpm --filter @gira/api exec tsc --noEmit` → limpio. **Checkpoint.**

## Task 3: Cálculo del descuento (puro, TDD)

**Files:** create `utils/couponDiscount.ts`; test `tests/unit/couponDiscount.test.ts`.

- [ ] **Step 1: tests (fallan)**

```ts
import { describe, it, expect } from "vitest";
import { CouponDiscountType, Currency, PriceRounding } from "@gira/shared";
import { computeCouponDiscount } from "../../src/utils/couponDiscount.js";

const fx = { mxnPerUsdCents: 1800, rounding: PriceRounding.NONE };
const percent = (percentOff: number) => ({ discountType: CouponDiscountType.PERCENT, percentOff });
const fixed = (amountOffMxn: number) => ({ discountType: CouponDiscountType.FIXED, amountOffMxn });

describe("computeCouponDiscount", () => {
  it("porcentaje: redondea hacia abajo", () => {
    expect(computeCouponDiscount(percent(10), 12_345, Currency.MXN, fx)).toBe(1_234);
  });
  it("porcentaje 100 descuenta todo el subtotal", () => {
    expect(computeCouponDiscount(percent(100), 5_000, Currency.MXN, fx)).toBe(5_000);
  });
  it("monto fijo en MXN", () => {
    expect(computeCouponDiscount(fixed(15_000), 80_000, Currency.MXN, fx)).toBe(15_000);
  });
  it("monto fijo se convierte a USD con el tipo de cambio", () => {
    // $150.00 MXN at 18.00 MXN/USD = $8.33 USD (minor units: 833)
    expect(computeCouponDiscount(fixed(15_000), 10_000, Currency.USD, fx)).toBe(833);
  });
  it("nunca excede el subtotal", () => {
    expect(computeCouponDiscount(fixed(50_000), 20_000, Currency.MXN, fx)).toBe(20_000);
  });
  it("subtotal 0 da 0", () => {
    expect(computeCouponDiscount(percent(50), 0, Currency.MXN, fx)).toBe(0);
  });
});
```

(Verificar `PriceRounding.NONE` existe en `packages/shared/src/enums/money.ts`; si el miembro se llama distinto, usar el que `applyRounding` trata como `default`.)

- [ ] **Step 2:** `pnpm --filter @gira/api exec vitest run tests/unit/couponDiscount.test.ts` → FAIL.
- [ ] **Step 3: implementación**

```ts
// utils/couponDiscount.ts
import { CouponDiscountType, type Currency, type PriceRounding } from "@gira/shared";
import { convertFromMxn } from "./money.js";

interface DiscountableCoupon {
  discountType: CouponDiscountType;
  percentOff?: number | undefined;
  amountOffMxn?: number | undefined;
}

interface DiscountFx {
  mxnPerUsdCents: number;
  rounding: PriceRounding;
}

/**
 * Discount in the charge currency's minor units. Percent rounds DOWN (the shop
 * never gives a cent more than the label promises); fixed is stored in MXN and
 * converted like any other MXN amount. Capped at the subtotal: shipping is
 * never discounted and a total can't go negative.
 */
const computeCouponDiscount = (
  coupon: DiscountableCoupon,
  subtotal: number,
  currency: Currency,
  fx: DiscountFx,
): number => {
  const raw =
    coupon.discountType === CouponDiscountType.PERCENT
      ? Math.floor((subtotal * (coupon.percentOff ?? 0)) / 100)
      : convertFromMxn(coupon.amountOffMxn ?? 0, currency, fx.mxnPerUsdCents, fx.rounding);
  return Math.max(0, Math.min(subtotal, raw));
};

export type { DiscountableCoupon, DiscountFx };
export { computeCouponDiscount };
```

- [ ] **Step 4:** tests → PASS. **Checkpoint.**

## Task 4: Reglas y canje atómico (TDD)

**Files:** create `utils/mongoErrors.ts`, `services/couponRulesService.ts`, `services/couponRedemptionService.ts`; modify `services/orderService.ts` (importar `isDuplicateKeyError` de `utils/mongoErrors.ts` y borrar la copia local de la línea ~219; mover el cuerpo tal cual); test `tests/integration/couponRedemption.test.ts` (parte 2).

- [ ] **Step 1: mover `isDuplicateKeyError`** a `utils/mongoErrors.ts` (mismo cuerpo que `orderService.ts:219`), exportarlo al final, importarlo en `orderService.ts`. `tsc --noEmit` limpio; `pnpm --filter @gira/api exec vitest run tests/integration/orderCreate.test.ts` sigue verde.
- [ ] **Step 2: tests de reglas y canje (fallan)** agregar a `couponRedemption.test.ts`:

```ts
import { vi } from "vitest";
import { AppError } from "../../src/utils/AppError.js";
import { resolveCouponForCheckout, assertMeetsMinimum } from "../../src/services/couponRulesService.js";
import { claimCoupon, releaseCouponForOrder } from "../../src/services/couponRedemptionService.js";

const userId = () => new mongoose.Types.ObjectId();
const DAY = 86_400_000;

describe("couponRulesService.resolveCouponForCheckout", () => {
  it("invitado: 401 con mensaje de sesión", async () => {
    await makeCoupon({ code: "SOLOCUENTA" });
    await expect(resolveCouponForCheckout("solocuenta", undefined)).rejects.toMatchObject({
      statusCode: 401,
      message: "Inicia sesión para usar un cupón.",
    });
  });
  it("código inexistente, retirado y no iniciado dan el MISMO mensaje", async () => {
    await makeCoupon({ code: "RETIRADO1", isActive: false });
    await makeCoupon({ code: "FUTURO001", startsAt: new Date(Date.now() + DAY) });
    const messages = await Promise.all(
      ["NOEXISTE1", "RETIRADO1", "FUTURO001"].map((c) =>
        resolveCouponForCheckout(c, userId()).catch((e: AppError) => e.message),
      ),
    );
    expect(new Set(messages).size).toBe(1);
    expect(messages[0]).toBe("El cupón no es válido.");
  });
  it("vencido: 409", async () => {
    await makeCoupon({ code: "VENCIDO01", endsAt: new Date(Date.now() - DAY) });
    await expect(resolveCouponForCheckout("VENCIDO01", userId())).rejects.toMatchObject({ statusCode: 409, message: "El cupón ya venció." });
  });
  it("agotado: 409", async () => {
    await makeCoupon({ code: "AGOTADO01", maxRedemptions: 1, redeemedCount: 1 });
    await expect(resolveCouponForCheckout("AGOTADO01", userId())).rejects.toMatchObject({ statusCode: 409, message: "El cupón ya alcanzó su límite de usos." });
  });
  it("ya usado por el cliente: 409", async () => {
    const coupon = await makeCoupon({ code: "USADO0001" });
    const user = userId();
    await CouponRedemption.create({ coupon: coupon._id, user, order: userId(), discount: 1 });
    await expect(resolveCouponForCheckout("USADO0001", user)).rejects.toMatchObject({ statusCode: 409, message: "Ya usaste este cupón." });
  });
  it("devuelve el cupón normalizando mayúsculas y espacios", async () => {
    await makeCoupon({ code: "BUENO0001" });
    const coupon = await resolveCouponForCheckout("  bueno0001 ", userId());
    expect(coupon.code).toBe("BUENO0001");
  });
});

describe("couponRulesService.assertMeetsMinimum", () => {
  it("dice cuánto falta", () => {
    expect(() => assertMeetsMinimum({ minSubtotalMxn: 79_900 }, 50_000)).toThrow("Agrega $299.00 más para usar este cupón.");
  });
  it("pasa con mínimo 0 o alcanzado", () => {
    expect(() => assertMeetsMinimum({ minSubtotalMxn: 0 }, 1)).not.toThrow();
    expect(() => assertMeetsMinimum({ minSubtotalMxn: 5_000 }, 5_000)).not.toThrow();
  });
});

describe("couponRedemptionService", () => {
  it("canje: incrementa el contador y crea la redención", async () => {
    const coupon = await makeCoupon({ code: "CANJE0001", maxRedemptions: 5 });
    await claimCoupon({ couponId: coupon._id, userId: userId(), orderId: userId(), discount: 500 });
    expect((await Coupon.findById(coupon._id))!.redeemedCount).toBe(1);
    expect(await CouponRedemption.countDocuments({ coupon: coupon._id })).toBe(1);
  });
  it("tope: con 1 lugar y 5 canjes simultáneos solo uno gana", async () => {
    const coupon = await makeCoupon({ code: "CARRERA01", maxRedemptions: 1 });
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () =>
        claimCoupon({ couponId: coupon._id, userId: userId(), orderId: userId(), discount: 100 }),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await Coupon.findById(coupon._id))!.redeemedCount).toBe(1);
    expect(await CouponRedemption.countDocuments({ coupon: coupon._id })).toBe(1);
  });
  it("un cliente con dos pedidos simultáneos solo canjea una vez y no deja contador de más", async () => {
    const coupon = await makeCoupon({ code: "UNO000001", maxRedemptions: 10 });
    const user = userId();
    const results = await Promise.allSettled([
      claimCoupon({ couponId: coupon._id, userId: user, orderId: userId(), discount: 100 }),
      claimCoupon({ couponId: coupon._id, userId: user, orderId: userId(), discount: 100 }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await Coupon.findById(coupon._id))!.redeemedCount).toBe(1);
  });
  it("liberar: devuelve el lugar y es idempotente", async () => {
    const coupon = await makeCoupon({ code: "LIBERA001", maxRedemptions: 1 });
    const orderId = userId();
    await claimCoupon({ couponId: coupon._id, userId: userId(), orderId, discount: 100 });
    expect(await releaseCouponForOrder(orderId)).toBe(true);
    expect(await releaseCouponForOrder(orderId)).toBe(false);
    expect((await Coupon.findById(coupon._id))!.redeemedCount).toBe(0);
  });
});
```

- [ ] **Step 3:** correr → FAIL. **Step 4: implementación**

```ts
// services/couponRulesService.ts
import type { Types } from "mongoose";
import { CouponDiscountType } from "@gira/shared";
import { Coupon, type CouponDocument } from "../models/Coupon.js";
import { CouponRedemption } from "../models/CouponRedemption.js";
import { AppError } from "../utils/AppError.js";

const MSG = {
  GUEST: "Inicia sesión para usar un cupón.",
  INVALID: "El cupón no es válido.",
  EXPIRED: "El cupón ya venció.",
  EXHAUSTED: "El cupón ya alcanzó su límite de usos.",
  USED: "Ya usaste este cupón.",
} as const;

const formatMxn = (cents: number): string =>
  `$${(cents / 100).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Read-only eligibility. Missing, retired and not-yet-started coupons share one
 * message so nobody can probe which codes exist. The atomic guard is
 * claimCoupon; this only gives the customer a precise reason before stock is held.
 */
const resolveCouponForCheckout = async (
  rawCode: string,
  userId: Types.ObjectId | undefined,
  now: Date = new Date(),
): Promise<CouponDocument> => {
  if (!userId) throw new AppError(MSG.GUEST, 401);

  const coupon = await Coupon.findOne({ code: rawCode.trim().toUpperCase() });
  if (!coupon || !coupon.isActive || (coupon.startsAt && coupon.startsAt > now)) {
    throw new AppError(MSG.INVALID, 400);
  }
  if (coupon.endsAt && coupon.endsAt < now) throw new AppError(MSG.EXPIRED, 409);
  if (coupon.maxRedemptions !== null && coupon.redeemedCount >= coupon.maxRedemptions) {
    throw new AppError(MSG.EXHAUSTED, 409);
  }
  if (await CouponRedemption.exists({ coupon: coupon._id, user: userId })) {
    throw new AppError(MSG.USED, 409);
  }
  return coupon;
};

/** Minimum is checked on the MXN subtotal, whatever currency is charged. */
const assertMeetsMinimum = (coupon: { minSubtotalMxn: number }, subtotalMxn: number): void => {
  if (coupon.minSubtotalMxn > 0 && subtotalMxn < coupon.minSubtotalMxn) {
    throw new AppError(
      `Agrega ${formatMxn(coupon.minSubtotalMxn - subtotalMxn)} más para usar este cupón.`,
      409,
    );
  }
};

export { resolveCouponForCheckout, assertMeetsMinimum, CouponDiscountType };
```

(Quitar el re-export de `CouponDiscountType` si no se usa; no exportar nada que no se consuma.)

```ts
// services/couponRedemptionService.ts
import mongoose, { type Types } from "mongoose";
import { Coupon } from "../models/Coupon.js";
import { CouponRedemption } from "../models/CouponRedemption.js";
import { AppError } from "../utils/AppError.js";
import { isDuplicateKeyError } from "../utils/mongoErrors.js";

interface ClaimInput {
  couponId: Types.ObjectId;
  userId: Types.ObjectId;
  orderId: Types.ObjectId;
  /** In the order's currency, minor units. */
  discount: number;
}

/**
 * Atomic redemption: the guarded $inc and the redemption row commit together or
 * not at all. The guard stops two orders from taking the last seat; the unique
 * {coupon,user} index stops one customer from taking two.
 */
const claimCoupon = async (input: ClaimInput): Promise<void> => {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const claimed = await Coupon.findOneAndUpdate(
        {
          _id: input.couponId,
          isActive: true,
          $or: [{ maxRedemptions: null }, { $expr: { $lt: ["$redeemedCount", "$maxRedemptions"] } }],
        },
        { $inc: { redeemedCount: 1 } },
        { session, new: true },
      );
      if (!claimed) throw new AppError("El cupón ya alcanzó su límite de usos.", 409);
      await CouponRedemption.create(
        [{ coupon: input.couponId, user: input.userId, order: input.orderId, discount: input.discount }],
        { session },
      );
    });
  } catch (err) {
    if (isDuplicateKeyError(err)) throw new AppError("Ya usaste este cupón.", 409);
    throw err;
  } finally {
    await session.endSession();
  }
};

/** Gives the seat back when the order never got paid. Idempotent: false = nothing to release. */
const releaseCouponForOrder = async (orderId: Types.ObjectId): Promise<boolean> => {
  const session = await mongoose.startSession();
  let released = false;
  try {
    await session.withTransaction(async () => {
      released = false;
      const redemption = await CouponRedemption.findOneAndDelete({ order: orderId }, { session });
      if (!redemption) return;
      await Coupon.updateOne({ _id: redemption.coupon }, { $inc: { redeemedCount: -1 } }, { session });
      released = true;
    });
  } finally {
    await session.endSession();
  }
  return released;
};

export type { ClaimInput };
export { claimCoupon, releaseCouponForOrder };
```

- [ ] **Step 5:** `pnpm --filter @gira/api exec vitest run tests/integration/couponRedemption.test.ts` → PASS (las pruebas de carrera necesitan réplica set; el entorno de tests ya usa transacciones para reservas). **Checkpoint.**

## Task 5: Integración en precio, checkout y liberación (TDD)

**Files:** modify `services/pricingService.ts`, `services/orderService.ts`, `services/reservationService.ts`, `validators/orderValidator.ts`; test `tests/integration/couponCheckout.test.ts`; actualizar asserts de `pricing.test.ts:256-258`, `orderCreate.test.ts:509` solo si dejan de compilar (siguen valiendo `discount === 0` sin cupón).

- [ ] **Step 1: tests (fallan).** Reusar el arranque de `orderCreate.test.ts` (`buildApp`, `seedCatalogVariant`, `quoteRateFor`, `loginAsCustomer`, `createOrderWithQuote` de `tests/helpers/orders.ts`). Casos, cada uno con aserción concreta:
  1. cliente con cuenta + cupón 10 % sobre subtotal `S`: `order.discount === floor(S*0.1)`, `order.total === S - discount + shippingCost`, `order.coupon` = `{code, discountType:"percent", value:10}`, `order.couponId` = id del cupón, `Coupon.redeemedCount === 1`, existe `CouponRedemption` con `order`.
  2. monto fijo en USD: `order.discount` = `convertFromMxn(amount)` capado al subtotal.
  3. IVA derivado del total descontado: `order.tax === splitTax(order.total, order.taxRateBps).tax`.
  4. invitado con `couponCode` → 401, mensaje de sesión, **sin** reserva ni orden creada (`Order.countDocuments() === 0`, `Variant.reserved === 0`).
  5. compra mínima no alcanzada → 409 con «Agrega $… más», sin reserva.
  6. cupón agotado por carrera tras `resolveCouponForCheckout` (forzar `redeemedCount=max` entre la resolución y el canje con `vi.spyOn(redemptionService,"claimCoupon")` rechazando 409) → 409 y la reserva queda liberada (`Variant.reserved === 0`).
  7. segundo pedido del mismo cliente con el mismo cupón → 409 «Ya usaste este cupón.».
  8. **liberación**: crear pedido con cupón, llamar `releaseReservation(order._id,"expired")` → `Coupon.redeemedCount === 0` y sin `CouponRedemption`; el mismo cliente puede volver a usarlo.
  9. pedido pagado (reserva confirmada con `commitReservation`) y luego `releaseReservation(...,"refunded")` devuelve `false` → el canje **permanece** (`redeemedCount === 1`).
  10. idempotencia: reintentar con la misma `idempotencyKey` no vuelve a canjear.
- [ ] **Step 2:** correr → FAIL.
- [ ] **Step 3: validador.** En `createOrderSchema` (`validators/orderValidator.ts:56`) agregar `couponCode: Joi.string().trim().uppercase().pattern(COUPON_CODE_PATTERN).min(COUPON_CODE_MIN).max(COUPON_CODE_MAX).messages({ "string.pattern.base": "El cupón no es válido.", "string.min": "El cupón no es válido.", "string.max": "El cupón no es válido." })` y el comentario de que el descuento nunca viene del cliente.
- [ ] **Step 4: pricing.** En `pricingService.ts`: `Quote` gana `coupon?: AppliedCoupon`; `QuoteInput` gana `coupon?: CouponDocument`; reemplazar `const discount = 0;` (línea 153) por

```ts
  if (input.coupon) assertMeetsMinimum(input.coupon, subtotalMxn);
  const discount = input.coupon
    ? computeCouponDiscount(input.coupon, subtotal, input.currency, { mxnPerUsdCents, rounding })
    : 0;
```

y devolver `...(input.coupon ? { coupon: toAppliedCoupon(input.coupon) } : {})` con

```ts
interface AppliedCoupon { couponId: Types.ObjectId; snapshot: OrderCoupon }
const toAppliedCoupon = (c: CouponDocument): AppliedCoupon => ({
  couponId: c._id,
  snapshot: {
    code: c.code,
    discountType: c.discountType,
    value: c.discountType === CouponDiscountType.PERCENT ? (c.percentOff as number) : (c.amountOffMxn as number),
  },
});
```

Quitar el comentario «Always 0 until coupons land (M12a)» de la línea 56. Un descuento 0 (p. ej. subtotal 0) no debe crear snapshot: si `discount === 0` devolver sin `coupon` y no canjear.
- [ ] **Step 5: orderService.** En `createOrder`, después de `resolveOrderLines` y `resolveQuotedRate`:

```ts
  const coupon = input.couponCode
    ? await resolveCouponForCheckout(input.couponCode, ctx.userId)
    : undefined;
  const quote = await quoteTotals(resolved, { currency: input.currency, shippingMxn: rate.amountMxn, ...(coupon ? { coupon } : {}) });
```

Justo después de `reserveStock(...)`:

```ts
  if (quote.coupon && ctx.userId) {
    try {
      await claimCoupon({ couponId: quote.coupon.couponId, userId: ctx.userId, orderId, discount: quote.discount });
    } catch (err) {
      await releaseReservation(orderId, "coupon_unavailable");
      throw err;
    }
  }
```

En `Order.create({...})` agregar `...(quote.coupon ? { couponId: quote.coupon.couponId, coupon: quote.coupon.snapshot } : {})`. `CreateOrderInput` gana `couponCode?: string`. Los dos caminos de fallo existentes (`order_creation_failed`, `payment_setup_failed`) ya llaman `releaseReservation`, que libera el cupón (Step 6).
- [ ] **Step 6: liberación.** En `reservationService.releaseReservation`, dentro de `if (applied) {` y antes del audit: `await releaseCouponForOrder(orderId);` (import de `couponRedemptionService`). Solo se libera cuando **una reserva activa** se liberó (pedido que nunca se pagó); un reembolso posterior al pago encuentra la reserva ya confirmada → `applied=false` → el canje se conserva. Comentar esa regla en el código.
- [ ] **Step 7:** `pnpm --filter @gira/api exec vitest run tests/integration/couponCheckout.test.ts tests/integration/orderCreate.test.ts tests/integration/pricing.test.ts tests/integration/reservation.test.ts` → todo PASS. **Checkpoint.**

## Task 6: API de admin (TDD)

**Files:** create `validators/couponValidator.ts`, `services/couponService.ts`, `services/adminCouponService.ts`, `controllers/couponController.ts`, `routes/v1/admin/couponRoutes.ts`; modify `routes/v1/admin/index.ts` (`adminRouter.use("/coupons", couponRouter);`); tests `adminCoupons.test.ts`, `adminCouponsDto.test.ts`.

- [ ] **Step 1: tests de CRUD y autorización (fallan)** siguiendo `adminPrintFamilies.test.ts` (`BASE = "/api/v1/admin/coupons"`, `loginAsAdmin`, `loginAsCustomer`, `ORIGIN`). Casos con aserción concreta:
  - GET/POST anónimo 401; POST como cliente 403.
  - crea porcentaje (`201`, `coupon.code` en mayúsculas aunque se mande minúscula, `status:"active"`, `redeemedCount:0`, no hay `amountOffMxn`).
  - crea monto fijo (`amountOffMxn:15000`).
  - 400: porcentaje sin `percentOff`; `percentOff` 0 o 101 o 10.5; monto con `percentOff` a la vez; `fixed` con `amountOffMxn` 99; código de 3 caracteres, con espacios o minúsculas inválidas (`ab c`); `endsAt` ≤ `startsAt`; `maxRedemptions` 0; `minSubtotalMxn` negativo.
  - descarta campos desconocidos (`redeemedCount:99`, `isActive:false` en POST → `0` y `true`).
  - código duplicado → 409 con `message === COUPON_CODE_TAKEN_MESSAGE` (también en distinta capitalización).
  - PATCH cambia nombre/fechas/mínimo/tope; `PATCH {}` → 400.
  - con `redeemedCount>0` (sembrar con `Coupon.updateOne`): PATCH de `code`, `discountType`, `percentOff` o `amountOffMxn` → 409 «El cupón ya tiene canjes: no se pueden cambiar el código ni el descuento.»; PATCH de `name` sí pasa; `maxRedemptions` menor a `redeemedCount` → 409 «El tope no puede ser menor a los canjes ya hechos (N).».
  - cambiar de `percent` a `fixed` limpia el campo anterior (`$unset`) y exige el nuevo.
  - `DELETE` retira (`isActive:false`, `status:"retired"`), `PATCH {isActive:true}` reactiva; ambos dejan fila en `AuditLog` con `COUPON_DEACTIVATED` / `COUPON_REACTIVATED`; crear y editar dejan `COUPON_CREATED` / `COUPON_UPDATED`.
  - `id` inválido → 400; inexistente → 404 «El cupón no existe.».
- [ ] **Step 2: tests del DTO y el listado (fallan)** `adminCouponsDto.test.ts`:
  - `status` por caso sembrado: retirado, vencido (`endsAt` pasado), programado (`startsAt` futuro), agotado (`redeemedCount==maxRedemptions`), activo; precedencia retirado > vencido > programado > agotado > activo (cupón retirado y vencido ⇒ `retired`; vencido y agotado ⇒ `expired`).
  - filtro `?estado=` para cada estado devuelve exactamente los sembrados de ese estado (con `now` fijo vía fechas ±1 día); `estado=todos` los devuelve todos.
  - `search` por código y por nombre, case-insensitive, con metacaracteres regex escapados (`?search=.*` no devuelve todo).
  - orden por `code`, `redeemedCount`, `endsAt`, `-createdAt` (por defecto) y fallback con sort inválido; paginación (`limit=2`, `meta.total`, `meta.pages`).
  - el DTO no incluye campos internos (`__v`, `_id`) y trae `id`, `createdAt`, `updatedAt` como string ISO.
- [ ] **Step 3:** correr ambos → FAIL.
- [ ] **Step 4: validador**

```ts
// validators/couponValidator.ts
import Joi from "joi";
import {
  CouponDiscountType, COUPON_AMOUNT_MAX, COUPON_AMOUNT_MIN, COUPON_CODE_MAX, COUPON_CODE_MIN,
  COUPON_CODE_PATTERN, COUPON_MAX_REDEMPTIONS_MAX, COUPON_MIN_SUBTOTAL_MAX, COUPON_NAME_MAX,
  COUPON_NAME_MIN, COUPON_PERCENT_MAX, COUPON_PERCENT_MIN,
} from "@gira/shared";
import { listQueryBase } from "./listQueryValidator.js";

const code = Joi.string().trim().uppercase().min(COUPON_CODE_MIN).max(COUPON_CODE_MAX)
  .pattern(COUPON_CODE_PATTERN).messages({
    "string.min": `El código debe tener entre ${COUPON_CODE_MIN} y ${COUPON_CODE_MAX} caracteres.`,
    "string.max": `El código debe tener entre ${COUPON_CODE_MIN} y ${COUPON_CODE_MAX} caracteres.`,
    "string.pattern.base": "El código solo admite letras, números y guiones.",
    "any.required": "El código es obligatorio.",
    "string.empty": "El código es obligatorio.",
  });
const name = Joi.string().trim().min(COUPON_NAME_MIN).max(COUPON_NAME_MAX).messages({
  "string.min": `El nombre debe tener al menos ${COUPON_NAME_MIN} caracteres.`,
  "string.max": `El nombre no puede exceder ${COUPON_NAME_MAX} caracteres.`,
  "any.required": "El nombre es obligatorio.",
  "string.empty": "El nombre es obligatorio.",
});
const percentOff = Joi.number().integer().min(COUPON_PERCENT_MIN).max(COUPON_PERCENT_MAX)
  .messages({ "number.base": "Escribe un porcentaje entre 1 y 100.", "number.integer": "El porcentaje debe ser un número entero.", "number.min": "El porcentaje mínimo es 1.", "number.max": "El porcentaje máximo es 100." });
const amountOffMxn = Joi.number().integer().min(COUPON_AMOUNT_MIN).max(COUPON_AMOUNT_MAX)
  .messages({ "number.base": "Escribe un monto válido.", "number.integer": "El monto no es válido.", "number.min": "El monto mínimo es $1.00.", "number.max": "El monto excede el máximo permitido." });
const minSubtotalMxn = Joi.number().integer().min(0).max(COUPON_MIN_SUBTOTAL_MAX);
const maxRedemptions = Joi.number().integer().min(1).max(COUPON_MAX_REDEMPTIONS_MAX).allow(null)
  .messages({ "number.min": "El tope debe ser al menos 1." });
const startsAt = Joi.date().iso().allow(null);
const endsAt = Joi.date().iso().allow(null)
  .when("startsAt", { is: Joi.date().required(), then: Joi.date().greater(Joi.ref("startsAt")) })
  .messages({ "date.greater": "La fecha de fin debe ser posterior al inicio." });

const createCouponSchema = Joi.object({
  code: code.required(),
  name: name.required(),
  discountType: Joi.string().valid(...Object.values(CouponDiscountType)).required(),
  percentOff: percentOff.when("discountType", { is: CouponDiscountType.PERCENT, then: Joi.required(), otherwise: Joi.forbidden() }),
  amountOffMxn: amountOffMxn.when("discountType", { is: CouponDiscountType.FIXED, then: Joi.required(), otherwise: Joi.forbidden() }),
  minSubtotalMxn,
  startsAt,
  endsAt,
  maxRedemptions,
});

const updateCouponSchema = Joi.object({
  code,
  name,
  discountType: Joi.string().valid(...Object.values(CouponDiscountType)),
  percentOff,
  amountOffMxn,
  minSubtotalMxn,
  startsAt,
  endsAt,
  maxRedemptions,
  isActive: Joi.boolean(),
}).min(1).messages({ "object.min": "Envía al menos un campo para actualizar." });

const COUPON_STATUS_FILTERS = ["todos", "activos", "programados", "vencidos", "agotados", "retirados"] as const;
const couponListQuerySchema = listQueryBase.keys({
  estado: Joi.string().valid(...COUPON_STATUS_FILTERS).default("todos"),
});

export { createCouponSchema, updateCouponSchema, couponListQuerySchema, COUPON_STATUS_FILTERS };
```

Nota: el estado se filtra con `estado` (español, igual que la URL de la web); si `validate` con `stripUnknown` no deja pasar la clave, ajustarlo en el mismo archivo.
- [ ] **Step 5: `couponService.ts`** (único que toca el modelo para escribir; mismo esqueleto que `printFamilyService.ts`): `createCoupon(input, ctx)` → `Coupon.create` con asignación explícita de campos; si `isDuplicateKeyError(err)` lanzar `new AppError(COUPON_CODE_TAKEN_MESSAGE, 409)`; auditoría `COUPON_CREATED` (módulo `COUPONS`). `updateCoupon(id, input, ctx)`: 404 «El cupón no existe.»; si `redeemedCount > 0` y el input cambia `code` (comparar normalizado), `discountType`, `percentOff` o `amountOffMxn` respecto al valor actual → 409 «El cupón ya tiene canjes: no se pueden cambiar el código ni el descuento.»; si `maxRedemptions !== undefined && maxRedemptions !== null && maxRedemptions < redeemedCount` → 409 con el conteo; al cambiar `discountType` aplicar `$unset` del campo del tipo anterior y exigir el del nuevo (400 «Falta el porcentaje.» / «Falta el monto.»); revalidar `endsAt > startsAt` con los valores resultantes (400); `isActive` true→false audita `COUPON_DEACTIVATED`, false→true `COUPON_REACTIVATED`, resto `COUPON_UPDATED`; duplicado → mismo 409. `deactivateCoupon(id, ctx)`: marca `isActive=false` y audita `COUPON_DEACTIVATED` (idempotente si ya estaba retirado, sin nueva fila de auditoría).
- [ ] **Step 6: `adminCouponService.ts`** — `LIST_CONFIG = { sortable: ["code","createdAt","redeemedCount","endsAt"], searchable: ["code","name"], defaultSort: "-createdAt", defaultLimit: 20 }`; `CODE_COLLATION = { locale: "es", strength: 2 }`; función pura exportada

```ts
const computeCouponStatus = (c: { isActive: boolean; startsAt: Date | null; endsAt: Date | null; maxRedemptions: number | null; redeemedCount: number }, now: Date): CouponStatus => {
  if (!c.isActive) return CouponStatus.RETIRED;
  if (c.endsAt && c.endsAt < now) return CouponStatus.EXPIRED;
  if (c.startsAt && c.startsAt > now) return CouponStatus.SCHEDULED;
  if (c.maxRedemptions !== null && c.redeemedCount >= c.maxRedemptions) return CouponStatus.EXHAUSTED;
  return CouponStatus.ACTIVE;
};
```

y `statusFilter(estado, now)` que devuelve el filtro Mongo equivalente (misma precedencia: `notExpired = { $or: [{ endsAt: null }, { endsAt: { $gte: now } }] }`, `started = { $or: [{ startsAt: null }, { startsAt: { $lte: now } }] }`, `notExhausted = { $or: [{ maxRedemptions: null }, { $expr: { $lt: ["$redeemedCount","$maxRedemptions"] } }] }`; `retirados: { isActive:false }`, `vencidos: { isActive:true, endsAt:{ $lt: now } }`, `programados: { isActive:true, startsAt:{ $gt: now }, ...notExpired }`, `agotados: { isActive:true, ...notExpired AND started, $expr: { $and: [{ $ne: ["$maxRedemptions", null] }, { $gte: ["$redeemedCount","$maxRedemptions"] }] } }`, `activos: { isActive:true, $and:[notExpired, started, notExhausted] }`; combinar con `$and` cuando haya varias claves `$or`). `listAdminCoupons(query)` usa `parseListQuery`, `Coupon.aggregate([{ $match }, { $facet: { rows: [sort, skip, limit], total: [count] } }]).collation(CODE_COLLATION)` y `toAdminCoupon(row, now)`; `getAdminCouponOrThrow(id)` → 404. Tomar `now = new Date()` una vez por request para filtro y DTO coherentes. Cuidar que `search` y `estado` ambos usan `$or`: componer con `$and`.
- [ ] **Step 7: controlador y rutas** — copiar la forma de `printFamilyController.ts`/`printFamilyRoutes.ts` (create 201 «Cupón creado correctamente.», list «Cupones obtenidos correctamente.» con clave `coupons`, detail/update/deactivate con clave `coupon`; tras escribir, releer con `getAdminCouponOrThrow`). Rutas: `GET /` (`couponListQuerySchema` en query), `POST /`, `GET /:id`, `PATCH /:id`, `DELETE /:id`, todas con `objectIdParamSchema` donde aplique. Registrar en `routes/v1/admin/index.ts`.
- [ ] **Step 8:** `pnpm --filter @gira/api exec vitest run tests/integration/adminCoupons.test.ts tests/integration/adminCouponsDto.test.ts` → PASS. `tsc --noEmit` limpio. **Checkpoint (fin del backend).**

## Task 7: Web — navegación, cliente y librerías puras (TDD)

**Files:** modify `lib/navigation.ts`, `lib/api/paths.ts`; create `lib/coupons/{panelCoupon,filters,money,dates,couponForm}.ts`, `lib/api/adminCoupons.ts`, `tests/helpers/coupons.ts`; tests `tests/lib/coupons/*.test.ts`.

- [ ] **Step 1: navegación.** En `NAV_GROUPS`, grupo `operation`, tras `orders`: `{ key: "coupons", label: "Cupones", href: "/cupones", icon: TicketIcon, keywords: ["cupones", "descuentos", "codigos", "promociones"], available: true }` (importar `TicketIcon` de `@phosphor-icons/react/dist/ssr`). Actualizar el test de navegación existente si cuenta ítems.
- [ ] **Step 2: tests de dinero y fechas (fallan)**

```ts
// tests/lib/coupons/money.test.ts
import { describe, it, expect } from "vitest";
import { pesosToCents, centsToPesosInput, formatMxn } from "@/lib/coupons/money";

describe("pesosToCents", () => {
  it.each([["150", 15000], ["150.5", 15050], ["150.50", 15050], ["0.01", 1], [" 799 ", 79900], ["1,500.00", 150000]])(
    "%s -> %s", (input, cents) => { expect(pesosToCents(input)).toBe(cents); });
  it.each(["", "abc", "10.999", "-5", "1.2.3", "10.", ".5x"])("rechaza %s sin redondear", (input) => {
    expect(pesosToCents(input)).toBeNull();
  });
  it("centsToPesosInput", () => { expect(centsToPesosInput(15050)).toBe("150.50"); expect(centsToPesosInput(15000)).toBe("150.00"); });
  it("formatMxn", () => { expect(formatMxn(79900)).toBe("$799.00"); });
});
```

```ts
// tests/lib/coupons/dates.test.ts
import { describe, it, expect } from "vitest";
import { parseMxDate, startOfMxDayIso, endOfMxDayIso, isoToMxInput, formatMxDate } from "@/lib/coupons/dates";

describe("fechas de México", () => {
  it("parsea dd/mm/aaaa", () => { expect(parseMxDate("01/06/2026")).toEqual({ y: 2026, m: 6, d: 1 }); });
  it.each(["1/6/26", "32/01/2026", "31/02/2026", "2026-06-01", ""])("rechaza %s", (v) => { expect(parseMxDate(v)).toBeNull(); });
  it("inicio 00:00 y fin 23:59:59 con -06:00", () => {
    expect(startOfMxDayIso({ y: 2026, m: 6, d: 1 })).toBe("2026-06-01T06:00:00.000Z");
    expect(endOfMxDayIso({ y: 2026, m: 6, d: 1 })).toBe("2026-06-02T05:59:59.000Z");
  });
  it("ida y vuelta del input", () => {
    expect(isoToMxInput("2026-06-01T06:00:00.000Z")).toBe("01/06/2026");
    expect(isoToMxInput("2026-06-02T05:59:59.000Z")).toBe("01/06/2026");
  });
  it("formatMxDate", () => { expect(formatMxDate("2026-06-01T06:00:00.000Z")).toBe("01 jun 2026"); });
});
```

- [ ] **Step 3: implementar** `money.ts` (`pesosToCents(input: string): number | null` — quita espacios y comas de miles, valida `/^\d+(\.\d{1,2})?$/`, devuelve `Math.round(Number(...)*100)` solo tras validar, `null` si no encaja; `centsToPesosInput(cents)` → `(cents/100).toFixed(2)`; `formatMxn(cents)` → `$` + `toLocaleString("es-MX",{minimumFractionDigits:2,maximumFractionDigits:2})`) y `dates.ts` (offset fijo `-06:00`: `startOfMxDayIso` = `Date.UTC(y,m-1,d,6,0,0)`, `endOfMxDayIso` = `Date.UTC(y,m-1,d+1,5,59,59)`; `parseMxDate` valida round-trip de calendario; `isoToMxInput` resta 6 h y formatea `dd/mm/aaaa`; `formatMxDate` → `dd mmm aaaa` en español con meses abreviados fijos `ene feb mar abr may jun jul ago sep oct nov dic`, sin `Intl` para evitar diferencias de ICU). Tests → PASS.
- [ ] **Step 4: DTO del panel y filtros (tests primero).** `panelCoupon.ts`: `PanelCoupon` = `AdminCoupon` recortado en el borde HTTP (`toPanelCoupon(dto: unknown): PanelCoupon`, lanza `ApiError(..., "parse")` si falta `id`/`code`/`status` — mismo estilo que `lib/taxonomy/panelTaxon.ts`). `filters.ts` espejo de `lib/taxonomy/filters.ts` con: `COUPON_SORT_FIELDS = ["createdAt","code","redeemedCount","endsAt"]`, `DEFAULT_SORT = "-createdAt"`, `DEFAULT_LIMIT = 20`, estados URL `todos|activos|programados|vencidos|agotados|retirados` (default `todos`), `parseCouponFilters`, `parseSelectedCoupon(params)` (`"nuevo"` o ObjectId; clave `cupon`), `buildCouponListQuery` (`estado`, `search`, `sort`, `page`, `limit`), `toSearchParams`, `applyFilterPatch`, `hasActiveFilters`. Tests en `tests/lib/coupons/filters.test.ts`: defaults limpios, round-trip parse→toSearchParams, `orden` inválido cae al default, `page` inválida a 1, cambiar `estado` reinicia página, `cupon=nuevo`, `cupon=<id>`, `cupon=basura` → `undefined`, búsqueda recortada a 80.
- [ ] **Step 5: formulario (tests primero)** `couponForm.ts` — `CouponFormValues { code, name, discountType: "percent"|"fixed", percentOff, amountOff, minSubtotal, startsAt, endsAt, maxRedemptions }` (strings salvo el tipo); `validateCouponForm(values, locked)` devuelve `Partial<Record<campo,string>>` con los mismos textos que el API (código 4–24 `[A-Z0-9-]`, nombre 2–80, porcentaje entero 1–100, monto ≥ $1.00 y ≤ máximo, mínimo vacío o monto válido, fechas válidas dd/mm/aaaa, fin posterior al inicio, tope entero ≥ 1 o vacío); `toCreateBody(values)` y `toUpdateBody(values, baseline)` (solo lo que cambió; campos vaciados → `null` para fechas/tope y `0` para mínimo; con `locked` jamás envía `code/discountType/percentOff/amountOffMxn`); `valuesFromCoupon(coupon)`. Tests: cada error por separado, `toCreateBody` convierte `150.50`→`15050` y fechas a ISO `-06:00`, `toUpdateBody` vacío cuando nada cambió, `locked` no envía campos de descuento, cambiar de tipo envía `discountType` + el valor nuevo.
- [ ] **Step 6: cliente** `lib/api/adminCoupons.ts` + constante `ADMIN_COUPONS_PATH = "/admin/coupons"` en `paths.ts` (exportarla en el bloque de exports): `couponClient = { list(query), get(id), create(body), update(id, body), retire(id), reactivate(id) }` con `browserRequest`/`expectData`/`assertCouponId` igual que `makeClient` de `adminTaxonomy.ts` (claves `coupons`/`coupon`). Test con `fetch` mockeado: `list` mapea `meta`, `get("basura")` lanza `ApiError` kind `parse` sin llamar a la red, `retire` usa DELETE, `reactivate` usa PATCH `{isActive:true}`.
- [ ] **Step 7:** `pnpm --filter @gira/web test -- tests/lib/coupons` → PASS; `pnpm --filter @gira/web exec tsc --noEmit` limpio. **Checkpoint.**

## Task 8: Web — hooks, componentes y página (TDD)

**Files:** create `hooks/useCouponList.ts`, `hooks/useCouponSave.ts`, `components/coupons/*`, `app/(admin)/cupones/{page,loading}.tsx`; tests `tests/components/coupons/*.test.tsx`, `tests/app/couponsPage.test.tsx`.

Mirror obligado (leer antes de escribir cada archivo): `hooks/useTaxonList.ts` → `useCouponList`; `hooks/useTaxonSave.ts` → `useCouponSave` (agrega `fieldErrors`: si `failure.status === 409` y `failure.message === COUPON_CODE_TAKEN_MESSAGE`, `codeError` = ese texto en lugar de `error`); `components/taxonomy/TaxonomyPage.tsx` (150 líneas: `writeUrl`, `writtenUrls`, `seenInitial`, `updateFiltersRef`, estados de página) → `CouponsPage`; `TaxonFilters.tsx` → `CouponFilters`; `TaxonTable.tsx` → `CouponTable`; `TaxonModal.tsx` (guarda de hidratación, `ModalBody` con `key`, descartar cambios) → `CouponModal`; `RetireTaxonSection.tsx` → `RetireCouponSection`; `TaxonEmpty.tsx`, `NewTaxonButton.tsx`. **Diferencias que sí cambian respecto al mirror:**

- `CouponsPage` recibe `initialFilters` y `initialSelected` (strings/objetos planos, **nunca** funciones ni un config). El cliente de API se importa dentro del componente cliente.
- `CouponFilters`: búsqueda (debounce 300 ms, sin pisar lo que el usuario escribe), `SelectField` «Estado» (Todos, Activos, Programados, Vencidos, Agotados, Retirados) y `SelectField` «Orden» (Más recientes, Código A-Z, Más canjeados, Vence primero). Sin `Segmented`.
- `CouponTable` (columnas del mockup A): **Cupón** (botón estirado sobre la fila con `after:absolute after:inset-0`, código en `font-mono font-bold`, nombre en `text-text-muted`), **Descuento** (`10%` o `$150.00`, mono), **Compra mín.** («Sin mínimo» o monto), **Vigencia** (dos líneas `formatMxDate`, «Sin inicio»/«Sin fin»), **Canjes** (`n / max` o `n / ∞` en mono + medidor de 8 px; lleno en `bg-ink` al 100 %), **Estado** con `Badge`: Activo=`ok`, Programado=`neutral`, Vencido=`neutral`, Agotado=`warn`, Retirado=`neutral`; filas Vencido/Retirado en `text-text-muted`. En móvil (`<sm`) ocultar Compra mín. y Vigencia como hace `TaxonTable`.
- `CouponForm` (una columna, ayuda bajo cada campo, textos del mockup A): Código, Nombre interno, Tipo (`Segmented` Porcentaje/Monto fijo — **no** agregar parches locales de color; si el seleccionado se ve sin relleno es el bug conocido de System Design, avisar a Manuel), Descuento (`Field` con sufijo `%` o `MXN`), Compra mínima, Inicia, Termina, Tope total de canjes y la línea fija «Cada cliente puede usarlo una sola vez. Solo clientes con cuenta.». Con `locked` (canjes > 0): Código/Tipo/Descuento en solo lectura con «Bloqueado: ya tiene N canjes.». Errores sobre el campo; error general en `Notice` arriba.
- `CouponModal`: título «Nuevo cupón» / «Editar cupón»; pie con **Guardar/Crear cupón** (`Button` primary, el único amarillo del modal) y Cancelar; «Retirar» a la izquierda solo al editar un cupón activo; un cupón retirado muestra «Reactivar» en esa posición. Retirar abre `ConfirmDialog` («¿Retirar este cupón?» / «Los clientes ya no podrán usarlo. Los pedidos que ya lo usaron no cambian.»).
- `NewCouponButton` → `Nuevo cupón` (primary) en `PageHeader`; `CouponEmpty` con los textos del mockup («Aún no hay cupones» / con filtros: «Ningún cupón coincide con estos filtros.» + limpiar).
- Página: `app/(admin)/cupones/page.tsx` async server component, `await searchParams`, `parseCouponFilters`/`parseSelectedCoupon`, `ErrorBoundary` + `SectionError`, `metadata = { title: "Cupones" }`, `<CouponsPage initialFilters initialSelected />`. `loading.tsx` con `PageHeader` + dos `Skeleton` de la geometría real.

- [ ] **Step 1: helper de tests** `tests/helpers/coupons.ts`: `makePanelCoupon(overrides)` (cupón activo 10 %, ObjectId fijo válido) y `makeCouponClientMock()` con `vi.fn()` en `list/get/create/update/retire/reactivate`, igual que `helpers/taxonomy.ts`.
- [ ] **Step 2: tests (fallan)**, cada uno con aserción concreta:
  - **CouponTable:** renderiza código, nombre, `10%`, `n / max`, badge «Agotado» para un cupón agotado; clic en la fila llama `onOpen(id)`; cupón sin tope muestra `∞` y sin medidor.
  - **CouponFilters:** escribir en búsqueda dispara `onChange({search})` tras el debounce (fake timers); `chooseOption` en «Estado» → `onChange({status:"retired"})`.
  - **CouponForm/Modal:** crear con campos vacíos muestra los errores de campo y **no** llama a `client.create`; crear válido llama `create` con el cuerpo en centavos/ISO y cierra; código duplicado (el mock rechaza `ApiError(COUPON_CODE_TAKEN_MESSAGE,"http",409)`) deja el error **sobre Código** y el modal abierto; otro error del servidor aparece en el `Notice` con «Reintentar» no requerido; con cupón `redeemedCount>0` los campos de código/tipo/valor están `readOnly`/deshabilitados y el cuerpo de `update` no los incluye; cerrar con cambios pide «¿Descartar los cambios?»; Retirar → confirmación → `client.retire`; Reactivar → `client.reactivate`; la hidratación: con el SSR simulado no renderiza el portal.
  - **CouponsPage:** carga (esqueletos), vacío, vacío con filtros, error con botón «Reintentar» que vuelve a pedir la lista, lista con filas; abrir `?cupon=nuevo` muestra el modal; cambiar filtro actualiza la URL en español (`router.replace` con `estado=vencidos`).
  - **Contrato servidor→cliente (`tests/app/couponsPage.test.tsx`)**, espejo de `taxonomyPages.test.tsx`: el elemento que devuelve `page.tsx` solo recibe props serializables (recorrer las props y afirmar `typeof !== "function"`).
- [ ] **Step 3:** correr → FAIL. **Step 4:** implementar los archivos anteriores. **Step 5:** `pnpm --filter @gira/web test -- tests/components/coupons tests/app/couponsPage.test.tsx` → PASS; `pnpm exec eslint apps/web` limpio; `designTokens.test.ts` sigue verde (cero colores/familias inline). **Checkpoint.**

## Task 9: Revisión, verificación y cierre
- [ ] `requesting-code-review` sobre el diff completo; atender hallazgos con `receiving-code-review`.
- [ ] `verification-before-completion` — correr y reportar la salida real: `pnpm --filter @gira/shared build`; `pnpm --filter @gira/api exec tsc --noEmit`; `pnpm --filter @gira/web exec tsc --noEmit`; `pnpm exec eslint apps/web`; `pnpm --filter @gira/web test`; `pnpm --filter @gira/api test` (flake conocido: re-correr aislado antes de investigar); build web **en una copia** del repo (`rsync -a --exclude node_modules --exclude .next --exclude .git ./ /tmp-copy/` con `node_modules` enlazado) con `NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1 pnpm --filter @gira/web build` — no tocar el `next dev` de Manuel.
- [ ] Recorrido en el navegador sobre una copia con `mongod` local (puerto 27018), API en 4100 (`COOKIE_NAME=gira_session`), web en 3100 reconstruida con `NEXT_PUBLIC_API_URL=http://localhost:4100/api/v1`; admin con `seed:admin` y 2FA por `/auth/2fa/enroll/*` con otplib. Flujo: crear cupón con error de código duplicado y de fechas, crear válido, editar, retirar, reactivar, filtrar por estado, vacío y error (apagar API). Además, con un cliente con cuenta, un pedido por `POST /orders` con `couponCode` y verificar `discount`/`coupon` en la orden. Si aparece «No se pudo cargar esta sección», revisar que ningún Server Component pase funciones a un Client Component.
- [ ] **Memoria y docs:** actualizar `project_milestone_status` (M12a hecho) y `project_standards_debt`; añadir «Pendientes conocidos» al final de este plan; recordar para M12c que `mockups/` se borra al cerrar M12, la pantalla «reiniciar 2FA» y la edición de la tasa de IVA caen ahí.
- [ ] **Final:** mostrar `git status` y `git diff --stat` y entregar los comandos de commit/merge **sin ejecutarlos**.

## Pendientes conocidos
Cerrado el 2026-10-20. Lo que quedó fuera a propósito o sin verificar:

- **Sin recorrido en el navegador.** La sesión no tuvo herramienta de browser; la UI se verificó con tests de componentes, typecheck, eslint y `next build` en copia. Falta el recorrido con login 2FA (copia con `mongod` 27018, API 4100, web 3100) y revisar 1440/390 contra el mockup A.
- **Cupón de 100 % con envío gratis** deja el total en 0: el proveedor de pago rechaza, el pedido se cancela por `payment_setup_failed` y el cupón se libera. Falta decidir una regla (mínimo de total o tratar el total 0 como pago sin proveedor).
- **El cupón no se ve en los pedidos.** `Order.coupon`/`couponId` se guardan, pero `PublicOrder`, `AdminOrder` y el detalle del panel de pedidos (§10 pide «descuento + cupón aplicado») aún no lo exponen.
- **Sin vista previa de cupón para una tienda pública** (no hay storefront en el repo): el canje vive en `POST /orders`. Cuando exista Bloque 3 hará falta un `POST /coupons/validate` de solo lectura con el mismo `resolveCouponForCheckout`.
- **Canje huérfano si el proceso muere** entre `claimCoupon` y `Order.create`: se libera cuando expira la reserva (TTL), no antes. No hay barrido propio.
- **Fallo al liberar el cupón** dentro de `releaseReservation` propaga el error después de devolver el stock; si se vuelve molesto, atraparlo y auditarlo.
- **El tipo de descuento usa `SelectField`, no `Segmented`** (el mockup A mostraba `Segmented`): evita el bug conocido de «seleccionado sin verde» hasta System Design.
- **Búsqueda y orden** de cupones usan colación `es` (strength 2) pero la búsqueda es por regex insensible; con muchos cupones habría que indexar.
- **Sin bloqueo optimista**: dos admins editando el mismo cupón; gana el último guardado.
- Heredados sin cambio: botón primary/`Segmented` sin relleno de marca, `writtenUrls` unificar en los tres paneles, CSP Cloudinary.
- Para M12c: `mockups/` se borra al cerrar M12, pantalla «reiniciar 2FA» y edición de la tasa de IVA en Ajustes.
