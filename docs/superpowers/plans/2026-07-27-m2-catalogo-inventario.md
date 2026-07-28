# M2 · Catálogo + Inventario — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use `subagent-driven-development` (recomendado) o `executing-plans` para ejecutar tarea por tarea. Los pasos usan checkbox (`- [ ]`).
>
> **Al aprobar:** copiar este archivo a `docs/superpowers/plans/2026-07-27-m2-catalogo-inventario.md` (convención del repo) antes de empezar.

## Context

Gira Clothing es un e-commerce a medida cuyo diferenciador es el **print como decisión principal de compra**: el mismo modelo existe en varias telas, y el stock es independiente por combinación modelo + print. Por eso no sirve el modelo talla/color de Shopify.

M1 ya está hecho y mergeado a `main`: monorepo pnpm (`apps/api` + `packages/shared`), Express 5 + TS estricto + Mongoose 8, cadena de middlewares endurecida, auth JWT en cookie HttpOnly + 2FA TOTP, 41 tests verdes. Hoy el catálogo no existe en el backend.

**M2 construye el corazón del dominio**: las cinco entidades de catálogo con sus CRUD por capa, el utilitario transversal de listados que faltaba desde M1 (`parseListQuery` se difirió a propósito hasta tener un consumidor real), los uploads a Cloudinary detrás de adapter, los endpoints públicos con filtro cruzado por print/familia, y el invariante que sostiene todo lo que viene después: **stock atómico que nunca puede quedar negativo**. M3 (órdenes/pagos) construye sobre este invariante — si aquí queda mal, el oversell es inevitable.

**Resultado esperado:** el panel admin (M5) puede dar de alta todo el catálogo vía API, y el frontend público (M5) puede listar productos filtrando por estampado y por familia.

### Fuera de alcance (no-negociable #5)
Settings singleton, carrito, órdenes, pagos, reservas con TTL, cron, mailer, Telegram, dashboard, frontend. Nada de esto se toca ni se "prepara".

### Decisiones tomadas en esta sesión (vinculantes)
| Decisión | Elección |
|---|---|
| Stock en M2 | **Solo ajuste admin.** `setOnHand`/`adjustOnHand` atómicos. `reserved` existe en el schema pero **nada lo escribe** hasta M3. Sin primitivas reserve/release/commit. |
| Identificadores | **Slug único + ObjectId.** Público resuelve por slug; admin opera por `_id`. |
| Uploads | **Endpoint dedicado** `POST /admin/uploads` (multer memoryStorage) → `UploadService` → `{ url, publicId, width, height }`. Los CRUD reciben ese objeto como JSON plano. |
| DELETE | **Baja lógica** (`isActive:false`) + **guard referencial**: no se desactiva un padre con hijos activos → 409. |

**Goal:** Entregar el dominio de catálogo e inventario completo en `apps/api`, con stock atómico probado bajo concurrencia real.

**Architecture:** Se replica exactamente el layering de M1 (`routes → controllers → services → models`, controllers nunca importan models — lo impone ESLint). Cinco modelos Mongoose nuevos con índices diseñados para los dos filtros del spec (print y categoría). Un utilitario transversal (`parseListQuery`/`buildMeta`) que **todos** los listados consumen. Cloudinary detrás de una interfaz de dominio angosta con fallback stub sin red. El stock vive solo en `Variant` y solo `inventoryService` lo escribe, siempre con un `findOneAndUpdate` cuyo filtro lleva el invariante.

**Tech Stack:** Node 24 · pnpm 9.12 · TS estricto NodeNext ESM · Express 5 · Mongoose 8 · Joi · multer · cloudinary · Vitest + supertest + mongodb-memory-server.

---

## Estructura de archivos

### `packages/shared` (modificar)
| Archivo | Responsabilidad |
|---|---|
| `src/enums/auditAction.ts` | + `AuditModule.CATALOG` / `INVENTORY` y las acciones de catálogo/stock. |

No hay tipos nuevos: `ApiMeta { total, page, pages, limit }` ya es exactamente lo que produce `buildMeta`. Sin enum de moneda (M2 es MXN implícito).

### `apps/api/src` (crear)
| Carpeta | Archivos |
|---|---|
| `utils/` | `parseListQuery.ts` (+`buildMeta`,`escapeRegex`) · `slug.ts` · `sku.ts` · `imageSignature.ts` |
| `adapters/upload/` | `types.ts` · `cloudinaryUploadService.ts` · `stubUploadService.ts` · `index.ts` (factory) |
| `middlewares/` | `upload.ts` (multer) |
| `models/` | `schemas/image.ts` · `PrintFamily.ts` · `Print.ts` · `ProductCategory.ts` · `Product.ts` · `Variant.ts` |
| `validators/` | `commonValidator.ts` · `listQueryValidator.ts` · `printFamilyValidator.ts` · `printValidator.ts` · `productCategoryValidator.ts` · `productValidator.ts` · `variantValidator.ts` · `catalogValidator.ts` |
| `services/` | `printFamilyService.ts` · `printService.ts` · `productCategoryService.ts` · `productService.ts` · `variantService.ts` · `inventoryService.ts` · `catalogService.ts` · `mediaService.ts` |
| `controllers/` | `printFamilyController.ts` · `printController.ts` · `productCategoryController.ts` · `productController.ts` · `variantController.ts` · `catalogController.ts` · `uploadController.ts` |
| `routes/v1/admin/` | `index.ts` (aplica `protect`+`restrictTo(ADMIN)` **a nivel de router**) · `printFamilyRoutes.ts` · `printRoutes.ts` · `productCategoryRoutes.ts` · `productRoutes.ts` · `variantRoutes.ts` · `uploadRoutes.ts` |
| `routes/v1/` | `catalogRoutes.ts` (público) |

> El guard a nivel de router (y no por ruta como en `authRoutes.ts`) es deliberado: con ~26 rutas admin, un guard por ruta es una superficie de "olvidé una línea = IDOR". Documentarlo en el header del archivo.

### Archivos de M1 a modificar
| Archivo | Cambio |
|---|---|
| [routes/v1/index.ts](apps/api/src/routes/v1/index.ts) | Montar `adminRouter` en `/admin` y `catalogRouter` en `/catalog`. |
| [middlewares/errorHandler.ts](apps/api/src/middlewares/errorHandler.ts) | Rama `MulterError` (413/400); ensanchar `MongoLikeError.code` a `number \| string`. |
| [config/env.ts](apps/api/src/config/env.ts) | `cloudinary: CloudinaryConfig \| null` en `Env`, con el patrón `requireVar` existente. |
| [apps/api/package.json](apps/api/package.json) | deps `cloudinary`, `multer`; devDep `@types/multer`. |
| [apps/api/tsconfig.json](apps/api/tsconfig.json) | `"types": ["node", "multer"]` (hoy es `["node"]`; necesario para que `tsc` vea `req.file`). |
| `apps/api/.env.development.example` y `.env.production.example` | 4 líneas Cloudinary con placeholders. |
| [apps/api/tests/setup.ts](apps/api/tests/setup.ts) | `delete process.env.CLOUDINARY_*` (fuerza el stub) + sync de índices post-connect. |
| [eslint.config.mjs](eslint.config.mjs) | Añadir `**/adapters/*` al grupo restringido para controllers/routes. |

---

## Tarea 0: Rama de trabajo

El repo está en `main` limpio (`5aa04eb Merge M1`). La rama `feat/m2-catalogo-inventario` **no existe todavía**.

- [ ] **Paso 1:** pedir aprobación a Manuel y ejecutar `git checkout -b feat/m2-catalogo-inventario`. Ninguna tarea posterior toca git sin mostrar `git status` + `git diff` y esperar aprobación explícita.

---

## Tarea 1: Enums compartidos

**Files:** Modify `packages/shared/src/enums/auditAction.ts`

- [ ] **Paso 1: Añadir los módulos y acciones** (al final de cada enum, sin reordenar los de M1)

```ts
enum AuditModule {
  AUTH = "auth",
  CATALOG = "catalog",
  INVENTORY = "inventory",
}

enum AuditAction {
  // ...acciones de M1 sin tocar...
  PRINT_FAMILY_CREATED = "print_family_created",
  PRINT_FAMILY_UPDATED = "print_family_updated",
  PRINT_FAMILY_DEACTIVATED = "print_family_deactivated",
  PRINT_CREATED = "print_created",
  PRINT_UPDATED = "print_updated",
  PRINT_DEACTIVATED = "print_deactivated",
  PRODUCT_CATEGORY_CREATED = "product_category_created",
  PRODUCT_CATEGORY_UPDATED = "product_category_updated",
  PRODUCT_CATEGORY_DEACTIVATED = "product_category_deactivated",
  PRODUCT_CREATED = "product_created",
  PRODUCT_UPDATED = "product_updated",
  PRODUCT_DEACTIVATED = "product_deactivated",
  VARIANT_CREATED = "variant_created",
  VARIANT_UPDATED = "variant_updated",
  VARIANT_DEACTIVATED = "variant_deactivated",
  IMAGE_UPLOADED = "image_uploaded",
  STOCK_SET = "stock_set",
  STOCK_ADJUSTED = "stock_adjusted",
}
```

Acciones por entidad y no un `CATALOG_UPDATED` genérico: `module` solo no distingue cuatro entidades, y el panel de auditoría necesita responder "quién desactivó qué estampado" sin decodificar `targetId`.

- [ ] **Paso 2: Rebuild obligatorio**

Run: `pnpm --filter @gira/shared build`
Expected: build limpio. **Sin esto, `apps/api` sigue viendo el enum de M1** (el paquete resuelve a `dist/`) y tanto `tsc` como vitest fallarán con "has no member CATALOG".

