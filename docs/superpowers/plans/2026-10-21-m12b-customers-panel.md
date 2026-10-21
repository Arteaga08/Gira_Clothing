# M12b — Clientes y cupón personal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Reglas del repo que mandan sobre cualquier paso:** código, schemas y comentarios en inglés, UI en español; exports al final del archivo; **NO `git add` / `git commit` / `git push`** (Manuel los hace; los pasos «Checkpoint» solo corren `git status`/`git diff --stat`); un solo botón amarillo por pantalla; todo select usa `SelectField` (`onChange(value)`; en tests `chooseOption` de `apps/web/tests/helpers/select.ts`); en `beforeEach` de Vitest no devolver el mock (usar llaves); páginas del servidor pasan solo datos planos (nunca funciones ni un config); no tocar el bug del `Button` primary / `Segmented`.

**Goal:** Pantalla Clientes (top 10 por gasto neto o compras, hoy/semana/mes, más listado con búsqueda y ficha) y cupón personal que el admin da desde la ficha y llega por correo.

**Architecture:** Cupón personal = `Coupon` con `kind: "personal"` + `assignedUser`; `resolveCouponForCheckout` rechaza con el mismo «El cupón no es válido.» si el dueño no es quien paga; se reutiliza el canje atómico de M12a. Nuevos servicios `customerRankingService`, `adminCustomerService`, `couponGrantService` y `couponMailService` bajo `/admin/customers`. Web: `/clientes` (podio + tabla) y `/clientes/[id]` (ficha + `Modal` «Dar cupón»), diseño **opción B** del mockup.

**Tech Stack:** Express + Mongoose (aggregation), Joi, Vitest + supertest; Next.js App Router, React 19, Tailwind tokens; `@gira/shared`.

**Spec:** `docs/superpowers/specs/2026-10-21-m12b-customers-panel-design.md`. Mockup elegido: B (`m12b-mockups/b.html` en el scratchpad, fuera del repo).

**Verificación (se corre al final, Task 17):** `pnpm --filter @gira/shared build`; typecheck API y web; `pnpm exec eslint apps/web`; `pnpm --filter @gira/web test`; `pnpm --filter @gira/api test` (flake conocido: re-correr aislado antes de investigar); `next build` solo en una copia del repo.

---

## File structure

**Shared (`packages/shared/src`)**
- Modify `enums/coupon.ts` (+`CouponKind`), `types/coupon.ts` (+`kind`, `assignedCustomer`), `constants/coupon.ts` (+`COUPON_MESSAGE_MAX`, `COUPON_KIND_FILTERS`), `enums/auditAction.ts` (+`COUPON_GRANTED`), `index.ts`.
- Create `constants/customer.ts`, `types/customer.ts`.

**API (`apps/api`)**
- Modify `src/models/Coupon.ts`, `src/services/couponRulesService.ts`, `src/services/couponService.ts`, `src/services/adminCouponService.ts`, `src/services/orderStatsService.ts`, `src/services/adminOrderService.ts`, `src/validators/couponValidator.ts`, `src/validators/adminOrderValidator.ts`, `src/routes/v1/admin/index.ts`, `tests/helpers/seedOrder.ts`.
- Create `src/utils/orderMxnExpr.ts`, `src/services/customerRankingService.ts`, `src/services/adminCustomerService.ts`, `src/services/couponGrantService.ts`, `src/services/couponMailService.ts`, `src/templates/couponEmails.ts`, `src/validators/customerValidator.ts`, `src/controllers/customerController.ts`, `src/routes/v1/admin/customerRoutes.ts`.
- Tests: `tests/integration/couponPersonal.test.ts`, `customerTop.test.ts`, `adminCustomers.test.ts`, `giveCoupon.test.ts`, `adminOrdersCustomerFilter.test.ts`, `adminCouponsKind.test.ts`; `tests/unit/couponEmails.test.ts`, `orderMxnExpr.test.ts`.

**Web (`apps/web/src`)**
- Create `lib/api/adminCustomers.ts`, `lib/customers/{panelCustomer,filters,giveCouponForm}.ts`, `hooks/{useTopCustomers,useCustomerList,useCustomerDetail,useGiveCoupon}.ts`, `components/customers/{CustomersPage,TopCustomersSection,CustomerTable,CustomerSearch,CustomerDetailPage,CustomerOrdersCard,GiveCouponModal,GiveCouponForm}.tsx`, `app/(admin)/clientes/{page,loading}.tsx`, `app/(admin)/clientes/[id]/{page,loading}.tsx`.
- Modify `lib/api/paths.ts`, `lib/navigation.ts`, `lib/coupons/{panelCoupon,filters}.ts`, `components/coupons/{CouponFilters,CouponTable,CouponModal,CouponsPage}.tsx`.
- Tests in `apps/web/tests/**` mirroring each file.

---

## Task 1: Shared — enums, constants, types

**Files:** see "Shared" above. Tests: type-checked by `pnpm --filter @gira/shared build`.

- [ ] **Step 1: `enums/coupon.ts`** — append the enum and export it.

```ts
enum CouponDiscountType {
  PERCENT = "percent",
  FIXED = "fixed",
}

/** Campaign = for any customer with an account; personal = bound to one customer (`assignedUser`). */
enum CouponKind {
  CAMPAIGN = "campaign",
  PERSONAL = "personal",
}

/** Computed by the server from isActive, dates and counters; never stored. */
enum CouponStatus {
  ACTIVE = "active",
  SCHEDULED = "scheduled",
  EXPIRED = "expired",
  EXHAUSTED = "exhausted",
  RETIRED = "retired",
}

export { CouponDiscountType, CouponKind, CouponStatus };
```

- [ ] **Step 2: `constants/coupon.ts`** — add before the export block and add both names to it.

```ts
/** Optional note the admin writes for a personal coupon; plain text in the email. */
const COUPON_MESSAGE_MAX = 500;
/** `clase` filter of GET /admin/coupons (Spanish words, same as the panel URL). */
const COUPON_KIND_FILTERS = ["todos", "campanas", "personales"] as const;
```

- [ ] **Step 3: `types/coupon.ts`** — import `CouponKind` and extend `AdminCoupon`.

```ts
import type { CouponDiscountType, CouponKind, CouponStatus } from "../enums/coupon.js";

interface AssignedCustomer {
  id: string;
  firstName: string;
  lastName: string;
}
```
Inside `AdminCoupon` add (after `name`):
```ts
  kind: CouponKind;
  /** Present only on personal coupons. */
  assignedCustomer?: AssignedCustomer;
```
Export `AssignedCustomer` with the other types.

- [ ] **Step 4: `constants/customer.ts`**

```ts
/** Calendar windows of the "Mejores clientes" ranking (hoy / semana / mes). */
const CUSTOMER_RANK_PERIODS = ["today", "week", "month"] as const;
/** What the ranking is ordered by; the other metric breaks ties. */
const CUSTOMER_RANK_SORTS = ["spent", "orders"] as const;
const CUSTOMER_RANK_LIMIT = 10;

type CustomerRankPeriod = (typeof CUSTOMER_RANK_PERIODS)[number];
type CustomerRankSort = (typeof CUSTOMER_RANK_SORTS)[number];

export type { CustomerRankPeriod, CustomerRankSort };
export { CUSTOMER_RANK_PERIODS, CUSTOMER_RANK_SORTS, CUSTOMER_RANK_LIMIT };
```

- [ ] **Step 5: `types/customer.ts`**

```ts
import type { AdminCoupon } from "./coupon.js";
import type { CustomerRankPeriod, CustomerRankSort } from "../constants/customer.js";

interface CustomerStats {
  /** Paid orders (REVENUE_STATUSES, no dispute lost). */
  orderCount: number;
  /** Net of refunds, in MXN centavos (USD orders converted with their own saved rate). */
  spentMxn: number;
  lastOrderAt: Date | null;
}

interface AdminCustomer {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  emailVerified: boolean;
  createdAt: Date;
  stats: CustomerStats;
}

interface TopCustomer {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  orderCount: number;
  spentMxn: number;
}

interface TopCustomers {
  period: CustomerRankPeriod;
  sortBy: CustomerRankSort;
  from: Date;
  to: Date;
  rows: TopCustomer[];
}

interface GiveCouponResult {
  coupon: AdminCoupon;
  /** false = the coupon exists but the email did not go out. */
  emailSent: boolean;
}

export type { CustomerStats, AdminCustomer, TopCustomer, TopCustomers, GiveCouponResult };
```

- [ ] **Step 6: audit enum** — in `enums/auditAction.ts` add `COUPON_GRANTED = "coupon_granted",` after `COUPON_REACTIVATED`.

- [ ] **Step 7: `index.ts`** — follow the file's style (imports at the top, one `export type {…}` and one `export {…}` block). Add:
  - `import { CouponDiscountType, CouponKind, CouponStatus } from "./enums/coupon.js";` (replace the existing import line)
  - `import type { AdminCoupon, AssignedCustomer, OrderCoupon } from "./types/coupon.js";`
  - `COUPON_MESSAGE_MAX, COUPON_KIND_FILTERS` into the existing `./constants/coupon.js` import and export list.
  - `import { CUSTOMER_RANK_PERIODS, CUSTOMER_RANK_SORTS, CUSTOMER_RANK_LIMIT } from "./constants/customer.js";` + `import type { CustomerRankPeriod, CustomerRankSort } from "./constants/customer.js";`
  - `import type { CustomerStats, AdminCustomer, TopCustomer, TopCustomers, GiveCouponResult } from "./types/customer.js";`
  - export all of the above (types in `export type {…}`, values in `export {…}`).

- [ ] **Step 8: build** — Run `pnpm --filter @gira/shared build` · Expected: success, no errors.

- [ ] **Step 9: Checkpoint** — `git status --short` shows only shared files (+ the spec/plan docs). No commit.

---

## Task 2: Coupon model + personal ownership at checkout (TDD)

**Files:** Modify `apps/api/src/models/Coupon.ts`, `apps/api/src/services/couponRulesService.ts`; Test `apps/api/tests/integration/couponPersonal.test.ts`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import mongoose from "mongoose";
import { CouponDiscountType, CouponKind } from "@gira/shared";
import { Coupon } from "../../src/models/Coupon.js";
import { resolveCouponForCheckout } from "../../src/services/couponRulesService.js";
import { createCustomer } from "../helpers/auth.js";

const oid = (id: string) => new mongoose.Types.ObjectId(id);

const personal = (assignedUser: mongoose.Types.ObjectId, overrides: Record<string, unknown> = {}) =>
  Coupon.create({
    code: "GRACIAS-ANA",
    name: "Personal · Ana",
    discountType: CouponDiscountType.PERCENT,
    percentOff: 15,
    kind: CouponKind.PERSONAL,
    assignedUser,
    maxRedemptions: 1,
    ...overrides,
  });