- [ ] **Paso 3:** `pnpm -r exec tsc --noEmit` → sin errores. Mostrar diff, pedir aprobación, commit.

---

## Tarea 2: `parseListQuery` + `buildMeta` (TDD)

**Files:** Create `apps/api/src/utils/parseListQuery.ts`, Test `apps/api/tests/unit/parseListQuery.test.ts`

- [ ] **Paso 1: Escribir el test primero** — casos exactos a cubrir:

```ts
import { describe, it, expect } from "vitest";
import { parseListQuery, buildMeta } from "../../src/utils/parseListQuery.js";

const CONFIG = { sortable: ["name", "createdAt"], searchable: ["name", "sku"], defaultSort: "name" } as const;

describe("parseListQuery · paginación", () => {
  it("aplica page 1 y limit 20 por defecto", () => {
    const r = parseListQuery({}, CONFIG);
    expect(r).toMatchObject({ page: 1, limit: 20, skip: 0 });
  });
  it("recorta limit al máximo de 100", () => {
    expect(parseListQuery({ limit: 1000 }, CONFIG).limit).toBe(100);
  });
  it("cae a page 1 con valores inválidos", () => {
    for (const page of [0, -3, "abc", null]) {
      expect(parseListQuery({ page }, CONFIG).page).toBe(1);
    }
  });
  it("calcula skip como (page - 1) * limit", () => {
    expect(parseListQuery({ page: 3, limit: 10 }, CONFIG).skip).toBe(20);
  });
});

describe("parseListQuery · orden", () => {
  it("ordena ascendente con desempate por _id", () => {
    expect(parseListQuery({ sort: "name" }, CONFIG).sort).toEqual({ name: 1, _id: 1 });
  });
  it("ordena descendente con prefijo -", () => {
    expect(parseListQuery({ sort: "-createdAt" }, CONFIG).sort).toEqual({ createdAt: -1, _id: -1 });
  });
  it("ignora un campo fuera de la whitelist y usa el orden por defecto", () => {
    expect(parseListQuery({ sort: "password" }, CONFIG).sort).toEqual({ name: 1, _id: 1 });
  });
});

describe("parseListQuery · búsqueda", () => {
  it("construye $or sobre cada campo buscable", () => {
    const { filter } = parseListQuery({ search: "tote" }, CONFIG);
    expect(filter.$or).toHaveLength(2);
  });
  it("escapa los metacaracteres de regex", () => {
    const { filter } = parseListQuery({ search: ".*" }, CONFIG);
    const first = (filter.$or as { name: RegExp }[])[0];
    expect(first.name.source).toBe("\\.\\*");
  });
  it("no agrega $or con búsqueda vacía o en blanco", () => {
    expect(parseListQuery({ search: "   " }, CONFIG).filter.$or).toBeUndefined();
  });
  it("trunca la búsqueda a 80 caracteres", () => {
    const { filter } = parseListQuery({ search: "a".repeat(200) }, CONFIG);
    expect(((filter.$or as { name: RegExp }[])[0]).name.source).toHaveLength(80);
  });
  it("preserva los filtros explícitos recibidos", () => {
    expect(parseListQuery({}, CONFIG, { isActive: true }).filter).toMatchObject({ isActive: true });
  });
});

describe("buildMeta", () => {
  it("devuelve 0 páginas cuando no hay resultados", () => {
    expect(buildMeta(0, { page: 1, limit: 20 })).toEqual({ total: 0, page: 1, limit: 20, pages: 0 });
  });
  it("redondea hacia arriba la última página parcial", () => {
    expect(buildMeta(21, { page: 1, limit: 20 }).pages).toBe(2);
  });
});
```

- [ ] **Paso 2: Correr y verificar que falla**

Run: `pnpm --filter @gira/api test -- parseListQuery`
Expected: FAIL — "Cannot find module '../../src/utils/parseListQuery.js'".

- [ ] **Paso 3: Implementar**

```ts
import type { ApiMeta } from "@gira/shared";

/**
 * Transversal list parser (BACKEND_ARCHITECTURE_GUIDELINES, "Listados
 * administrativos"). Every admin/public listing goes through this: paginate,
 * sort, search, filter — never a raw client object handed to Mongo.
 *
 * The caller builds `filters` EXPLICITLY from already-validated query params.
 * Nothing from `query` reaches the Mongo filter except the escaped search term.
 */

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const MAX_SEARCH_LENGTH = 80;

interface ListQueryConfig {
  /** Whitelisted sortable fields. Anything else falls back to `defaultSort`. */
  sortable: readonly string[];
  /** Whitelisted fields the free-text search runs against. */
  searchable: readonly string[];
  /** e.g. "name" or "-createdAt". Its field must be in `sortable`. */
  defaultSort: string;
  defaultLimit?: number;
  maxLimit?: number;
}

interface RawListQuery {
  page?: unknown;
  limit?: unknown;
  sort?: unknown;
  search?: unknown;
}

interface ParsedListQuery {
  page: number;
  limit: number;
  skip: number;
  sort: Record<string, 1 | -1>;
  filter: Record<string, unknown>;
}

/** Escapes every regex metacharacter (anti-ReDoS / anti-injection, SECURITY §4). */
const escapeRegex = (input: string): string => input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const toPositiveInt = (value: unknown, fallback: number): number => {
  const n = Number(value);
  return Number.isFinite(n) && n >= 1 ? Math.trunc(n) : fallback;
};

const parseSort = (raw: unknown, config: ListQueryConfig): Record<string, 1 | -1> => {
  const candidate = typeof raw === "string" && raw.trim() ? raw.trim() : config.defaultSort;
  const desc = candidate.startsWith("-");
  const field = desc ? candidate.slice(1) : candidate;
  const allowed = config.sortable.includes(field);
  const safeField = allowed ? field : config.defaultSort.replace(/^-/, "");
  const safeDesc = allowed ? desc : config.defaultSort.startsWith("-");
  // `_id` tiebreaker keeps pagination deterministic when the sort key repeats.
  return { [safeField]: safeDesc ? -1 : 1, _id: safeDesc ? -1 : 1 };
};

const parseListQuery = (
  query: RawListQuery,
  config: ListQueryConfig,
  filters: Record<string, unknown> = {},
): ParsedListQuery => {
  const maxLimit = config.maxLimit ?? MAX_LIMIT;
  const page = toPositiveInt(query.page, 1);
  const limit = Math.min(toPositiveInt(query.limit, config.defaultLimit ?? DEFAULT_LIMIT), maxLimit);

  const filter: Record<string, unknown> = { ...filters };

  const term =
    typeof query.search === "string" ? query.search.trim().slice(0, MAX_SEARCH_LENGTH) : "";
  if (term && config.searchable.length > 0) {
    const rx = new RegExp(escapeRegex(term), "i");
    filter.$or = config.searchable.map((field) => ({ [field]: rx }));
  }

  return { page, limit, skip: (page - 1) * limit, sort: parseSort(query.sort, config), filter };
};

const buildMeta = (total: number, { page, limit }: { page: number; limit: number }): ApiMeta => ({
  total,
  page,
  limit,
  pages: total === 0 ? 0 : Math.ceil(total / limit),
});

export type { ListQueryConfig, ParsedListQuery, RawListQuery };
export { parseListQuery, buildMeta, escapeRegex };
```

> Nota para el header: `filter.$or` se agrega **después** de que `mongoSanitize` corrió sobre `req.query`, así que el middleware nunca borra nuestro propio operador — solo saneó el objeto del cliente.

- [ ] **Paso 4:** correr el test → PASS. `pnpm --filter @gira/api typecheck` y `pnpm lint` limpios.
- [ ] **Paso 5:** mostrar diff, pedir aprobación, commit.

---

## Tarea 3: `slug.ts` y `sku.ts` (TDD)

**Files:** Create `apps/api/src/utils/slug.ts`, `apps/api/src/utils/sku.ts`; Test `apps/api/tests/unit/slug.test.ts`, `apps/api/tests/unit/sku.test.ts`

- [ ] **Paso 1: Tests primero**

```ts
// slug.test.ts
describe("slugify", () => {
  it("elimina acentos", () => expect(slugify("Bárbara")).toBe("barbara"));
  it("normaliza eñes y espacios", () => expect(slugify("Ñandú Ruffles")).toBe("nandu-ruffles"));
  it("colapsa signos y recorta guiones", () => expect(slugify("  Tote — Bag!! ")).toBe("tote-bag"));
  it("devuelve cadena vacía si no queda nada utilizable", () => expect(slugify("🌸🌸")).toBe(""));
});

describe("resolveUniqueSlug", () => {
  it("devuelve la base cuando está libre", async () => {
    await expect(resolveUniqueSlug("tote", async () => false)).resolves.toBe("tote");
  });
  it("agrega -2 cuando la base está tomada", async () => {
    const taken = new Set(["tote"]);
    await expect(resolveUniqueSlug("tote", async (c) => taken.has(c))).resolves.toBe("tote-2");
  });
  it("agrega -3 cuando la base y -2 están tomadas", async () => {
    const taken = new Set(["tote", "tote-2"]);
    await expect(resolveUniqueSlug("tote", async (c) => taken.has(c))).resolves.toBe("tote-3");
  });
  it("lanza 400 con base vacía", async () => {
    await expect(resolveUniqueSlug("", async () => false)).rejects.toMatchObject({ statusCode: 400 });
  });
});

// sku.test.ts
describe("buildVariantSku", () => {
  it("compone producto y estampado en mayúsculas", () =>
    expect(buildVariantSku("tote-bag", "FLR-001")).toBe("TOTE-BAG-FLR-001"));
  it("normaliza minúsculas y acentos", () =>
    expect(buildVariantSku("bárbara mini", "lun 02")).toBe("BARBARA-MINI-LUN-02"));
  it("no deja guiones sobrantes al inicio ni al final", () =>
    expect(buildVariantSku("--tote--", "--flr--")).toBe("TOTE-FLR"));
  it("trunca a 48 caracteres", () =>
    expect(buildVariantSku("a".repeat(60), "b".repeat(60))).toHaveLength(48));
});
```

- [ ] **Paso 2:** correr → FAIL (módulos inexistentes).
- [ ] **Paso 3: Implementar**

```ts
// utils/slug.ts
import { AppError } from "./AppError.js";

/** URL-safe slug: strips diacritics ("Bárbara" -> "barbara"), lowercases, dashes. */
const slugify = (input: string): string =>
  input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip combining diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/**
 * Appends -2, -3, ... until `isTaken` says the candidate is free. IO is injected
 * so this stays pure and unit-testable; each service passes its own model check.
 * The unique index is the real guarantee — this loop is only UX.
 */
const resolveUniqueSlug = async (
  base: string,
  isTaken: (candidate: string) => Promise<boolean>,
): Promise<string> => {
  if (!base) throw new AppError("El nombre no permite generar una URL válida.", 400);
  let candidate = base;
  let n = 1;
  while (await isTaken(candidate)) {
    n += 1;
    candidate = `${base}-${n}`;
  }
  return candidate;
};

export { slugify, resolveUniqueSlug };
```

```ts
// utils/sku.ts
/** Uppercase, ASCII-only, dash-separated SKU token. */
const normalizeSku = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/**
 * Deterministic `<PRODUCT-TOKEN>-<PRINT-SKU>`, capped at Variant.sku maxlength.
 * Derived ONCE at creation and never recomputed: a SKU that changes when someone
 * fixes a typo in the product name breaks printed labels and M3 order snapshots.
 */
const buildVariantSku = (productSlug: string, printSku: string): string =>
  `${normalizeSku(productSlug).slice(0, 24)}-${normalizeSku(printSku)}`.slice(0, 48).replace(/-+$/, "");

export { normalizeSku, buildVariantSku };
```

- [ ] **Paso 4:** tests PASS, typecheck y lint limpios.
- [ ] **Paso 5:** diff, aprobación, commit.

---

## Tarea 4: Modelos base y validadores comunes

**Files:** Create `apps/api/src/models/schemas/image.ts`, `models/PrintFamily.ts`, `models/ProductCategory.ts`, `validators/commonValidator.ts`, `validators/listQueryValidator.ts`. **Depends on:** Tarea 1.

- [ ] **Paso 1: Sub-schema de imagen reutilizable**

```ts
import { Schema } from "mongoose";

/**
 * Image reference produced by the upload endpoint. Stored exactly as the
 * UploadService returns it so CRUD payloads need zero transformation, and
 * `publicId` is kept so the asset can be destroyed at the provider later.
 */
interface ImageAttrs {
  url: string;
  publicId: string;
  width: number;
  height: number;
}

const imageSchema = new Schema<ImageAttrs>(
  {
    url: { type: String, required: true, trim: true },
    publicId: { type: String, required: true, trim: true },
    width: { type: Number, required: true, min: 1 },
    height: { type: Number, required: true, min: 1 },
  },
  { _id: false },
);

export type { ImageAttrs };
export { imageSchema };
```

Solo `Print` (foto macro, requerida) y `Variant` (`images: [imageSchema]`) llevan imágenes — es lo que dice el modelo de dominio del spec. Darle imágenes a familias/categorías/productos sería una feature no pedida.

- [ ] **Paso 2: PrintFamily y ProductCategory** (misma forma; colecciones y ciclos de vida distintos, por eso son dos modelos y no una "taxonomía" genérica). Seguir la tríada `XAttrs`/`XModel`/`XDocument` de [models/User.ts](apps/api/src/models/User.ts):

```ts
interface PrintFamilyAttrs {
  name: string;
  slug: string;
  description?: string;
  isActive: boolean;
}
type PrintFamilyModel = Model<PrintFamilyAttrs>;
type PrintFamilyDocument = HydratedDocument<PrintFamilyAttrs>;

const printFamilySchema = new Schema<PrintFamilyAttrs, PrintFamilyModel>(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    description: { type: String, trim: true, maxlength: 500 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

// Admin + public listing: filter by isActive, sort by name.
printFamilySchema.index({ isActive: 1, name: 1 });

const PrintFamily = model<PrintFamilyAttrs, PrintFamilyModel>("PrintFamily", printFamilySchema);

export type { PrintFamilyAttrs, PrintFamilyDocument };
export { PrintFamily };
```

`ProductCategory` es idéntico cambiando los nombres. **No declarar `index: true` junto a `unique: true`** — Mongoose 8 avisa de índice duplicado.

- [ ] **Paso 3: Validadores comunes**

```ts
// validators/commonValidator.ts
import Joi from "joi";

const objectId = Joi.string()
  .pattern(/^[0-9a-fA-F]{24}$/)
  .messages({ "string.pattern.base": "El identificador no tiene un formato válido." });

const slugValue = Joi.string()
  .trim()
  .lowercase()
  .max(120)
  .pattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .messages({ "string.pattern.base": "La URL amigable no tiene un formato válido." });

const objectIdParamSchema = Joi.object({ id: objectId.required() });
const slugParamSchema = Joi.object({ slug: slugValue.required() });

const imageObjectSchema = Joi.object({
  url: Joi.string().uri({ scheme: ["https"] }).required().messages({
    "string.uri": "La imagen debe tener una URL https válida.",
    "any.required": "La imagen es obligatoria.",
  }),
  publicId: Joi.string().trim().max(200).required(),
  width: Joi.number().integer().min(1).required(),
  height: Joi.number().integer().min(1).required(),
});

export { objectId, slugValue, objectIdParamSchema, slugParamSchema, imageObjectSchema };
```

```ts
// validators/listQueryValidator.ts
import Joi from "joi";

/** Base every admin/public list query extends with its own explicit filters. */
const listQueryBase = Joi.object({
  page: Joi.number().integer().min(1).default(1).messages({
    "number.base": "La página debe ser un número.",
  }),
  limit: Joi.number().integer().min(1).max(100).default(20).messages({
    "number.max": "El máximo por página es 100.",
  }),
  sort: Joi.string().trim().max(40),
  search: Joi.string().trim().max(80).allow(""),
});

export { listQueryBase };
```

- [ ] **Paso 4:** `pnpm --filter @gira/api typecheck` limpio. Diff, aprobación, commit.

---

## Tarea 5: Vertical slice de referencia — CRUD de PrintFamily (TDD)

**Depends on:** 2, 3, 4. **Esta tarea define el patrón que las tareas 6, 8, 9 y 10 copian mecánicamente.**

**Files:**
- Create: `validators/printFamilyValidator.ts`, `services/printFamilyService.ts`, `controllers/printFamilyController.ts`, `routes/v1/admin/index.ts`, `routes/v1/admin/printFamilyRoutes.ts`
- Create test helpers: `tests/helpers/auth.ts`, `tests/helpers/factories.ts`
- Modify: `routes/v1/index.ts`, `tests/setup.ts`
- Test: `tests/integration/adminPrintFamilies.test.ts`

- [ ] **Paso 1: Helpers de test compartidos** (no son archivos `.test.ts`, así que vitest no los ejecuta — `include` es `tests/**/*.test.ts`)

```ts
// tests/helpers/auth.ts
import request from "supertest";
import type { Express } from "express";
import { User } from "../../src/models/User.js";
import { UserRole } from "@gira/shared";

const ORIGIN = "http://localhost:3000";

const cookieFrom = (res: request.Response): string => {
  const raw = res.headers["set-cookie"];
  const list = Array.isArray(raw) ? raw : [raw];
  return list.map((c) => String(c).split(";")[0]).join("; ");
};

/** Creates an admin directly (register always yields customer) and logs in. */
const loginAsAdmin = async (app: Express): Promise<string> => {
  const email = `admin${Date.now()}@gira.test`;
  await User.create({ name: "Admin", email, password: "Admin1234", role: UserRole.ADMIN });
  const res = await request(app)
    .post("/api/v1/auth/login")
    .set("Origin", ORIGIN)
    .send({ email, password: "Admin1234" });
  return cookieFrom(res);
};

const loginAsCustomer = async (app: Express): Promise<string> => {
  const email = `cliente${Date.now()}@gira.test`;
  await request(app)
    .post("/api/v1/auth/register")
    .set("Origin", ORIGIN)
    .send({ name: "Cliente", email, password: "Cliente123" });
  const res = await request(app)
    .post("/api/v1/auth/login")
    .set("Origin", ORIGIN)
    .send({ email, password: "Cliente123" });
  return cookieFrom(res);
};

export { ORIGIN, cookieFrom, loginAsAdmin, loginAsCustomer };
```

> **Gotcha:** toda petición mutante en supertest necesita `.set("Origin", ORIGIN)` o `verifyOrigin` responde 403. Los helpers lo traen incorporado; el resto de los tests debe hacerlo explícito.

- [ ] **Paso 2: Sync de índices en `tests/setup.ts`** — después de `mongoose.connect`, y limpiar credenciales:

```ts
// Force the stub upload adapter: a developer's shell must never leak real
// credentials into the test run.
delete process.env.CLOUDINARY_CLOUD_NAME;
delete process.env.CLOUDINARY_API_KEY;
delete process.env.CLOUDINARY_API_SECRET;

// ...inside beforeAll, after connect: unique-index assertions must be
// deterministic on the first test (autoIndex builds lazily otherwise).
await Promise.all(mongoose.modelNames().map((n) => mongoose.model(n).init()));
```