describe("Coupon personal · propiedad", () => {
  it("el dueño lo resuelve", async () => {
    const owner = await createCustomer();
    await personal(oid(owner.id));
    const coupon = await resolveCouponForCheckout("gracias-ana", oid(owner.id));
    expect(coupon.code).toBe("GRACIAS-ANA");
  });

  it("otro cliente recibe el mismo mensaje genérico que un código inexistente", async () => {
    const owner = await createCustomer({ email: "dueno@example.com" });
    const other = await createCustomer({ email: "otro@example.com" });
    await personal(oid(owner.id));
    const wrong = await resolveCouponForCheckout("GRACIAS-ANA", oid(other.id)).catch((e: Error) => e);
    const missing = await resolveCouponForCheckout("NO-EXISTE", oid(other.id)).catch((e: Error) => e);
    expect(wrong).toMatchObject({ message: "El cupón no es válido.", statusCode: 400 });
    expect((wrong as Error).message).toBe((missing as Error).message);
  });

  it("un invitado sigue recibiendo 401", async () => {
    const owner = await createCustomer();
    await personal(oid(owner.id));
    await expect(resolveCouponForCheckout("GRACIAS-ANA", undefined)).rejects.toMatchObject({ statusCode: 401 });
  });

  it("un cupón sin kind (anterior a M12b) se comporta como campaña", async () => {
    const anyone = await createCustomer();
    await Coupon.collection.insertOne({
      code: "VIEJO10",
      name: "Viejo",
      discountType: CouponDiscountType.PERCENT,
      percentOff: 10,
      minSubtotalMxn: 0,
      startsAt: null,
      endsAt: null,
      maxRedemptions: null,
      redeemedCount: 0,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const coupon = await resolveCouponForCheckout("VIEJO10", oid(anyone.id));
    expect(coupon.code).toBe("VIEJO10");
  });

  it("el esquema exige assignedUser en un personal y lo prohíbe en una campaña", async () => {
    await expect(
      Coupon.create({
        code: "SINDUENO",
        name: "x y",
        discountType: CouponDiscountType.PERCENT,
        percentOff: 5,
        kind: CouponKind.PERSONAL,
      }),
    ).rejects.toThrow(/assignedUser/);
    const owner = await createCustomer();
    await expect(
      Coupon.create({
        code: "CAMPANA5",
        name: "x y",
        discountType: CouponDiscountType.PERCENT,
        percentOff: 5,
        assignedUser: oid(owner.id),
      }),
    ).rejects.toThrow(/assignedUser/);
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `pnpm --filter @gira/api exec vitest run tests/integration/couponPersonal.test.ts` · Expected: FAIL (`kind`/`assignedUser` unknown, TS or assertion errors).

- [ ] **Step 3: Model** — in `models/Coupon.ts` add to imports `CouponKind` and `type Types` (`import { Schema, model, type HydratedDocument, type Model, type Types } from "mongoose";`), to `CouponAttrs`:

```ts
  kind: CouponKind;
  /** Only on personal coupons: the one customer who can redeem it. */
  assignedUser?: Types.ObjectId;
```
and to the schema fields (after `name`):
```ts
    kind: { type: String, enum: Object.values(CouponKind), default: CouponKind.CAMPAIGN },
    assignedUser: {
      type: Schema.Types.ObjectId,
      ref: "User",
      validate: {
        validator: function (this: CouponAttrs, value: unknown) {
          const personal = this.kind === CouponKind.PERSONAL;
          return personal ? Boolean(value) : !value;
        },
        message: "assignedUser is required for a personal coupon and forbidden otherwise",
      },
      required: [
        function (this: CouponAttrs) {
          return this.kind === CouponKind.PERSONAL;
        },
        "assignedUser is required for a personal coupon",
      ],
    },
```
and the index after the existing ones:
```ts
couponSchema.index({ assignedUser: 1 }, { partialFilterExpression: { assignedUser: { $exists: true } } });
```
Import `CouponKind` from `@gira/shared` in the existing import list.

- [ ] **Step 4: Rule** — in `couponRulesService.ts` add `import { CouponKind } from "@gira/shared";` and, right after the first `INVALID` guard in `resolveCouponForCheckout`:

```ts
  // Someone else's personal coupon looks exactly like a code that does not exist (anti-enumeration).
  if (coupon.kind === CouponKind.PERSONAL && String(coupon.assignedUser) !== String(userId)) {
    throw new AppError(MSG.INVALID, 400);
  }
```
Update the doc comment: «Missing, retired, not-yet-started and other-customer personal coupons share one message».

- [ ] **Step 5: Run to verify it passes** — same command · Expected: PASS (5 tests). Then run `pnpm --filter @gira/api exec vitest run tests/integration/couponCheckout.test.ts tests/integration/couponRedemption.test.ts` · Expected: still PASS.

- [ ] **Step 6: Checkpoint** — `git diff --stat`. No commit.

---

## Task 3: Shared MXN expression (refactor with guard test)

**Files:** Create `apps/api/src/utils/orderMxnExpr.ts`; Modify `apps/api/src/services/orderStatsService.ts`; Test `apps/api/tests/unit/orderMxnExpr.test.ts`.

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from "vitest";
import { mxnOf, NET_MXN_EXPR } from "../../src/utils/orderMxnExpr.js";

describe("orderMxnExpr", () => {
  it("mxnOf deja los pesos tal cual y convierte USD con la tasa guardada", () => {
    expect(JSON.stringify(mxnOf("$total"))).toContain('"$eq":["$currency","MXN"]');
    expect(JSON.stringify(mxnOf("$total"))).toContain('"$exchangeRate"');
  });

  it("NET_MXN_EXPR resta el reembolso acumulado y nunca baja de 0", () => {
    const text = JSON.stringify(NET_MXN_EXPR);
    expect(text).toContain("payment.refundedAmount");
    expect(text).toContain('"$max"');
  });
});
```

- [ ] **Step 2: Run** — `pnpm --filter @gira/api exec vitest run tests/unit/orderMxnExpr.test.ts` · Expected: FAIL (module missing).

- [ ] **Step 3: Implementation** — `utils/orderMxnExpr.ts`:

```ts
import { Currency } from "@gira/shared";

/**
 * Aggregation expression: an amount stored in the order's charge currency, as MXN
 * centavos. USD orders convert with the rate saved ON THAT ORDER (`exchangeRate` is
 * pesos per dollar in cents, hence the /100), never today's rate.
 */
const mxnOf = (amount: unknown): Record<string, unknown> => ({
  $cond: {
    if: { $eq: ["$currency", Currency.MXN] },
    then: amount,
    else: { $round: [{ $divide: [{ $multiply: [amount, "$exchangeRate"] }, 100] }, 0] },
  },
});

/** What the customer really paid: total minus the cumulative refund, converted to MXN. */
const NET_MXN_EXPR = mxnOf({
  $max: [0, { $subtract: ["$total", { $ifNull: ["$payment.refundedAmount", 0] }] }],
});

export { mxnOf, NET_MXN_EXPR };
```

- [ ] **Step 4: Refactor `orderStatsService.ts`** — import `mxnOf` and replace the inline `$cond` inside `mxnEquivalent` with `mxnEquivalent: mxnOf("$total"),`.

- [ ] **Step 5: Run** — `pnpm --filter @gira/api exec vitest run tests/unit/orderMxnExpr.test.ts tests/integration/orderStats.test.ts tests/integration/statsOverview.test.ts` · Expected: PASS (behaviour unchanged).

---

## Task 4: Ranking service + `GET /admin/customers/top` (TDD)

**Files:** Modify `apps/api/tests/helpers/seedOrder.ts`; Create `validators/customerValidator.ts`, `services/customerRankingService.ts`, `controllers/customerController.ts`, `routes/v1/admin/customerRoutes.ts`; Modify `routes/v1/admin/index.ts`; Test `tests/integration/customerTop.test.ts`.

- [ ] **Step 1: Extend `seedOrder`** — in `SeedOrderOptions` add `user?: mongoose.Types.ObjectId; exchangeRate?: number; refundedAmount?: number;`. In the `Order.create` object: `exchangeRate: opts.exchangeRate ?? 1,` (replace the literal `1`), `...(opts.user ? { user: opts.user } : {}),` and
`payment: { provider: "stripe", status: PaymentStatus.SUCCEEDED, ...(opts.refundedAmount ? { refundedAmount: opts.refundedAmount } : {}) },`.

- [ ] **Step 2: Failing test**

```ts
import { describe, it, expect } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { Currency, DisputeStatus, OrderStatus } from "@gira/shared";
import { buildApp } from "../../src/app.js";
import { createCustomer, loginAsAdmin, loginAsCustomer } from "../helpers/auth.js";
import { seedOrder } from "../helpers/seedOrder.js";

const app = buildApp();
const URL = "/api/v1/admin/customers/top";
const oid = (id: string) => new mongoose.Types.ObjectId(id);
const DAYS = 86_400_000;
const now = () => new Date();
const daysAgo = (n: number) => new Date(Date.now() - n * DAYS);

const get = async (query = "") => {
  const cookie = await loginAsAdmin(app);
  return request(app).get(`${URL}${query}`).set("cookie", cookie);
};

describe("GET /admin/customers/top", () => {
  it("401 sin sesión y 403 a un cliente", async () => {
    expect((await request(app).get(URL)).status).toBe(401);
    const cookie = await loginAsCustomer(app);
    expect((await request(app).get(URL).set("cookie", cookie)).status).toBe(403);
  });

  it("400 con periodo u orden inválidos", async () => {
    expect((await get("?period=year")).status).toBe(400);
    expect((await get("?sortBy=nope")).status).toBe(400);
  });

  it("ordena por gasto neto por defecto, con compras como desempate", async () => {
    const a = await createCustomer({ email: "a@example.com" });
    const b = await createCustomer({ email: "b@example.com" });
    await seedOrder({ status: OrderStatus.PAID, total: 50_000, createdAt: now(), user: oid(a.id) });
    await seedOrder({ status: OrderStatus.DELIVERED, total: 30_000, createdAt: now(), user: oid(b.id) });
    await seedOrder({ status: OrderStatus.DELIVERED, total: 30_000, createdAt: now(), user: oid(b.id) });
    const res = await get();
    expect(res.status).toBe(200);
    const rows = res.body.data.ranking.rows;
    expect(rows.map((r: { email: string }) => r.email)).toEqual(["b@example.com", "a@example.com"]);
    expect(rows[0]).toMatchObject({ orderCount: 2, spentMxn: 60_000 });
    expect(res.body.data.ranking).toMatchObject({ period: "month", sortBy: "spent" });
  });

  it("sortBy=orders ordena por número de compras", async () => {
    const a = await createCustomer({ email: "a@example.com" });
    const b = await createCustomer({ email: "b@example.com" });
    await seedOrder({ status: OrderStatus.PAID, total: 90_000, createdAt: now(), user: oid(a.id) });
    await seedOrder({ status: OrderStatus.PAID, total: 10_000, createdAt: now(), user: oid(b.id) });
    await seedOrder({ status: OrderStatus.PAID, total: 10_000, createdAt: now(), user: oid(b.id) });
    const rows = (await get("?sortBy=orders")).body.data.ranking.rows;
    expect(rows[0].email).toBe("b@example.com");
  });

  it("solo cuentan pedidos pagados (no pendientes, cancelados, reembolsados) ni disputa perdida", async () => {
    const c = await createCustomer();
    for (const status of [OrderStatus.PENDING_PAYMENT, OrderStatus.CANCELLED, OrderStatus.EXPIRED, OrderStatus.REFUNDED]) {
      await seedOrder({ status, total: 10_000, createdAt: now(), user: oid(c.id) });
    }
    await seedOrder({ status: OrderStatus.PAID, total: 10_000, createdAt: now(), user: oid(c.id), disputeStatus: DisputeStatus.LOST });
    expect((await get()).body.data.ranking.rows).toEqual([]);
  });

  it("descuenta el reembolso parcial", async () => {
    const c = await createCustomer();
    await seedOrder({ status: OrderStatus.PAID, total: 50_000, createdAt: now(), user: oid(c.id), refundedAmount: 20_000 });
    expect((await get()).body.data.ranking.rows[0]).toMatchObject({ spentMxn: 30_000 });
  });

  it("convierte un pedido en USD con su propia tasa", async () => {
    const c = await createCustomer();
    // 10_00 US cents at 18.50 MXN/USD (exchangeRate 1850) = 18_500 MXN centavos
    await seedOrder({ status: OrderStatus.PAID, total: 1_000, currency: Currency.USD, exchangeRate: 1_850, createdAt: now(), user: oid(c.id) });
    expect((await get()).body.data.ranking.rows[0].spentMxn).toBe(18_500);
  });

  it("ignora invitados y admins, y respeta el periodo", async () => {
    const c = await createCustomer();
    await seedOrder({ status: OrderStatus.PAID, total: 10_000, createdAt: now() }); // guest: no user
    await seedOrder({ status: OrderStatus.PAID, total: 10_000, createdAt: daysAgo(40), user: oid(c.id) }); // out of month
    expect((await get("?period=month")).body.data.ranking.rows).toEqual([]);
    await seedOrder({ status: OrderStatus.PAID, total: 10_000, createdAt: now(), user: oid(c.id) });
    expect((await get("?period=today")).body.data.ranking.rows).toHaveLength(1);
  });

  it("devuelve como máximo 10 filas y no expone datos sensibles", async () => {
    for (let i = 0; i < 12; i++) {
      const c = await createCustomer({ email: `c${i}@example.com` });
      await seedOrder({ status: OrderStatus.PAID, total: 10_000 + i, createdAt: now(), user: oid(c.id) });
    }
    const rows = (await get()).body.data.ranking.rows;
    expect(rows).toHaveLength(10);
    expect(rows[0]).not.toHaveProperty("password");
    expect(Object.keys(rows[0]).sort()).toEqual(["email", "firstName", "id", "lastName", "orderCount", "spentMxn"]);
  });
});
```
> `createCustomer` crea un admin aparte al llamar `loginAsAdmin`; el test «ignora admins» queda cubierto porque el `$lookup` filtra `role: customer` y el admin nunca tiene pedidos con `user`. Si `createCustomer` no acepta `email`, usar su firma real (ver `tests/helpers/auth.ts`).

- [ ] **Step 3: Run** — `pnpm --filter @gira/api exec vitest run tests/integration/customerTop.test.ts` · Expected: FAIL (404 route).

- [ ] **Step 4: Validator** `validators/customerValidator.ts` (se amplía en Tasks 5 y 8):

```ts
import Joi from "joi";
import { CUSTOMER_RANK_PERIODS, CUSTOMER_RANK_SORTS } from "@gira/shared";

const customerTopQuerySchema = Joi.object({
  period: Joi.string()
    .valid(...CUSTOMER_RANK_PERIODS)
    .default("month")
    .messages({ "any.only": "El periodo debe ser today, week o month." }),
  sortBy: Joi.string()
    .valid(...CUSTOMER_RANK_SORTS)
    .default("spent")
    .messages({ "any.only": "El orden debe ser spent u orders." }),
});

export { customerTopQuerySchema };
```

- [ ] **Step 5: Service** `services/customerRankingService.ts`:

```ts
import {
  CUSTOMER_RANK_LIMIT,
  DisputeStatus,
  UserRole,
  type CustomerRankPeriod,
  type CustomerRankSort,
  type TopCustomers,
} from "@gira/shared";
import { Order } from "../models/Order.js";
import { User } from "../models/User.js";
import { NET_MXN_EXPR } from "../utils/orderMxnExpr.js";
import { resolveCurrentPeriod } from "../utils/resolveCurrentPeriod.js";
import { REVENUE_STATUSES } from "./orderStatsService.js";

/**
 * "Mejores clientes": customers WITH an account (orders carry `user`; guests never
 * rank), by calendar window in Mexico time. An order counts like revenue elsewhere
 * (REVENUE_STATUSES, no lost dispute); spend is net of the cumulative refund, in MXN.
 * The user lookup sits BEFORE the limit so test orders placed by admins cannot shrink the top.
 */

interface TopCustomersQuery {
  period: CustomerRankPeriod;
  sortBy: CustomerRankSort;
}

interface Row {
  _id: unknown;
  firstName: string;
  lastName: string;
  email: string;
  orderCount: number;
  spentMxn: number;
}

const getTopCustomers = async ({ period, sortBy }: TopCustomersQuery): Promise<TopCustomers> => {
  const range = resolveCurrentPeriod({ period });
  const sort =
    sortBy === "orders"
      ? { orderCount: -1, spentMxn: -1, _id: 1 }
      : { spentMxn: -1, orderCount: -1, _id: 1 };

  const rows = await Order.aggregate<Row>([
    {
      $match: {
        user: { $exists: true },
        createdAt: { $gte: range.from, $lte: range.to },
        status: { $in: REVENUE_STATUSES },
        disputeStatus: { $ne: DisputeStatus.LOST },
      },
    },
    { $group: { _id: "$user", orderCount: { $sum: 1 }, spentMxn: { $sum: NET_MXN_EXPR } } },
    {
      $lookup: {
        from: User.collection.name,
        localField: "_id",
        foreignField: "_id",
        pipeline: [{ $match: { role: UserRole.CUSTOMER } }, { $project: { firstName: 1, lastName: 1, email: 1 } }],
        as: "customer",
      },
    },
    { $unwind: "$customer" },
    { $sort: sort as Record<string, 1 | -1> },
    { $limit: CUSTOMER_RANK_LIMIT },
    {
      $project: {
        orderCount: 1,
        spentMxn: 1,
        firstName: "$customer.firstName",
        lastName: "$customer.lastName",
        email: "$customer.email",
      },
    },
  ]);

  return {
    period,
    sortBy,
    from: range.from,
    to: range.to,
    rows: rows.map((row) => ({
      id: String(row._id),
      firstName: row.firstName,
      lastName: row.lastName,
      email: row.email,
      orderCount: row.orderCount,
      spentMxn: row.spentMxn,
    })),
  };
};

export type { TopCustomersQuery };
export { getTopCustomers };
```

- [ ] **Step 6: Controller** `controllers/customerController.ts`:

```ts
import type { Request, Response } from "express";
import type { CustomerRankPeriod, CustomerRankSort } from "@gira/shared";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendResponse } from "../utils/sendResponse.js";
import { getTopCustomers } from "../services/customerRankingService.js";

/** Customer admin controllers: req/res only. */

const top = asyncHandler(async (req: Request, res: Response) => {
  const { period, sortBy } = req.query as unknown as { period: CustomerRankPeriod; sortBy: CustomerRankSort };
  const ranking = await getTopCustomers({ period, sortBy });
  sendResponse(res, 200, "Ranking de clientes obtenido correctamente.", { ranking });
});

export { top };
```

- [ ] **Step 7: Routes** `routes/v1/admin/customerRoutes.ts` and mount:

```ts
import { Router } from "express";
import { validate } from "../../../middlewares/validate.js";
import { customerTopQuerySchema } from "../../../validators/customerValidator.js";
import { top } from "../../../controllers/customerController.js";

const customerRouter = Router();

// `/top` is declared before `/:id` (Task 5) so "top" is never read as an id.
customerRouter.get("/top", validate(customerTopQuerySchema, "query"), top);

export { customerRouter };
```
In `routes/v1/admin/index.ts`: `import { customerRouter } from "./customerRoutes.js";` and `adminRouter.use("/customers", customerRouter);`.

- [ ] **Step 8: Run** — `pnpm --filter @gira/api exec vitest run tests/integration/customerTop.test.ts` · Expected: PASS (9 tests).

---

## Task 5: Customer list + detail (`GET /admin/customers`, `GET /admin/customers/:id`) (TDD)

**Files:** Create `services/adminCustomerService.ts`; Modify `validators/customerValidator.ts`, `controllers/customerController.ts`, `routes/v1/admin/customerRoutes.ts`; Test `tests/integration/adminCustomers.test.ts`.

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { OrderStatus, UserRole } from "@gira/shared";
import { buildApp } from "../../src/app.js";
import { User } from "../../src/models/User.js";
import { createCustomer, loginAsAdmin, loginAsCustomer } from "../helpers/auth.js";
import { seedOrder } from "../helpers/seedOrder.js";

const app = buildApp();
const BASE = "/api/v1/admin/customers";
const oid = (id: string) => new mongoose.Types.ObjectId(id);

describe("GET /admin/customers", () => {
  it("401 / 403", async () => {
    expect((await request(app).get(BASE)).status).toBe(401);
    const cookie = await loginAsCustomer(app);
    expect((await request(app).get(BASE).set("cookie", cookie)).status).toBe(403);
  });

  it("lista solo clientes (no admins) con sus métricas históricas", async () => {
    const cookie = await loginAsAdmin(app);
    const ana = await createCustomer({ email: "ana@example.com" });
    await createCustomer({ email: "sin-compras@example.com" });
    await seedOrder({ status: OrderStatus.PAID, total: 40_000, createdAt: new Date("2026-01-10"), user: oid(ana.id) });
    await seedOrder({ status: OrderStatus.DELIVERED, total: 20_000, createdAt: new Date("2026-02-10"), user: oid(ana.id), refundedAmount: 5_000 });
    await seedOrder({ status: OrderStatus.CANCELLED, total: 99_000, createdAt: new Date("2026-03-10"), user: oid(ana.id) });
    const res = await request(app).get(`${BASE}?limit=10`).set("cookie", cookie);
    expect(res.status).toBe(200);
    const customers = res.body.data.customers as { email: string; stats: Record<string, unknown> }[];
    expect(customers.some((c) => c.email.startsWith("admin"))).toBe(false);
    const row = customers.find((c) => c.email === "ana@example.com")!;
    expect(row.stats).toMatchObject({ orderCount: 2, spentMxn: 55_000 });
    expect(new Date(row.stats.lastOrderAt as string).toISOString()).toBe(new Date("2026-02-10").toISOString());
    const empty = customers.find((c) => c.email === "sin-compras@example.com")!;
    expect(empty.stats).toEqual({ orderCount: 0, spentMxn: 0, lastOrderAt: null });
    expect(row).not.toHaveProperty("password");
    expect(res.body.meta).toMatchObject({ page: 1, limit: 10 });
  });

  it("busca por nombre o correo", async () => {
    const cookie = await loginAsAdmin(app);
    await User.create({ firstName: "Mariana", lastName: "Ocampo", email: "mariana@example.com", password: "Clave12345", role: UserRole.CUSTOMER });
    await createCustomer({ email: "otro@example.com" });
    const res = await request(app).get(`${BASE}?search=mariana`).set("cookie", cookie);
    expect(res.body.data.customers.map((c: { email: string }) => c.email)).toEqual(["mariana@example.com"]);
  });
});

describe("GET /admin/customers/:id", () => {
  it("devuelve la ficha con métricas", async () => {
    const cookie = await loginAsAdmin(app);
    const ana = await createCustomer({ email: "ana@example.com" });
    await seedOrder({ status: OrderStatus.PAID, total: 40_000, createdAt: new Date(), user: oid(ana.id) });
    const res = await request(app).get(`${BASE}/${ana.id}`).set("cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body.data.customer).toMatchObject({ id: ana.id, email: "ana@example.com", stats: { orderCount: 1, spentMxn: 40_000 } });
  });

  it("404 para un id inexistente o de un admin, 400 para un id mal formado", async () => {
    const cookie = await loginAsAdmin(app);
    const admin = await User.findOne({ role: UserRole.ADMIN });
    expect((await request(app).get(`${BASE}/${new mongoose.Types.ObjectId()}`).set("cookie", cookie)).status).toBe(404);
    expect((await request(app).get(`${BASE}/${admin!.id}`).set("cookie", cookie)).status).toBe(404);
    expect((await request(app).get(`${BASE}/zzz`).set("cookie", cookie)).status).toBe(400);
  });
});
```

- [ ] **Step 2: Run** — `pnpm --filter @gira/api exec vitest run tests/integration/adminCustomers.test.ts` · Expected: FAIL (404).

- [ ] **Step 3: Validator** — append to `customerValidator.ts`:

```ts
import { listQueryBase } from "./listQueryValidator.js";

const customerListQuerySchema = listQueryBase;
```
and export it with `customerTopQuerySchema`.

- [ ] **Step 4: Service** `services/adminCustomerService.ts`:

```ts
import { Types } from "mongoose";
import { DisputeStatus, UserRole, type AdminCustomer, type ApiMeta, type CustomerStats } from "@gira/shared";
import { Order } from "../models/Order.js";
import { User } from "../models/User.js";
import { AppError } from "../utils/AppError.js";
import { NET_MXN_EXPR } from "../utils/orderMxnExpr.js";
import { buildMeta, parseListQuery, type ListQueryConfig, type RawListQuery } from "../utils/parseListQuery.js";
import { REVENUE_STATUSES } from "./orderStatsService.js";

/**
 * Admin read model for customers (role customer only). The list/detail metrics are
 * lifetime (no date window) and computed only for the ids on the page, in one
 * aggregate: never per-row queries.
 */

const LIST_CONFIG: ListQueryConfig = {
  sortable: ["createdAt", "firstName", "lastName", "email"],
  searchable: ["firstName", "lastName", "email"],
  defaultSort: "-createdAt",
  defaultLimit: 20,
};

const NOT_FOUND = "El cliente no existe.";
const EMPTY_STATS: CustomerStats = { orderCount: 0, spentMxn: 0, lastOrderAt: null };

interface CustomerLean {
  _id: Types.ObjectId;
  firstName: string;
  lastName: string;
  email: string;
  emailVerified?: boolean;
  createdAt: Date;
}

const statsFor = async (ids: Types.ObjectId[]): Promise<Map<string, CustomerStats>> => {
  const rows = await Order.aggregate<{ _id: Types.ObjectId; orderCount: number; spentMxn: number; lastOrderAt: Date }>([
    {
      $match: {
        user: { $in: ids },
        status: { $in: REVENUE_STATUSES },
        disputeStatus: { $ne: DisputeStatus.LOST },
      },
    },
    {
      $group: {
        _id: "$user",
        orderCount: { $sum: 1 },
        spentMxn: { $sum: NET_MXN_EXPR },
        lastOrderAt: { $max: "$createdAt" },
      },
    },
  ]);
  return new Map(
    rows.map((row) => [String(row._id), { orderCount: row.orderCount, spentMxn: row.spentMxn, lastOrderAt: row.lastOrderAt }]),
  );
};

const toAdminCustomer = (doc: CustomerLean, stats: CustomerStats | undefined): AdminCustomer => ({
  id: String(doc._id),
  firstName: doc.firstName,
  lastName: doc.lastName,
  email: doc.email,
  emailVerified: doc.emailVerified ?? false,
  createdAt: doc.createdAt,
  stats: stats ?? EMPTY_STATS,
});

const listAdminCustomers = async (query: RawListQuery): Promise<{ items: AdminCustomer[]; meta: ApiMeta }> => {
  const { filter, sort, skip, limit, page } = parseListQuery(query, LIST_CONFIG, { role: UserRole.CUSTOMER });
  const [docs, total] = await Promise.all([
    User.find(filter).select("firstName lastName email emailVerified createdAt").sort(sort).skip(skip).limit(limit).lean<CustomerLean[]>(),
    User.countDocuments(filter),
  ]);
  const stats = await statsFor(docs.map((doc) => doc._id));
  return {
    items: docs.map((doc) => toAdminCustomer(doc, stats.get(String(doc._id)))),
    meta: buildMeta(total, { page, limit }),
  };
};

const getAdminCustomerOrThrow = async (id: string): Promise<AdminCustomer> => {
  const doc = await User.findOne({ _id: new Types.ObjectId(id), role: UserRole.CUSTOMER })
    .select("firstName lastName email emailVerified createdAt")
    .lean<CustomerLean>();
  if (!doc) throw new AppError(NOT_FOUND, 404);
  const stats = await statsFor([doc._id]);
  return toAdminCustomer(doc, stats.get(String(doc._id)));
};

export { listAdminCustomers, getAdminCustomerOrThrow };
```

- [ ] **Step 5: Controller + routes** — in `customerController.ts` add:

```ts
import { getAdminCustomerOrThrow, listAdminCustomers } from "../services/adminCustomerService.js";

const list = asyncHandler(async (req: Request, res: Response) => {
  const { items, meta } = await listAdminCustomers(req.query);
  sendResponse(res, 200, "Clientes obtenidos correctamente.", { customers: items }, meta);
});

const detail = asyncHandler(async (req: Request, res: Response) => {
  const customer = await getAdminCustomerOrThrow(req.params.id as string);
  sendResponse(res, 200, "Cliente obtenido correctamente.", { customer });
});
```
export `{ top, list, detail }`. In `customerRoutes.ts` (after `/top`):

```ts
customerRouter.get("/", validate(customerListQuerySchema, "query"), list);
customerRouter.get("/:id", validate(objectIdParamSchema, "params"), detail);
```
importing `objectIdParamSchema` from `../../../validators/commonValidator.js` and `customerListQuerySchema`.

- [ ] **Step 6: Run** — `pnpm --filter @gira/api exec vitest run tests/integration/adminCustomers.test.ts tests/integration/customerTop.test.ts` · Expected: PASS.

---

## Task 6: Orders list filter `customer` (TDD)

**Files:** Modify `validators/adminOrderValidator.ts` (inside `adminOrderListQuerySchema`), `services/adminOrderService.ts`; Test `tests/integration/adminOrdersCustomerFilter.test.ts`.

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { OrderStatus } from "@gira/shared";
import { buildApp } from "../../src/app.js";
import { createCustomer, loginAsAdmin } from "../helpers/auth.js";
import { seedOrder } from "../helpers/seedOrder.js";

const app = buildApp();
const oid = (id: string) => new mongoose.Types.ObjectId(id);

describe("GET /admin/orders?customer=", () => {
  it("devuelve solo los pedidos de ese cliente", async () => {
    const cookie = await loginAsAdmin(app);
    const ana = await createCustomer({ email: "ana@example.com" });
    const luis = await createCustomer({ email: "luis@example.com" });
    await seedOrder({ status: OrderStatus.PAID, total: 10_000, createdAt: new Date(), user: oid(ana.id) });
    await seedOrder({ status: OrderStatus.PAID, total: 20_000, createdAt: new Date(), user: oid(luis.id) });
    await seedOrder({ status: OrderStatus.PAID, total: 30_000, createdAt: new Date() });
    const res = await request(app).get(`/api/v1/admin/orders?customer=${ana.id}`).set("cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body.data.orders).toHaveLength(1);
    expect(res.body.data.orders[0].user).toBe(ana.id);
  });

  it("400 si el id no es un ObjectId", async () => {
    const cookie = await loginAsAdmin(app);
    expect((await request(app).get("/api/v1/admin/orders?customer=zzz").set("cookie", cookie)).status).toBe(400);
  });
});
```

- [ ] **Step 2: Run** — FAIL (filter ignored / not rejected).

- [ ] **Step 3: Validator** — add inside `listQueryBase.keys({…})` of `adminOrderListQuerySchema`:

```ts
  customer: Joi.string()
    .hex()
    .length(24)
    .messages({ "string.hex": "El cliente no es válido.", "string.length": "El cliente no es válido." }),
```

- [ ] **Step 4: Service** — in `AdminOrderListQuery` add `/** A customer's user id (already validated as a 24-hex string). */ customer?: string;` and in `listAdminOrders` after the `orderNumber` line:
```ts
  if (query.customer) filters.user = new Types.ObjectId(query.customer);
```
(import `Types` from `mongoose` if not already).

- [ ] **Step 5: Run** — `pnpm --filter @gira/api exec vitest run tests/integration/adminOrdersCustomerFilter.test.ts` plus the existing admin orders list test file (`grep -l "admin/orders" apps/api/tests/integration`) · Expected: PASS.

---

## Task 7: Coupon email template + mail service (TDD)

**Files:** Create `templates/couponEmails.ts`, `services/couponMailService.ts`; Test `tests/unit/couponEmails.test.ts`.

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderCouponGift } from "../../src/templates/couponEmails.js";
import { sendCouponEmail } from "../../src/services/couponMailService.js";
import { getMailer } from "../../src/adapters/mailer/index.js";

const base = {
  firstName: "Ana",
  code: "GRACIAS-ANA",
  discountLabel: "15% de descuento",
};

describe("renderCouponGift", () => {
  it("incluye código, descuento y vigencia", () => {
    const mail = renderCouponGift({ ...base, endsAtLabel: "30 de noviembre de 2026", minSubtotalLabel: "$800.00" });
    expect(mail.subject).toBe("Un detalle de Gira para ti");
    expect(mail.html).toContain("GRACIAS-ANA");
    expect(mail.html).toContain("15% de descuento");
    expect(mail.html).toContain("Vigente hasta el 30 de noviembre de 2026");
    expect(mail.html).toContain("Compra mínima $800.00");
    expect(mail.text).toContain("GRACIAS-ANA");
  });

  it("escapa el mensaje del admin y el nombre (no es HTML)", () => {
    const mail = renderCouponGift({
      ...base,
      firstName: `<img src=x onerror=alert(1)>`,
      message: `<script>alert("x")</script>\nSegunda línea & más`,
    });
    expect(mail.html).not.toContain("<script>");
    expect(mail.html).not.toContain("<img");
    expect(mail.html).toContain("&lt;script&gt;");
    expect(mail.html).toContain("&amp; más");
    expect(mail.html).toContain("<br>");
    expect(mail.text).toContain("Segunda línea & más");
  });

  it("sin mensaje no deja un bloque vacío", () => {
    expect(renderCouponGift(base).html).not.toContain("data-message");
  });
});

describe("sendCouponEmail", () => {
  afterEach(() => vi.restoreAllMocks());

  it("devuelve true cuando el proveedor acepta", async () => {
    const spy = vi.spyOn(getMailer(), "send").mockResolvedValue({ providerId: "x" });
    expect(await sendCouponEmail({ to: "ana@example.com", ...base })).toBe(true);
    expect(spy.mock.calls[0]![0]).toMatchObject({ to: "ana@example.com" });
  });

  it("devuelve false y no lanza si el proveedor falla", async () => {
    vi.spyOn(getMailer(), "send").mockRejectedValue(new Error("boom"));
    expect(await sendCouponEmail({ to: "ana@example.com", ...base })).toBe(false);
  });
});
```

- [ ] **Step 2: Run** — `pnpm --filter @gira/api exec vitest run tests/unit/couponEmails.test.ts` · Expected: FAIL (modules missing).

- [ ] **Step 3: Template** `templates/couponEmails.ts`:

```ts
import { env } from "../config/env.js";
import { escapeHtml, layout, type RenderedMail } from "./emailLayout.js";

/**
 * Personal coupon email. `message` is the ONLY value here written by a human (the admin)
 * rather than composed by the code: it travels as plain text and is escaped explicitly
 * before it is placed in the HTML; line breaks become <br> AFTER escaping.
 */

interface CouponGiftInput {
  firstName: string;
  code: string;
  /** Ready to show: "15% de descuento" / "$150.00 de descuento". */
  discountLabel: string;
  /** "$800.00", already formatted. */
  minSubtotalLabel?: string;
  /** "30 de noviembre de 2026", already formatted. */
  endsAtLabel?: string;
  message?: string;
}

const toHtmlLines = (text: string): string => escapeHtml(text).replace(/\r?\n/g, "<br>");

const renderCouponGift = (input: CouponGiftInput): RenderedMail => {
  const details = [
    input.endsAtLabel ? `Vigente hasta el ${input.endsAtLabel}` : null,
    input.minSubtotalLabel ? `Compra mínima ${input.minSubtotalLabel}` : null,
  ].filter((line): line is string => line !== null);

  const html = layout(
    "Un detalle para tu próxima compra",
    `<p>Hola ${escapeHtml(input.firstName)}, queremos agradecerte por ser parte de Gira.</p>` +
      `<div style="border:2px dashed #0d0d0d;background:#d9f2d0;padding:16px;text-align:center;margin:16px 0">` +
      `<div style="font-size:14px">${escapeHtml(input.discountLabel)}</div>` +
      `<div style="font-family:monospace;font-size:24px;font-weight:700;margin:6px 0">${escapeHtml(input.code)}</div>` +
      details.map((line) => `<div style="font-size:12px;color:#3d3a33">${escapeHtml(line)}</div>`).join("") +
      `</div>` +
      (input.message ? `<p data-message style="font-size:16px">${toHtmlLines(input.message)}</p>` : "") +
      `<p><a href="${escapeHtml(env.clientUrl)}" style="background:#f5ff3d;color:#0d0d0d;padding:10px 20px;border:2px solid #0d0d0d;text-decoration:none;font-weight:700">Ir a la tienda</a></p>` +
      `<p style="font-size:12px;color:#666">Este cupón es personal. Si no lo quieres, ignora este mensaje.</p>`,
  );

  const text = [
    `Hola ${input.firstName}, queremos agradecerte por ser parte de Gira.`,
    "",
    `${input.discountLabel}: ${input.code}`,
    ...details,
    ...(input.message ? ["", input.message] : []),
    "",
    `Ir a la tienda: ${env.clientUrl}`,
    "Este cupón es personal. Si no lo quieres, ignora este mensaje.",
  ].join("\n");

  return { subject: "Un detalle de Gira para ti", html, text };
};

export type { CouponGiftInput };
export { renderCouponGift };
```

- [ ] **Step 4: Service** `services/couponMailService.ts`:

```ts
import { getMailer } from "../adapters/mailer/index.js";
import { logger } from "../config/logger.js";
import { renderCouponGift, type CouponGiftInput } from "../templates/couponEmails.js";

/**
 * Sends the personal coupon straight to the provider (no outbox): the admin is waiting
 * on the answer and needs to know whether it went out. Never rejects; a failure is
 * logged without recipient or code and reported as `false` so the coupon still stands.
 */

type SendCouponEmailInput = CouponGiftInput & { to: string };

const sendCouponEmail = async ({ to, ...content }: SendCouponEmailInput): Promise<boolean> => {
  try {
    await getMailer().send({ to, ...renderCouponGift(content) });
    return true;
  } catch (err) {
    logger.error(
      { kind: "coupon_gift", reason: err instanceof Error ? err.message : "unknown" },
      "No se pudo enviar el correo de un cupón personal",
    );
    return false;
  }
};

export type { SendCouponEmailInput };
export { sendCouponEmail };
```

- [ ] **Step 5: Run** — same command · Expected: PASS (5 tests).

---

## Task 8: Give coupon — `POST /admin/customers/:id/coupons` (TDD)

**Files:** Modify `services/couponService.ts`, `validators/couponValidator.ts`, `validators/customerValidator.ts`, `controllers/customerController.ts`, `routes/v1/admin/customerRoutes.ts`; Create `services/couponGrantService.ts`; Test `tests/integration/giveCoupon.test.ts`.

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect, afterEach, vi } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { AuditAction, OrderStatus } from "@gira/shared";
import { buildApp } from "../../src/app.js";
import { AuditLog } from "../../src/models/AuditLog.js";
import { Coupon } from "../../src/models/Coupon.js";
import { resolveCouponForCheckout } from "../../src/services/couponRulesService.js";
import { createCustomer, loginAsAdmin, loginAsCustomer, ORIGIN } from "../helpers/auth.js";
import { spyOnMailer, sentTo } from "../helpers/mail.js";

const app = buildApp();
const oid = (id: string) => new mongoose.Types.ObjectId(id);
const url = (id: string) => `/api/v1/admin/customers/${id}/coupons`;
const body = (overrides: Record<string, unknown> = {}) => ({
  code: "GRACIAS-ANA",
  discountType: "percent",
  percentOff: 15,
  message: "Gracias por estar con nosotros.",
  ...overrides,
});
const post = (cookie: string, id: string, payload: Record<string, unknown>) =>
  request(app).post(url(id)).set("Origin", ORIGIN).set("Cookie", cookie).send(payload);

afterEach(() => vi.restoreAllMocks());

describe("POST /admin/customers/:id/coupons", () => {
  it("401 / 403", async () => {
    const ana = await createCustomer();
    expect((await request(app).post(url(ana.id)).set("Origin", ORIGIN).send(body())).status).toBe(401);
    const cookie = await loginAsCustomer(app);
    expect((await post(cookie, ana.id, body())).status).toBe(403);
  });

  it("crea un cupón personal de un solo uso, manda el correo y audita sin PII", async () => {
    const spy = spyOnMailer();
    const cookie = await loginAsAdmin(app);
    const ana = await createCustomer({ email: "ana@example.com" });
    const res = await post(cookie, ana.id, body({ minSubtotalMxn: 80_000 }));
    expect(res.status).toBe(201);
    expect(res.body.data.emailSent).toBe(true);
    expect(res.body.data.coupon).toMatchObject({
      code: "GRACIAS-ANA",
      kind: "personal",
      maxRedemptions: 1,
      minSubtotalMxn: 80_000,
      assignedCustomer: { id: ana.id },
    });
    const mails = sentTo(spy, "ana@example.com");
    expect(mails).toHaveLength(1);
    expect(mails[0]!.html).toContain("GRACIAS-ANA");
    expect(mails[0]!.html).toContain("Gracias por estar con nosotros.");

    const audit = await AuditLog.findOne({ action: AuditAction.COUPON_GRANTED }).lean();
    expect(audit).toBeTruthy();
    expect(JSON.stringify(audit)).not.toContain("ana@example.com");
    expect(JSON.stringify(audit)).not.toContain("Gracias por estar");
  });

  it("solo el cliente asignado lo puede canjear", async () => {
    const cookie = await loginAsAdmin(app);
    const ana = await createCustomer({ email: "ana@example.com" });
    const luis = await createCustomer({ email: "luis@example.com" });
    await post(cookie, ana.id, body());
    await expect(resolveCouponForCheckout("GRACIAS-ANA", oid(luis.id))).rejects.toMatchObject({ message: "El cupón no es válido." });
    await expect(resolveCouponForCheckout("GRACIAS-ANA", oid(ana.id))).resolves.toBeTruthy();
  });

  it("si el correo falla el cupón queda creado y la respuesta lo avisa", async () => {
    const spy = spyOnMailer();
    spy.mockRejectedValue(new Error("down"));
    const cookie = await loginAsAdmin(app);
    const ana = await createCustomer();
    const res = await post(cookie, ana.id, body());
    expect(res.status).toBe(201);
    expect(res.body.data.emailSent).toBe(false);
    expect(await Coupon.countDocuments({ code: "GRACIAS-ANA" })).toBe(1);
  });

  it("409 con el mensaje de código duplicado", async () => {
    const cookie = await loginAsAdmin(app);
    const ana = await createCustomer();
    await post(cookie, ana.id, body());
    const again = await post(cookie, ana.id, body());
    expect(again.status).toBe(409);
    expect(again.body.message).toBe("Ya existe un cupón con este código.");
  });

  it("404 para un cliente inexistente y 400 para datos inválidos", async () => {
    const cookie = await loginAsAdmin(app);
    expect((await post(cookie, String(new mongoose.Types.ObjectId()), body())).status).toBe(404);
    const ana = await createCustomer();
    expect((await post(cookie, ana.id, body({ percentOff: 500 }))).status).toBe(400);
    expect((await post(cookie, ana.id, body({ message: "x".repeat(501) }))).status).toBe(400);
  });

  it("ignora kind, assignedUser y maxRedemptions que mande el cliente HTTP", async () => {
    const cookie = await loginAsAdmin(app);
    const ana = await createCustomer();
    const other = await createCustomer({ email: "otro@example.com" });
    const res = await post(cookie, ana.id, body({ kind: "campaign", assignedUser: other.id, maxRedemptions: 50, name: "hack" }));
    expect(res.status).toBe(201);
    expect(res.body.data.coupon).toMatchObject({ kind: "personal", maxRedemptions: 1, assignedCustomer: { id: ana.id } });
    expect(res.body.data.coupon.name).not.toBe("hack");
  });
});
```
> El canje atómico del cupón (un solo uso, snapshot en la orden) ya lo cubre `couponRedemption.test.ts`; aquí solo se prueba la asignación y el correo. Quita `OrderStatus` del import de `@gira/shared` en este archivo (no se usa).

- [ ] **Step 2: Run** — `pnpm --filter @gira/api exec vitest run tests/integration/giveCoupon.test.ts` · Expected: FAIL (404 route).

- [ ] **Step 3: `couponService.createCoupon`** — extend the input and the audit helper:

```ts
interface CreateCouponInput {
  /* …existing fields… */
  /** Set by couponGrantService only; the HTTP validator never lets a client send them. */
  kind?: CouponKind;
  assignedUser?: Types.ObjectId;
}
```
Import `CouponKind` from `@gira/shared` and `type Types` from `mongoose`. Replace the private `audit` with:

```ts
const audit = (action: AuditAction, id: string, ctx: RequestContext, after?: Record<string, unknown>): Promise<void> =>
  recordAudit({
    actorId: ctx.actorId,
    actorType: "user",
    action,
    module: AuditModule.COUPONS,
    targetId: id,
    ...(after ? { after } : {}),
    ip: ctx.ip,
  });
```
In `Coupon.create({...})` add `...(input.kind ? { kind: input.kind } : {}), ...(input.assignedUser ? { assignedUser: input.assignedUser } : {}),` and replace the final audit call:

```ts
  if (input.kind === CouponKind.PERSONAL) {
    await audit(AuditAction.COUPON_GRANTED, id, ctx, { customerId: String(input.assignedUser) });
  } else {
    await audit(AuditAction.COUPON_CREATED, id, ctx);
  }
```

- [ ] **Step 4: Validators** — in `couponValidator.ts` add (it owns the field definitions) and export:

```ts
import { COUPON_MESSAGE_MAX } from "@gira/shared";

const message = Joi.string()
  .trim()
  .max(COUPON_MESSAGE_MAX)
  .allow("")
  .messages({ "string.max": `El mensaje no puede exceder ${COUPON_MESSAGE_MAX} caracteres.` });

/** Personal coupon from the customer's page: no name, no cap (fixed to one use), no kind/owner (the URL decides). */
const giveCouponSchema = Joi.object({
  code: code.required(),
  discountType: Joi.string()
    .valid(...Object.values(CouponDiscountType))
    .required()
    .messages({ "any.required": "Elige el tipo de descuento.", "any.only": "El tipo de descuento no es válido." }),
  percentOff: Joi.when("discountType", { is: CouponDiscountType.PERCENT, then: percentOff.required(), otherwise: Joi.forbidden() }),
  amountOffMxn: Joi.when("discountType", { is: CouponDiscountType.FIXED, then: amountOffMxn.required(), otherwise: Joi.forbidden() }),
  minSubtotalMxn,
  startsAt,
  endsAt,
  message,
});
```
Add `giveCouponSchema` to the export list. (Joi's `stripUnknown` drops `kind`, `assignedUser`, `maxRedemptions`, `name`.)

Also add the `clase` filter now (used in Task 9): in the same file

```ts
import { COUPON_KIND_FILTERS } from "@gira/shared";

const couponListQuerySchema = listQueryBase.keys({
  estado: Joi.string().valid(...COUPON_STATUS_FILTERS).default("todos"),
  clase: Joi.string().valid(...COUPON_KIND_FILTERS).default("todos"),
});
```

- [ ] **Step 5: Service** `services/couponGrantService.ts`:

```ts
import type { Types } from "mongoose";
import { CouponDiscountType, CouponKind, Currency, UserRole, type GiveCouponResult } from "@gira/shared";
import { User } from "../models/User.js";
import { AppError } from "../utils/AppError.js";
import type { RequestContext } from "../utils/requestContext.js";
import { formatMoney } from "../templates/orderEmails.js";
import { getAdminCouponOrThrow } from "./adminCouponService.js";
import { sendCouponEmail } from "./couponMailService.js";
import { createCoupon } from "./couponService.js";

/**
 * A personal coupon: created for ONE customer (kind personal, assignedUser, one use) and
 * emailed to them. The coupon is the source of truth: if the email fails it still
 * exists and the panel is told (`emailSent: false`) so the admin can pass the code on.
 */

interface GiveCouponInput {
  code: string;
  discountType: CouponDiscountType;
  percentOff?: number;
  amountOffMxn?: number;
  minSubtotalMxn?: number;
  startsAt?: Date | null;
  endsAt?: Date | null;
  message?: string;
}

const MX_DATE = new Intl.DateTimeFormat("es-MX", { timeZone: "America/Mexico_City", dateStyle: "long" });

const giveCouponToCustomer = async (
  customerId: string | Types.ObjectId,
  input: GiveCouponInput,
  ctx: RequestContext,
): Promise<GiveCouponResult> => {
  const customer = await User.findOne({ _id: customerId, role: UserRole.CUSTOMER, isActive: true }).select(
    "firstName lastName email",
  );
  if (!customer) throw new AppError("El cliente no existe.", 404);

  const { id } = await createCoupon(
    {
      code: input.code,
      name: `Personal · ${customer.firstName} ${customer.lastName}`.slice(0, 80),
      discountType: input.discountType,
      ...(input.percentOff !== undefined ? { percentOff: input.percentOff } : {}),
      ...(input.amountOffMxn !== undefined ? { amountOffMxn: input.amountOffMxn } : {}),
      ...(input.minSubtotalMxn !== undefined ? { minSubtotalMxn: input.minSubtotalMxn } : {}),
      startsAt: input.startsAt ?? null,
      endsAt: input.endsAt ?? null,
      maxRedemptions: 1,
      kind: CouponKind.PERSONAL,
      assignedUser: customer._id,
    },
    ctx,
  );

  const coupon = await getAdminCouponOrThrow(id);
  const message = input.message?.trim();
  const emailSent = await sendCouponEmail({
    to: customer.email,
    firstName: customer.firstName,
    code: coupon.code,
    discountLabel:
      coupon.discountType === CouponDiscountType.PERCENT
        ? `${coupon.percentOff ?? 0}% de descuento`
        : `${formatMoney(coupon.amountOffMxn ?? 0, Currency.MXN)} de descuento`,
    ...(coupon.minSubtotalMxn > 0 ? { minSubtotalLabel: formatMoney(coupon.minSubtotalMxn, Currency.MXN) } : {}),
    ...(coupon.endsAt ? { endsAtLabel: MX_DATE.format(new Date(coupon.endsAt)) } : {}),
    ...(message ? { message } : {}),
  });

  return { coupon, emailSent };
};

export type { GiveCouponInput };
export { giveCouponToCustomer };
```

- [ ] **Step 6: Admin DTO needs `kind`/`assignedCustomer`** — este test lo afirma (`coupon.kind`, `assignedCustomer`), así que implementa **antes** el paso 3 de Task 9 (`adminCouponService`: `kind`, `assignedDoc`, `getAdminCouponOrThrow`) y luego vuelve aquí; los tests de Task 9 cubren además el filtro `clase`.

- [ ] **Step 7: Controller + route** — controller:

```ts
import { buildContext } from "../utils/requestContext.js";
import { giveCouponToCustomer, type GiveCouponInput } from "../services/couponGrantService.js";

const giveCoupon = asyncHandler(async (req: Request, res: Response) => {
  const result = await giveCouponToCustomer(req.params.id as string, req.body as GiveCouponInput, buildContext(req));
  sendResponse(res, 201, result.emailSent ? "Cupón enviado correctamente." : "Cupón creado, pero el correo no salió.", result);
});
```
route (declare with the others): `customerRouter.post("/:id/coupons", validate(objectIdParamSchema, "params"), validate(giveCouponSchema), giveCoupon);` importing `giveCouponSchema` from `couponValidator.js`.

- [ ] **Step 8: Run** — `pnpm --filter @gira/api exec vitest run tests/integration/giveCoupon.test.ts` · Expected: PASS (7 tests, sin el `it` de sanidad).

---

## Task 9: Admin coupons DTO — `kind`, `assignedCustomer`, filtro `clase` (TDD)

**Files:** Modify `services/adminCouponService.ts`, `controllers/couponController.ts` (none needed: `req.query` already passes `clase`); Test `tests/integration/adminCouponsKind.test.ts`.

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { CouponDiscountType, CouponKind } from "@gira/shared";
import { buildApp } from "../../src/app.js";
import { Coupon } from "../../src/models/Coupon.js";
import { createCustomer, loginAsAdmin } from "../helpers/auth.js";

const app = buildApp();
const BASE = "/api/v1/admin/coupons";

const seed = async () => {
  const ana = await createCustomer({ email: "ana@example.com" });
  await Coupon.create({ code: "VERANO10", name: "Verano", discountType: CouponDiscountType.PERCENT, percentOff: 10 });
  await Coupon.create({
    code: "GRACIAS-ANA",
    name: "Personal · Cliente Prueba",
    discountType: CouponDiscountType.PERCENT,
    percentOff: 15,
    kind: CouponKind.PERSONAL,
    assignedUser: new mongoose.Types.ObjectId(ana.id),
    maxRedemptions: 1,
  });
  return ana;
};

describe("Admin coupons · clase", () => {
  it("el DTO trae kind y el cliente asignado solo en los personales", async () => {
    const cookie = await loginAsAdmin(app);
    const ana = await seed();
    const res = await request(app).get(BASE).set("cookie", cookie);
    const byCode = Object.fromEntries(res.body.data.coupons.map((c: { code: string }) => [c.code, c]));
    expect(byCode.VERANO10).toMatchObject({ kind: "campaign" });
    expect(byCode.VERANO10).not.toHaveProperty("assignedCustomer");
    expect(byCode["GRACIAS-ANA"]).toMatchObject({
      kind: "personal",
      assignedCustomer: { id: ana.id, firstName: "Cliente", lastName: "Prueba" },
    });
    expect(JSON.stringify(res.body)).not.toContain("ana@example.com");
  });

  it("filtra por clase", async () => {
    const cookie = await loginAsAdmin(app);
    await seed();
    const camp = await request(app).get(`${BASE}?clase=campanas`).set("cookie", cookie);
    const pers = await request(app).get(`${BASE}?clase=personales`).set("cookie", cookie);
    expect(camp.body.data.coupons.map((c: { code: string }) => c.code)).toEqual(["VERANO10"]);
    expect(pers.body.data.coupons.map((c: { code: string }) => c.code)).toEqual(["GRACIAS-ANA"]);
    expect((await request(app).get(`${BASE}?clase=otra`).set("cookie", cookie)).status).toBe(400);
  });

  it("el detalle también trae el cliente asignado", async () => {
    const cookie = await loginAsAdmin(app);
    await seed();
    const coupon = await Coupon.findOne({ code: "GRACIAS-ANA" });
    const res = await request(app).get(`${BASE}/${coupon!.id}`).set("cookie", cookie);
    expect(res.body.data.coupon.assignedCustomer).toBeTruthy();
  });

  it("al crear una campaña por POST /admin/coupons ignora kind y assignedUser", async () => {
    const cookie = await loginAsAdmin(app);
    const ana = await createCustomer();
    const res = await request(app)
      .post(BASE)
      .set("Origin", "http://localhost:3000")
      .set("cookie", cookie)
      .send({ code: "CAMP10", name: "Camp", discountType: "percent", percentOff: 10, kind: "personal", assignedUser: ana.id });
    expect(res.status).toBe(201);
    expect(res.body.data.coupon.kind).toBe("campaign");
  });
});
```

- [ ] **Step 2: Run** — `pnpm --filter @gira/api exec vitest run tests/integration/adminCouponsKind.test.ts` · Expected: FAIL.

- [ ] **Step 3: `adminCouponService.ts`** — imports: add `CouponKind`, `COUPON_KIND_FILTERS` and `import { User } from "../models/User.js";`. Types/rows:

```ts
type CouponKindFilter = (typeof COUPON_KIND_FILTERS)[number];

interface AdminCouponListQuery {
  /* …existing… */
  clase?: CouponKindFilter;
}

interface CouponRow {
  /* …existing… */
  kind?: CouponKind;
  assignedUser?: Types.ObjectId;
  assignedDoc?: { _id: Types.ObjectId; firstName: string; lastName: string }[];
}

/** Campaign also matches coupons created before M12b (no `kind` stored). */
const kindFilter = (clase: CouponKindFilter): Record<string, unknown> | undefined => {
  if (clase === "personales") return { kind: CouponKind.PERSONAL };
  if (clase === "campanas") return { kind: { $ne: CouponKind.PERSONAL } };
  return undefined;
};
```
`toAdminCoupon` gains, after `name`:
```ts
  kind: row.kind ?? CouponKind.CAMPAIGN,
  ...(row.assignedDoc?.[0]
    ? { assignedCustomer: { id: String(row.assignedDoc[0]._id), firstName: row.assignedDoc[0].firstName, lastName: row.assignedDoc[0].lastName } }
    : {}),
```
`listAdminCoupons`: build filters `{ ...(status ?? {}), ...(kindFilter(query.clase ?? "todos") ?? {}) }` (pass to `parseListQuery` as third arg), and inside `$facet.rows` append after `$limit`:
```ts
{
  $lookup: {
    from: User.collection.name,
    localField: "assignedUser",
    foreignField: "_id",
    pipeline: [{ $project: { firstName: 1, lastName: 1 } }],
    as: "assignedDoc",
  },
},
```
`getAdminCouponOrThrow`: after the `lean`, if `row.assignedUser` do
```ts
  const owner = row.assignedUser
    ? await User.findById(row.assignedUser).select("firstName lastName").lean<{ _id: Types.ObjectId; firstName: string; lastName: string }>()
    : null;
  return toAdminCoupon(owner ? { ...row, assignedDoc: [owner] } : row, new Date());
```

- [ ] **Step 4: Run** — new test + `adminCoupons.test.ts` + `adminCouponsDto.test.ts` + `giveCoupon.test.ts` · Expected: PASS.

- [ ] **Step 5: API gate** — `pnpm --filter @gira/api exec tsc --noEmit` (confirm the typecheck script name in `apps/api/package.json` first) · Expected: no errors. Then `pnpm --filter @gira/api test` (flake conocido: re-correr el archivo aislado).

---

## Task 10: Web — paths, panel models, filters (TDD)

**Files:** Modify `lib/api/paths.ts`; Create `lib/customers/panelCustomer.ts`, `lib/customers/filters.ts`; Tests `tests/lib/customers/{panelCustomer,filters}.test.ts`.

- [ ] **Step 1: `paths.ts`** — add `const ADMIN_CUSTOMERS_PATH = "/admin/customers";` and export it.

- [ ] **Step 2: Failing tests** `tests/lib/customers/filters.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  applyFilterPatch,
  buildCustomerListQuery,
  buildTopQuery,
  parseCustomerFilters,
  toSearchParams,
} from "@/lib/customers/filters";

describe("customer filters", () => {
  it("por defecto: mes, gasto, sin búsqueda, página 1", () => {
    expect(parseCustomerFilters({})).toEqual({ period: "month", sortBy: "spent", page: 1 });
  });

  it("lee las palabras en español de la URL", () => {
    expect(parseCustomerFilters({ periodo: "hoy", orden: "compras", q: " ana ", page: "3" })).toEqual({
      period: "today",
      sortBy: "orders",
      search: "ana",
      page: 3,
    });
  });

  it("ignora valores no permitidos", () => {
    expect(parseCustomerFilters({ periodo: "año", orden: "x", page: "-2" })).toEqual({ period: "month", sortBy: "spent", page: 1 });
  });

  it("serializa sin los valores por defecto", () => {
    expect(toSearchParams({ period: "month", sortBy: "spent", page: 1 })).toBe("");
    expect(toSearchParams({ period: "week", sortBy: "orders", search: "ana", page: 2 })).toBe("periodo=semana&orden=compras&q=ana&page=2");
  });

  it("cambiar el periodo no reinicia la búsqueda pero sí la página; cambiar la página la conserva", () => {
    const base = { period: "month", sortBy: "spent", search: "ana", page: 4 } as const;
    expect(applyFilterPatch(base, { period: "week" })).toEqual({ period: "week", sortBy: "spent", search: "ana", page: 1 });
    expect(applyFilterPatch(base, { page: 5 }).page).toBe(5);
    expect(applyFilterPatch(base, { search: undefined })).toEqual({ period: "month", sortBy: "spent", page: 1 });
  });

  it("arma las consultas del API", () => {
    expect(buildTopQuery({ period: "week", sortBy: "orders", page: 1 })).toBe("period=week&sortBy=orders");
    expect(buildCustomerListQuery({ period: "month", sortBy: "spent", search: "ana", page: 2 })).toBe("search=ana&page=2&limit=20");
  });
});
```
`tests/lib/customers/panelCustomer.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { customerFullName, toPanelCustomer } from "@/lib/customers/panelCustomer";

describe("panelCustomer", () => {
  it("aplana las métricas y arma el nombre", () => {
    const customer = toPanelCustomer({
      id: "68f2ab12c3d4e5f6a7b8caa1",
      firstName: "Ana",
      lastName: "Pérez",
      email: "ana@example.com",
      emailVerified: true,
      createdAt: "2026-03-12T10:00:00.000Z",
      stats: { orderCount: 2, spentMxn: 55_000, lastOrderAt: null },
    });
    expect(customer).toMatchObject({ orderCount: 2, spentMxn: 55_000, lastOrderAt: null });
    expect(customerFullName(customer)).toBe("Ana Pérez");
  });
});
```

- [ ] **Step 3: Run** — `pnpm --filter @gira/web exec vitest run tests/lib/customers` · Expected: FAIL.

- [ ] **Step 4: `lib/customers/panelCustomer.ts`**

```ts
import type { AdminCustomer, TopCustomer, Wire } from "@gira/shared";

/** A customer as the list and the detail hold it: metrics flattened, no nesting to remember. */
interface PanelCustomer {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  emailVerified: boolean;
  createdAt: string;
  orderCount: number;
  /** Net MXN centavos. */
  spentMxn: number;
  lastOrderAt: string | null;
}

type PanelTopCustomer = Wire<TopCustomer>;

const toPanelCustomer = (customer: Wire<AdminCustomer>): PanelCustomer => ({
  id: customer.id,
  firstName: customer.firstName,
  lastName: customer.lastName,
  email: customer.email,
  emailVerified: customer.emailVerified,
  createdAt: customer.createdAt,
  orderCount: customer.stats.orderCount,
  spentMxn: customer.stats.spentMxn,
  lastOrderAt: customer.stats.lastOrderAt,
});

const customerFullName = (customer: { firstName: string; lastName: string }): string =>
  `${customer.firstName} ${customer.lastName}`.trim();

export type { PanelCustomer, PanelTopCustomer };
export { toPanelCustomer, customerFullName };
```

- [ ] **Step 5: `lib/customers/filters.ts`**

```ts
import type { CustomerRankPeriod, CustomerRankSort } from "@gira/shared";

const DEFAULT_PERIOD: CustomerRankPeriod = "month";
const DEFAULT_SORT: CustomerRankSort = "spent";
const DEFAULT_LIMIT = 20;
const MAX_SEARCH_LENGTH = 80;
/** The URL key that opens the «Dar cupón» modal on the detail page (`?cupon=nuevo`). */
const GIVE_COUPON_PARAM = "cupon";

/** Spanish words in the page URL; the API takes the English enum values. */
const PERIOD_TO_URL: Readonly<Record<CustomerRankPeriod, string>> = { today: "hoy", week: "semana", month: "mes" };
const URL_TO_PERIOD: Readonly<Record<string, CustomerRankPeriod>> = Object.fromEntries(
  Object.entries(PERIOD_TO_URL).map(([period, word]) => [word, period as CustomerRankPeriod]),
);
const SORT_TO_URL: Readonly<Record<CustomerRankSort, string>> = { spent: "gasto", orders: "compras" };
const URL_TO_SORT: Readonly<Record<string, CustomerRankSort>> = Object.fromEntries(
  Object.entries(SORT_TO_URL).map(([sort, word]) => [word, sort as CustomerRankSort]),
);

interface CustomerFilters {
  period: CustomerRankPeriod;
  sortBy: CustomerRankSort;
  search?: string;
  page: number;
}

/** `search: undefined` means "clear the search". */
interface CustomerFilterPatch {
  period?: CustomerRankPeriod;
  sortBy?: CustomerRankSort;
  search?: string | undefined;
  page?: number;
}

type RawParams = Record<string, string | string[] | undefined>;

const firstOf = (value: string | string[] | undefined): string | undefined => (Array.isArray(value) ? value[0] : value);

const parseCustomerFilters = (params: RawParams): CustomerFilters => {
  const search = firstOf(params.q)?.trim().slice(0, MAX_SEARCH_LENGTH);
  const page = Number(firstOf(params.page));
  const filters: CustomerFilters = {
    period: URL_TO_PERIOD[firstOf(params.periodo) ?? ""] ?? DEFAULT_PERIOD,
    sortBy: URL_TO_SORT[firstOf(params.orden) ?? ""] ?? DEFAULT_SORT,
    page: Number.isInteger(page) && page >= 1 ? page : 1,
  };
  if (search) filters.search = search;
  return filters;
};

/** Query string for GET /admin/customers/top: only the ranking's own filters. */
const buildTopQuery = (filters: CustomerFilters): string =>
  new URLSearchParams({ period: filters.period, sortBy: filters.sortBy }).toString();

/** Query string for GET /admin/customers: only the table's own filters. */
const buildCustomerListQuery = (filters: CustomerFilters, limit: number = DEFAULT_LIMIT): string => {
  const query = new URLSearchParams();
  if (filters.search) query.set("search", filters.search);
  query.set("page", String(filters.page));
  query.set("limit", String(limit));
  return query.toString();
};

/** Page URL params: defaults are omitted so a fresh visit has a clean URL. */
const toSearchParams = (filters: CustomerFilters): string => {
  const params = new URLSearchParams();
  if (filters.period !== DEFAULT_PERIOD) params.set("periodo", PERIOD_TO_URL[filters.period]);
  if (filters.sortBy !== DEFAULT_SORT) params.set("orden", SORT_TO_URL[filters.sortBy]);
  if (filters.search) params.set("q", filters.search);
  if (filters.page !== 1) params.set("page", String(filters.page));
  return params.toString();
};

/** Any change other than the page itself goes back to page 1. */
const applyFilterPatch = (current: CustomerFilters, patch: CustomerFilterPatch): CustomerFilters => {
  const merged: CustomerFilters = {
    period: patch.period ?? current.period,
    sortBy: patch.sortBy ?? current.sortBy,
    page: patch.page ?? 1,
  };
  const search = "search" in patch ? patch.search : current.search;
  if (search) merged.search = search;
  return merged;
};

export {
  DEFAULT_PERIOD,
  DEFAULT_SORT,
  DEFAULT_LIMIT,
  GIVE_COUPON_PARAM,
  PERIOD_TO_URL,
  parseCustomerFilters,
  buildTopQuery,
  buildCustomerListQuery,
  toSearchParams,
  applyFilterPatch,
};
export type { CustomerFilters, CustomerFilterPatch };
```

- [ ] **Step 6: Run** — `pnpm --filter @gira/web exec vitest run tests/lib/customers` · Expected: PASS.

---

## Task 11: Web — API client + hooks (TDD)

**Files:** Create `lib/api/adminCustomers.ts`, `hooks/{useTopCustomers,useCustomerList,useCustomerDetail}.ts`; Tests `tests/lib/api/adminCustomers.test.ts`, `tests/hooks/useTopCustomers.test.tsx`.

- [ ] **Step 1: Failing client test** (uses `stubFetch`/`jsonResponse` from `tests/helpers/fetchMock.ts`; mirror `tests/lib/api/adminCoupons.test.ts` for the setup lines):

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { customerClient } from "@/lib/api/adminCustomers";
import { jsonResponse, stubFetch } from "../../helpers/fetchMock";

const ID = "68f2ab12c3d4e5f6a7b8caa1";

describe("customerClient", () => {
  let fetchMock: ReturnType<typeof stubFetch>;
  beforeEach(() => {
    fetchMock = stubFetch();
  });

  it("top llama a /admin/customers/top con la consulta", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, { data: { ranking: { period: "month", sortBy: "spent", from: "x", to: "y", rows: [] } } }),
    );
    const ranking = await customerClient.top("period=month&sortBy=spent");
    expect(String(fetchMock.mock.calls[0]![0])).toContain("/admin/customers/top?period=month&sortBy=spent");
    expect(ranking.rows).toEqual([]);
  });

  it("list devuelve clientes aplanados y la paginación", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        data: { customers: [{ id: ID, firstName: "Ana", lastName: "P", email: "a@x.mx", emailVerified: true, createdAt: "2026-01-01T00:00:00.000Z", stats: { orderCount: 1, spentMxn: 100, lastOrderAt: null } }] },
        meta: { total: 1, page: 1, pages: 1, limit: 20 },
      }),
    );
    const { items, meta } = await customerClient.list("page=1&limit=20");
    expect(items[0]).toMatchObject({ orderCount: 1, spentMxn: 100 });
    expect(meta.total).toBe(1);
  });

  it("rechaza un id mal formado antes de pedir nada", async () => {
    await expect(customerClient.get("zzz")).rejects.toThrow("El identificador del cliente no es válido.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("giveCoupon hace POST y devuelve cupón y emailSent", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(201, { data: { coupon: { id: ID, code: "X", name: "n", kind: "personal", discountType: "percent", percentOff: 10, minSubtotalMxn: 0, redeemedCount: 0, isActive: true, status: "active", createdAt: "", updatedAt: "" }, emailSent: false } }),
    );
    const result = await customerClient.giveCoupon(ID, { code: "GRACIAS-ANA", discountType: "percent", percentOff: 15 });
    expect(fetchMock.mock.calls[0]![1]).toMatchObject({ method: "POST" });
    expect(result.emailSent).toBe(false);
  });
});
```

- [ ] **Step 2: Client** `lib/api/adminCustomers.ts`

```ts
import type { AdminCustomer, ApiMeta, GiveCouponResult, TopCustomers, Wire } from "@gira/shared";
import type { GiveCouponBody } from "@/lib/customers/giveCouponForm";
import { isObjectId } from "@/lib/inventory/variantId";
import { toPanelCoupon, type PanelCoupon } from "@/lib/coupons/panelCoupon";
import { toPanelCustomer, type PanelCustomer } from "@/lib/customers/panelCustomer";
import { ApiError } from "./ApiError";
import { browserRequest } from "./browser";
import { ADMIN_CUSTOMERS_PATH } from "./paths";
import { expectData } from "./request";

/** Browser-side client for /admin/customers (reads refresh in the client; the POST needs a real Origin). */

interface CustomerClient {
  top: (query: string) => Promise<Wire<TopCustomers>>;
  list: (query: string) => Promise<{ items: PanelCustomer[]; meta: ApiMeta }>;
  get: (id: string) => Promise<PanelCustomer>;
  giveCoupon: (id: string, body: GiveCouponBody) => Promise<{ coupon: PanelCoupon; emailSent: boolean }>;
}

const assertCustomerId = (value: string): string => {
  if (!isObjectId(value)) throw new ApiError("El identificador del cliente no es válido.", "parse");
  return value;
};

const customerClient: CustomerClient = {
  top: async (query) => expectData(await browserRequest<{ ranking: Wire<TopCustomers> }>(`${ADMIN_CUSTOMERS_PATH}/top?${query}`)).ranking,
  list: async (query) => {
    const result = await browserRequest<{ customers: Wire<AdminCustomer>[] }>(`${ADMIN_CUSTOMERS_PATH}?${query}`);
    const customers = expectData(result).customers ?? [];
    return {
      items: customers.map(toPanelCustomer),
      meta: result.meta ?? { total: customers.length, page: 1, pages: 1, limit: customers.length },
    };
  },
  get: async (id) =>
    toPanelCustomer(expectData(await browserRequest<{ customer: Wire<AdminCustomer> }>(`${ADMIN_CUSTOMERS_PATH}/${assertCustomerId(id)}`)).customer),
  giveCoupon: async (id, body) => {
    const data = expectData(
      await browserRequest<Wire<GiveCouponResult>>(`${ADMIN_CUSTOMERS_PATH}/${assertCustomerId(id)}/coupons`, { method: "POST", body }),
    );
    return { coupon: toPanelCoupon(data.coupon), emailSent: data.emailSent };
  },
};