- [ ] **Paso 3: Escribir `tests/integration/adminPrintFamilies.test.ts` primero.** Casos:

| Grupo | Casos |
|---|---|
| Autorización | anónimo → 401 en GET/POST/PATCH/DELETE; cliente autenticado → 403 |
| Creación | 201 con slug derivado (`"Florales Vintage"` → `florales-vintage`); acentos (`"Bárbara"` → `barbara`); nombre duplicado → segundo slug `-2`; sin `name` → 400; `name` de 200 chars → 400; campo desconocido descartado por `stripUnknown` |
| Listado | `meta` correcto en 2 páginas (crear 25, `?limit=10&page=3` → `items.length === 5`, `meta.pages === 3`); `?search=` filtra; `?isActive=false` filtra; `?limit=1000` → 400 (Joi) |
| Detalle | 200; id inexistente → 404; id malformado → 400 |
| Actualización | PATCH renombra y re-sluga; el slug propio no colisiona consigo mismo |
| Baja lógica | DELETE sin hijos → 200 y `isActive:false`; **DELETE con un `Print` activo → 409**; con hijos solo inactivos → 200; `PATCH {isActive:false}` corre el mismo guard → 409 |
| Auditoría | crear escribe un `PRINT_FAMILY_CREATED`; el 409 del guard no escribe nada |

> Los casos con `Print` hijo se escriben en esta tarea pero se activan en la Tarea 8 (cuando exista el modelo). Marcarlos `it.todo` aquí y convertirlos a `it` en la Tarea 8 — está en la checklist de esa tarea.

- [ ] **Paso 4:** correr → FAIL (404 en todas las rutas).

- [ ] **Paso 5: Validator**

```ts
import Joi from "joi";
import { listQueryBase } from "./listQueryValidator.js";

const name = Joi.string().trim().min(2).max(80).messages({
  "string.min": "El nombre debe tener al menos 2 caracteres.",
  "string.max": "El nombre no puede exceder 80 caracteres.",
  "any.required": "El nombre es obligatorio.",
  "string.empty": "El nombre es obligatorio.",
});

const createPrintFamilySchema = Joi.object({
  name: name.required(),
  description: Joi.string().trim().max(500).allow(""),
});

const updatePrintFamilySchema = Joi.object({
  name,
  description: Joi.string().trim().max(500).allow(""),
  isActive: Joi.boolean(),
})
  .min(1)
  .messages({ "object.min": "Envía al menos un campo para actualizar." });

const printFamilyListQuerySchema = listQueryBase.keys({ isActive: Joi.boolean() });

export { createPrintFamilySchema, updatePrintFamilySchema, printFamilyListQuerySchema };
```

- [ ] **Paso 6: Service** — la única capa que toca models; devuelve DTOs, nunca documentos.

```ts
/**
 * PrintFamily CRUD. Deactivation is a soft delete guarded by referential
 * integrity: a family with active prints cannot be retired, or the catalog
 * would show orphaned prints.
 */

const LIST_CONFIG: ListQueryConfig = {
  sortable: ["name", "createdAt", "updatedAt"],
  searchable: ["name"],
  defaultSort: "name",
};

interface PublicPrintFamily {
  id: string;
  name: string;
  slug: string;
  description?: string;
  isActive: boolean;
}

// .lean() docs have no `id` virtual — map _id explicitly.
const toPublicPrintFamily = (doc: PrintFamilyLean): PublicPrintFamily => ({
  id: String(doc._id),
  name: doc.name,
  slug: doc.slug,
  ...(doc.description ? { description: doc.description } : {}),
  isActive: doc.isActive,
});

const createPrintFamily = async (
  input: CreatePrintFamilyInput,
  ctx: RequestContext,
): Promise<PublicPrintFamily> => {
  const slug = await resolveUniqueSlug(
    slugify(input.name),
    async (c) => (await PrintFamily.exists({ slug: c })) !== null,
  );
  // Explicit assignment — never spread the payload (anti mass-assignment).
  const created = await PrintFamily.create({
    name: input.name,
    slug,
    description: input.description,
  });
  await recordAudit({
    actorId: ctx.actorId,
    actorType: "user",
    action: AuditAction.PRINT_FAMILY_CREATED,
    module: AuditModule.CATALOG,
    targetId: created.id as string,
    ip: ctx.ip,
  });
  return toPublicPrintFamily(created.toObject());
};

const listPrintFamilies = async (
  query: PrintFamilyListQuery,
): Promise<{ items: PublicPrintFamily[]; meta: ApiMeta }> => {
  const filters: Record<string, unknown> = {};
  if (query.isActive !== undefined) filters.isActive = query.isActive;

  const { filter, sort, skip, limit, page } = parseListQuery(query, LIST_CONFIG, filters);
  const [docs, total] = await Promise.all([
    PrintFamily.find(filter).sort(sort).skip(skip).limit(limit).lean(),
    PrintFamily.countDocuments(filter),
  ]);
  return { items: docs.map(toPublicPrintFamily), meta: buildMeta(total, { page, limit }) };
};

/** Soft delete + referential guard. Same guard runs on PATCH { isActive: false }. */
const deactivatePrintFamily = async (
  id: string,
  ctx: RequestContext,
): Promise<PublicPrintFamily> => {
  const family = await PrintFamily.findById(id);
  if (!family) throw new AppError("La familia de estampados no existe.", 404);

  const activeChildren = await Print.countDocuments({ family: id, isActive: true });
  if (activeChildren > 0) {
    throw new AppError(
      "No puedes retirar una familia con estampados activos. Retira primero sus estampados.",
      409,
    );
  }

  family.isActive = false;
  await family.save();
  await recordAudit({ /* PRINT_FAMILY_DEACTIVATED, module CATALOG, targetId: id */ });
  return toPublicPrintFamily(family.toObject());
};
```

`getPrintFamily(id)` y `updatePrintFamily(id, input, ctx)` siguen la misma forma: 404 si no existe, `resolveUniqueSlug` con `_id: { $ne: id }` al renombrar, audit al final.

- [ ] **Paso 7: Controller** — solo orquesta, `asyncHandler` + `sendResponse`, mensajes en español:

```ts
const create = asyncHandler(async (req: Request, res: Response) => {
  const family = await createPrintFamily(req.body as CreatePrintFamilyInput, buildContext(req));
  sendResponse(res, 201, "Familia de estampados creada correctamente.", { family });
});

const list = asyncHandler(async (req: Request, res: Response) => {
  const { items, meta } = await listPrintFamilies(req.query as PrintFamilyListQuery);
  sendResponse(res, 200, "Familias obtenidas correctamente.", { families: items }, meta);
});
```

`buildContext(req)` (helper local o en `utils/`) devuelve `{ actorId, ip }` desde `req.user` y `req.ip`.

- [ ] **Paso 8: Routers**

```ts
// routes/v1/admin/index.ts
/**
 * Admin router. protect + restrictTo are applied ONCE here, at mount level, so
 * anything mounted below is deny-by-default. With ~26 admin routes a per-route
 * guard would be a "forgot one line = IDOR" surface — that's why this differs
 * from authRoutes.ts. Admin routes are not rate-limited (auth + role is the barrier).
 */
const adminRouter = Router();
adminRouter.use(protect, restrictTo(UserRole.ADMIN));
adminRouter.use("/print-families", printFamilyRouter);

export { adminRouter };
```

```ts
// routes/v1/admin/printFamilyRoutes.ts
const printFamilyRouter = Router();

printFamilyRouter.get("/", validate(printFamilyListQuerySchema, "query"), list);
printFamilyRouter.post("/", validate(createPrintFamilySchema), create);
printFamilyRouter.get("/:id", validate(objectIdParamSchema, "params"), detail);
printFamilyRouter.patch(
  "/:id",
  validate(objectIdParamSchema, "params"),
  validate(updatePrintFamilySchema),
  update,
);
printFamilyRouter.delete("/:id", validate(objectIdParamSchema, "params"), deactivate);

export { printFamilyRouter };
```

Y en [routes/v1/index.ts](apps/api/src/routes/v1/index.ts): `v1Router.use("/admin", adminRouter);`

- [ ] **Paso 9:** `pnpm --filter @gira/api test -- adminPrintFamilies` → PASS (salvo los `it.todo` de guard). `pnpm lint` verifica que el controller no importa models.
- [ ] **Paso 10:** diff, aprobación, commit.

---

## Tarea 6: CRUD de ProductCategory

**Depends on:** 5. Espejo exacto de la Tarea 5 cambiando entidad, mensajes y el guard (hijos = `Product` activos).

**Files:** Create `validators/productCategoryValidator.ts`, `services/productCategoryService.ts`, `controllers/productCategoryController.ts`, `routes/v1/admin/productCategoryRoutes.ts`; Test `tests/integration/adminProductCategories.test.ts`

- [ ] **Paso 1:** escribir `adminProductCategories.test.ts` con la misma matriz de la Tarea 5 (autorización, creación/slug, listado+meta, detalle, actualización, baja lógica). El caso "DELETE con `Product` activo → 409" queda `it.todo` hasta la Tarea 9.
- [ ] **Paso 2:** correr → FAIL.
- [ ] **Paso 3:** implementar validator/service/controller/router copiando la Tarea 5; montar en `adminRouter` bajo `/product-categories`; usar `AuditAction.PRODUCT_CATEGORY_*` y `AuditModule.CATALOG`. Mensaje del guard: `"No puedes retirar una categoría con productos activos. Retira primero sus productos."`
- [ ] **Paso 4:** tests PASS; typecheck y lint limpios.
- [ ] **Paso 5:** diff, aprobación, commit.