export { customerClient };
export type { CustomerClient };
```
(`ApiError` constructor second arg `"parse"` mirrors `adminCoupons.ts`.)

- [ ] **Step 3: Hooks** — the three read hooks follow `useCouponList`'s pattern (cancelled flag, silent refresh, «Reintentar» via `refresh`). Write them compactly:

`hooks/useTopCustomers.ts`
```ts
"use client";

import type { TopCustomers, Wire } from "@gira/shared";
import { useCallback, useEffect, useState } from "react";
import { customerClient } from "@/lib/api/adminCustomers";
import { isApiError } from "@/lib/api/ApiError";
import { buildTopQuery, type CustomerFilters } from "@/lib/customers/filters";

type TopStatus = "loading" | "error" | "ready";
interface TopState {
  status: TopStatus;
  ranking: Wire<TopCustomers> | null;
  error: string | null;
}
interface UseTopCustomers extends TopState {
  refresh: () => void;
}

const INITIAL: TopState = { status: "loading", ranking: null, error: null };
const GENERIC_ERROR = "No se pudo cargar el ranking.";

/** The ranking depends only on period and order: typing in the search box never refetches it. */
const useTopCustomers = (filters: Pick<CustomerFilters, "period" | "sortBy">): UseTopCustomers => {
  const query = buildTopQuery({ ...filters, page: 1 });
  const [state, setState] = useState<TopState>(INITIAL);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState((previous) => (previous.status === "ready" ? { ...previous, status: "loading" } : INITIAL));
    customerClient
      .top(query)
      .then((ranking) => {
        if (!cancelled) setState({ status: "ready", ranking, error: null });
      })
      .catch((failure: unknown) => {
        if (!cancelled) setState({ status: "error", ranking: null, error: isApiError(failure) ? failure.message : GENERIC_ERROR });
      });
    return () => {
      cancelled = true;
    };
  }, [query, version]);

  const refresh = useCallback(() => setVersion((current) => current + 1), []);
  return { ...state, refresh };
};