---

## Tarea 7: Uploads (adapter Cloudinary + multer)

**Depends on:** 1. **Files:** Create `adapters/upload/{types,cloudinaryUploadService,stubUploadService,index}.ts`, `utils/imageSignature.ts`, `middlewares/upload.ts`, `services/mediaService.ts`, `controllers/uploadController.ts`, `routes/v1/admin/uploadRoutes.ts`; Modify `config/env.ts`, `middlewares/errorHandler.ts`, `tsconfig.json`, `package.json`, ambos `.env.*.example`; Test `tests/unit/imageSignature.test.ts`, `tests/unit/uploadAdapter.test.ts`, `tests/integration/uploads.test.ts`

- [ ] **Paso 1: Dependencias**

Run: `pnpm --filter @gira/api add cloudinary multer && pnpm --filter @gira/api add -D @types/multer`
Después: `pnpm audit --prod --audit-level=high` → sin high/critical.

- [ ] **Paso 2: Env** — Cloudinary es **obligatorio en producción**, todo-o-nada fuera de ella (así `tests/setup.ts` no gana ninguna variable requerida nueva y `env.test.ts` de M1 sigue pasando sin tocarse):

```ts
interface CloudinaryConfig {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
  folder: string;
}

interface Env { /* ...campos de M1... */ cloudinary: CloudinaryConfig | null }

// dentro de loadEnv(), tras las variables de M1:
const cloudFolder = source.CLOUDINARY_FOLDER?.trim() || "gira";
let cloudinary: CloudinaryConfig | null = null;

if (nodeEnv === "production") {
  // In production the real provider is mandatory — no silent stub uploads.
  const cloudName = requireVar(source, "CLOUDINARY_CLOUD_NAME", errors);
  const apiKey = requireVar(source, "CLOUDINARY_API_KEY", errors);
  const apiSecret = requireVar(source, "CLOUDINARY_API_SECRET", errors);
  if (cloudName && apiKey && apiSecret) {
    cloudinary = { cloudName, apiKey, apiSecret, folder: cloudFolder };
  }
} else {
  const cloudName = source.CLOUDINARY_CLOUD_NAME?.trim();
  const apiKey = source.CLOUDINARY_API_KEY?.trim();
  const apiSecret = source.CLOUDINARY_API_SECRET?.trim();
  // All three or none — a half-configured provider fails at request time instead.
  if (cloudName && apiKey && apiSecret) {
    cloudinary = { cloudName, apiKey, apiSecret, folder: cloudFolder };
  } else if (cloudName || apiKey || apiSecret) {
    errors.push(
      "Configuración de Cloudinary incompleta: define CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY y CLOUDINARY_API_SECRET, o ninguna.",
    );
  }
}
```

Añadir a ambos `.env.*.example`:
```
# Cloudinary (obligatorio en producción; si se omite en dev/test se usa un adapter stub sin red)
CLOUDINARY_CLOUD_NAME=<cloud name>
CLOUDINARY_API_KEY=<api key>
CLOUDINARY_API_SECRET=<api secret>
CLOUDINARY_FOLDER=gira
```
Añadir 2 tests a `tests/unit/env.test.ts`: producción sin las 3 vars → error agregado; dev con solo una → error de configuración incompleta.

- [ ] **Paso 3: Interfaz de dominio**

```ts
/**
 * Narrow, domain-owned storage interface (ARCHITECTURE, "integraciones detrás
 * de una interfaz angosta"). No Cloudinary type crosses this boundary, so a
 * second provider is a new file here and nothing else.
 */
interface UploadedImage {
  url: string;
  publicId: string;
  width: number;
  height: number;
}

interface UploadInput {
  buffer: Buffer;
  mimeType: string;
  /** Logical folder: "prints" | "variants". */
  folder: string;
}

interface UploadService {
  upload(input: UploadInput): Promise<UploadedImage>;
  destroy(publicId: string): Promise<void>;
}

export type { UploadedImage, UploadInput, UploadService };
```

- [ ] **Paso 4: Test de magic bytes primero** (`imageSignature.test.ts`): cabeceras reales JPEG (`FFD8FF`), PNG (`89504E47`), WEBP (`RIFF....WEBP`), AVIF (`ftyp`+`avif`) aceptadas; buffer de texto UTF-8 con `mimetype: image/png` → `AppError` 400; buffer truncado → 400. Luego implementar `assertImageSignature(buffer, mimeType)`.

El MIME lo controla el cliente: la whitelist de multer **no basta**, por eso se valida la firma antes de mandar nada a un tercero.

- [ ] **Paso 5: Adapters + factory**

```ts
// cloudinaryUploadService.ts
const upload = ({ buffer, folder }: UploadInput): Promise<UploadedImage> =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: `${cfg.folder}/${folder}`,
        resource_type: "image",
        image_metadata: false, // strip EXIF before it ever lands at the provider
        invalidate: true,
      },
      (err: unknown, result?: UploadApiResponse) => {
        if (err || !result) {
          logger.error({ err }, "Cloudinary upload failed");
          reject(new AppError("No se pudo subir la imagen. Intenta de nuevo.", 502));
          return;
        }
        resolve({
          url: result.secure_url,
          publicId: result.public_id,
          width: result.width,
          height: result.height,
        });
      },
    );
    stream.end(buffer);
  });
```

```ts
// stubUploadService.ts
/**
 * No-network fallback used when Cloudinary credentials are absent (dev/test).
 * Deterministic: same buffer -> same publicId, so tests can assert on it.
 * width/height are 1 to satisfy the schema contract without decoding the image.
 */
const createStubUploadService = (): UploadService => ({
  upload: ({ buffer, folder }) => {
    const hash = createHash("sha256").update(buffer).digest("hex").slice(0, 16);
    return Promise.resolve({
      url: `https://stub.local/${folder}/${hash}.img`,
      publicId: `${folder}/${hash}`,
      width: 1,
      height: 1,
    });
  },
  destroy: () => Promise.resolve(),
});
```

```ts
// index.ts — provider chosen by configuration, never by conditionals in business code.
let cached: UploadService | undefined;
const getUploadService = (): UploadService => {
  cached ??= env.cloudinary
    ? createCloudinaryUploadService(env.cloudinary)
    : createStubUploadService();
  return cached;
};
```

`uploadAdapter.test.ts`: stub determinista y con URL https válida para `imageObjectSchema`; adapter Cloudinary con `vi.mock("cloudinary")` verificando que pasa `resource_type:"image"` y mapea `secure_url/public_id/width/height`, y que un error del SDK sale como `AppError` 502; la factory devuelve el stub cuando `env.cloudinary` es `null`. **Ningún test toca la red.**

- [ ] **Paso 6: multer**

```ts
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);
const MAX_FILE_BYTES = 5 * 1024 * 1024;

// memoryStorage: the buffer goes straight to the provider, never to disk.
const uploadSingleImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES, files: 1, fields: 2 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      cb(new AppError("Formato de imagen no permitido. Usa JPG, PNG, WEBP o AVIF.", 400));
      return;
    }
    cb(null, true);
  },
}).single("file");
```

Multipart nunca pasa por `express.json`, así que el límite de 10 kb del resto de la API queda intacto.

- [ ] **Paso 7: `errorHandler`** — ensanchar `code?: number | string` y agregar antes del `switch (e.name)`:

```ts
if (e.name === "MulterError") {
  switch (e.code) {
    case "LIMIT_FILE_SIZE":
      return new AppError("La imagen excede el tamaño máximo permitido (5 MB).", 413);
    case "LIMIT_FILE_COUNT":
    case "LIMIT_UNEXPECTED_FILE":
      return new AppError('Envía un solo archivo en el campo "file".', 400);
    default:
      return new AppError("No se pudo procesar el archivo enviado.", 400);
  }
}
```
`e.code === 11000` sigue tipando bien con la unión ensanchada.

- [ ] **Paso 8: `mediaService.uploadImage(file, folder, ctx)`** = `assertImageSignature` → `getUploadService().upload(...)` → `recordAudit({ action: IMAGE_UPLOADED, module: CATALOG, targetId: publicId })` → devuelve `UploadedImage`. Los controllers solo tocan este service (nunca el adapter). Ruta: `adminRouter.use("/uploads", uploadRouter)` con `uploadRouter.post("/", uploadSingleImage, uploadImageHandler)`.

- [ ] **Paso 9: `uploads.test.ts`** — anónimo → 401; cliente → 403; sin archivo → 400; `text/plain` adjunto → 400; buffer PNG con magic bytes correctos → 201 con `{url, publicId, width, height}`; buffer de 6 MB → 413; dos archivos → 400; auditoría `IMAGE_UPLOADED` registrada.
- [ ] **Paso 10:** si `tsc` no resuelve `req.file`, poner `"types": ["node", "multer"]` en `apps/api/tsconfig.json`. Añadir `**/adapters/*` al grupo restringido de `eslint.config.mjs`.
- [ ] **Paso 11:** todos los tests PASS. Diff, aprobación, commit.

---

## Tarea 8: Modelo y CRUD de Print

**Depends on:** 5, 7. **Files:** Create `models/Print.ts`, `validators/printValidator.ts`, `services/printService.ts`, `controllers/printController.ts`, `routes/v1/admin/printRoutes.ts`; Test `tests/integration/adminPrints.test.ts`

- [ ] **Paso 1: Escribir `adminPrints.test.ts`** con la matriz de la Tarea 5 más: `family` inexistente al crear → 400; sin `image` → 400; `image` malformada (sin `publicId`, `url` http) → 400; **`sku` duplicado → 409**; `?family=<id>` filtra; DELETE con una `Variant` activa → 409 (`it.todo` hasta la Tarea 10). Además: convertir a `it` los casos `it.todo` de guard en `adminPrintFamilies.test.ts`.
- [ ] **Paso 2:** correr → FAIL.
- [ ] **Paso 3: Modelo**

```ts
interface PrintAttrs {
  name: string;
  slug: string;
  sku: string;
  family: Types.ObjectId;
  /** Macro photo — a print without it is unusable in the selector. */
  image: ImageAttrs;
  isActive: boolean;
}