export type { UseTopCustomers };
export { useTopCustomers };
```

`hooks/useCustomerList.ts`: same shape as `useCouponList` (copy it, replacing `couponClient`→`customerClient`, `buildCouponListQuery`→`buildCustomerListQuery`, `PanelCoupon`→`PanelCustomer`, `CouponFilters`→`CustomerFilters`, `GENERIC_ERROR = "No se pudieron cargar los clientes."`), exporting `useCustomerList`.

`hooks/useCustomerDetail.ts`:
```ts
"use client";

import { useCallback, useEffect, useState } from "react";
import { customerClient } from "@/lib/api/adminCustomers";
import { listOrders } from "@/lib/api/adminOrders";
import { isApiError } from "@/lib/api/ApiError";
import type { PanelCustomer } from "@/lib/customers/panelCustomer";
import type { PanelOrder } from "@/lib/orders/panelOrder";

type Status = "loading" | "error" | "ready";
interface Section<T> {
  status: Status;
  data: T | null;
  error: string | null;
  /** 404: the link is old; retrying will not help. */
  gone: boolean;
}

const LOADING = { status: "loading", data: null, error: null, gone: false } as const;
const RECENT_ORDERS_LIMIT = 5;

const useSection = <T>(load: () => Promise<T>, key: string, genericError: string) => {
  const [state, setState] = useState<Section<T>>(LOADING);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setState(LOADING);
    load()
      .then((data) => {
        if (!cancelled) setState({ status: "ready", data, error: null, gone: false });
      })
      .catch((failure: unknown) => {
        if (cancelled) return;
        setState({
          status: "error",
          data: null,
          gone: isApiError(failure) && failure.status === 404,
          error: isApiError(failure) ? failure.message : genericError,
        });
      });
    return () => {
      cancelled = true;
    };
    // `load` closes over `key` only: re-run when the customer or a retry changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, version]);
  return { ...state, refresh: useCallback(() => setVersion((current) => current + 1), []) };
};

/** The customer and their recent orders load independently: the card can fail while the header stands. */
const useCustomerDetail = (id: string) => {
  const customer = useSection<PanelCustomer>(() => customerClient.get(id), id, "No se pudo cargar el cliente.");
  const orders = useSection<PanelOrder[]>(
    async () => (await listOrders(`customer=${id}&sort=-createdAt&limit=${RECENT_ORDERS_LIMIT}`)).orders,
    id,
    "No se pudieron cargar los pedidos.",
  );
  return { customer, orders };
};

export { useCustomerDetail };
```
> Si `eslint` (`react-hooks/exhaustive-deps`) se queja de otra forma, ajusta el comentario `eslint-disable` a la línea exacta; no cambies la lógica.

- [ ] **Step 4: Hook test** `tests/hooks/useTopCustomers.test.tsx`:

```tsx
import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useTopCustomers } from "@/hooks/useTopCustomers";

const top = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/adminCustomers", () => ({ customerClient: { top } }));

const ranking = { period: "month", sortBy: "spent", from: "a", to: "b", rows: [] };

describe("useTopCustomers", () => {
  beforeEach(() => {
    top.mockReset();
  });

  it("carga y publica el ranking", async () => {
    top.mockResolvedValue(ranking);
    const { result } = renderHook(() => useTopCustomers({ period: "month", sortBy: "spent" }));
    expect(result.current.status).toBe("loading");
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(top).toHaveBeenCalledWith("period=month&sortBy=spent");
  });

  it("refetch al cambiar el periodo", async () => {
    top.mockResolvedValue(ranking);
    const { result, rerender } = renderHook(({ period }) => useTopCustomers({ period, sortBy: "spent" }), {
      initialProps: { period: "month" as "month" | "week" },
    });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    rerender({ period: "week" });
    await waitFor(() => expect(top).toHaveBeenLastCalledWith("period=week&sortBy=spent"));
  });

  it("muestra el error y se recupera con refresh", async () => {
    top.mockRejectedValueOnce(new Error("x")).mockResolvedValueOnce(ranking);
    const { result } = renderHook(() => useTopCustomers({ period: "month", sortBy: "spent" }));
    await waitFor(() => expect(result.current.status).toBe("error"));
    result.current.refresh();
    await waitFor(() => expect(result.current.status).toBe("ready"));
  });
});
```

- [ ] **Step 5: Run** — `pnpm --filter @gira/web exec vitest run tests/lib/api/adminCustomers.test.ts tests/hooks/useTopCustomers.test.tsx` · Expected: PASS. (Esto depende de `giveCouponForm.ts` del Task 12 por el tipo `GiveCouponBody`: crea primero el archivo de ese task o corre ambos juntos.)

---

## Task 12: Web — give-coupon form logic + hook (TDD)

**Files:** Create `lib/customers/giveCouponForm.ts`, `hooks/useGiveCoupon.ts`; Tests `tests/lib/customers/giveCouponForm.test.ts`, `tests/hooks/useGiveCoupon.test.tsx`.

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from "vitest";
import { EMPTY_GIVE_VALUES, toGiveBody, validateGiveForm } from "@/lib/customers/giveCouponForm";

const ok = { ...EMPTY_GIVE_VALUES, code: "gracias-ana", percentOff: "15" };

describe("giveCouponForm", () => {
  it("un formulario completo no tiene errores y no pide nombre ni tope", () => {
    expect(validateGiveForm(ok)).toEqual({});
  });

  it("valida código, valor y mensaje", () => {
    expect(validateGiveForm({ ...ok, code: "" }).code).toBeTruthy();
    expect(validateGiveForm({ ...ok, percentOff: "0" }).percentOff).toBeTruthy();
    expect(validateGiveForm({ ...ok, message: "x".repeat(501) }).message).toBe("El mensaje no puede pasar de 500 caracteres.");
  });

  it("monto fijo: rechaza más de 2 decimales y convierte a centavos", () => {
    const fixed = { ...ok, discountType: "fixed" as const, percentOff: "", amountOff: "150.50" };
    expect(validateGiveForm({ ...fixed, amountOff: "10.999" }).amountOff).toBeTruthy();
    expect(toGiveBody(fixed)).toMatchObject({ discountType: "fixed", amountOffMxn: 15_050 });
  });

  it("el cuerpo no manda nombre ni tope, normaliza el código y omite lo vacío", () => {
    const body = toGiveBody({ ...ok, message: "  Gracias  ", minSubtotal: "800", endsAt: "30/11/2026" });
    expect(body).toMatchObject({ code: "GRACIAS-ANA", discountType: "percent", percentOff: 15, minSubtotalMxn: 80_000, message: "Gracias" });
    expect(body).not.toHaveProperty("name");
    expect(body).not.toHaveProperty("maxRedemptions");
    expect(body.endsAt).toBe("2026-12-01T05:59:59.000Z");
    expect(toGiveBody(ok)).not.toHaveProperty("message");
    expect(toGiveBody(ok)).not.toHaveProperty("endsAt");
  });
});
```