const printSchema = new Schema<PrintAttrs, PrintModel>(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    sku: { type: String, required: true, unique: true, uppercase: true, trim: true, maxlength: 24 },
    family: { type: Schema.Types.ObjectId, ref: "PrintFamily", required: true },
    image: { type: imageSchema, required: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

// "Prints of this family" — the spec's print-family filter.
printSchema.index({ family: 1, isActive: 1, name: 1 });
// Listing without family filter.
printSchema.index({ isActive: 1, name: 1 });
```

- [ ] **Paso 4: Validator** — `sku` provisto por el admin (catálogo pequeño y curado), requerido y único, patrón `/^[A-Z0-9-]{2,24}$/` con `.uppercase()`; `family: objectId.required()`; `image: imageObjectSchema.required()`. Lista: `printListQuerySchema = listQueryBase.keys({ family: objectId, isActive: Joi.boolean() })`.
- [ ] **Paso 5: Service** — patrón de la Tarea 5, más: verificar que la familia existe y está activa antes de crear (404/400 con mensaje claro); `LIST_CONFIG = { sortable: ["name","sku","createdAt","updatedAt"], searchable: ["name","sku"], defaultSort: "name" }`; `.populate("family", "name slug")` en listado y detalle; guard de baja = `Variant.countDocuments({ print: id, isActive: true })` → `"No puedes retirar un estampado con variantes activas."`
- [ ] **Paso 6:** controller + router montados bajo `/admin/prints`. Tests PASS, typecheck, lint.
- [ ] **Paso 7:** diff, aprobación, commit.

---

## Tarea 9: Modelo y CRUD de Product

**Depends on:** 6. **Files:** Create `models/Product.ts`, `validators/productValidator.ts`, `services/productService.ts`, `controllers/productController.ts`, `routes/v1/admin/productRoutes.ts`; Test `tests/integration/adminProducts.test.ts`

- [ ] **Paso 1: Escribir el test primero**, con la matriz base más: `basePrice` debe ser entero ≥ 0 (`12.5` → 400, `-1` → 400); `materials` con tope de elementos; `measurements` fuera de rango → 400; `category` inexistente → 400; `?category=` filtra; `?sort=basePrice` ordena; DELETE con `Variant` activa → 409 (`it.todo` hasta la Tarea 10). Convertir a `it` el guard pendiente de `adminProductCategories.test.ts`.
- [ ] **Paso 2:** correr → FAIL.
- [ ] **Paso 3: Modelo**

```ts
interface Measurements {
  widthCm?: number;
  heightCm?: number;
  depthCm?: number;
}

interface ProductAttrs {
  name: string;
  slug: string;
  category: Types.ObjectId;
  description?: string;
  /** Base price in MXN centavos (integer). Money in floats drifts, and M3 snapshots this value. */
  basePrice: number;
  measurements: Measurements;
  materials: string[];
  isActive: boolean;
}

const measurementsSchema = new Schema<Measurements>(
  {
    widthCm: { type: Number, min: 0, max: 500 },
    heightCm: { type: Number, min: 0, max: 500 },
    depthCm: { type: Number, min: 0, max: 500 },
  },
  { _id: false },
);

const productSchema = new Schema<ProductAttrs, ProductModel>(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    category: { type: Schema.Types.ObjectId, ref: "ProductCategory", required: true },
    description: { type: String, trim: true, maxlength: 2000 },
    basePrice: { type: Number, required: true, min: 0, validate: Number.isInteger },
    measurements: { type: measurementsSchema, default: () => ({}) },
    materials: { type: [String], default: [] },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

// The main catalog query: products of a category.
productSchema.index({ category: 1, isActive: 1, name: 1 });
// Listing without category filter.
productSchema.index({ isActive: 1, name: 1 });
```

Sin campo `currency`: M2 es MXN (spec: "precio base MXN"). El tipo de cambio es de M3.

- [ ] **Paso 4:** validator (`basePrice: Joi.number().integer().min(0).max(10_000_000).required()`, `materials: Joi.array().items(Joi.string().trim().max(60)).max(10)`, `measurements` como objeto con los tres opcionales), service (`LIST_CONFIG` con `sortable: ["name","basePrice","createdAt","updatedAt"]`, `searchable: ["name"]`; check de categoría; guard sobre `Variant`), controller, router bajo `/admin/products`.
- [ ] **Paso 5:** tests PASS, typecheck, lint. Diff, aprobación, commit.

---

## Tarea 10: Modelo y CRUD de Variant

**Depends on:** 8, 9. **Files:** Create `models/Variant.ts`, `validators/variantValidator.ts`, `services/variantService.ts`, `controllers/variantController.ts`, `routes/v1/admin/variantRoutes.ts`; Modify `services/printService.ts` y `services/productService.ts` (cerrar los guards); Test `tests/integration/adminVariants.test.ts`

- [ ] **Paso 1: Escribir el test primero:** autorización; creación deriva el SKU; **par `(product, print)` duplicado → 409**; `sku` explícito duplicado → 409; `priceOverride` entero ≥ 0 (`10.5` → 400); acepta el array `images` con la forma que devuelve `POST /admin/uploads`; `?product=` y `?print=` filtran; DELETE → baja lógica sin guard de hijos; producto o estampado inexistente → 400. Convertir a `it` los `it.todo` de guard en `adminPrints.test.ts` y `adminProducts.test.ts`.
- [ ] **Paso 2:** correr → FAIL.
- [ ] **Paso 3: Modelo — dueño único del stock**

```ts
interface VariantAttrs {
  product: Types.ObjectId;
  print: Types.ObjectId;
  sku: string;
  images: ImageAttrs[];
  /** Overrides Product.basePrice when present. MXN centavos, integer. */
  priceOverride?: number;
  /** Physical units on hand. Written ONLY by inventoryService. */
  onHand: number;
  /** Units held by in-flight orders. Written by M3 only — nothing in M2 writes it. */
  reserved: number;
  isActive: boolean;
}

const variantSchema = new Schema<VariantAttrs, VariantModel>(
  {
    product: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    print: { type: Schema.Types.ObjectId, ref: "Print", required: true },
    sku: { type: String, required: true, unique: true, uppercase: true, trim: true, maxlength: 48 },
    images: { type: [imageSchema], default: [] },
    priceOverride: { type: Number, min: 0, validate: Number.isInteger },
    onHand: { type: Number, default: 0, min: 0 },
    reserved: { type: Number, default: 0, min: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

// One variant per (product, print) — the pair IS the identity of the variant.
// This index also serves find({ product }) as a prefix, so no extra { product: 1 }.
variantSchema.index({ product: 1, print: 1 }, { unique: true });
// Public cross-filter: "which products exist with this print?" -> distinct("product").
variantSchema.index({ print: 1, isActive: 1, product: 1 });
```

> Comentario obligatorio en el header: **`min: 0` en `onHand`/`reserved` es documentación, no garantía** — los validators de Mongoose no corren en `findOneAndUpdate` sin `runValidators`, y `$inc` los saltea igual. El invariante real vive en el filtro atómico (Tarea 11).

- [ ] **Paso 4:** service — `sku` derivado con `buildVariantSku(product.slug, print.sku)` **solo al crear**, jamás recalculado al actualizar (rompería etiquetas impresas y los snapshots de M3); el validator acepta un `sku` explícito opcional para códigos heredados; verificar que producto y estampado existen; `LIST_CONFIG = { sortable: ["sku","createdAt","updatedAt"], searchable: ["sku"], defaultSort: "sku" }`; DTO público con `available: onHand - reserved`.
- [ ] **Paso 5:** cerrar los guards en `printService.deactivatePrint` y `productService.deactivateProduct` (ahora que `Variant` existe) y activar los `it.todo` correspondientes.
- [ ] **Paso 6:** controller + router bajo `/admin/variants`. Tests PASS. Diff, aprobación, commit.

---

## Tarea 11: Stock atómico (TDD estricto — el corazón de M2)

**Depends on:** 10. **Files:** Create `services/inventoryService.ts`; Modify `validators/variantValidator.ts`, `controllers/variantController.ts`, `routes/v1/admin/variantRoutes.ts`; Test `tests/integration/inventory.test.ts`

### Por qué read-then-write está mal
Dos admins (o un admin y, en M3, el camino de una orden) decrementan la misma variante. Ambos leen `onHand = 1`, ambos calculan `0`, ambos escriben `0`: un decremento desaparece en silencio. Con `-1` cada uno partiendo de una lectura obsoleta, la segunda escritura puede aterrizar sobre un documento ya cambiado y producir `-1`. **Ningún código de aplicación puede cerrar esa ventana** porque lectura y escritura son dos viajes distintos. MongoDB sí garantiza atomicidad de una actualización de un solo documento, así que **la condición tiene que vivir dentro del update**: `findOneAndUpdate` evalúa el filtro y aplica la mutación como una operación indivisible contra el estado comprometido. El perdedor recibe `null` **sin haber tocado el documento del ganador**.

- [ ] **Paso 1: Escribir `tests/integration/inventory.test.ts` COMPLETO antes de una sola línea de implementación.**

Nivel servicio:
1. `setOnHand(v, 25)` en variante nueva → `onHand === 25`, `available === 25`.
2. `setOnHand(v, 3)` con `reserved = 5` (sembrado con un `updateOne` crudo, porque nada más escribe `reserved`) → `AppError` 409 y `onHand` en DB **sin cambios**.
3. `setOnHand(v, 5)` con `reserved = 5` → éxito (frontera: disponible exactamente 0).
4. `setOnHand(<id inexistente>, 1)` → 404.
5. `adjustOnHand(v, +5)` desde 10 → 15.
6. `adjustOnHand(v, -10)` desde `onHand 10, reserved 0` → 0 (frontera).
7. `adjustOnHand(v, -11)` desde 10 → 409 y la DB sigue en 10 (prueba de que no hubo escritura parcial).
8. `adjustOnHand(v, -7)` desde `onHand 10, reserved 4` → 409 (el disponible es 6, no 10).
9. `adjustOnHand(<id inexistente>, -1)` → 404.
10. Auditoría: un ajuste exitoso escribe exactamente un `STOCK_ADJUSTED` con `before.onHand`/`after.onHand`; un 409 no escribe ninguno.

**Concurrencia (el punto de toda la tarea):**
11. Sembrar `onHand = 10, reserved = 0`. `await Promise.allSettled(Array.from({ length: 20 }, () => adjustOnHand(v, -1, ctx)))`. Asertar: exactamente 10 `fulfilled`, exactamente 10 `rejected` con `statusCode === 409`, `onHand` final `=== 0` y nunca negativo.
12. Igual con `onHand = 10, reserved = 4` y 20 decrementos paralelos de `-1`: exactamente **6** exitosos, 14 rechazados, `onHand` final `=== 4`, `available === 0`.
13. Carga mixta desde `onHand = 10`: 10 `-1` y 10 `+1` en paralelo → los 10 incrementos tienen éxito, `onHand >= 0` siempre, y `onHand` final `=== 10 + 10 - (decrementos exitosos)`.

Nivel HTTP:
14. `PATCH /admin/variants/:id/stock` anónimo → 401. 15. como cliente → 403.
16. como admin `{ onHand: 12 }` → 200 con `data.variant.available === 12`.
17. como admin `{ delta: -999 }` → 409 con el mensaje en español.
18. `{ onHand: 5, delta: 1 }` → 400 (xor); `{}` → 400; `{ delta: 0 }` → 400; `{ onHand: -1 }` → 400.
19. `:id` malformado → 400.

- [ ] **Paso 2: Correr y verificar que falla**

Run: `pnpm --filter @gira/api test -- inventory`
Expected: FAIL — `inventoryService` no existe.

- [ ] **Paso 3: Implementar `inventoryService.ts`**

```ts
/**
 * The ONLY module allowed to write onHand. Every mutation is a single atomic
 * findOneAndUpdate whose filter carries the invariant `onHand - reserved >= 0`
 * (ECOMMERCE_ARCHITECTURE_GUIDELINES, "Inventario y concurrencia"). Never
 * read-then-write: the condition and the mutation must be one operation.
 *
 * `reserved` is NOT written here: M2 only exposes admin stock adjustment.
 * Reserve/release/commit primitives belong to M3.
 *
 * Soft-deleted (isActive:false) variants remain adjustable — physical stock
 * exists regardless of catalog visibility, and blocking it would strand inventory.
 */

const INSUFFICIENT = "Stock insuficiente: la operación dejaría unidades disponibles en negativo.";

/** Absolute set. Guard is a plain filter: reserved must fit inside the new onHand. */
const setOnHand = async (
  variantId: string,
  onHand: number,
  ctx: RequestContext,
): Promise<StockView> => {
  const before = await Variant.findById(variantId).select("onHand reserved").lean();
  if (!before) throw new AppError("La variante no existe.", 404);

  const updated = await Variant.findOneAndUpdate(
    { _id: variantId, reserved: { $lte: onHand } },
    { $set: { onHand } },
    { new: true },
  ).lean();

  if (!updated) throw new AppError(INSUFFICIENT, 409);

  await recordAudit({
    actorId: ctx.actorId,
    actorType: "user",
    action: AuditAction.STOCK_SET,
    module: AuditModule.INVENTORY,
    targetId: variantId,
    before: { onHand: before.onHand },
    after: { onHand: updated.onHand },
    ip: ctx.ip,
  });

  return toStockView(updated);
};

/** Relative adjustment. Condition: (onHand + delta) - reserved >= 0. */
const adjustOnHand = async (
  variantId: string,
  delta: number,
  ctx: RequestContext,
): Promise<StockView> => {
  const updated = await Variant.findOneAndUpdate(
    {
      _id: variantId,
      $expr: { $gte: [{ $subtract: [{ $add: ["$onHand", delta] }, "$reserved"] }, 0] },
    },
    { $inc: { onHand: delta } },
    { new: true },
  ).lean();

  if (!updated) {
    // Only reached on failure, so this extra read cannot race the guard.
    const exists = await Variant.exists({ _id: variantId });
    throw exists ? new AppError(INSUFFICIENT, 409) : new AppError("La variante no existe.", 404);
  }

  await recordAudit({
    actorId: ctx.actorId,
    actorType: "user",
    action: AuditAction.STOCK_ADJUSTED,
    module: AuditModule.INVENTORY,
    targetId: variantId,
    before: { onHand: updated.onHand - delta },
    after: { onHand: updated.onHand },
    ip: ctx.ip,
  });

  return toStockView(updated);
};

const toStockView = (doc: VariantLean): StockView => ({
  id: String(doc._id),
  sku: doc.sku,
  onHand: doc.onHand,
  reserved: doc.reserved,
  available: doc.onHand - doc.reserved,
});

export type { StockView };
export { setOnHand, adjustOnHand };
```

**Qué significa el 409:** el cambio pedido empujaría `onHand - reserved` por debajo de cero. No es una falla del servidor ni un error de validación — la petición está bien formada y es el **estado actual** el que la rechaza. Es el mismo status que devolverá la reserva de M3, así que los clientes aprenden un solo contrato.

- [ ] **Paso 4: Validator y ruta**

```ts
const stockUpdateSchema = Joi.object({
  onHand: Joi.number().integer().min(0).max(1_000_000),
  delta: Joi.number().integer().invalid(0).min(-100_000).max(100_000),
})
  .xor("onHand", "delta")
  .messages({
    "object.xor": "Envía onHand (valor absoluto) o delta (ajuste relativo), no ambos.",
    "object.missing": "Envía onHand (valor absoluto) o delta (ajuste relativo).",
    "any.invalid": "El ajuste no puede ser 0.",
  });
```

```ts
variantRouter.patch(
  "/:id/stock",
  validate(objectIdParamSchema, "params"),
  validate(stockUpdateSchema),
  updateStock,
);
```

El controller delega en `setOnHand` o `adjustOnHand` según qué campo llegó y responde `sendResponse(res, 200, "Stock actualizado correctamente.", { variant })`.

- [ ] **Paso 5: Correr y verificar que pasa**

Run: `pnpm --filter @gira/api test -- inventory`
Expected: PASS, los 19 casos incluidos los tres de concurrencia.

- [ ] **Paso 6:** diff, aprobación, commit.

---

## Tarea 12: Catálogo público con filtro cruzado

**Depends on:** 10. **Files:** Create `validators/catalogValidator.ts`, `services/catalogService.ts`, `controllers/catalogController.ts`, `routes/v1/catalogRoutes.ts`; Modify `routes/v1/index.ts`; Test `tests/integration/catalogPublic.test.ts`

### Endpoints (sin auth; **solo documentos `isActive: true`**)
| Método | Ruta | Middlewares | Propósito |
|---|---|---|---|
| GET | `/catalog/families` | `validate(publicListQuerySchema,"query")` | Familias activas, paginado. |
| GET | `/catalog/families/:slug` | `validate(slugParamSchema,"params")` | Detalle de familia. |
| GET | `/catalog/prints` | `validate(publicPrintQuerySchema,"query")` | Estampados activos, `?family=<slug>` opcional. |
| GET | `/catalog/prints/:slug` | `validate(slugParamSchema,"params")` | Detalle (foto macro + familia). |
| GET | `/catalog/categories` | `validate(publicListQuerySchema,"query")` | Categorías activas. |
| GET | `/catalog/products` | `validate(publicProductQuerySchema,"query")` | **Filtro cruzado**: `?category=&print=&family=&search=&sort=&page=&limit=` (todos por slug). |
| GET | `/catalog/products/:slug` | `validate(slugParamSchema,"params")` | Detalle + variantes activas con `available` calculado. |

Las respuestas públicas **nunca** exponen `onHand` ni `reserved` — solo `available = onHand - reserved`.

### Filtro cruzado: dos pasos, no aggregation
`Product ↔ Print` es N:M **a través de** `Variant`.

- [ ] **Paso 1: Escribir `catalogPublic.test.ts` primero.** Casos: 200 anónimo; documentos inactivos excluidos de todo listado y detalle (404); `?category=<slug>`; `?print=<slug>` devuelve solo productos con una variante activa de ese estampado; `?family=<slug>` devuelve la unión de los estampados de la familia; `print` + `category` combinados; slug desconocido → 404; familia sin estampados activos → lista vacía con `meta.total === 0`; paginación correcta en 2 páginas; el detalle de producto trae variantes activas con `available` y **sin** las claves `onHand`/`reserved`; una variante cuyo estampado fue desactivado queda excluida.

- [ ] **Paso 2:** correr → FAIL.

- [ ] **Paso 3: Implementar `catalogService.listPublicProducts`**

```ts
const PUBLIC_PRODUCT_CONFIG: ListQueryConfig = {
  sortable: ["name", "basePrice", "createdAt"],
  searchable: ["name"],
  defaultSort: "name",
};

const listPublicProducts = async (query: PublicProductQuery) => {
  const filters: Record<string, unknown> = { isActive: true };

  if (query.category) {
    const category = await ProductCategory.findOne({ slug: query.category, isActive: true })
      .select("_id")
      .lean();
    if (!category) throw new AppError("La categoría no existe.", 404);
    filters.category = category._id;
  }

  // Step 1 — resolve the print set (one print, or every active print of a family).
  let printIds: Types.ObjectId[] | null = null;
  if (query.print) {
    const print = await Print.findOne({ slug: query.print, isActive: true }).select("_id").lean();
    if (!print) throw new AppError("El estampado no existe.", 404);
    printIds = [print._id];
  } else if (query.family) {
    const family = await PrintFamily.findOne({ slug: query.family, isActive: true })
      .select("_id")
      .lean();
    if (!family) throw new AppError("La familia de estampados no existe.", 404);
    // Served by index { family: 1, isActive: 1, name: 1 }.
    printIds = await Print.distinct("_id", { family: family._id, isActive: true });
  }

  // Step 2 — products that actually have an active variant with one of those prints.
  // Served entirely by index { print: 1, isActive: 1, product: 1 } (index-only).
  if (printIds !== null) {
    const productIds =
      printIds.length === 0
        ? []
        : await Variant.distinct("product", { print: { $in: printIds }, isActive: true });
    if (productIds.length === 0) {
      const { page, limit } = parseListQuery(query, PUBLIC_PRODUCT_CONFIG, filters);
      return { items: [], meta: buildMeta(0, { page, limit }) };
    }
    filters._id = { $in: productIds };
  }

  const { filter, sort, skip, limit, page } = parseListQuery(query, PUBLIC_PRODUCT_CONFIG, filters);
  const [docs, total] = await Promise.all([
    Product.find(filter).sort(sort).skip(skip).limit(limit).populate("category", "name slug").lean(),
    Product.countDocuments(filter),
  ]);
  return { items: docs.map(toPublicProduct), meta: buildMeta(total, { page, limit }) };
};
```

**Por qué dos pasos y no una aggregation** (dejar este razonamiento en el header del archivo):
1. La paginación y el `meta` son sobre **Products**. Una aggregation necesitaría `$lookup` de products a variants para *cada* producto candidato más un `$facet` para el conteo — estrictamente más trabajo que un `distinct` cubierto por un índice hecho a la medida.
2. `distinct("product", { print: {$in}, isActive: true })` lo sirve entero el índice `{ print: 1, isActive: 1, product: 1 }` (index-only, sin traer documentos).
3. Reusar `parseListQuery`/`buildMeta` sobre un `find` plano mantiene el listado público en el mismo camino de código que todos los demás; una aggregation bifurcaría ese camino y duplicaría la lógica de orden/búsqueda/paginación.
4. **Trade-off documentado:** el array `$in` crece con el catálogo. A la escala de Gira (decenas de productos, cientos de variantes) queda diminuto. El umbral para reconsiderarlo son unos pocos miles de productos coincidentes; la salida es una aggregation `$lookup`+`$facet` aislada dentro de esta única función.

`/catalog/products/:slug` es el espejo: producto por slug activo, luego `Variant.find({ product, isActive: true }).populate("print", "name slug sku image")`, mapeado con `available`. Una variante cuyo estampado esté inactivo se filtra tras el populate.

- [ ] **Paso 4:** `publicProductQuerySchema = listQueryBase.keys({ category: slugValue, print: slugValue, family: slugValue })` — **sin** `isActive` (el público nunca elige ver inactivos). Montar `v1Router.use("/catalog", catalogRouter)`.
- [ ] **Paso 5:** tests PASS. Diff, aprobación, commit.

---

## Tarea 13: Barrido de índices y guards

**Depends on:** 12.

- [ ] **Paso 1:** arrancar `pnpm --filter @gira/api dev` contra Mongo local y confirmar que **no hay warnings de índice duplicado** de Mongoose en el log de arranque.
- [ ] **Paso 2:** en `mongosh`, para cada colección: `db.<col>.getIndexes()` — verificar que existen exactamente los índices declarados (unique de slug/sku, `{product:1,print:1}` unique, `{print:1,isActive:1,product:1}`, `{category:1,isActive:1,name:1}`, `{family:1,isActive:1,name:1}`, `{isActive:1,name:1}`).
- [ ] **Paso 3:** `explain("executionStats")` sobre las tres consultas del spec — prints por familia, productos por categoría, `Variant.distinct("product", { print: {$in}, isActive: true })` — y confirmar `IXSCAN` (no `COLLSCAN`) en las tres. **Pegar la salida real.**
- [ ] **Paso 4:** revisar que las cuatro relaciones padre-hijo tienen guard con test verde: familia→prints, categoría→productos, print→variantes, producto→variantes.
- [ ] **Paso 5:** diff (si hubo ajustes), aprobación, commit.

---

## Tarea 14: Verificación final

**Depends on:** 13. Nada se declara "hecho" sin la salida real pegada (no-negociable #8).

- [ ] **Paso 1:** `pnpm -r exec tsc --noEmit` → sin errores.
- [ ] **Paso 2:** `pnpm build` → limpio (incluye `@gira/shared`).
- [ ] **Paso 3:** `pnpm lint` → sin errores; confirmar que la regla de layering no reporta nada (ningún controller/route importa models ni adapters).
- [ ] **Paso 4:** `pnpm test` → toda la suite verde, los 41 tests de M1 incluidos. Reportar el conteo total.
- [ ] **Paso 5:** `pnpm audit --prod --audit-level=high` → sin vulnerabilidades high/critical (`cloudinary` y `multer` son deps nuevas).
- [ ] **Paso 6: Recorrido manual end-to-end** con `curl` contra Mongo local, pegando cada respuesta:
  1. login admin (2FA si está activo) → cookie
  2. `POST /admin/uploads` con un PNG real → `{url, publicId, width, height}`
  3. `POST /admin/print-families` → slug derivado
  4. `POST /admin/prints` usando el objeto de imagen del paso 2
  5. `POST /admin/product-categories` → `POST /admin/products`
  6. `POST /admin/variants` → SKU derivado
  7. `PATCH /admin/variants/:id/stock {"onHand":10}` → 200; `{"delta":-11}` → **409**
  8. `GET /catalog/products?print=<slug>` sin cookie → el producto aparece
  9. `GET /catalog/products?family=<slug>` → misma unión
  10. `DELETE /admin/print-families/:id` con estampado activo → **409**
  11. `GET /catalog/products/:slug` → variantes con `available`, sin `onHand` ni `reserved`
- [ ] **Paso 7:** revisar punto por punto el checklist de arranque de seguridad, anotando lo que sigue diferido a su milestone (rate limit de checkout, guards de rutas de frontend, rotación de refresh token → M4).
- [ ] **Paso 8:** `git ls-files | grep -i env` → solo `.example`, ningún `.local`.
- [ ] **Paso 9:** mostrar `git status` + `git diff` completos y **esperar aprobación explícita de Manuel** antes de cualquier commit o merge.

---

## Verificación end-to-end (resumen)

| Qué | Comando / evidencia |
|---|---|
| Tipos | `pnpm -r exec tsc --noEmit` |
| Build | `pnpm build` |
| Lint + layering | `pnpm lint` |
| Tests | `pnpm test` (unit: parseListQuery, slug, sku, imageSignature, uploadAdapter, env · integration: 5 CRUD admin, uploads, inventory con concurrencia, catálogo público) |
| Dependencias | `pnpm audit --prod --audit-level=high` |
| Índices | `getIndexes()` + `explain()` con `IXSCAN` en los 3 filtros del spec |
| Invariante de stock | 3 casos de concurrencia con `Promise.allSettled`: exactamente N éxitos, resto 409, `onHand` nunca negativo |
| Flujo real | Recorrido curl de 11 pasos, salidas pegadas |

## Gotchas a recordar durante la ejecución

1. **`@gira/shared` se debe rebuildear** (`pnpm --filter @gira/shared build`) tras editar el enum, o `tsc`, vitest y runtime siguen viendo el enum de M1.
2. **Toda petición mutante en supertest necesita `.set("Origin", "http://localhost:3000")`** o `verifyOrigin` responde 403.
3. **El SDK de Cloudinary se mockea** (`vi.mock("cloudinary")`) y `tests/setup.ts` borra las `CLOUDINARY_*`. Ningún test toca la red.
4. **Los tests de índice único pueden ser flaky**: `autoIndex` construye en diferido. El sync de índices en `tests/setup.ts` (Tarea 5, paso 2) es lo que hace deterministas los 409 de duplicado.
5. **`req.file` puede no tipar**: `apps/api/tsconfig.json` fija `"types": ["node"]`; añadir `"multer"` si `tsc` no lo resuelve.
6. **`mongoSanitize` borra claves con `$` y con puntos** de `req.query`/`req.body` — nunca diseñar un parámetro tipo `measurements.widthCm` en query.
7. **`sanitizeInput` escapa XSS en todos los strings**: una descripción con `<` vuelve escapada. Asertar sobre la salida escapada, no "arreglar" el middleware.
8. **Git:** ninguna tarea ejecuta `git add`/`commit`/`push` sin mostrar el diff y recibir aprobación explícita.