- [ ] **Step 2: Implementation** `lib/customers/giveCouponForm.ts` (reuses the campaign form's validation and body builders):

```ts
import { COUPON_MESSAGE_MAX } from "@gira/shared";
import {
  EMPTY_COUPON_VALUES,
  toCreateBody,
  validateCouponForm,
  type CouponFormValues,
  type CreateCouponBody,
} from "@/lib/coupons/couponForm";

/** The personal-coupon form: a campaign coupon without name or cap (the server fixes both), plus a note. */
type GiveCouponValues = Omit<CouponFormValues, "name" | "maxRedemptions"> & { message: string };
type GiveCouponErrors = Partial<Record<keyof GiveCouponValues, string | undefined>>;
type GiveCouponBody = Omit<CreateCouponBody, "name" | "maxRedemptions"> & { message?: string };

const EMPTY_GIVE_VALUES: GiveCouponValues = {
  code: EMPTY_COUPON_VALUES.code,
  discountType: EMPTY_COUPON_VALUES.discountType,
  percentOff: "",
  amountOff: "",
  minSubtotal: "",
  startsAt: "",
  endsAt: "",
  message: "",
};

// A neutral stand-in so the shared validator and body builder (which require a name and ignore an empty cap) can be reused.
const asCouponValues = (values: GiveCouponValues): CouponFormValues => ({
  ...values,
  name: "Personal",
  maxRedemptions: "",
});

const validateGiveForm = (values: GiveCouponValues): GiveCouponErrors => {
  const { name: _name, maxRedemptions: _cap, ...errors } = validateCouponForm(asCouponValues(values), false);
  const result: GiveCouponErrors = { ...errors };
  if (values.message.trim().length > COUPON_MESSAGE_MAX) {
    result.message = `El mensaje no puede pasar de ${COUPON_MESSAGE_MAX} caracteres.`;
  }
  return result;
};

/** Call only after `validateGiveForm` passed. */
const toGiveBody = (values: GiveCouponValues): GiveCouponBody => {
  const { name: _name, maxRedemptions: _cap, ...body } = toCreateBody(asCouponValues(values));
  const message = values.message.trim();
  return message ? { ...body, message } : body;
};

export type { GiveCouponValues, GiveCouponErrors, GiveCouponBody };
export { EMPTY_GIVE_VALUES, validateGiveForm, toGiveBody };
```
> Si eslint marca `_name`/`_cap` como variables sin usar, usa `delete`-free destructuring con `// eslint-disable-next-line @typescript-eslint/no-unused-vars` en esas dos líneas (patrón ya usado en el repo: `grep -rn "no-unused-vars" apps/web/src`).

- [ ] **Step 3: Hook** `hooks/useGiveCoupon.ts` (mirror of `useCouponSave`):

```ts
"use client";

import { COUPON_CODE_TAKEN_MESSAGE } from "@gira/shared";
import { useCallback, useState } from "react";
import { customerClient } from "@/lib/api/adminCustomers";
import { isApiError } from "@/lib/api/ApiError";
import { toGiveBody, validateGiveForm, type GiveCouponValues } from "@/lib/customers/giveCouponForm";

const GENERIC_ERROR = "Inténtalo de nuevo en un momento.";

type GiveOutcome = { ok: true; emailSent: boolean; code: string } | { ok: false };

interface UseGiveCoupon {
  saving: boolean;
  error: string | null;
  /** The duplicate-code 409, kept apart because it belongs on the Código field. */
  codeError: string | null;
  clearErrors: () => void;
  give: (customerId: string, values: GiveCouponValues) => Promise<GiveOutcome>;
}

const useGiveCoupon = (): UseGiveCoupon => {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);

  const give = useCallback(async (customerId: string, values: GiveCouponValues): Promise<GiveOutcome> => {
    // The form already shows field errors; this keeps a bad body off the network.
    if (Object.values(validateGiveForm(values)).some(Boolean)) return { ok: false };
    setSaving(true);
    setError(null);
    setCodeError(null);
    try {
      const result = await customerClient.giveCoupon(customerId, toGiveBody(values));
      return { ok: true, emailSent: result.emailSent, code: result.coupon.code };
    } catch (failure) {
      if (isApiError(failure) && failure.status === 409 && failure.message === COUPON_CODE_TAKEN_MESSAGE) {
        setCodeError(failure.message);
      } else {
        setError(isApiError(failure) ? failure.message : GENERIC_ERROR);
      }
      return { ok: false };
    } finally {
      setSaving(false);
    }
  }, []);

  const clearErrors = useCallback(() => {
    setError(null);
    setCodeError(null);
  }, []);

  return { saving, error, codeError, clearErrors, give };
};

export type { UseGiveCoupon, GiveOutcome };
export { useGiveCoupon };
```

- [ ] **Step 4: Hook test** `tests/hooks/useGiveCoupon.test.tsx` (3 cases: success returns `{ok:true,emailSent,code}`; 409 with `COUPON_CODE_TAKEN_MESSAGE` fills `codeError`, `error` null; invalid form returns `{ok:false}` and `giveCoupon` not called). Use `vi.hoisted` mock of `@/lib/api/adminCustomers` exactly like Task 11, and `new ApiError(COUPON_CODE_TAKEN_MESSAGE, "http", 409)` — **check the real constructor signature in `lib/api/ApiError.ts` before writing the line**.

- [ ] **Step 5: Run** — `pnpm --filter @gira/web exec vitest run tests/lib/customers tests/hooks/useGiveCoupon.test.tsx` · Expected: PASS.

---

## Task 13: Web — Clientes page (podio + tabla) (TDD)

**Files:** Create `components/customers/{CustomersPage,TopCustomersSection,CustomerTable,CustomerSearch}.tsx`, `app/(admin)/clientes/{page,loading}.tsx`; Modify `lib/navigation.ts`; Tests `tests/components/customers/{CustomersPage,TopCustomersSection}.test.tsx`, `tests/app/customersPage.test.tsx`.

Design source: mockup **B**, frame 1 (header panel with periods + «Ordenar por»; three podium tiles `bg-brand-subtle` / `bg-tile-alt` / `bg-accent-soft`; rows 4–10; «Todos los clientes» table). Tokens only (no color literals; `designTokens.test.ts` enforces it).

- [ ] **Step 1: `lib/navigation.ts`** — flip Clientes to `available: true` (`{ key: "customers", …, available: true }`).

- [ ] **Step 2: `TopCustomersSection.tsx`**

```tsx
"use client";

import { CUSTOMER_RANK_SORTS, type CustomerRankPeriod, type CustomerRankSort } from "@gira/shared";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Notice } from "@/components/ui/Notice";
import { SelectField } from "@/components/ui/SelectField";
import { Skeleton } from "@/components/ui/Skeleton";
import { NB_SURFACE } from "@/components/ui/styles";
import { Tabs } from "@/components/ui/Tabs";
import { useTopCustomers } from "@/hooks/useTopCustomers";
import { formatMxn } from "@/lib/coupons/money";
import { customerFullName } from "@/lib/customers/panelCustomer";
import type { CustomerFilters } from "@/lib/customers/filters";

interface TopCustomersSectionProps {
  filters: CustomerFilters;
  onPeriodChange: (period: CustomerRankPeriod) => void;
  onSortChange: (sortBy: CustomerRankSort) => void;
}

const PERIOD_TABS = [
  { id: "today", label: "Hoy" },
  { id: "week", label: "Semana" },
  { id: "month", label: "Mes" },
];
const SORT_OPTIONS = [
  { value: "spent", label: "Gasto neto" },
  { value: "orders", label: "Número de compras" },
];
const EMPTY_COPY: Record<CustomerRankPeriod, string> = {
  today: "Nadie ha completado una compra hoy.",
  week: "Nadie ha completado una compra desde el lunes.",
  month: "Nadie ha completado una compra en lo que va del mes.",
};
/** Podium tile fills by place; tokens only. */
const PODIUM_BG = ["bg-brand-subtle", "bg-tile-alt", "bg-accent-soft"] as const;
const PODIUM_SIZE = 3;

const isRankSort = (value: string): value is CustomerRankSort =>
  (CUSTOMER_RANK_SORTS as readonly string[]).includes(value);

/** «Mejores clientes»: the top 10 with an account, podium for the first three, rows for the rest. */
const TopCustomersSection = ({ filters, onPeriodChange, onSortChange }: TopCustomersSectionProps) => {
  const top = useTopCustomers(filters);
  const rows = top.ranking?.rows ?? [];

  return (
    <section className="flex flex-col gap-5" aria-label="Mejores clientes">
      <div className={`${NB_SURFACE} flex flex-wrap items-start justify-between gap-4 p-5`}>
        <div>
          <h2 className="font-display text-xl uppercase">Mejores clientes</h2>
          <p className="text-sm text-text-muted">Clientes con cuenta. Gasto neto en pesos, sin reembolsos.</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <Tabs
            tabs={PERIOD_TABS}
            value={filters.period}
            onChange={(id) => onPeriodChange(id as CustomerRankPeriod)}
          />
          <SelectField
            label="Ordenar por"
            options={SORT_OPTIONS}
            value={filters.sortBy}
            onChange={(value) => {
              if (isRankSort(value)) onSortChange(value);
            }}
            containerClassName="min-w-52"
          />
        </div>
      </div>

      {top.status === "error" ? (
        <Notice variant="danger" title="No se pudo cargar el ranking">
          <p>{top.error}</p>
          <Button size="sm" className="mt-2" onClick={top.refresh}>
            Reintentar
          </Button>
        </Notice>
      ) : top.status === "loading" && !top.ranking ? (
        <div className="grid gap-4 md:grid-cols-3" aria-busy="true">
          {Array.from({ length: PODIUM_SIZE }, (_, index) => (
            <Skeleton key={index} className="h-40 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className={NB_SURFACE}>
          <EmptyState title="Sin compras en este periodo" description={EMPTY_COPY[filters.period]} />
        </div>
      ) : (
        <>
          <ol className="grid gap-4 md:grid-cols-3" aria-label="Podio">
            {rows.slice(0, PODIUM_SIZE).map((row, index) => (
              <li key={row.id} className={`${NB_SURFACE} ${PODIUM_BG[index]} flex flex-col gap-3 p-5`}>
                <div className="flex items-start justify-between gap-2">
                  <span className="font-display text-4xl leading-none" aria-label={`Lugar ${index + 1}`}>
                    {index + 1}
                  </span>
                  <span className="rounded-nb-pill border-[1.5px] border-ink bg-surface px-2 py-0.5 font-mono text-2xs font-bold uppercase">
                    {row.orderCount} {row.orderCount === 1 ? "compra" : "compras"}
                  </span>
                </div>
                <Link href={`/clientes/${row.id}`} className="font-bold underline-offset-2 hover:underline">
                  {customerFullName(row)}
                </Link>
                <span className="font-mono text-xs text-text-secondary">{row.email}</span>
                <span className="font-mono text-2xl font-bold">{formatMxn(row.spentMxn)}</span>
              </li>
            ))}
          </ol>
          {rows.length > PODIUM_SIZE ? (
            <ol className={`${NB_SURFACE} divide-y divide-border px-4`} start={PODIUM_SIZE + 1}>
              {rows.slice(PODIUM_SIZE).map((row, index) => (
                <li key={row.id} className="grid grid-cols-[2rem_1fr_auto_auto] items-center gap-4 py-3">
                  <span className="font-mono text-sm font-bold text-text-muted">{index + PODIUM_SIZE + 1}</span>
                  <Link href={`/clientes/${row.id}`} className="min-w-0">
                    <span className="block font-bold">{customerFullName(row)}</span>
                    <span className="block truncate font-mono text-xs text-text-muted">{row.email}</span>
                  </Link>
                  <span className="hidden font-mono text-sm sm:block">
                    {row.orderCount} {row.orderCount === 1 ? "compra" : "compras"}
                  </span>
                  <span className="font-mono font-bold">{formatMxn(row.spentMxn)}</span>
                </li>
              ))}
            </ol>
          ) : null}
        </>
      )}
    </section>
  );
};

export type { TopCustomersSectionProps };
export { TopCustomersSection };
```
> Verifica las props reales de `EmptyState` (`components/ui/EmptyState.tsx`) y de `Tabs`/`SelectField` antes de compilar; ajusta nombres si difieren (`title`/`description`/`icon`). El resto de clases son tokens ya usados en M12a.

- [ ] **Step 3: `CustomerTable.tsx`** (tabla «Todos los clientes»; copia la estructura de `CouponTable`: `Table/Thead/Tbody/Tr/Th/Td`, código = enlace cubriendo la fila)

```tsx
import Link from "next/link";
import { Table, Tbody, Td, Th, Thead, Tr } from "@/components/ui/Table";
import { formatMxn } from "@/lib/coupons/money";
import { formatShortDate } from "@/lib/format";
import { customerFullName, type PanelCustomer } from "@/lib/customers/panelCustomer";

interface CustomerTableProps {
  items: PanelCustomer[];
}

const CustomerTable = ({ items }: CustomerTableProps) => (
  <Table>
    <Thead>
      <tr>
        <Th scope="col">Cliente</Th>
        <Th scope="col" className="hidden md:table-cell">Alta</Th>
        <Th scope="col" className="text-right">Compras</Th>
        <Th scope="col" className="text-right">Gasto neto</Th>
        <Th scope="col" className="hidden text-right md:table-cell">Último pedido</Th>
      </tr>
    </Thead>
    <Tbody>
      {items.map((customer) => (
        <Tr key={customer.id}>
          <Td>
            <Link href={`/clientes/${customer.id}`} className="block after:absolute after:inset-0">
              <span className="block font-bold">{customerFullName(customer)}</span>
              <span className="block font-mono text-xs text-text-muted">{customer.email}</span>
            </Link>
          </Td>
          <Td className="hidden font-mono md:table-cell">{formatShortDate(new Date(customer.createdAt))}</Td>
          <Td className="text-right font-mono">{customer.orderCount}</Td>
          <Td className="text-right font-mono">{formatMxn(customer.spentMxn)}</Td>
          <Td className="hidden text-right font-mono md:table-cell">
            {customer.lastOrderAt ? formatShortDate(new Date(customer.lastOrderAt)) : "—"}
          </Td>
        </Tr>
      ))}
    </Tbody>
  </Table>
);

export type { CustomerTableProps };
export { CustomerTable };
```
> `after:absolute after:inset-0` solo funciona si el `Tr`/`Td` tiene `relative`: copia exactamente cómo `CouponTable` estira el botón sobre la fila (mismas clases) en vez de inventar.

- [ ] **Step 4: `CustomerSearch.tsx`** — debounced search box: copy the search part of `CouponFilters.tsx` (state `searchText`, 300 ms debounce, sync with `filters.search`) into a component with props `{ value?: string; onChange: (search: string | undefined) => void }`, `Field` label «Buscar», placeholder «Busca por nombre o correo», `MagnifyingGlassIcon`.

- [ ] **Step 5: `CustomersPage.tsx`** — same URL-sync skeleton as `CouponsPage` (state `filters`, `writtenUrls` ref, `seenInitial`, `writeUrl`, `updateFilters`), without `selected`:

```tsx
"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Notice } from "@/components/ui/Notice";
import { PageHeader } from "@/components/ui/PageHeader";
import { Pagination } from "@/components/ui/Pagination";
import { Skeleton } from "@/components/ui/Skeleton";
import { NB_SURFACE } from "@/components/ui/styles";
import { useCustomerList } from "@/hooks/useCustomerList";
import { applyFilterPatch, toSearchParams, type CustomerFilterPatch, type CustomerFilters } from "@/lib/customers/filters";
import { CustomerSearch } from "./CustomerSearch";
import { CustomerTable } from "./CustomerTable";
import { TopCustomersSection } from "./TopCustomersSection";

interface CustomersPageProps {
  /** Plain data from the server component: never a function or a config object. */
  initialFilters: CustomerFilters;
}

const SKELETON_ROWS = 5;

const CustomersPage = ({ initialFilters }: CustomersPageProps) => {
  const router = useRouter();
  const pathname = usePathname();
  const [filters, setFilters] = useState(initialFilters);
  const writtenUrls = useRef(new Set<string>());
  const seenInitial = useRef(toSearchParams(initialFilters));

  const writeUrl = useCallback(
    (next: CustomerFilters) => {
      setFilters(next);
      const query = toSearchParams(next);
      writtenUrls.current.add(query);
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router],
  );
  const updateFilters = useCallback((patch: CustomerFilterPatch) => writeUrl(applyFilterPatch(filters, patch)), [filters, writeUrl]);
  const updateFiltersRef = useRef(updateFilters);
  useEffect(() => {
    updateFiltersRef.current = updateFilters;
  });

  const list = useCustomerList(filters, (lastPage) => updateFiltersRef.current({ page: lastPage }));

  const incomingQuery = toSearchParams(initialFilters);
  useEffect(() => {
    if (seenInitial.current === incomingQuery) return;
    seenInitial.current = incomingQuery;
    if (writtenUrls.current.delete(incomingQuery)) return;
    setFilters(initialFilters);
  }, [incomingQuery, initialFilters]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Clientes" subtitle="Quién compra más y a quién darle un detalle." />

      <TopCustomersSection
        filters={filters}
        onPeriodChange={(period) => updateFilters({ period })}
        onSortChange={(sortBy) => updateFilters({ sortBy })}
      />

      <section className={`${NB_SURFACE} flex flex-col gap-4 p-5`} aria-label="Todos los clientes">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-xl uppercase">Todos los clientes</h2>
            <p className="text-sm text-text-muted">Cuentas de clientes. Entra a una para darle un cupón.</p>
          </div>
          <CustomerSearch value={filters.search} onChange={(search) => updateFilters({ search })} />
        </div>

        {list.status === "ready" && list.error ? (
          <Notice variant="warning" title="No se pudo actualizar la lista">
            <p>{list.error} Estás viendo la última lista cargada.</p>
            <Button size="sm" className="mt-2" onClick={list.refresh}>Reintentar</Button>
          </Notice>
        ) : null}

        {list.status === "error" ? (
          <Notice variant="danger" title="No se pudieron cargar los clientes">
            <p>{list.error}</p>
            <Button size="sm" className="mt-2" onClick={list.refresh}>Reintentar</Button>
          </Notice>
        ) : list.status === "loading" ? (
          <div className="flex flex-col gap-3" aria-busy="true">
            {Array.from({ length: SKELETON_ROWS }, (_, index) => (
              <Skeleton key={index} className="h-12 w-full" />
            ))}
          </div>
        ) : list.items.length === 0 ? (
          filters.search ? (
            <EmptyState
              title="Sin resultados"
              description="Ningún cliente coincide con esa búsqueda."
              action={<Button onClick={() => updateFilters({ search: undefined })}>Limpiar búsqueda</Button>}
            />
          ) : (
            <EmptyState title="Todavía no hay clientes" description="Aquí aparecerán las cuentas en cuanto alguien se registre." />
          )
        ) : (
          <div className="overflow-hidden rounded-nb-sm border-2 border-ink">
            <CustomerTable items={list.items} />
            {list.meta ? (
              <div className="border-t-2 border-ink px-4 py-2">
                <Pagination
                  page={list.meta.page}
                  limit={list.meta.limit}
                  total={list.meta.total}
                  onPageChange={(page) => updateFilters({ page })}
                  className="mt-0"
                />
              </div>
            ) : null}
          </div>
        )}
      </section>
    </div>
  );
};

export type { CustomersPageProps };
export { CustomersPage };
```
> Confirma contra `components/ui/EmptyState.tsx` si `action` existe; si no, usa el patrón de `CouponEmpty.tsx` (copia su forma de poner el botón).

- [ ] **Step 6: Server page + loading**

`app/(admin)/clientes/page.tsx`:
```tsx
import type { Metadata } from "next";
import { CustomersPage } from "@/components/customers/CustomersPage";
import { SectionError } from "@/components/resumen/SectionError";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { parseCustomerFilters } from "@/lib/customers/filters";

const metadata: Metadata = { title: "Clientes" };
const RENDER_CRASH_MESSAGE = "Esta sección no se pudo mostrar. Actualiza la página para reintentar.";

interface ClientesPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** Filters live in the URL; the lists load in the client. This only parses the query string and passes plain data. */
const ClientesPage = async ({ searchParams }: ClientesPageProps) => {
  const params = await searchParams;
  return (
    <ErrorBoundary fallback={<SectionError message={RENDER_CRASH_MESSAGE} />}>
      <CustomersPage initialFilters={parseCustomerFilters(params)} />
    </ErrorBoundary>
  );
};

export { metadata };
export default ClientesPage;
```
`loading.tsx`: `PageHeader title="Clientes"` + `Skeleton h-20`, 3-up skeleton grid (`grid gap-4 md:grid-cols-3` with `h-40`), `Skeleton h-72`.

- [ ] **Step 7: Tests** (mirror `tests/components/coupons/CouponsPage.test.tsx` setup: `vi.hoisted` client mock, `next/navigation` mock with `replaceMock`, `ToastProvider` wrapper). Cases, each with real assertions:
  1. renders podium with the first three and rows 4+ from a ranking fixture (names, `$12,480.00`, «7 compras»);
  2. clicking «Semana» calls `customerClient.top` with `period=week&sortBy=spent` and writes `?periodo=semana` (`replaceMock`);
  3. `chooseOption(screen.getByLabelText("Ordenar por"), "Número de compras")` → `top` called with `sortBy=orders` and URL `orden=compras`;
  4. ranking error shows «No se pudo cargar el ranking» and «Reintentar» retries;
  5. empty ranking shows «Sin compras en este periodo» with the period copy;
  6. list: search typing debounces to `search=ana`, empty search → «Sin resultados» + «Limpiar búsqueda» clears;
  7. list error shows «No se pudieron cargar los clientes» + «Reintentar».
  And `tests/app/customersPage.test.tsx`: renders the server page output with `searchParams` `{periodo:"semana"}` and asserts `CustomersPage` received `initialFilters.period === "week"` and **only plain data** (JSON round-trip equals itself).

- [ ] **Step 8: Run** — `pnpm --filter @gira/web exec vitest run tests/components/customers tests/app/customersPage.test.tsx` · Expected: PASS.

---

## Task 14: Web — ficha `/clientes/[id]` + modal «Dar cupón» (TDD)

**Files:** Create `components/customers/{CustomerDetailPage,CustomerOrdersCard,GiveCouponModal,GiveCouponForm}.tsx`, `app/(admin)/clientes/[id]/{page,loading}.tsx`; Tests `tests/components/customers/{CustomerDetailPage,GiveCouponModal}.test.tsx`.

Design source: mockup **B**, frames 2, 3, 5, 6 (two columns: profile tile `bg-brand-subtle` + gasto neto; right column Pedidos; modal wide with «Así le llega» preview).

- [ ] **Step 1: Server page** `app/(admin)/clientes/[id]/page.tsx`:

```tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CustomerDetailPage } from "@/components/customers/CustomerDetailPage";
import { SectionError } from "@/components/resumen/SectionError";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { GIVE_COUPON_PARAM } from "@/lib/customers/filters";
import { isObjectId } from "@/lib/inventory/variantId";

const metadata: Metadata = { title: "Cliente" };
const RENDER_CRASH_MESSAGE = "Esta sección no se pudo mostrar. Actualiza la página para reintentar.";

interface ClientePageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** A malformed id is a 404 before any request. The customer loads in the client; only plain data goes down. */
const ClientePage = async ({ params, searchParams }: ClientePageProps) => {
  const { id } = await params;
  if (!isObjectId(id)) notFound();
  const query = await searchParams;
  const raw = query[GIVE_COUPON_PARAM];
  return (
    <ErrorBoundary fallback={<SectionError message={RENDER_CRASH_MESSAGE} />}>
      <CustomerDetailPage customerId={id} initialGiveOpen={(Array.isArray(raw) ? raw[0] : raw) === "nuevo"} />
    </ErrorBoundary>
  );
};

export { metadata };
export default ClientePage;
```
`loading.tsx`: `PageHeader title="Cliente"` + grid `lg:grid-cols-[340px_1fr]` of two skeletons.

- [ ] **Step 2: `GiveCouponForm.tsx`** — controlled, like `CouponForm`, fields in this order (labels verbatim from the spec/mockup): intro `Notice variant="info"` «Es un cupón personal: solo {firstName} puede usarlo. Le llega a {email}.»; **Código** (`Field`, mono, uppercase, helper «Lo que escribe al pagar. Letras sin acento, números y guiones.»); **Tipo de descuento** (`SelectField`: Porcentaje / Monto fijo (MXN)) + **Porcentaje (%)** or **Monto (MXN)**; **Compra mínima (MXN, opcional)** + **Vence (opcional)** (dd/mm/aaaa, helper «Hasta las 23:59, hora de México.»); optionally **Inicia (opcional)**; **Mensaje para {firstName} (opcional)** — a `<textarea>` styled like `Field` (check `components/ui/Field.tsx` for a textarea variant; if none, add the same classes `NB_CONTROL` uses) with helper «Sale en el correo que recibe. {n}/500» and `maxLength={COUPON_MESSAGE_MAX}`. Props: `{ formId, customerName: { firstName }, customerEmail, values: GiveCouponValues, errors: GiveCouponErrors, error: string | null, onChange(values), onSubmit() }`. The top `Notice variant="danger"` shows «No se pudo dar el cupón» with `error ?? "Revisa los campos marcados."` exactly like `CouponForm`.

- [ ] **Step 3: `GiveCouponModal.tsx`** — same structure as `CouponModal`'s `Editor`: hydration guard with `useSyncExternalStore` (return `null` until hydrated or when `!open`), `Modal` with title `Dar cupón a {firstName}`, footer `Cancelar` + `Button type="submit" form={formId} variant="primary" loading={give.saving}` «Crear y enviar», `ConfirmDialog` «¿Descartar los cambios?» when dirty, request-in-flight guard, `alive` ref. On submit:

```tsx
const outcome = await give.give(customer.id, values);
if (!outcome.ok) return;
if (outcome.emailSent) {
  toast({ variant: "success", title: "Cupón enviado", description: `${outcome.code} le llegó a ${customer.email}.` });
} else {
  toast({ variant: "warning", title: "Cupón creado, pero el correo no salió", description: `Avísale a ${customer.firstName} que su código es ${outcome.code}.` });
}
onClose();
```
(check `useToast().toast` accepts `description` and `variant: "warning"`; if the Toast API differs, fold the second line into `title`.) Field errors: `{ ...errors, ...(give.codeError ? { code: give.codeError } : {}) }`.
Wide layout with the email preview (mockup B frame 3): the modal body is a two-column grid on `md:` — the form on the left, and a «Así le llega» preview card on the right showing `Un detalle para ti`, «Hola {firstName}, gracias por ser parte de Gira.», the dashed coupon box (discount label computed from the current values: `${percentOff}% de descuento` or `formatMxn(pesosToCents(amountOff))`, the uppercase code, «Vigente hasta el …» if `endsAt` valid) and the message text rendered as **plain text** (`whitespace-pre-line`, never `dangerouslySetInnerHTML`). Hide the preview below `md:` (it is decorative; the bottom sheet stays single column). If `Modal` has no wide size, pass `className`/size per its props or keep the modal at its default width and stack the preview under the form — do not touch `Modal.tsx`.

- [ ] **Step 4: `CustomerOrdersCard.tsx`** — `Panel`-less section (`NB_SURFACE p-5`): heading «Pedidos», hint «{n} más recientes, del más reciente al más antiguo.»; states: skeleton rows, `Notice danger` «No se pudieron cargar los pedidos» + «Reintentar» (`onRetry`), `EmptyState` «Sin pedidos» / «Este cliente todavía no ha comprado nada.», table `Folio` (mono, `Link` to `/pedidos/${order.id}`) / `Fecha` (`formatShortDate`) / `Estado` (`<StatusChip status={order.status} />`) / `Total` (`formatMoney(order.total, order.currency)` from `@/lib/orders/money`, mono right-aligned). Props `{ state: { status; data: PanelOrder[] | null; error: string | null }, onRetry }`. **Confirm `PanelOrder`'s field names** in `lib/orders/panelOrder.ts` (`id`, `orderNumber`, `status`, `total`, `currency`, `createdAt`) and use the real ones.

- [ ] **Step 5: `CustomerDetailPage.tsx`**

```tsx
"use client";

import Link from "next/link";
import { useState } from "react";
import { BreadcrumbLabel } from "@/components/shell/BreadcrumbLabel";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { PageHeader } from "@/components/ui/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { NB_SURFACE } from "@/components/ui/styles";
import { useCustomerDetail } from "@/hooks/useCustomerDetail";
import { formatMxn } from "@/lib/coupons/money";
import { customerFullName } from "@/lib/customers/panelCustomer";
import { formatShortDate } from "@/lib/format";
import { CustomerOrdersCard } from "./CustomerOrdersCard";
import { GiveCouponModal } from "./GiveCouponModal";

interface CustomerDetailPageProps {
  customerId: string;
  /** `?cupon=nuevo` opens the modal on load. */
  initialGiveOpen: boolean;
}

const CustomerDetailPage = ({ customerId, initialGiveOpen }: CustomerDetailPageProps) => {
  const { customer, orders } = useCustomerDetail(customerId);
  const [giveOpen, setGiveOpen] = useState(initialGiveOpen);

  if (customer.status === "error") {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Cliente" />
        <Notice variant="danger" title={customer.gone ? "Cliente no encontrado" : "No se pudo cargar el cliente"}>
          <p>{customer.gone ? "El cliente ya no existe. Puede que el enlace sea viejo." : customer.error}</p>
          {customer.gone ? (
            <Link href="/clientes" className="mt-2 inline-block underline">Volver a Clientes</Link>
          ) : (
            <Button size="sm" className="mt-2" onClick={customer.refresh}>Reintentar</Button>
          )}
        </Notice>
      </div>
    );
  }

  if (!customer.data) {
    return (
      <div className="flex flex-col gap-6" aria-busy="true">
        <PageHeader title="Cliente" />
        <div className="grid gap-5 lg:grid-cols-[340px_1fr]">
          <Skeleton className="h-72 w-full" />
          <Skeleton className="h-72 w-full" />
        </div>
      </div>
    );
  }

  const person = customer.data;
  const name = customerFullName(person);

  return (
    <div className="flex flex-col gap-6">
      <BreadcrumbLabel label={name} />
      <PageHeader
        title={name}
        subtitle={person.email}
        actions={<Button variant="primary" onClick={() => setGiveOpen(true)}>Dar cupón</Button>}
      />
      <div className="grid items-start gap-5 lg:grid-cols-[340px_1fr]">
        <section className={`${NB_SURFACE} flex flex-col gap-4 bg-brand-subtle p-5`} aria-label="Cliente">
          <dl className="flex flex-col gap-4">
            <div>
              <dt className="font-mono text-2xs font-bold uppercase text-text-muted">Gasto neto</dt>
              <dd className="font-mono text-3xl font-bold">{formatMxn(person.spentMxn)}</dd>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <dt className="font-mono text-2xs font-bold uppercase text-text-muted">Compras</dt>
                <dd className="font-mono text-xl font-bold">{person.orderCount}</dd>
              </div>
              <div>
                <dt className="font-mono text-2xs font-bold uppercase text-text-muted">Cliente desde</dt>
                <dd className="font-mono text-base font-bold">{formatShortDate(new Date(person.createdAt))}</dd>
              </div>
            </div>
            <div>
              <dt className="font-mono text-2xs font-bold uppercase text-text-muted">Correo verificado</dt>
              <dd className="font-bold">{person.emailVerified ? "Sí" : "No"}</dd>
            </div>
          </dl>
        </section>
        <CustomerOrdersCard state={orders} onRetry={orders.refresh} />
      </div>
      <GiveCouponModal customer={person} open={giveOpen} onClose={() => setGiveOpen(false)} />
    </div>
  );
};

export type { CustomerDetailPageProps };
export { CustomerDetailPage };
```
Keep the open state out of the URL after load (simple `useState`; `?cupon=nuevo` is only an entry point, documented in the spec).

- [ ] **Step 6: Tests** (client mock + `listOrders` mock; wrapper `ToastProvider`):
  `CustomerDetailPage.test.tsx`: shows name/email/«Gasto neto $48,260.00»/«Correo verificado Sí»; orders card lists a folio linking to `/pedidos/<id>`; orders error shows «No se pudieron cargar los pedidos» + «Reintentar» while the header stays; customer 404 shows «Cliente no encontrado»; `initialGiveOpen` opens the modal; breadcrumb label set.
  `GiveCouponModal.test.tsx`: fills code `gracias-ana` (uppercased), percent 15, message → submit → `giveCoupon` called with `{code:"GRACIAS-ANA",discountType:"percent",percentOff:15,message:"…"}` and **no `name`/`maxRedemptions`**, success toast «Cupón enviado» + «GRACIAS-ANA le llegó a ana@example.com.», modal closes; `emailSent:false` shows «Cupón creado, pero el correo no salió»; 409 duplicate shows the message under the Código field and keeps the modal open; other API error shows «No se pudo dar el cupón» Notice; empty submit shows field errors and does **not** call the client; closing with typed text asks «¿Descartar los cambios?»; the preview escapes: message `<b>hola</b>` appears as literal text (assert `screen.getByText("<b>hola</b>")`); type select via `chooseOption(screen.getByLabelText("Tipo de descuento"), "Monto fijo (MXN)")` swaps to «Monto (MXN)».

- [ ] **Step 7: Run** — `pnpm --filter @gira/web exec vitest run tests/components/customers` · Expected: PASS.

---

## Task 15: Web — Cupones: clase personal (TDD)

**Files:** Modify `lib/coupons/panelCoupon.ts`, `lib/coupons/filters.ts`, `components/coupons/{CouponFilters,CouponTable,CouponModal,CouponsPage}.tsx`, `tests/helpers/coupons.ts`; Tests: extend `tests/lib/coupons/filters.test.ts`, `tests/components/coupons/{CouponTable,CouponModal,CouponsPage}.test.tsx`.

- [ ] **Step 1: `panelCoupon.ts`** — add `kind: CouponKind` and `assignedCustomer?: { id: string; firstName: string; lastName: string }` to `PanelCoupon` and map them in `toPanelCoupon` (`kind: coupon.kind, ...(coupon.assignedCustomer ? { assignedCustomer: coupon.assignedCustomer } : {})`). In `tests/helpers/coupons.ts`' `makePanelCoupon` add `kind: CouponKind.CAMPAIGN,` (import `CouponKind`).

- [ ] **Step 2: Failing tests** (add to `filters.test.ts`):

```ts
it("clase: por defecto todas; lee campanas y personales; se serializa y va al API", () => {
  expect(parseCouponFilters({}).kind).toBe("all");
  expect(parseCouponFilters({ clase: "personales" }).kind).toBe("personal");
  expect(parseCouponFilters({ clase: "campanas" }).kind).toBe("campaign");
  expect(parseCouponFilters({ clase: "x" }).kind).toBe("all");
  const filters = { ...parseCouponFilters({}), kind: "personal" as const };
  expect(toSearchParams(filters)).toContain("clase=personales");
  expect(buildCouponListQuery(filters)).toContain("clase=personales");
  expect(toSearchParams(parseCouponFilters({}))).not.toContain("clase");
  expect(applyFilterPatch({ ...filters, page: 3 }, { kind: "campaign" }).page).toBe(1);
});
```
Component tests: `CouponTable` row with `kind: personal` + `assignedCustomer` shows badge «Personal» and a link «Ana Pérez» to `/clientes/<id>`; a campaign row shows neither. `CouponModal` with a personal coupon shows «Cliente: Ana Pérez» read-only (link) and the form still edits/retira normally. `CouponsPage` shows the help text «Para dar uno personal, entra a la cuenta del cliente.» and `chooseOption(Clase, "Personales")` calls `list` with `clase=personales`.

- [ ] **Step 3: `filters.ts`** — add `type CouponKindFilter = "all" | "campaign" | "personal"`, `DEFAULT_KIND = "all"`, `KIND_TO_URL = { all: "todos", campaign: "campanas", personal: "personales" }` with its inverse; `kind` in `CouponFilters` and `CouponFilterPatch`; parse (`URL_TO_KIND[firstOf(params.clase) ?? ""] ?? DEFAULT_KIND`), `buildCouponListQuery` (`if (filters.kind !== DEFAULT_KIND) query.set("clase", KIND_TO_URL[filters.kind])`), `toSearchParams` (same, key `clase`), `applyFilterPatch` (`kind: patch.kind ?? current.kind`), and `hasActiveFilters` (`|| filters.kind !== DEFAULT_KIND`). Export `DEFAULT_KIND` and the type. Update `CouponsPage.clearFilters` to also reset `kind: DEFAULT_KIND`, and every place that builds a `CouponFilters` literal (grep `status: DEFAULT_STATUS`).

- [ ] **Step 4: `CouponFilters.tsx`** — add a third `SelectField` «Clase» with options `Todos / Campañas / Personales` (`onChange` → `onChange({ kind: value as CouponKindFilter })`), placed next to «Estado».

- [ ] **Step 5: `CouponTable.tsx`** — in the code cell, after the code add `{coupon.kind === "personal" ? <Badge variant="neutral">Personal</Badge> : null}` and, under the name line, `{coupon.assignedCustomer ? <Link href={`/clientes/${coupon.assignedCustomer.id}`} className="relative z-10 underline">{`${firstName} ${lastName}`}</Link> : null}` (the link must sit above the row-stretching button: reuse the stacking classes the row already uses; verify by test that clicking the name navigates instead of opening the modal).

- [ ] **Step 6: `CouponModal.tsx`** — in `Editor`, when `coupon?.assignedCustomer` render, above the form, `<Notice variant="info" title="Cupón personal"><p>Solo lo puede usar <Link …>{name}</Link>. Un solo uso.</p></Notice>`.

- [ ] **Step 7: `CouponsPage.tsx`** — `PageHeader subtitle`: «Descuentos de campaña y cupones personales. Solo aplican a clientes con cuenta.» and below the header, inside the filters surface, a muted line «Para dar uno personal, entra a la cuenta del cliente.» (`text-xs text-text-secondary`). «Nuevo cupón» still creates campaigns only.

- [ ] **Step 8: Run** — `pnpm --filter @gira/web exec vitest run tests/lib/coupons tests/components/coupons tests/app/couponsPage.test.tsx` · Expected: PASS (existing M12a tests updated where they build `CouponFilters` / `PanelCoupon`).

---

## Task 16: Web gate

- [ ] **Step 1:** `pnpm --filter @gira/shared build` · Expected: ok.
- [ ] **Step 2:** typecheck web (confirm script name in `apps/web/package.json`, e.g. `pnpm --filter @gira/web exec tsc --noEmit`) · Expected: no errors.
- [ ] **Step 3:** `pnpm exec eslint apps/web` · Expected: clean. (Los 5 errores de `enviaShippingProvider.ts` son del API y preexistentes.)
- [ ] **Step 4:** `pnpm --filter @gira/web test` · Expected: all green, including `designTokens.test.ts` (no color literals outside `tokens.css`).
- [ ] **Step 5: code review** — invoke `requesting-code-review` on `git diff main...HEAD` plus the untracked files; fix every Critical/Important finding with a test first.

---

## Task 17: Verification, browser walkthrough, memory, handoff

- [ ] **Step 1: API suites** — `pnpm --filter @gira/api exec tsc --noEmit` then `pnpm --filter @gira/api test`. Flake conocido: if one test fails, re-run **that file** isolated before investigating (cae uno distinto por corrida, p. ej. `shippingLabel`, `jobs`, `adminOrderAddress`).

- [ ] **Step 2: Build in a copy (never over Manuel's `.next`)** —
```bash
COPY=/private/tmp/claude-501/-Users-manuelarteaga-Documents-Gira-Clothing/c48795cd-4c38-47de-bde8-6f79dc5810ee/scratchpad/repo-copy
mkdir -p "$COPY" && rsync -a --delete --exclude node_modules --exclude .next --exclude .git ./ "$COPY"/
for d in . apps/web apps/api packages/shared; do ln -sfn "$PWD/$d/node_modules" "$COPY/$d/node_modules"; done
cd "$COPY" && NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1 pnpm --filter @gira/web build
```
Expected: build succeeds and lists `/clientes` and `/clientes/[id]`.

- [ ] **Step 3: Browser walkthrough (Chromium via Playwright from `~/.npm/_npx`, copy only)** — `mongod --replSet rs0 --port 27018 --dbpath <scratch>/db` + `rs.initiate()`; API on 4100 (`COOKIE_NAME=gira_session`, `CLIENT_URL=http://localhost:3100`, Mongo local); `pnpm --filter @gira/api seed:admin`; enrol 2FA via `/auth/2fa/enroll/start|complete` with `otplib`; web rebuilt with `NEXT_PUBLIC_API_URL=http://localhost:4100/api/v1` on 3100. Seed 6+ customers and orders (script in the scratchpad). Walk and screenshot at 1440 and 390: `/clientes` (switch Hoy/Semana/Mes, Ordenar por, search, pagination, error by stopping the API once, empty state), a ficha, «Dar cupón» (success with Resend stubbed, 409 duplicate code, message with `<b>` stays literal), `/cupones` with filter Clase + badge, a personal coupon redeemed at checkout by the owner and rejected for another customer (`POST /orders` with `couponCode`), and the M12a Cupones screen at 1440/390 against mockup A. If a screen shows «No se pudo cargar esta sección», look for a Server Component passing a function to a Client Component. If any of this cannot be run, **say so plainly** in the report; do not claim it.

- [ ] **Step 4: Memory** — update `project_milestone_status` (M12b hecho, rama `feat/m12b-customers-panel`, opción B, decisiones: ranking hoy/semana/mes por gasto neto o compras, cupón personal `kind/assignedUser` un solo uso, correo directo con `emailSent`) and `project_standards_debt` (resuelto: cupón personal por correo, `sendCouponEmail`, filtro de pedidos por cliente; sigue: lo de M12a no resuelto). Recordar para M12c: `mockups/` se borra al cerrar M12, pantalla «reiniciar 2FA», edición de la tasa de IVA en Ajustes.

- [ ] **Step 5: «Pendientes conocidos»** — add this section at the end of this plan with what was left out or unverified (e.g.: cupón aún no aparece en `PublicOrder`/`AdminOrder`/detalle del pedido; sin reenvío del correo ni historial de cupones en la ficha; el cupón personal de 100 % con envío gratis hereda el problema de total 0 de M12a; ranking filtra por `createdAt` igual que Resumen, un pedido pagado días después cuenta en el día de creación; lista de clientes incluye cuentas sin verificar; `?cupon=nuevo` solo abre el modal al cargar; el recorrido en navegador si no se pudo correr; flake observado).

- [ ] **Step 6: Handoff (no ejecutar)** — show `git status` and `git diff --stat`, then give Manuel the commands (sin ejecutarlos), leaving out `.agents/`, `.claude/skills/design-taste-frontend`, `mockups/paletas.html`, `skills-lock.json`:
```bash
git add packages/shared apps/api apps/web docs/superpowers/specs/2026-10-21-m12b-customers-panel-design.md docs/superpowers/plans/2026-10-21-m12b-customers-panel.md
git commit -m "FEAT: M12b clientes (ranking, listado, ficha) y cupón personal por correo

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
git checkout main && git merge --no-ff feat/m12b-customers-panel -m "Merge: M12b panel de clientes y cupón personal"
git push origin main
```

---

## Self-review (spec ↔ plan)

| Spec | Task |
|---|---|
| Ranking top 10, hoy/semana/mes, gasto neto o compras, qué cuenta, neto con reembolso, USD con su tasa | 3, 4, 13 |
| Todos los clientes con búsqueda y métricas por página | 5, 10, 11, 13 |
| Ficha con métricas y pedidos (`customer` filter) | 5, 6, 11, 14 |
| Cupón personal: modelo, un uso, anti-enumeración, no mezcla con campañas | 2, 8, 9, 15 |
| Correo con mensaje escapado, `emailSent`, sin outbox, auditoría sin PII | 7, 8 |
| Cupones: badge, enlace, filtro Clase, texto de ayuda | 9, 15 |
| Estados vacío/carga/error con «Reintentar», hidratación, solo datos planos | 13, 14 |
| Fuera de alcance respetado (sin cupón en `AdminOrder`, sin reenvío, sin parches a Button/Segmented) | todo |

Type names usados de forma consistente: `CouponKind`, `AssignedCustomer`, `AdminCustomer`/`CustomerStats`, `TopCustomer(s)`, `GiveCouponResult`, `CustomerRankPeriod/Sort`, `PanelCustomer`, `GiveCouponValues/Errors/Body`, `giveCouponToCustomer`, `sendCouponEmail`, `renderCouponGift`, `getTopCustomers`, `listAdminCustomers`, `getAdminCustomerOrThrow`, `customerClient`.

## Pendientes conocidos

Cerrado el 2026-10-21. Lo que quedó fuera a propósito o sin verificar:

- **Cupón fuera de los pedidos.** `PublicOrder`, `AdminOrder` y el detalle del pedido siguen sin mostrar el cupón aplicado (pendiente heredado de M12a).
- **Sin reenvío del correo ni historial de cupones en la ficha.** Si el correo falla, el toast da el código para pasarlo a mano; el cupón se ve en Cupones con badge «Personal».
- **Cupón de 100 % con envío gratis** deja el total en 0 (heredado de M12a); aplica también al cupón personal.
- **El ranking filtra por `createdAt`** (igual que Resumen): un pedido pagado días después cuenta en el día en que se creó.
- **«Todos los clientes» incluye cuentas sin verificar** (la ficha muestra «Correo verificado: Sí/No»).
- **`?cupon=nuevo` solo abre el modal al cargar la ficha**; después el estado es local (no se escribe en la URL).
- **Vista previa del correo debajo del formulario**, no al lado como en el mockup B: `Modal` solo tiene un ancho (no se tocó).
- **Mosaicos teñidos usan `NB_TILE`** (`components/customers/tileStyles.ts`): `bg-surface` de `NB_SURFACE` ganaba a `bg-brand-subtle`/`bg-accent-soft`. Misma raíz del bug conocido de Button primary/Segmented, que sigue pendiente de System Design (en el recorrido, «Dar cupón» y «Crear y enviar» salen sin amarillo por ese bug).
- **Tabla de Cupones en móvil** (390 px) se desplaza en horizontal dentro de su contenedor, como en M12a; el badge «Personal» ya envuelve.
- **Canje de un cupón personal en checkout** probado con tests de integración (dueño sí, otro cliente «no válido», invitado 401, un solo uso); no se hizo una compra real en el navegador.
- **El recorrido en navegador** se hizo en una copia con `mongod` local, sin tocar Atlas ni el `next dev` de Manuel. Se compiló una sola vez con `NEXT_PUBLIC_API_URL=http://localhost:4100/api/v1` (no también con 4000: es el mismo código). Al armar la copia, `rsync` arrastró `.env.development.local`: se borró de la copia antes de repetir (el primer intento usó Resend real y fue rechazado con 422; no salió ningún correo). Los archivos `.env*` deben excluirse del rsync.
- **Flake conocido de la suite del API:** en la corrida completa cayeron `adminPrints` y `webhookRetry`; aislados pasan.
- Heredados sin cambio: botón primary/`Segmented` sin relleno de marca, `writtenUrls` unificar, CSP Cloudinary, lint de `enviaShippingProvider.ts`.
- Para M12c: `mockups/` se borra al cerrar M12, pantalla «reiniciar 2FA» y edición de la tasa de IVA en Ajustes.
