# M11a · Panel de Productos — Plan de implementación

> **Para agentes:** SUB-SKILL REQUERIDA: usar superpowers:subagent-driven-development (recomendado) o superpowers:executing-plans para ejecutar este plan tarea por tarea. Los pasos usan casillas (`- [ ]`).
>
> **Regla del proyecto (CLAUDE.md global de Manuel): NO se ejecuta `git add` / `git commit` / `git push`.** Donde otros planes dicen «Commit», aquí hay un **Punto de revisión**: correr `git status --short` y `git diff --stat`, mostrarlos a Manuel, y esperar. Solo Manuel hace commits.

**Spec:** `docs/superpowers/specs/2026-10-20-m11a-catalog-products-design.md` (dirección visual A «Vitrina», mockups de referencia en el scratchpad de la sesión de diseño).

**Goal:** Volver real la sección Productos del panel: lista agrupada por categoría con filtros en la URL, y un editor de una página donde se crea o edita un modelo con su foto de tamaño, las estampas (variantes) elegidas visualmente, el precio especial por estampa y las fotos de cada variante.

**Architecture:** El API gana un read model `AdminProduct` (agregación con categoría y resumen de variantes), el campo `Product.sizeImage`, la carpeta de subida `products`, imágenes opcionales en `AdminVariant` y `priceOverride: null`. La web (`apps/web`) sigue el patrón M10: datos recortados en la frontera HTTP, filtros en la URL en español, mutaciones solo por `browserRequest`, ids validados antes de armar rutas, estados vacío/carga/error explícitos. El editor es un componente cliente con estado local, guardado secuencial (modelo → variantes) y reporte de fallos parciales.

**Tech Stack:** Express + Mongoose + Joi + Vitest/supertest (API); Next.js App Router + Tailwind v4 + Vitest/Testing Library (web); `@gira/shared` para DTOs y constantes.

---

## Desviaciones respecto al spec (decididas al leer el código)

1. **`AdminVariant.images` es opcional y solo viaja cuando se pide.** `GET /admin/variants` lo incluye solo con `?withImages=true` (el test de M10 `not.toHaveProperty("images")` sigue valiendo para el listado normal y el ajuste de stock). Las lecturas y mutaciones de **una** variante del catálogo (crear, detalle, editar, retirar) sí lo incluyen. Motivo: el listado de Inventario trae hasta 100 filas y no necesita fotos.
2. **`cover` cae a `sizeImage`** cuando un modelo no tiene variantes activas (una tarjeta nunca queda sin imagen si hay foto de tamaño). Orden de preferencia: primera foto de una variante activa → imagen de la primera estampa activa → foto de tamaño → sin portada.
3. **Pestaña de estado → select.** El filtro «Estado» (Activos / Retirados / Todos) es un `SelectField` dentro de la isla de filtros, como en el mockup A (no pestañas).
4. **La etiqueta «Ya en el modelo» del mockup** pasa a significar «Con apartados»: una estampa cuya variante tiene piezas apartadas no puede deseleccionarse. Una estampa con variante retirada se puede volver a elegir y reactiva la variante.
5. **Retirar una variante** (deseleccionar una estampa con variante existente) usa `PATCH isActive:false` y no `DELETE`: ambas hacen lo mismo y el PATCH responde `AdminVariant`.
6. **Fallo parcial al crear:** si el modelo se creó pero alguna variante falló, la web redirige a `/productos/[id]` con un toast que nombra las estampas pendientes. Al estar en modo edición, volver a elegirlas y guardar las crea («Reintentar» sin código extra). Las fotos ya subidas de esas variantes quedan huérfanas en Cloudinary (pendiente conocido).
7. **El botón «Nuevo producto»** es un `Button` con `router.push`, no un `<a>` con estilo de botón (no existe `ButtonLink` y no se agrega).

## Mapa de archivos

**Shared (`packages/shared/src`)**
- Crear `constants/catalog.ts` — límites de formulario y de subida.
- Modificar `types/catalog.ts` — `Product.sizeImage`, `AdminProduct`, `AdminProductPrint`, `AdminVariant.images`.
- Modificar `index.ts` — exportar lo nuevo.

**API (`apps/api`)**
- Modificar `src/models/Product.ts`, `src/validators/productValidator.ts`, `src/services/productService.ts` — `sizeImage`.
- Modificar `src/validators/uploadValidator.ts` — carpeta `products`.
- Crear `src/services/adminProductService.ts` — read model `AdminProduct`.
- Modificar `src/controllers/productController.ts` — responde `AdminProduct`.
- Modificar `src/services/adminVariantService.ts`, `src/services/variantService.ts`, `src/controllers/variantController.ts`, `src/validators/variantValidator.ts` — imágenes opcionales, `priceOverride: null`, respuestas `AdminVariant`.
- Tests: `tests/integration/uploads.test.ts` (ampliar), crear `adminProductSizeImage.test.ts`, `adminProductCatalog.test.ts`, `adminVariantCatalog.test.ts`.

**Web (`apps/web/src`)**
- `lib/api/request.ts` (FormData), `lib/api/paths.ts`, `lib/api/adminProducts.ts`, `lib/api/adminCatalog.ts`, `lib/api/adminUploads.ts`, `lib/api/adminVariants.ts` (ampliar).
- `lib/catalog/` — `money.ts`, `productId.ts`, `panelProduct.ts`, `editorProduct.ts`, `filters.ts`, `groupByCategory.ts`, `catalogOptions.ts`, `productForm.ts`.
- `hooks/` — `useProductList.ts`, `useCatalogOptions.ts`, `useProductEditorData.ts`, `useImageUpload.ts`, `useProductSave.ts`.
- `components/catalog/` — `ImageTile`, `ProductCard`, `CategorySection`, `ProductFilters`, `ProductEmpty`, `ProductsPage`, `NewProductButton`, `ModelDataSection`, `SizePhotoField`, `PrintPicker`, `PrintPriceOverrides`, `VariantPhotos`, `RetireModelSection`, `SaveBar`, `NewPrintSlideOver`, `ProductEditor`.
- `app/(admin)/productos/{page,loading}.tsx`, `productos/nuevo/page.tsx`, `productos/[id]/{page,loading}.tsx`.
- `lib/navigation.ts` (activar `products`).
- Tests en `apps/web/tests/{lib,hooks,components}`.

## Comandos de verificación (referencia)

```bash
pnpm --filter @gira/shared build
pnpm --filter @gira/api typecheck
pnpm --filter @gira/api exec vitest run tests/integration/<archivo>.test.ts
pnpm --filter @gira/web exec tsc --noEmit
pnpm --filter @gira/web test -- tests/lib/catalog
pnpm exec eslint apps/web
NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1 pnpm --filter @gira/web build
```

(Si `tsc` del web no es un script, usar `pnpm --filter @gira/web exec tsc --noEmit`. La suite completa del API tiene un flake conocido: re-correr aislado antes de investigar.)

---

# PARTE 1 · SHARED + API

### Task 1: Shared — constantes y tipos del catálogo

**Files:**
- Create: `packages/shared/src/constants/catalog.ts`
- Modify: `packages/shared/src/types/catalog.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Crear las constantes**

Create `packages/shared/src/constants/catalog.ts`:

```ts
/**
 * Bounds of the catalog forms. The API validates with the same numbers
 * (productValidator / variantValidator / upload middleware); the panel
 * pre-checks with them so the operator sees the error before the request.
 */
const PRODUCT_NAME_MIN = 2;
const PRODUCT_NAME_MAX = 120;
const PRODUCT_DESCRIPTION_MAX = 2000;
/** MXN centavos. */
const PRODUCT_BASE_PRICE_MAX = 10_000_000;
const PRODUCT_WEIGHT_MIN = 1;
const PRODUCT_WEIGHT_MAX = 20_000;
const PRODUCT_MEASURE_MAX = 500;
const PRODUCT_MATERIALS_MAX = 10;
const PRODUCT_MATERIAL_MAX = 60;
const VARIANT_IMAGES_MAX = 10;
/** MXN centavos. */
const VARIANT_PRICE_OVERRIDE_MAX = 10_000_000;

const UPLOAD_MAX_BYTES = 5 * 1024 * 1024;
const UPLOAD_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"] as const;

export {
  PRODUCT_NAME_MIN,
  PRODUCT_NAME_MAX,
  PRODUCT_DESCRIPTION_MAX,
  PRODUCT_BASE_PRICE_MAX,
  PRODUCT_WEIGHT_MIN,
  PRODUCT_WEIGHT_MAX,
  PRODUCT_MEASURE_MAX,
  PRODUCT_MATERIALS_MAX,
  PRODUCT_MATERIAL_MAX,
  VARIANT_IMAGES_MAX,
  VARIANT_PRICE_OVERRIDE_MAX,
  UPLOAD_MAX_BYTES,
  UPLOAD_MIME_TYPES,
};
```

- [ ] **Step 2: Ampliar los tipos**

In `packages/shared/src/types/catalog.ts`:

1. En `interface Product`, agregar después de `materials?: string[];`:

```ts
  /** One photo (or diagram) that shows the real size of the model. Optional, one per model. */
  sizeImage?: ImageAttrs;
```

2. Reemplazar `interface AdminVariant { ... }` por la misma con un campo nuevo antes de `updatedAt`:

```ts
  /** Present only on single-variant catalog reads and on `?withImages=true` lists. */
  images?: ImageAttrs[];
```

3. Agregar, antes de `/** One stock movement from the audit trail ... */`:

```ts
/** A print shown as a thumbnail on a product card. */
interface AdminProductPrint {
  id: string;
  name: string;
  image: ImageAttrs;
}

/** Admin catalog row/detail: a model with its category and a summary of its variants. */
interface AdminProduct extends Product {
  measurements: Measurements;
  materials: string[];
  variantCount: number;
  activeVariantCount: number;
  /** First photo of an active variant, else the first active print's image, else the size photo. */
  cover?: ImageAttrs;
  /** Up to 5 active prints, in creation order. */
  prints: AdminProductPrint[];
  updatedAt: Date;
}
```

4. En el `export type { ... }` del final, agregar `AdminProduct,` y `AdminProductPrint,`.

- [ ] **Step 3: Exportar desde el índice**

In `packages/shared/src/index.ts`:

1. En el `import type { CatalogRef, AdminVariant, ... } from "./types/catalog.js";` agregar `AdminProduct,` y `AdminProductPrint,`.
2. Después de la línea `import { STOCK_ON_HAND_MAX, STOCK_DELTA_MAX, STOCK_REASON_MAX } from "./constants/inventory.js";` agregar:

```ts
import {
  PRODUCT_NAME_MIN,
  PRODUCT_NAME_MAX,
  PRODUCT_DESCRIPTION_MAX,
  PRODUCT_BASE_PRICE_MAX,
  PRODUCT_WEIGHT_MIN,
  PRODUCT_WEIGHT_MAX,
  PRODUCT_MEASURE_MAX,
  PRODUCT_MATERIALS_MAX,
  PRODUCT_MATERIAL_MAX,
  VARIANT_IMAGES_MAX,
  VARIANT_PRICE_OVERRIDE_MAX,
  UPLOAD_MAX_BYTES,
  UPLOAD_MIME_TYPES,
} from "./constants/catalog.js";
```

3. En el bloque `export type { Wire, ... }` agregar `AdminProduct,` y `AdminProductPrint,` junto a `AdminVariant,`.
4. En el bloque `export { ... }` de valores (el que contiene `STOCK_ON_HAND_MAX`) agregar los 13 nombres del paso 3.2.

- [ ] **Step 4: Compilar shared**

Run: `pnpm --filter @gira/shared build`
Expected: termina sin errores de TypeScript.

- [ ] **Step 5: Punto de revisión**

Run: `git status --short` y `git diff --stat`. Mostrar a Manuel. No hacer commit.

---

### Task 2: API — carpeta de subida `products`

**Files:**
- Modify: `apps/api/src/validators/uploadValidator.ts`
- Test: `apps/api/tests/integration/uploads.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Append to `apps/api/tests/integration/uploads.test.ts` (al final del archivo; reutiliza `app`, `BASE`, `PNG_BYTES`, `loginAsAdmin`, `ORIGIN` ya importados arriba):

```ts
describe("Admin · Uploads · carpeta products", () => {
  it("acepta folder=products y devuelve la imagen", async () => {
    const cookie = await loginAsAdmin(app);
    const res = await request(app)
      .post(BASE)
      .set("Origin", ORIGIN)
      .set("Cookie", cookie)
      .field("folder", "products")
      .attach("file", PNG_BYTES, { filename: "tamano.png", contentType: "image/png" });
    expect(res.status).toBe(201);
    expect(res.body.data.image.url).toContain("products");
  });
});
```

- [ ] **Step 2: Ver que falla**

Run: `pnpm --filter @gira/api exec vitest run tests/integration/uploads.test.ts`
Expected: FAIL en el test nuevo (400 en vez de 201).

- [ ] **Step 3: Implementar**

In `apps/api/src/validators/uploadValidator.ts` reemplazar el bloque del `folder`:

```ts
  folder: Joi.string().valid("prints", "variants", "products").required().messages({
    "any.only": 'El campo "folder" debe ser "prints", "variants" o "products".',
    "any.required": 'El campo "folder" es obligatorio.',
  }),
```

- [ ] **Step 4: Ver que pasa**

Run: `pnpm --filter @gira/api exec vitest run tests/integration/uploads.test.ts`
Expected: PASS en todo el archivo (el test de `folder: "hackers"` sigue en 400).

- [ ] **Step 5: Punto de revisión** (`git status --short`, `git diff --stat`; sin commit).

---

### Task 3: API — `Product.sizeImage`

**Files:**
- Modify: `apps/api/src/models/Product.ts`
- Modify: `apps/api/src/validators/productValidator.ts`
- Modify: `apps/api/src/services/productService.ts`
- Test: `apps/api/tests/integration/adminProductSizeImage.test.ts` (crear)

- [ ] **Step 1: Escribir el test que falla**

Create `apps/api/tests/integration/adminProductSizeImage.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import request from "supertest";
import { buildApp } from "../../src/app.js";
import { Product } from "../../src/models/Product.js";
import { ProductCategory } from "../../src/models/ProductCategory.js";
import { loginAsAdmin, ORIGIN } from "../helpers/auth.js";

const app = buildApp();
const BASE = "/api/v1/admin/products";

const IMAGE = {
  url: "https://res.cloudinary.com/gira/image/upload/v1/products/tamano.jpg",
  publicId: "gira/products/tamano",
  width: 900,
  height: 900,
};

const seedCategory = () => ProductCategory.create({ name: "Cosmetiqueras", slug: "cosmetiqueras-si" });

const post = (cookie: string, body: Record<string, unknown>) =>
  request(app).post(BASE).set("Origin", ORIGIN).set("Cookie", cookie).send(body);

const patch = (cookie: string, id: string, body: Record<string, unknown>) =>
  request(app).patch(`${BASE}/${id}`).set("Origin", ORIGIN).set("Cookie", cookie).send(body);

const base = (categoryId: string) => ({
  name: "Cosmetiquera chica",
  category: categoryId,
  basePrice: 18900,
  weightGrams: 140,
});

describe("Admin · Product · sizeImage", () => {
  it("se guarda al crear", async () => {
    const cookie = await loginAsAdmin(app);
    const category = await seedCategory();
    const res = await post(cookie, { ...base(String(category._id)), sizeImage: IMAGE });
    expect(res.status).toBe(201);
    const saved = await Product.findById(res.body.data.product.id).lean();
    expect(saved?.sizeImage).toMatchObject(IMAGE);
  });

  it("se reemplaza al editar", async () => {
    const cookie = await loginAsAdmin(app);
    const category = await seedCategory();
    const created = await post(cookie, { ...base(String(category._id)), sizeImage: IMAGE });
    const next = { ...IMAGE, publicId: "gira/products/otra" };
    const res = await patch(cookie, created.body.data.product.id, { sizeImage: next });
    expect(res.status).toBe(200);
    const saved = await Product.findById(created.body.data.product.id).lean();
    expect(saved?.sizeImage?.publicId).toBe("gira/products/otra");
  });

  it("null la quita", async () => {
    const cookie = await loginAsAdmin(app);
    const category = await seedCategory();
    const created = await post(cookie, { ...base(String(category._id)), sizeImage: IMAGE });
    const res = await patch(cookie, created.body.data.product.id, { sizeImage: null });
    expect(res.status).toBe(200);
    const saved = await Product.findById(created.body.data.product.id).lean();
    expect(saved?.sizeImage).toBeUndefined();
  });

  it("rechaza una URL que no es https", async () => {
    const cookie = await loginAsAdmin(app);
    const category = await seedCategory();
    const res = await post(cookie, {
      ...base(String(category._id)),
      sizeImage: { ...IMAGE, url: "http://insegura.test/a.jpg" },
    });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Ver que falla**

Run: `pnpm --filter @gira/api exec vitest run tests/integration/adminProductSizeImage.test.ts`
Expected: FAIL (Joi rechaza `sizeImage` como campo desconocido o no se guarda).

- [ ] **Step 3: Modelo**

In `apps/api/src/models/Product.ts`:

1. Agregar el import tras la primera línea: `import { imageSchema, type ImageAttrs } from "./schemas/image.js";`
2. En `interface ProductAttrs`, después de `materials: string[];` agregar: `  /** One photo or diagram of the real size of the model. */\n  sizeImage?: ImageAttrs;`
3. En `productSchema`, después de `materials: { type: [String], default: [] },` agregar: `    sizeImage: { type: imageSchema },`

- [ ] **Step 4: Validador**

In `apps/api/src/validators/productValidator.ts`:

1. Cambiar el import: `import { objectId, imageObjectSchema } from "./commonValidator.js";`
2. En `createProductSchema` agregar `sizeImage: imageObjectSchema,` después de `materials,`.
3. En `updateProductSchema` agregar `sizeImage: imageObjectSchema.allow(null),` después de `materials,`.

- [ ] **Step 5: Servicio**

In `apps/api/src/services/productService.ts`:

1. Agregar el import: `import type { ImageAttrs } from "../models/schemas/image.js";`
2. En `interface CreateProductInput` agregar `  sizeImage?: ImageAttrs;` después de `materials?: string[];`.
3. En `interface UpdateProductInput` agregar `  sizeImage?: ImageAttrs | null;` después de `materials?: string[];`.
4. En `createProduct`, dentro de `Product.create({ ... })`, agregar `    sizeImage: input.sizeImage,` después de `materials: input.materials ?? [],`.
5. En `updateProduct`, después de `if (input.materials !== undefined) product.materials = input.materials;` agregar:

```ts
  if (input.sizeImage === null) product.set("sizeImage", undefined);
  else if (input.sizeImage !== undefined) product.sizeImage = input.sizeImage;
```

- [ ] **Step 6: Ver que pasa**

Run: `pnpm --filter @gira/api exec vitest run tests/integration/adminProductSizeImage.test.ts tests/integration/adminProducts.test.ts`
Expected: PASS (los tests viejos de productos siguen verdes).

- [ ] **Step 7: Punto de revisión** (sin commit).

---

### Task 4: API — read model `AdminProduct` y controlador

**Files:**
- Create: `apps/api/src/services/adminProductService.ts`
- Modify: `apps/api/src/controllers/productController.ts`
- Test: `apps/api/tests/integration/adminProductCatalog.test.ts` (crear)

- [ ] **Step 1: Escribir el test que falla**

Create `apps/api/tests/integration/adminProductCatalog.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import request from "supertest";
import { buildApp } from "../../src/app.js";
import { Print } from "../../src/models/Print.js";
import { PrintFamily } from "../../src/models/PrintFamily.js";
import { Product } from "../../src/models/Product.js";
import { ProductCategory } from "../../src/models/ProductCategory.js";
import { Variant } from "../../src/models/Variant.js";
import { loginAsAdmin, ORIGIN } from "../helpers/auth.js";

const app = buildApp();
const BASE = "/api/v1/admin/products";

const img = (name: string) => ({
  url: `https://res.cloudinary.com/gira/image/upload/v1/${name}.jpg`,
  publicId: `gira/${name}`,
  width: 800,
  height: 600,
});

const get = (cookie: string, qs = "") => request(app).get(`${BASE}${qs}`).set("Cookie", cookie);

const seedCategory = (name: string) =>
  ProductCategory.create({ name, slug: `cat-${name.toLowerCase().replace(/\s+/g, "-")}` });

interface SeedProduct {
  name: string;
  categoryId: unknown;
  basePrice?: number;
  isActive?: boolean;
  sizeImage?: ReturnType<typeof img>;
}

const seedProduct = (input: SeedProduct) =>
  Product.create({
    name: input.name,
    slug: input.name.toLowerCase().replace(/\s+/g, "-"),
    category: input.categoryId,
    basePrice: input.basePrice ?? 20000,
    weightGrams: 300,
    isActive: input.isActive ?? true,
    ...(input.sizeImage ? { sizeImage: input.sizeImage } : {}),
  });

let printCounter = 0;
const seedVariant = async (
  productId: unknown,
  opts: { isActive?: boolean; images?: ReturnType<typeof img>[]; printName?: string } = {},
) => {
  printCounter += 1;
  const family = await PrintFamily.create({ name: `Familia ${printCounter}`, slug: `fam-${printCounter}` });
  const print = await Print.create({
    name: opts.printName ?? `Print ${printCounter}`,
    slug: `print-${printCounter}`,
    sku: `P-${printCounter}`,
    family: family._id,
    image: img(`print-${printCounter}`),
  });
  return Variant.create({
    product: productId,
    print: print._id,
    sku: `SKU-${printCounter}`,
    images: opts.images ?? [],
    isActive: opts.isActive ?? true,
  });
};

describe("GET /admin/products · forma AdminProduct", () => {
  it("resuelve la categoría, cuenta variantes y arma portada y estampas", async () => {
    const cookie = await loginAsAdmin(app);
    const category = await seedCategory("Cosmetiquera");
    const product = await seedProduct({ name: "Cosmetiquera chica", categoryId: category._id });
    await seedVariant(product._id, { printName: "Nopal" });
    await seedVariant(product._id, { printName: "Monarca", images: [img("foto-monarca"), img("otra")] });
    await seedVariant(product._id, { printName: "Retirada", isActive: false });

    const res = await get(cookie);
    expect(res.status).toBe(200);
    const row = res.body.data.products[0];
    expect(row).toMatchObject({
      id: String(product._id),
      name: "Cosmetiquera chica",
      category: { id: String(category._id), name: "Cosmetiquera" },
      variantCount: 3,
      activeVariantCount: 2,
      basePrice: 20000,
      isActive: true,
    });
    expect(row.cover.url).toContain("foto-monarca");
    expect(row.prints.map((p: { name: string }) => p.name)).toEqual(["Nopal", "Monarca"]);
    expect(row.prints[0].image.url).toContain("print-");
    expect(row.updatedAt).toBeTruthy();
    expect(row).not.toHaveProperty("sizeImage");
  });

  it("la portada cae a la imagen de la primera estampa activa", async () => {
    const cookie = await loginAsAdmin(app);
    const category = await seedCategory("Totes");
    const product = await seedProduct({ name: "Tote lona", categoryId: category._id });
    await seedVariant(product._id, { printName: "Solo print" });
    const row = (await get(cookie)).body.data.products[0];
    expect(row.cover.url).toContain("print-");
  });

  it("sin variantes activas la portada cae a la foto de tamaño", async () => {
    const cookie = await loginAsAdmin(app);
    const category = await seedCategory("Totes");
    await seedProduct({ name: "Tote vacío", categoryId: category._id, sizeImage: img("tamano") });
    const row = (await get(cookie)).body.data.products[0];
    expect(row.variantCount).toBe(0);
    expect(row.cover.url).toContain("tamano");
    expect(row.sizeImage.url).toContain("tamano");
    expect(row.prints).toEqual([]);
  });

  it("limita a 5 estampas en la tarjeta pero cuenta todas", async () => {
    const cookie = await loginAsAdmin(app);
    const category = await seedCategory("Playeras");
    const product = await seedProduct({ name: "Playera", categoryId: category._id });
    for (let i = 0; i < 6; i += 1) await seedVariant(product._id);
    const row = (await get(cookie)).body.data.products[0];
    expect(row.prints).toHaveLength(5);
    expect(row.variantCount).toBe(6);
  });
});

describe("GET /admin/products · orden, filtros y búsqueda", () => {
  it("por defecto ordena por categoría A-Z y luego por nombre", async () => {
    const cookie = await loginAsAdmin(app);
    const zeta = await seedCategory("Zeta");
    const alfa = await seedCategory("Alfa");
    await seedProduct({ name: "Beta", categoryId: zeta._id });
    await seedProduct({ name: "Dos", categoryId: alfa._id });
    await seedProduct({ name: "Uno", categoryId: alfa._id });
    const names = (await get(cookie)).body.data.products.map((p: { name: string }) => p.name);
    expect(names).toEqual(["Dos", "Uno", "Beta"]);
  });

  it("ordena por precio base descendente con sort=-basePrice", async () => {
    const cookie = await loginAsAdmin(app);
    const category = await seedCategory("Cat");
    await seedProduct({ name: "Barato", categoryId: category._id, basePrice: 10000 });
    await seedProduct({ name: "Caro", categoryId: category._id, basePrice: 90000 });
    const names = (await get(cookie, "?sort=-basePrice")).body.data.products.map(
      (p: { name: string }) => p.name,
    );
    expect(names).toEqual(["Caro", "Barato"]);
  });

  it("filtra por category e isActive, y busca por nombre sin tratar el texto como regex", async () => {
    const cookie = await loginAsAdmin(app);
    const a = await seedCategory("Cat A");
    const b = await seedCategory("Cat B");
    await seedProduct({ name: "Hoodie (II)", categoryId: a._id });
    await seedProduct({ name: "Gorra", categoryId: a._id, isActive: false });
    await seedProduct({ name: "Otra", categoryId: b._id });
    const byCategory = await get(cookie, `?category=${a._id}`);
    expect(byCategory.body.meta.total).toBe(2);
    const active = await get(cookie, `?category=${a._id}&isActive=true`);
    expect(active.body.data.products.map((p: { name: string }) => p.name)).toEqual(["Hoodie (II)"]);
    const search = await get(cookie, `?search=${encodeURIComponent("(II)")}`);
    expect(search.body.data.products).toHaveLength(1);
    expect((await get(cookie, `?search=${encodeURIComponent(".*")}`)).body.data.products).toEqual([]);
  });
});

describe("Mutaciones de producto responden AdminProduct", () => {
  it("POST, GET /:id, PATCH y DELETE traen categoría y resumen de variantes", async () => {
    const cookie = await loginAsAdmin(app);
    const category = await seedCategory("Bolsas");
    const created = await request(app)
      .post(BASE)
      .set("Origin", ORIGIN)
      .set("Cookie", cookie)
      .send({ name: "Tote", category: String(category._id), basePrice: 45000, weightGrams: 400 });
    expect(created.status).toBe(201);
    expect(created.body.data.product).toMatchObject({
      category: { name: "Bolsas" },
      variantCount: 0,
      activeVariantCount: 0,
      prints: [],
      materials: [],
      measurements: {},
    });
    const id = created.body.data.product.id as string;

    const detail = await get(cookie, `/${id}`);
    expect(detail.body.data.product.variantCount).toBe(0);

    const patched = await request(app)
      .patch(`${BASE}/${id}`)
      .set("Origin", ORIGIN)
      .set("Cookie", cookie)
      .send({ basePrice: 50000 });
    expect(patched.body.data.product.basePrice).toBe(50000);

    const retired = await request(app).delete(`${BASE}/${id}`).set("Origin", ORIGIN).set("Cookie", cookie);
    expect(retired.body.data.product).toMatchObject({ isActive: false, variantCount: 0 });
  });

  it("GET /:id inexistente responde 404", async () => {
    const cookie = await loginAsAdmin(app);
    const res = await get(cookie, "/64b7f3f3f3f3f3f3f3f3f3f3");
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Ver que falla**

Run: `pnpm --filter @gira/api exec vitest run tests/integration/adminProductCatalog.test.ts`
Expected: FAIL (`variantCount` indefinido, orden distinto, etc.).

- [ ] **Step 3: Crear el servicio**

Create `apps/api/src/services/adminProductService.ts`:

```ts
import { Types, type PipelineStage } from "mongoose";
import type { AdminProduct, ApiMeta, ImageAttrs, Measurements } from "@gira/shared";
import { Product } from "../models/Product.js";
import { AppError } from "../utils/AppError.js";
import { parseListQuery, buildMeta, type ListQueryConfig } from "../utils/parseListQuery.js";

/**
 * Admin read model for the catalog: one Product with its category and a
 * summary of its variants (counts, cover, a few print thumbnails) resolved in
 * a single aggregation. The variant lookup runs AFTER the page is cut, so it
 * only touches the rows that leave the API.
 */

const LIST_CONFIG: ListQueryConfig = {
  sortable: ["category", "name", "basePrice", "updatedAt"],
  searchable: ["name"],
  defaultSort: "category",
};

const PRINT_PREVIEW_LIMIT = 5;

interface AdminProductListQuery {
  page?: unknown;
  limit?: unknown;
  sort?: unknown;
  search?: unknown;
  category?: string;
  isActive?: boolean;
}

interface VariantSummaryRow {
  isActive: boolean;
  images: ImageAttrs[];
  printDoc: { _id: Types.ObjectId; name: string; image: ImageAttrs };
}

interface AdminProductRow {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  description?: string;
  basePrice: number;
  weightGrams: number;
  measurements?: Measurements;
  materials?: string[];
  sizeImage?: ImageAttrs;
  isActive: boolean;
  updatedAt: Date;
  categoryDoc: { _id: Types.ObjectId; name: string; slug: string };
  variantDocs: VariantSummaryRow[];
}

const toAdminProduct = (row: AdminProductRow): AdminProduct => {
  const active = row.variantDocs.filter((variant) => variant.isActive);
  const cover =
    active.find((variant) => variant.images.length > 0)?.images[0] ??
    active[0]?.printDoc.image ??
    row.sizeImage;

  return {
    id: String(row._id),
    name: row.name,
    slug: row.slug,
    category: { id: String(row.categoryDoc._id), name: row.categoryDoc.name, slug: row.categoryDoc.slug },
    ...(row.description ? { description: row.description } : {}),
    basePrice: row.basePrice,
    weightGrams: row.weightGrams,
    measurements: row.measurements ?? {},
    materials: row.materials ?? [],
    ...(row.sizeImage ? { sizeImage: row.sizeImage } : {}),
    isActive: row.isActive,
    variantCount: row.variantDocs.length,
    activeVariantCount: active.length,
    ...(cover ? { cover } : {}),
    prints: active.slice(0, PRINT_PREVIEW_LIMIT).map((variant) => ({
      id: String(variant.printDoc._id),
      name: variant.printDoc.name,
      image: variant.printDoc.image,
    })),
    updatedAt: row.updatedAt,
  };
};

/** Joins product -> category. A product whose category is gone drops out. */
const CATEGORY_STAGES: PipelineStage[] = [
  {
    $lookup: { from: "productcategories", localField: "category", foreignField: "_id", as: "categoryDoc" },
  },
  { $unwind: "$categoryDoc" },
];

/** Variants of the product with only what the card paints: state, first photo, print name and image. */
const VARIANTS_LOOKUP: PipelineStage.Lookup = {
  $lookup: {
    from: "variants",
    let: { productId: "$_id" },
    pipeline: [
      { $match: { $expr: { $eq: ["$product", "$$productId"] } } },
      { $sort: { createdAt: 1, _id: 1 } },
      { $lookup: { from: "prints", localField: "print", foreignField: "_id", as: "printDoc" } },
      { $unwind: "$printDoc" },
      {
        $project: {
          isActive: 1,
          images: { $slice: ["$images", 1] },
          "printDoc._id": 1,
          "printDoc.name": 1,
          "printDoc.image": 1,
        },
      },
    ],
    as: "variantDocs",
  },
};

/** `category` sorts by the category NAME (then the model's), which only exists after the lookup. */
const toSortStage = (sort: Record<string, 1 | -1>): Record<string, 1 | -1> => {
  const field = Object.keys(sort)[0] as string;
  const direction = sort[field] as 1 | -1;
  if (field === "category") return { "categoryDoc.name": direction, name: 1, _id: 1 };
  return sort;
};

const listAdminProducts = async (
  query: AdminProductListQuery,
): Promise<{ items: AdminProduct[]; meta: ApiMeta }> => {
  const filters: Record<string, unknown> = {};
  if (query.category) filters.category = new Types.ObjectId(query.category);
  if (query.isActive !== undefined) filters.isActive = query.isActive;

  const { filter, sort, skip, limit, page } = parseListQuery(query, LIST_CONFIG, filters);

  const [result] = await Product.aggregate<{ rows: AdminProductRow[]; total: { n: number }[] }>([
    { $match: filter },
    ...CATEGORY_STAGES,
    {
      $facet: {
        rows: [{ $sort: toSortStage(sort) }, { $skip: skip }, { $limit: limit }, VARIANTS_LOOKUP],
        total: [{ $count: "n" }],
      },
    },
  ]);

  const total = result?.total[0]?.n ?? 0;
  return { items: (result?.rows ?? []).map(toAdminProduct), meta: buildMeta(total, { page, limit }) };
};

const getAdminProductOrThrow = async (id: string): Promise<AdminProduct> => {
  const [row] = await Product.aggregate<AdminProductRow>([
    { $match: { _id: new Types.ObjectId(id) } },
    ...CATEGORY_STAGES,
    VARIANTS_LOOKUP,
  ]);
  if (!row) throw new AppError("El producto no existe.", 404);
  return toAdminProduct(row);
};

export type { AdminProductListQuery };
export { listAdminProducts, getAdminProductOrThrow };
```

- [ ] **Step 4: Cambiar el controlador**

Replace the whole content of `apps/api/src/controllers/productController.ts` with:

```ts
import type { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendResponse } from "../utils/sendResponse.js";
import { buildContext } from "../utils/requestContext.js";
import {
  createProduct,
  updateProduct,
  deactivateProduct,
  type CreateProductInput,
  type UpdateProductInput,
} from "../services/productService.js";
import { listAdminProducts, getAdminProductOrThrow } from "../services/adminProductService.js";

/**
 * Product admin controllers — orchestrate req/res only, never touch models.
 * Writes go through productService; every response is re-read as an
 * AdminProduct so the panel always gets the same shape.
 */

const create = asyncHandler(async (req: Request, res: Response) => {
  const created = await createProduct(req.body as CreateProductInput, buildContext(req));
  const product = await getAdminProductOrThrow(created.id);
  sendResponse(res, 201, "Producto creado correctamente.", { product });
});

const list = asyncHandler(async (req: Request, res: Response) => {
  const { items, meta } = await listAdminProducts(req.query);
  sendResponse(res, 200, "Productos obtenidos correctamente.", { products: items }, meta);
});

const detail = asyncHandler(async (req: Request, res: Response) => {
  const product = await getAdminProductOrThrow(req.params.id as string);
  sendResponse(res, 200, "Producto obtenido correctamente.", { product });
});

const update = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  await updateProduct(id, req.body as UpdateProductInput, buildContext(req));
  const product = await getAdminProductOrThrow(id);
  sendResponse(res, 200, "Producto actualizado correctamente.", { product });
});

const deactivate = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  await deactivateProduct(id, buildContext(req));
  const product = await getAdminProductOrThrow(id);
  sendResponse(res, 200, "Producto retirado correctamente.", { product });
});

export { create, list, detail, update, deactivate };
```

- [ ] **Step 5: Ver que pasa y que nada se rompió**

Run: `pnpm --filter @gira/api exec vitest run tests/integration/adminProductCatalog.test.ts tests/integration/adminProducts.test.ts tests/integration/adminProductSizeImage.test.ts tests/integration/catalogPublic.test.ts`
Expected: PASS en los cuatro archivos.

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter @gira/api typecheck`
Expected: sin errores.

- [ ] **Step 7: Punto de revisión** (sin commit).

---

### Task 5: API — variantes con imágenes opcionales, `priceOverride: null` y respuestas `AdminVariant`

**Files:**
- Modify: `apps/api/src/services/adminVariantService.ts`
- Modify: `apps/api/src/services/variantService.ts`
- Modify: `apps/api/src/controllers/variantController.ts`
- Modify: `apps/api/src/validators/variantValidator.ts`
- Test: `apps/api/tests/integration/adminVariantCatalog.test.ts` (crear)

- [ ] **Step 1: Escribir el test que falla**

Create `apps/api/tests/integration/adminVariantCatalog.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import request from "supertest";
import { buildApp } from "../../src/app.js";
import { Print } from "../../src/models/Print.js";
import { Variant } from "../../src/models/Variant.js";
import { loginAsAdmin, ORIGIN } from "../helpers/auth.js";
import { seedVariant } from "../helpers/seedInventory.js";

const app = buildApp();
const BASE = "/api/v1/admin/variants";

const img = (name: string) => ({
  url: `https://res.cloudinary.com/gira/image/upload/v1/variants/${name}.jpg`,
  publicId: `gira/variants/${name}`,
  width: 800,
  height: 800,
});

const send = (method: "post" | "patch" | "delete", cookie: string, path: string, body?: unknown) => {
  const req = request(app)[method](`${BASE}${path}`).set("Origin", ORIGIN).set("Cookie", cookie);
  return body === undefined ? req : req.send(body as object);
};

/** A seeded variant plus a second print of the same family, so POST has a free (product, print) pair. */
const seedWithSpare = async (tag: string) => {
  const base = await seedVariant({ tag });
  const first = await Print.findById(base.printId);
  const spare = await Print.create({
    name: `Print ${tag} b`,
    slug: `print-${tag}-b`.toLowerCase(),
    sku: `P-${tag}-B`,
    family: first!.family,
    image: img("spare"),
  });
  return { ...base, sparePrintId: String(spare._id) };
};

describe("Variantes del catálogo responden AdminVariant", () => {
  it("POST devuelve producto, estampa e imágenes", async () => {
    const cookie = await loginAsAdmin(app);
    const seeded = await seedWithSpare("C1");
    const res = await send("post", cookie, "", {
      product: seeded.productId,
      print: seeded.sparePrintId,
      images: [img("a"), img("b")],
      priceOverride: 25000,
    });
    expect(res.status).toBe(201);
    const variant = res.body.data.variant;
    expect(variant).toMatchObject({
      priceOverride: 25000,
      isActive: true,
      onHand: 0,
      product: { id: seeded.productId, name: "Modelo C1" },
      print: { id: seeded.sparePrintId },
    });
    expect(variant.images.map((i: { publicId: string }) => i.publicId)).toEqual([
      "gira/variants/a",
      "gira/variants/b",
    ]);
    expect(variant.updatedAt).toBeTruthy();
  });

  it("GET /:id incluye las imágenes", async () => {
    const cookie = await loginAsAdmin(app);
    const seeded = await seedVariant({ tag: "C2" });
    await Variant.updateOne({ _id: seeded.id }, { $set: { images: [img("x")] } });
    const res = await send("patch", cookie, `/${seeded.id}`, { priceOverride: 100 });
    expect(res.body.data.variant.images).toHaveLength(1);
    const detail = await request(app).get(`${BASE}/${seeded.id}`).set("Cookie", cookie);
    expect(detail.body.data.variant.images).toHaveLength(1);
    expect(detail.body.data.variant.product.category.name).toBe("Categoría C2");
  });

  it("PATCH con priceOverride null quita el precio especial", async () => {
    const cookie = await loginAsAdmin(app);
    const seeded = await seedVariant({ tag: "C3" });
    await send("patch", cookie, `/${seeded.id}`, { priceOverride: 12000 });
    const res = await send("patch", cookie, `/${seeded.id}`, { priceOverride: null });
    expect(res.status).toBe(200);
    expect(res.body.data.variant).not.toHaveProperty("priceOverride");
    const saved = await Variant.findById(seeded.id).lean();
    expect(saved?.priceOverride).toBeUndefined();
  });

  it("PATCH reemplaza las imágenes y respeta el orden", async () => {
    const cookie = await loginAsAdmin(app);
    const seeded = await seedVariant({ tag: "C4" });
    const res = await send("patch", cookie, `/${seeded.id}`, { images: [img("segunda"), img("primera")] });
    expect(res.body.data.variant.images[0].publicId).toBe("gira/variants/segunda");
  });

  it("DELETE responde la variante retirada", async () => {
    const cookie = await loginAsAdmin(app);
    const seeded = await seedVariant({ tag: "C5" });
    const res = await send("delete", cookie, `/${seeded.id}`);
    expect(res.status).toBe(200);
    expect(res.body.data.variant).toMatchObject({ id: seeded.id, isActive: false });
  });

  it("el create sigue rechazando priceOverride null", async () => {
    const cookie = await loginAsAdmin(app);
    const seeded = await seedWithSpare("C6");
    const res = await send("post", cookie, "", {
      product: seeded.productId,
      print: seeded.sparePrintId,
      priceOverride: null,
    });
    expect(res.status).toBe(400);
  });
});

describe("GET /admin/variants · withImages", () => {
  it("por defecto no trae imágenes y con withImages=true sí", async () => {
    const cookie = await loginAsAdmin(app);
    const seeded = await seedVariant({ tag: "C7" });
    await Variant.updateOne({ _id: seeded.id }, { $set: { images: [img("l")] } });
    const plain = await request(app).get(`${BASE}?product=${seeded.productId}`).set("Cookie", cookie);
    expect(plain.body.data.variants[0]).not.toHaveProperty("images");
    const withImages = await request(app)
      .get(`${BASE}?product=${seeded.productId}&withImages=true`)
      .set("Cookie", cookie);
    expect(withImages.body.data.variants[0].images).toHaveLength(1);
  });

  it("el ajuste de stock sigue sin traer imágenes", async () => {
    const cookie = await loginAsAdmin(app);
    const seeded = await seedVariant({ tag: "C8", onHand: 5 });
    const res = await send("patch", cookie, `/${seeded.id}/stock`, { delta: 1 });
    expect(res.status).toBe(200);
    expect(res.body.data.variant).not.toHaveProperty("images");
  });
});
```

- [ ] **Step 2: Ver que falla**

Run: `pnpm --filter @gira/api exec vitest run tests/integration/adminVariantCatalog.test.ts`
Expected: FAIL (respuestas con `product` como id suelto, sin `images`, `priceOverride: null` rechazado).

- [ ] **Step 3: `adminVariantService`**

In `apps/api/src/services/adminVariantService.ts`:

1. En `interface AdminVariantListQuery` agregar `  withImages?: boolean;` después de `stock?: StockStatus;`.
2. En `interface AdminVariantRow` agregar `  images?: ImageAttrs[];` después de `priceOverride?: number;`.
3. Reemplazar la firma y el cierre de `toAdminVariant`:

   - Cambiar `const toAdminVariant = (row: AdminVariantRow): AdminVariant => ({` por `const toAdminVariant = (row: AdminVariantRow, withImages = false): AdminVariant => ({`.
   - Agregar `  ...(withImages ? { images: row.images ?? [] } : {}),` justo antes de `  updatedAt: row.updatedAt,`.

4. En `listAdminVariants`, cambiar `items: (result?.rows ?? []).map(toAdminVariant),` por:

```ts
    items: (result?.rows ?? []).map((row) => toAdminVariant(row, query.withImages === true)),
```

5. Reemplazar `findAdminVariant` y `getAdminVariantOrThrow` por:

```ts
/** One AdminVariant by id, or null when the variant (or one of its parents) is gone. */
const findAdminVariant = async (id: string, withImages = false): Promise<AdminVariant | null> => {
  const [row] = await Variant.aggregate<AdminVariantRow>([
    { $match: { _id: new Types.ObjectId(id) } },
    ...JOIN_STAGES,
  ]);
  return row ? toAdminVariant(row, withImages) : null;
};

const getAdminVariantOrThrow = async (id: string, withImages = false): Promise<AdminVariant> => {
  const variant = await findAdminVariant(id, withImages);
  if (!variant) throw new AppError("La variante no existe.", 404);
  return variant;
};
```

- [ ] **Step 4: `variantService` (priceOverride null)**

In `apps/api/src/services/variantService.ts`:

1. En `interface UpdateVariantInput` cambiar `priceOverride?: number;` por `priceOverride?: number | null;`.
2. En `updateVariant`, reemplazar `if (input.priceOverride !== undefined) variant.priceOverride = input.priceOverride;` por:

```ts
  if (input.priceOverride === null) variant.set("priceOverride", undefined);
  else if (input.priceOverride !== undefined) variant.priceOverride = input.priceOverride;
```

- [ ] **Step 5: Validador**

In `apps/api/src/validators/variantValidator.ts`:

1. En `updateVariantSchema` cambiar `priceOverride,` por `priceOverride: priceOverride.allow(null),`.
2. En `variantListQuerySchema` agregar `  withImages: Joi.boolean(),` después de `isActive: Joi.boolean(),`.

- [ ] **Step 6: Controlador**

In `apps/api/src/controllers/variantController.ts`:

1. Quitar `getVariant,` del import de `variantService.js`.
2. Reemplazar los handlers `create`, `detail`, `update` y `deactivate` por:

```ts
const create = asyncHandler(async (req: Request, res: Response) => {
  const created = await createVariant(req.body as CreateVariantInput, buildContext(req));
  const variant = await getAdminVariantOrThrow(created.id, true);
  sendResponse(res, 201, "Variante creada correctamente.", { variant });
});

const detail = asyncHandler(async (req: Request, res: Response) => {
  const variant = await getAdminVariantOrThrow(req.params.id as string, true);
  sendResponse(res, 200, "Variante obtenida correctamente.", { variant });
});

const update = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  await updateVariant(id, req.body as UpdateVariantInput, buildContext(req));
  const variant = await getAdminVariantOrThrow(id, true);
  sendResponse(res, 200, "Variante actualizada correctamente.", { variant });
});

const deactivate = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  await deactivateVariant(id, buildContext(req));
  const variant = await getAdminVariantOrThrow(id, true);
  sendResponse(res, 200, "Variante retirada correctamente.", { variant });
});
```

(`updateStock` y `list` no cambian: el stock sigue sin imágenes y la lista sigue recibiendo `req.query`, que ahora puede traer `withImages`.)

- [ ] **Step 7: Ver que pasa**

Run: `pnpm --filter @gira/api exec vitest run tests/integration/adminVariantCatalog.test.ts tests/integration/adminVariants.test.ts tests/integration/adminVariantList.test.ts tests/integration/adminVariantStock.test.ts`
Expected: PASS en los cuatro.

- [ ] **Step 8: Typecheck y lint de lo tocado**

Run: `pnpm --filter @gira/api typecheck` y `pnpm exec eslint apps/api/src/services/adminProductService.ts apps/api/src/services/adminVariantService.ts apps/api/src/services/variantService.ts apps/api/src/services/productService.ts apps/api/src/controllers/productController.ts apps/api/src/controllers/variantController.ts apps/api/src/validators/productValidator.ts apps/api/src/validators/variantValidator.ts apps/api/src/validators/uploadValidator.ts apps/api/src/models/Product.ts`
Expected: sin errores.

- [ ] **Step 9: Punto de revisión** (sin commit).

---

### Task 6: API — suite completa

- [ ] **Step 1: Correr la suite del API**

Run: `pnpm --filter @gira/api test`
Expected: todo verde. Si falla `shippingLabel` («éxito tardío») u otro test conocido por el flake de la corrida completa, re-correr ese archivo aislado (`pnpm --filter @gira/api exec vitest run tests/integration/shippingLabel.test.ts`); si pasa aislado, no es de M11. Cualquier otro fallo es nuestro: investigar con `superpowers:systematic-debugging`.

- [ ] **Step 2: Punto de revisión.** Reportar a Manuel conteo de tests y cualquier flake.

---
# PARTE 2 · WEB — librería pura y capa de API

> Convenciones del web (ya vigentes): exports al final; `@/` apunta a `apps/web/src`; sin colores ni fuentes fuera de `tokens.css`/`fonts.ts` (lo vigila `tests/designTokens.test.ts`); tests en español; `exactOptionalPropertyTypes` activo (las props opcionales que pueden recibir `undefined` se tipan `?: T | undefined`).

### Task 7: `request()` acepta `FormData`

**Files:**
- Modify: `apps/web/src/lib/api/request.ts`
- Test: `apps/web/tests/lib/request.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Add inside the `describe("request", ...)` of `apps/web/tests/lib/request.test.ts` (antes del `});` final del describe):

```ts
  it("un FormData se envía tal cual y sin content-type (el navegador pone el boundary)", async () => {
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValueOnce(jsonResponse(201, { status: "success", message: "ok" }));
    const form = new FormData();
    form.append("folder", "products");

    await request("/admin/uploads", { method: "POST", body: form });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.body).toBe(form);
    expect((init.headers as Record<string, string>)["content-type"]).toBeUndefined();
  });
```

- [ ] **Step 2: Ver que falla**

Run: `pnpm --filter @gira/web test -- tests/lib/request.test.ts`
Expected: FAIL (`init.body` es un string JSON y el header existe).

- [ ] **Step 3: Implementar**

In `apps/web/src/lib/api/request.ts`, replace:

```ts
  if (options.body !== undefined) {
    headers["content-type"] = "application/json";
    init.body = JSON.stringify(options.body);
  }
```

with:

```ts
  if (options.body !== undefined) {
    if (options.body instanceof FormData) {
      // The browser writes the multipart boundary itself: a hand-set content-type would break the upload.
      init.body = options.body;
    } else {
      headers["content-type"] = "application/json";
      init.body = JSON.stringify(options.body);
    }
  }
```

- [ ] **Step 4: Ver que pasa**

Run: `pnpm --filter @gira/web test -- tests/lib/request.test.ts`
Expected: PASS.

- [ ] **Step 5: Punto de revisión** (sin commit).

---

### Task 8: `lib/catalog` — dinero y ids

**Files:**
- Create: `apps/web/src/lib/catalog/money.ts`
- Create: `apps/web/src/lib/catalog/productId.ts`
- Test: `apps/web/tests/lib/catalog/money.test.ts`, `apps/web/tests/lib/catalog/productId.test.ts`

- [ ] **Step 1: Escribir los tests que fallan**

Create `apps/web/tests/lib/catalog/money.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { centsToPesosText, formatPesos, parsePesos } from "@/lib/catalog/money";

describe("parsePesos", () => {
  it.each([
    ["189", 18900],
    ["189.5", 18950],
    ["189.50", 18950],
    ["$1,234.50", 123450],
    ["0", 0],
    [" 12.05 ", 1205],
  ])("%s → %i centavos", (text, cents) => {
    expect(parsePesos(text)).toBe(cents);
  });

  it.each(["", "abc", "1.234", "-5", "12.", "1e3", "1,2,3.4x"])("rechaza %j", (text) => {
    expect(parsePesos(text)).toBeNull();
  });
});

describe("centsToPesosText", () => {
  it("siempre dos decimales, sin separador de miles", () => {
    expect(centsToPesosText(18900)).toBe("189.00");
    expect(centsToPesosText(21950)).toBe("219.50");
    expect(centsToPesosText(123450)).toBe("1234.50");
  });
});

describe("formatPesos", () => {
  it("formatea en MXN con símbolo y miles", () => {
    expect(formatPesos(18900)).toBe("$189.00");
    expect(formatPesos(123450)).toBe("$1,234.50");
  });
});
```

Create `apps/web/tests/lib/catalog/productId.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isApiError } from "@/lib/api/ApiError";
import { assertProductId, isProductId, productPath } from "@/lib/catalog/productId";

const ID = "68f2ab12c3d4e5f6a7b8c9e2";

describe("productId", () => {
  it("acepta un ObjectId de 24 hex", () => {
    expect(isProductId(ID)).toBe(true);
    expect(assertProductId(ID)).toBe(ID);
    expect(productPath(ID)).toBe(`/productos/${ID}`);
  });

  it("rechaza algo que no es un id antes de armar una ruta", () => {
    for (const bad of ["", "abc", "../etc/passwd", `${ID}/x`]) {
      expect(isProductId(bad)).toBe(false);
      try {
        assertProductId(bad);
        throw new Error("no lanzó");
      } catch (failure) {
        expect(isApiError(failure) && failure.kind).toBe("parse");
      }
    }
  });
});
```

- [ ] **Step 2: Ver que fallan**

Run: `pnpm --filter @gira/web test -- tests/lib/catalog`
Expected: FAIL (módulos inexistentes).

- [ ] **Step 3: Implementar**

Verificar primero que `Currency.MXN` existe: `grep -n "MXN" packages/shared/src/enums/money.ts`. Si el miembro tiene otro nombre, usar ese en `formatPesos`.

Create `apps/web/src/lib/catalog/money.ts`:

```ts
import { Currency } from "@gira/shared";
import { formatMoneyParts } from "@/lib/format";

/** Up to 9 whole digits and at most 2 decimals: the API's 10,000,000-centavo ceiling is 100,000.00 pesos. */
const PESOS_PATTERN = /^\d{1,9}(\.\d{1,2})?$/;

/**
 * The form captures pesos as text ("189", "189.5", "$1,234.50"); the API wants
 * integer centavos. The conversion is string-based so 0.1 + 0.2 float drift can
 * never reach a price. `null` means "not a valid amount".
 */
const parsePesos = (text: string): number | null => {
  const clean = text.trim().replace(/^\$/, "").replace(/,/g, "");
  if (!PESOS_PATTERN.test(clean)) return null;
  const [whole = "0", fraction = ""] = clean.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
};

/** Centavos back to the text an input shows: always two decimals, no grouping. */
const centsToPesosText = (cents: number): string => (cents / 100).toFixed(2);

/** "$1,234.50" for display (money is mono at the call site). */
const formatPesos = (cents: number): string => {
  const { amount, fraction } = formatMoneyParts(cents, Currency.MXN);
  return `${amount}${fraction}`;
};

export { parsePesos, centsToPesosText, formatPesos };
```

Create `apps/web/src/lib/catalog/productId.ts`:

```ts
import { ApiError } from "@/lib/api/ApiError";
import { isObjectId } from "@/lib/inventory/variantId";

const isProductId = (value: string): boolean => isObjectId(value);

/** A manipulated URL or id never reaches the API: it fails here, before any request. */
const assertProductId = (value: string): string => {
  if (!isProductId(value)) throw new ApiError("El identificador del modelo no es válido.", "parse");
  return value;
};

/** Panel route of one product (the id is internal; the slug never appears in the UI). */
const productPath = (id: string): string => `/productos/${assertProductId(id)}`;

export { isProductId, assertProductId, productPath };
```

- [ ] **Step 4: Ver que pasan**

Run: `pnpm --filter @gira/web test -- tests/lib/catalog`
Expected: PASS.

- [ ] **Step 5: Punto de revisión** (sin commit).

---

### Task 9: `lib/catalog` — fixtures, `PanelProduct`, `EditorProduct`

**Files:**
- Create: `apps/web/tests/helpers/catalog.ts`
- Create: `apps/web/src/lib/catalog/panelProduct.ts`
- Create: `apps/web/src/lib/catalog/editorProduct.ts`
- Test: `apps/web/tests/lib/catalog/panelProduct.test.ts`, `apps/web/tests/lib/catalog/editorProduct.test.ts`

- [ ] **Step 1: Fixtures de test**

Create `apps/web/tests/helpers/catalog.ts`:

```ts
import type { AdminProduct, AdminVariant, ImageAttrs, Wire } from "@gira/shared";

const CATEGORY_ID = "68f2ab12c3d4e5f6a7b8c9e1";
const PRODUCT_ID = "68f2ab12c3d4e5f6a7b8c9e2";
const PRINT_A_ID = "68f2ab12c3d4e5f6a7b8c9e3";
const PRINT_B_ID = "68f2ab12c3d4e5f6a7b8c9e4";
const VARIANT_A_ID = "68f2ab12c3d4e5f6a7b8c9e5";
const VARIANT_B_ID = "68f2ab12c3d4e5f6a7b8c9e6";

/** Sentinels for fields the panel must never keep in the LIST model. */
const SLUG_SENTINEL = "slug-que-no-debe-llegar";
const PUBLIC_ID_SENTINEL = "gira/public-id-que-no-debe-llegar";
const DESCRIPTION_SENTINEL = "descripcion-que-no-debe-llegar";

const makeImage = (name: string, publicId = `gira/${name}`): ImageAttrs => ({
  url: `https://res.cloudinary.com/gira/${name}.jpg`,
  publicId,
  width: 800,
  height: 800,
});

const makeRawProduct = (overrides: Partial<Wire<AdminProduct>> = {}): Wire<AdminProduct> => ({
  id: PRODUCT_ID,
  name: "Cosmetiquera chica",
  slug: SLUG_SENTINEL,
  category: { id: CATEGORY_ID, name: "Cosmetiquera", slug: SLUG_SENTINEL },
  description: "Una cosmetiquera",
  basePrice: 18900,
  weightGrams: 140,
  measurements: { widthCm: 18, heightCm: 11, depthCm: 6 },
  materials: ["Lona de algodón", "forro impermeable"],
  isActive: true,
  variantCount: 3,
  activeVariantCount: 2,
  cover: makeImage("portada", PUBLIC_ID_SENTINEL),
  prints: [
    { id: PRINT_A_ID, name: "Nopal en flor", image: makeImage("nopal", PUBLIC_ID_SENTINEL) },
    { id: PRINT_B_ID, name: "Monarca", image: makeImage("monarca", PUBLIC_ID_SENTINEL) },
  ],
  updatedAt: "2026-10-20T12:00:00.000Z",
  ...overrides,
});

const makeRawVariant = (overrides: Partial<Wire<AdminVariant>> = {}): Wire<AdminVariant> => ({
  id: VARIANT_A_ID,
  sku: "COSMETIQUERA-CHICA-NOP",
  product: {
    id: PRODUCT_ID,
    name: "Cosmetiquera chica",
    slug: SLUG_SENTINEL,
    category: { id: CATEGORY_ID, name: "Cosmetiquera", slug: SLUG_SENTINEL },
  },
  print: { id: PRINT_A_ID, name: "Nopal en flor", sku: "NOP", image: makeImage("nopal") },
  onHand: 12,
  reserved: 0,
  available: 12,
  isActive: true,
  images: [makeImage("foto-1"), makeImage("foto-2")],
  updatedAt: "2026-10-20T12:00:00.000Z",
  ...overrides,
});

export {
  CATEGORY_ID,
  PRODUCT_ID,
  PRINT_A_ID,
  PRINT_B_ID,
  VARIANT_A_ID,
  VARIANT_B_ID,
  SLUG_SENTINEL,
  PUBLIC_ID_SENTINEL,
  DESCRIPTION_SENTINEL,
  makeImage,
  makeRawProduct,
  makeRawVariant,
};
```

- [ ] **Step 2: Escribir los tests que fallan**

Create `apps/web/tests/lib/catalog/panelProduct.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { toPanelProduct } from "@/lib/catalog/panelProduct";
import { makeRawProduct, PUBLIC_ID_SENTINEL, SLUG_SENTINEL } from "../../helpers/catalog";

describe("toPanelProduct", () => {
  it("conserva lo que la lista pinta", () => {
    const product = toPanelProduct(makeRawProduct());
    expect(product).toMatchObject({
      name: "Cosmetiquera chica",
      category: { name: "Cosmetiquera" },
      basePrice: 18900,
      isActive: true,
      variantCount: 3,
      activeVariantCount: 2,
      cover: { url: "https://res.cloudinary.com/gira/portada.jpg" },
    });
    expect(product.prints.map((print) => print.name)).toEqual(["Nopal en flor", "Monarca"]);
    expect(product.prints[0]?.image.url).toContain("nopal");
  });

  it("corta en la frontera slugs, ids de almacenamiento, descripción, peso y medidas", () => {
    const json = JSON.stringify(toPanelProduct(makeRawProduct()));
    expect(json).not.toContain(SLUG_SENTINEL);
    expect(json).not.toContain(PUBLIC_ID_SENTINEL);
    expect(json).not.toContain("Una cosmetiquera");
    expect(json).not.toContain("weightGrams");
    expect(json).not.toContain("measurements");
  });

  it("sin portada no inventa la clave", () => {
    const raw = makeRawProduct();
    delete (raw as { cover?: unknown }).cover;
    expect(toPanelProduct(raw)).not.toHaveProperty("cover");
  });
});
```

Create `apps/web/tests/lib/catalog/editorProduct.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { toEditorProduct, toExistingVariant } from "@/lib/catalog/editorProduct";
import { makeImage, makeRawProduct, makeRawVariant, CATEGORY_ID, PRINT_A_ID } from "../../helpers/catalog";

describe("toEditorProduct", () => {
  it("trae lo que el formulario edita", () => {
    const product = toEditorProduct(makeRawProduct({ sizeImage: makeImage("tamano") }));
    expect(product).toMatchObject({
      name: "Cosmetiquera chica",
      categoryId: CATEGORY_ID,
      categoryName: "Cosmetiquera",
      description: "Una cosmetiquera",
      basePrice: 18900,
      weightGrams: 140,
      measurements: { widthCm: 18, heightCm: 11, depthCm: 6 },
      materials: ["Lona de algodón", "forro impermeable"],
      isActive: true,
      activeVariantCount: 2,
    });
    expect(product.sizeImage?.publicId).toBe("gira/tamano");
  });

  it("sin descripción devuelve cadena vacía", () => {
    const raw = makeRawProduct();
    delete (raw as { description?: unknown }).description;
    expect(toEditorProduct(raw).description).toBe("");
  });
});

describe("toExistingVariant", () => {
  it("conserva las imágenes completas (hay que reenviarlas al guardar) y el stock", () => {
    const variant = toExistingVariant(makeRawVariant({ reserved: 2, priceOverride: 25000 }));
    expect(variant).toMatchObject({ printId: PRINT_A_ID, isActive: true, onHand: 12, reserved: 2, priceOverride: 25000 });
    expect(variant.images).toHaveLength(2);
    expect(variant.images[0]?.publicId).toBe("gira/foto-1");
  });

  it("sin images en la respuesta trabaja con lista vacía", () => {
    const raw = makeRawVariant();
    delete (raw as { images?: unknown }).images;
    expect(toExistingVariant(raw).images).toEqual([]);
  });
});
```

- [ ] **Step 3: Ver que fallan**

Run: `pnpm --filter @gira/web test -- tests/lib/catalog`
Expected: FAIL (módulos inexistentes).

- [ ] **Step 4: Implementar**

Create `apps/web/src/lib/catalog/panelProduct.ts`:

```ts
import type { AdminProduct, Wire } from "@gira/shared";

/**
 * A product as the LIST holds it. The admin DTO also carries slugs, the
 * description, weight, measurements and the images' storage ids: the cards
 * paint none of them, so they are cut at the HTTP boundary and never reach
 * component props, React state or the RSC payload.
 */
interface PanelProduct {
  id: string;
  name: string;
  category: { id: string; name: string };
  /** MXN centavos. */
  basePrice: number;
  isActive: boolean;
  variantCount: number;
  activeVariantCount: number;
  cover?: { url: string };
  /** Up to 5 active prints, for the thumbnails on the card. */
  prints: { id: string; name: string; image: { url: string } }[];
  updatedAt: string;
}

const toPanelProduct = (product: Wire<AdminProduct>): PanelProduct => ({
  id: product.id,
  name: product.name,
  category: { id: product.category.id, name: product.category.name },
  basePrice: product.basePrice,
  isActive: product.isActive,
  variantCount: product.variantCount,
  activeVariantCount: product.activeVariantCount,
  ...(product.cover ? { cover: { url: product.cover.url } } : {}),
  prints: product.prints.map((print) => ({ id: print.id, name: print.name, image: { url: print.image.url } })),
  updatedAt: product.updatedAt,
});

export { toPanelProduct };
export type { PanelProduct };
```

Create `apps/web/src/lib/catalog/editorProduct.ts`:

```ts
import type { AdminProduct, AdminVariant, ImageAttrs, Measurements, Wire } from "@gira/shared";

/**
 * The product as the EDITOR holds it. `sizeImage` keeps its `publicId` only to
 * tell whether the operator replaced it; it is never rendered.
 */
interface EditorProduct {
  id: string;
  name: string;
  categoryId: string;
  categoryName: string;
  description: string;
  /** MXN centavos. */
  basePrice: number;
  weightGrams: number;
  measurements: Measurements;
  materials: string[];
  sizeImage?: ImageAttrs;
  isActive: boolean;
  activeVariantCount: number;
}

/**
 * A variant of the product as the editor holds it. Unlike the Inventory panel,
 * the images keep their `publicId`/size: PATCH replaces the whole array, so the
 * photos the operator did not touch must travel back intact.
 */
interface ExistingVariant {
  id: string;
  printId: string;
  sku: string;
  isActive: boolean;
  /** MXN centavos. */
  priceOverride?: number;
  images: ImageAttrs[];
  onHand: number;
  reserved: number;
}

const toEditorProduct = (product: Wire<AdminProduct>): EditorProduct => ({
  id: product.id,
  name: product.name,
  categoryId: product.category.id,
  categoryName: product.category.name,
  description: product.description ?? "",
  basePrice: product.basePrice,
  weightGrams: product.weightGrams,
  measurements: product.measurements,
  materials: product.materials,
  ...(product.sizeImage ? { sizeImage: product.sizeImage } : {}),
  isActive: product.isActive,
  activeVariantCount: product.activeVariantCount,
});

const toExistingVariant = (variant: Wire<AdminVariant>): ExistingVariant => ({
  id: variant.id,
  printId: variant.print.id,
  sku: variant.sku,
  isActive: variant.isActive,
  ...(variant.priceOverride !== undefined ? { priceOverride: variant.priceOverride } : {}),
  images: variant.images ?? [],
  onHand: variant.onHand,
  reserved: variant.reserved,
});

export { toEditorProduct, toExistingVariant };
export type { EditorProduct, ExistingVariant };
```

- [ ] **Step 5: Ver que pasan**

Run: `pnpm --filter @gira/web test -- tests/lib/catalog`
Expected: PASS.

- [ ] **Step 6: Punto de revisión** (sin commit).

---

### Task 10: `lib/catalog` — filtros en la URL y agrupación

**Files:**
- Create: `apps/web/src/lib/catalog/filters.ts`
- Create: `apps/web/src/lib/catalog/groupByCategory.ts`
- Test: `apps/web/tests/lib/catalog/filters.test.ts`, `apps/web/tests/lib/catalog/groupByCategory.test.ts`

- [ ] **Step 1: Escribir los tests que fallan**

Create `apps/web/tests/lib/catalog/filters.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  applyFilterPatch,
  buildProductListQuery,
  hasActiveFilters,
  parseCatalogFilters,
  toSearchParams,
} from "@/lib/catalog/filters";

const CATEGORY = "68f2ab12c3d4e5f6a7b8c9e1";

describe("parseCatalogFilters", () => {
  it("sin parámetros: activos, orden por categoría, página 1", () => {
    expect(parseCatalogFilters({})).toEqual({ status: "active", sort: "category", page: 1 });
  });

  it("lee los parámetros en español", () => {
    expect(
      parseCatalogFilters({ categoria: CATEGORY, estado: "retirados", q: "  tote ", orden: "-basePrice", page: "3" }),
    ).toEqual({ category: CATEGORY, status: "retired", search: "tote", sort: "-basePrice", page: 3 });
  });

  it("descarta ids, estados, órdenes y páginas inválidos", () => {
    expect(
      parseCatalogFilters({ categoria: "no-es-id", estado: "x", orden: "password", page: "-2", q: "   " }),
    ).toEqual({ status: "active", sort: "category", page: 1 });
  });

  it("toma el primer valor cuando el parámetro viene repetido", () => {
    expect(parseCatalogFilters({ estado: ["todos", "activos"] }).status).toBe("all");
  });
});

describe("buildProductListQuery", () => {
  it("activos pide isActive=true", () => {
    const params = new URLSearchParams(buildProductListQuery({ status: "active", sort: "category", page: 1 }));
    expect(params.get("isActive")).toBe("true");
    expect(params.get("sort")).toBe("category");
    expect(params.get("limit")).toBe("100");
  });

  it("retirados pide isActive=false y todos no manda isActive", () => {
    const retired = new URLSearchParams(buildProductListQuery({ status: "retired", sort: "name", page: 2 }));
    expect(retired.get("isActive")).toBe("false");
    expect(retired.get("page")).toBe("2");
    const all = new URLSearchParams(buildProductListQuery({ status: "all", sort: "name", page: 1 }));
    expect(all.has("isActive")).toBe(false);
  });

  it("manda categoría y búsqueda al API", () => {
    const params = new URLSearchParams(
      buildProductListQuery({ status: "active", category: CATEGORY, search: "tote", sort: "name", page: 1 }),
    );
    expect(params.get("category")).toBe(CATEGORY);
    expect(params.get("search")).toBe("tote");
  });
});

describe("toSearchParams", () => {
  it("omite los valores por defecto", () => {
    expect(toSearchParams({ status: "active", sort: "category", page: 1 })).toBe("");
  });

  it("escribe lo que se aparta del defecto, en español", () => {
    const query = toSearchParams({ status: "retired", category: CATEGORY, search: "tote", sort: "name", page: 2 });
    const params = new URLSearchParams(query);
    expect(params.get("estado")).toBe("retirados");
    expect(params.get("categoria")).toBe(CATEGORY);
    expect(params.get("q")).toBe("tote");
    expect(params.get("orden")).toBe("name");
    expect(params.get("page")).toBe("2");
  });
});

describe("applyFilterPatch", () => {
  const current = { status: "active" as const, category: CATEGORY, sort: "category", page: 3 };

  it("un filtro nuevo vuelve a la página 1", () => {
    expect(applyFilterPatch(current, { search: "tote" })).toEqual({ ...current, search: "tote", page: 1 });
  });

  it("undefined limpia ese filtro", () => {
    const next = applyFilterPatch(current, { category: undefined });
    expect(next).not.toHaveProperty("category");
    expect(next.page).toBe(1);
  });

  it("cambiar solo la página la respeta", () => {
    expect(applyFilterPatch(current, { page: 2 }).page).toBe(2);
  });
});

describe("hasActiveFilters", () => {
  it("el estado por defecto y el orden no cuentan", () => {
    expect(hasActiveFilters({ status: "active", sort: "name", page: 1 })).toBe(false);
  });

  it("búsqueda, categoría o un estado distinto sí", () => {
    expect(hasActiveFilters({ status: "active", search: "a", sort: "category", page: 1 })).toBe(true);
    expect(hasActiveFilters({ status: "all", sort: "category", page: 1 })).toBe(true);
    expect(hasActiveFilters({ status: "active", category: CATEGORY, sort: "category", page: 1 })).toBe(true);
  });
});
```

Create `apps/web/tests/lib/catalog/groupByCategory.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { groupProductsByCategory } from "@/lib/catalog/groupByCategory";
import { toPanelProduct } from "@/lib/catalog/panelProduct";
import { makeRawProduct } from "../../helpers/catalog";

const product = (id: string, name: string, categoryId: string, categoryName: string) =>
  toPanelProduct(
    makeRawProduct({ id, name, category: { id: categoryId, name: categoryName, slug: "x" } }),
  );

describe("groupProductsByCategory", () => {
  it("agrupa por categoría en el orden en que aparecen, conservando el orden de los modelos", () => {
    const groups = groupProductsByCategory([
      product("1", "Chica", "c1", "Cosmetiquera"),
      product("2", "Grande", "c1", "Cosmetiquera"),
      product("3", "Oversize", "c2", "Playeras"),
    ]);
    expect(groups.map((group) => [group.name, group.products.map((p) => p.name)])).toEqual([
      ["Cosmetiquera", ["Chica", "Grande"]],
      ["Playeras", ["Oversize"]],
    ]);
  });

  it("sin modelos no hay grupos", () => {
    expect(groupProductsByCategory([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Ver que fallan**

Run: `pnpm --filter @gira/web test -- tests/lib/catalog/filters.test.ts tests/lib/catalog/groupByCategory.test.ts`
Expected: FAIL (módulos inexistentes).

- [ ] **Step 3: Implementar**

Create `apps/web/src/lib/catalog/filters.ts`:

```ts
import { isObjectId } from "@/lib/inventory/variantId";

/** `category` sorts by the category NAME and then the model's; the rest map to the model's own fields. */
const CATALOG_SORT_FIELDS = ["category", "name", "basePrice", "updatedAt"] as const;
const DEFAULT_SORT = "category";
const DEFAULT_LIMIT = 100;
const MAX_SEARCH_LENGTH = 80;

type CatalogStatus = "active" | "retired" | "all";
const DEFAULT_STATUS: CatalogStatus = "active";

/** URL value (Spanish) -> panel value. */
const STATUS_URL_VALUES: Readonly<Record<string, CatalogStatus>> = {
  activos: "active",
  retirados: "retired",
  todos: "all",
};
const STATUS_TO_URL: Readonly<Record<CatalogStatus, string>> = {
  active: "activos",
  retired: "retirados",
  all: "todos",
};

interface CatalogFilters {
  category?: string;
  status: CatalogStatus;
  search?: string;
  sort: string;
  page: number;
}

/** A change to the filters: optional keys may be `undefined`, which means "clear this filter". */
interface CatalogFilterPatch {
  category?: string | undefined;
  status?: CatalogStatus;
  search?: string | undefined;
  sort?: string;
  page?: number;
}

type RawParams = Record<string, string | string[] | undefined>;

const firstOf = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

const isAllowedSort = (value: string): boolean =>
  (CATALOG_SORT_FIELDS as readonly string[]).includes(value.replace(/^-/, ""));

const parseCatalogFilters = (params: RawParams): CatalogFilters => {
  const rawCategory = firstOf(params.categoria);
  const rawSort = firstOf(params.orden);
  const search = firstOf(params.q)?.trim().slice(0, MAX_SEARCH_LENGTH);
  const page = Number(firstOf(params.page));

  const filters: CatalogFilters = {
    status: STATUS_URL_VALUES[firstOf(params.estado) ?? ""] ?? DEFAULT_STATUS,
    sort: rawSort && isAllowedSort(rawSort) ? rawSort : DEFAULT_SORT,
    page: Number.isInteger(page) && page >= 1 ? page : 1,
  };
  if (rawCategory && isObjectId(rawCategory)) filters.category = rawCategory;
  if (search) filters.search = search;
  return filters;
};

/** Query string for GET /admin/products. */
const buildProductListQuery = (filters: CatalogFilters, limit: number = DEFAULT_LIMIT): string => {
  const query = new URLSearchParams();
  if (filters.status === "active") query.set("isActive", "true");
  if (filters.status === "retired") query.set("isActive", "false");
  if (filters.category) query.set("category", filters.category);
  if (filters.search) query.set("search", filters.search);
  query.set("sort", filters.sort);
  query.set("page", String(filters.page));
  query.set("limit", String(limit));
  return query.toString();
};

/** Page URL params: defaults are omitted so a fresh visit has a clean URL. */
const toSearchParams = (filters: CatalogFilters): string => {
  const params = new URLSearchParams();
  if (filters.status !== DEFAULT_STATUS) params.set("estado", STATUS_TO_URL[filters.status]);
  if (filters.category) params.set("categoria", filters.category);
  if (filters.search) params.set("q", filters.search);
  if (filters.sort !== DEFAULT_SORT) params.set("orden", filters.sort);
  if (filters.page !== 1) params.set("page", String(filters.page));
  return params.toString();
};

/** Applies a patch. Any change other than the page itself goes back to page 1: a new filter makes the old page meaningless. */
const applyFilterPatch = (current: CatalogFilters, patch: CatalogFilterPatch): CatalogFilters => {
  const merged: CatalogFilters = {
    status: patch.status ?? current.status,
    sort: patch.sort ?? current.sort,
    page: patch.page ?? 1,
  };
  const category = "category" in patch ? patch.category : current.category;
  const search = "search" in patch ? patch.search : current.search;
  if (category) merged.category = category;
  if (search) merged.search = search;
  return merged;
};

/** True when something other than sort/page narrows the list: the empty state's wording depends on it. */
const hasActiveFilters = (filters: CatalogFilters): boolean =>
  Boolean(filters.category ?? filters.search) || filters.status !== DEFAULT_STATUS;

export {
  CATALOG_SORT_FIELDS,
  DEFAULT_SORT,
  DEFAULT_LIMIT,
  DEFAULT_STATUS,
  parseCatalogFilters,
  buildProductListQuery,
  toSearchParams,
  applyFilterPatch,
  hasActiveFilters,
};
export type { CatalogFilters, CatalogFilterPatch, CatalogStatus };
```

Create `apps/web/src/lib/catalog/groupByCategory.ts`:

```ts
import type { PanelProduct } from "./panelProduct";

interface ProductGroup {
  id: string;
  name: string;
  products: PanelProduct[];
}

/**
 * Groups the page's products by category, in the order each category first
 * appears. The API already sorts (category name, then model name, by default),
 * so this keeps that order instead of re-sorting. Counts describe only the
 * page that was loaded.
 */
const groupProductsByCategory = (products: readonly PanelProduct[]): ProductGroup[] => {
  const groups = new Map<string, ProductGroup>();
  for (const product of products) {
    const existing = groups.get(product.category.id);
    if (existing) existing.products.push(product);
    else groups.set(product.category.id, { id: product.category.id, name: product.category.name, products: [product] });
  }
  return [...groups.values()];
};

export { groupProductsByCategory };
export type { ProductGroup };
```

- [ ] **Step 4: Ver que pasan**

Run: `pnpm --filter @gira/web test -- tests/lib/catalog`
Expected: PASS.

- [ ] **Step 5: Punto de revisión** (sin commit).

---

### Task 11: `lib/catalog/productForm.ts` — estado, validación, cuerpos y plan de variantes

Es la lógica no trivial del editor: TDD obligatorio.

**Files:**
- Create: `apps/web/src/lib/catalog/productForm.ts`
- Test: `apps/web/tests/lib/catalog/productForm.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Create `apps/web/tests/lib/catalog/productForm.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { toEditorProduct, toExistingVariant, type ExistingVariant } from "@/lib/catalog/editorProduct";
import {
  addPrint,
  emptyFormState,
  isDirty,
  planVariantChanges,
  removePrint,
  setDraftImages,
  setDraftPrice,
  stateFromBaseline,
  toCreateBody,
  toUpdateBody,
  validateModel,
  validateVariantPrices,
  type ModelFields,
  type ProductBaseline,
} from "@/lib/catalog/productForm";
import {
  CATEGORY_ID,
  PRINT_A_ID,
  PRINT_B_ID,
  VARIANT_A_ID,
  VARIANT_B_ID,
  makeImage,
  makeRawProduct,
  makeRawVariant,
} from "../../helpers/catalog";

const VALID: ModelFields = {
  name: "Cosmetiquera chica",
  categoryId: CATEGORY_ID,
  description: "",
  price: "189.00",
  weight: "140",
  width: "18",
  height: "11",
  depth: "6",
  materials: "Lona de algodón, forro impermeable",
};

const baseline = (variants: ExistingVariant[] = []): ProductBaseline => ({
  product: toEditorProduct(makeRawProduct({ description: undefined as never })),
  variants,
});

const existingA = toExistingVariant(makeRawVariant({ images: [makeImage("a1")] }));
const existingB = toExistingVariant(
  makeRawVariant({ id: VARIANT_B_ID, print: { id: PRINT_B_ID, name: "Monarca", sku: "MON", image: makeImage("m") }, images: [], isActive: false }),
);

describe("validateModel", () => {
  it("un modelo completo no tiene errores", () => {
    expect(validateModel(VALID)).toEqual({});
  });

  it("nombre, categoría, precio y peso son obligatorios", () => {
    const errors = validateModel({ ...VALID, name: "A", categoryId: "", price: "abc", weight: "" });
    expect(errors.name).toMatch(/al menos 2/);
    expect(errors.categoryId).toBe("Elige una categoría.");
    expect(errors.price).toMatch(/precio en pesos/);
    expect(errors.weight).toBe("Indica el peso en gramos para cotizar el envío.");
  });

  it("respeta los límites del API", () => {
    expect(validateModel({ ...VALID, price: "100000.01" }).price).toMatch(/no puede pasar/);
    expect(validateModel({ ...VALID, weight: "0" }).weight).toMatch(/entre 1 y 20000/);
    expect(validateModel({ ...VALID, weight: "20001" }).weight).toMatch(/entre 1 y 20000/);
    expect(validateModel({ ...VALID, width: "501" }).width).toMatch(/0 y 500/);
    expect(validateModel({ ...VALID, name: "x".repeat(121) }).name).toMatch(/120/);
    expect(validateModel({ ...VALID, description: "x".repeat(2001) }).description).toMatch(/2000/);
  });

  it("las medidas son opcionales pero no pueden ser basura", () => {
    expect(validateModel({ ...VALID, width: "", height: "", depth: "" })).toEqual({});
    expect(validateModel({ ...VALID, height: "ancho" }).height).toMatch(/0 y 500/);
  });

  it("máximo 10 materiales de hasta 60 caracteres", () => {
    expect(validateModel({ ...VALID, materials: Array.from({ length: 11 }, (_, i) => `m${i}`).join(",") }).materials).toMatch(/10/);
    expect(validateModel({ ...VALID, materials: "y".repeat(61) }).materials).toMatch(/60/);
  });
});

describe("validateVariantPrices", () => {
  it("vacío vale (usa el precio base); texto inválido o fuera de rango no", () => {
    const state = addPrint(addPrint(addPrint(emptyFormState(), PRINT_A_ID, []), PRINT_B_ID, []), "p3", []);
    const withPrices = setDraftPrice(setDraftPrice(setDraftPrice(state, PRINT_A_ID, ""), PRINT_B_ID, "abc"), "p3", "100001");
    const errors = validateVariantPrices(withPrices.selected);
    expect(errors[PRINT_A_ID]).toBeUndefined();
    expect(errors[PRINT_B_ID]).toMatch(/precio en pesos/);
    expect(errors.p3).toMatch(/no puede pasar/);
  });
});

describe("toCreateBody", () => {
  it("convierte pesos a centavos y arma materiales y medidas", () => {
    const state = { ...emptyFormState(), model: VALID };
    expect(toCreateBody(state)).toEqual({
      name: "Cosmetiquera chica",
      category: CATEGORY_ID,
      description: "",
      basePrice: 18900,
      weightGrams: 140,
      measurements: { widthCm: 18, heightCm: 11, depthCm: 6 },
      materials: ["Lona de algodón", "forro impermeable"],
    });
  });

  it("omite las medidas vacías e incluye la foto de tamaño si hay", () => {
    const body = toCreateBody({
      ...emptyFormState(),
      model: { ...VALID, width: "", depth: "" },
      sizeImage: makeImage("tamano"),
    });
    expect(body.measurements).toEqual({ heightCm: 11 });
    expect(body.sizeImage?.publicId).toBe("gira/tamano");
  });
});

describe("toUpdateBody", () => {
  it("sin cambios devuelve null", () => {
    expect(toUpdateBody(stateFromBaseline(baseline()), baseline())).toBeNull();
  });

  it("solo manda lo que cambió", () => {
    const state = stateFromBaseline(baseline());
    const next = { ...state, model: { ...state.model, name: "Cosmetiquera mini", price: "150" } };
    expect(toUpdateBody(next, baseline())).toEqual({ name: "Cosmetiquera mini", basePrice: 15000 });
  });

  it("quitar la foto de tamaño manda null y reemplazarla manda la nueva", () => {
    const base = { ...baseline(), product: { ...baseline().product, sizeImage: makeImage("vieja") } };
    const state = stateFromBaseline(base);
    expect(toUpdateBody({ ...state, sizeImage: null }, base)).toEqual({ sizeImage: null });
    expect(toUpdateBody({ ...state, sizeImage: makeImage("nueva") }, base)).toEqual({ sizeImage: makeImage("nueva") });
  });
});

describe("selección de estampas", () => {
  it("elegir una estampa nueva crea un borrador vacío y no duplica", () => {
    const once = addPrint(emptyFormState(), PRINT_A_ID, []);
    expect(once.selected).toEqual([{ printId: PRINT_A_ID, priceOverride: "", images: [] }]);
    expect(addPrint(once, PRINT_A_ID, []).selected).toHaveLength(1);
  });

  it("volver a elegir una estampa con variante retirada recupera su precio y fotos", () => {
    const retired: ExistingVariant = { ...existingB, priceOverride: 20900, images: [makeImage("m1")] };
    const state = addPrint(emptyFormState(), PRINT_B_ID, [retired]);
    expect(state.selected[0]).toEqual({ printId: PRINT_B_ID, priceOverride: "209.00", images: [makeImage("m1")] });
  });

  it("quitar la estampa la saca de la selección", () => {
    const state = removePrint(addPrint(emptyFormState(), PRINT_A_ID, []), PRINT_A_ID);
    expect(state.selected).toEqual([]);
  });

  it("setDraftImages reemplaza solo las fotos de esa estampa", () => {
    const state = addPrint(addPrint(emptyFormState(), PRINT_A_ID, []), PRINT_B_ID, []);
    const next = setDraftImages(state, PRINT_B_ID, [makeImage("x")]);
    expect(next.selected.find((d) => d.printId === PRINT_A_ID)?.images).toEqual([]);
    expect(next.selected.find((d) => d.printId === PRINT_B_ID)?.images).toEqual([makeImage("x")]);
  });
});

describe("planVariantChanges", () => {
  it("una estampa elegida sin variante se crea con su precio y fotos", () => {
    let state = addPrint(emptyFormState(), PRINT_A_ID, []);
    state = setDraftPrice(state, PRINT_A_ID, "209.00");
    state = setDraftImages(state, PRINT_A_ID, [makeImage("n")]);
    const plan = planVariantChanges(state.selected, []);
    expect(plan.create).toEqual([{ printId: PRINT_A_ID, priceOverride: 20900, images: [makeImage("n")] }]);
    expect(plan.update).toEqual([]);
    expect(plan.retire).toEqual([]);
  });

  it("sin precio especial no manda priceOverride al crear", () => {
    const plan = planVariantChanges(addPrint(emptyFormState(), PRINT_A_ID, []).selected, []);
    expect(plan.create[0]).not.toHaveProperty("priceOverride");
  });

  it("una variante activa sin cambios no genera operaciones", () => {
    const state = stateFromBaseline(baseline([existingA]));
    expect(planVariantChanges(state.selected, [existingA])).toEqual({ create: [], update: [], retire: [] });
  });

  it("cambiar fotos o precio actualiza; quitar el precio manda null", () => {
    const withPrice = { ...existingA, priceOverride: 25000 };
    let state = stateFromBaseline(baseline([withPrice]));
    state = setDraftPrice(state, PRINT_A_ID, "");
    state = setDraftImages(state, PRINT_A_ID, [makeImage("a2"), makeImage("a1")]);
    const plan = planVariantChanges(state.selected, [withPrice]);
    expect(plan.update).toEqual([
      { id: VARIANT_A_ID, printId: PRINT_A_ID, patch: { images: [makeImage("a2"), makeImage("a1")], priceOverride: null } },
    ]);
  });

  it("deseleccionar una variante activa la retira", () => {
    const state = removePrint(stateFromBaseline(baseline([existingA])), PRINT_A_ID);
    const plan = planVariantChanges(state.selected, [existingA]);
    expect(plan.retire.map((v) => v.id)).toEqual([VARIANT_A_ID]);
  });

  it("volver a elegir una variante retirada la reactiva", () => {
    const state = addPrint(emptyFormState(), PRINT_B_ID, [existingB]);
    const plan = planVariantChanges(state.selected, [existingB]);
    expect(plan.update).toEqual([{ id: VARIANT_B_ID, printId: PRINT_B_ID, patch: { isActive: true } }]);
    expect(plan.create).toEqual([]);
  });

  it("una variante ya retirada que sigue sin elegir no hace nada", () => {
    expect(planVariantChanges([], [existingB])).toEqual({ create: [], update: [], retire: [] });
  });
});

describe("isDirty", () => {
  it("crear: vacío no está sucio; escribir algo sí", () => {
    expect(isDirty(emptyFormState(), null)).toBe(false);
    expect(isDirty({ ...emptyFormState(), model: { ...VALID } }, null)).toBe(true);
    expect(isDirty(addPrint(emptyFormState(), PRINT_A_ID, []), null)).toBe(true);
  });

  it("editar: sin cambios no está sucio; cambiar un campo, una estampa o una foto sí", () => {
    const base = baseline([existingA]);
    const state = stateFromBaseline(base);
    expect(isDirty(state, base)).toBe(false);
    expect(isDirty({ ...state, model: { ...state.model, name: "Otro" } }, base)).toBe(true);
    expect(isDirty(removePrint(state, PRINT_A_ID), base)).toBe(true);
    expect(isDirty(setDraftImages(state, PRINT_A_ID, []), base)).toBe(true);
  });
});
```

- [ ] **Step 2: Ver que falla**

Run: `pnpm --filter @gira/web test -- tests/lib/catalog/productForm.test.ts`
Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Implementar**

Create `apps/web/src/lib/catalog/productForm.ts`:

```ts
import {
  PRODUCT_BASE_PRICE_MAX,
  PRODUCT_DESCRIPTION_MAX,
  PRODUCT_MATERIAL_MAX,
  PRODUCT_MATERIALS_MAX,
  PRODUCT_MEASURE_MAX,
  PRODUCT_NAME_MAX,
  PRODUCT_NAME_MIN,
  PRODUCT_WEIGHT_MAX,
  PRODUCT_WEIGHT_MIN,
  VARIANT_PRICE_OVERRIDE_MAX,
} from "@gira/shared";
import type { ImageAttrs, Measurements } from "@gira/shared";
import type { EditorProduct, ExistingVariant } from "./editorProduct";
import { centsToPesosText, parsePesos } from "./money";

/** Text exactly as the inputs hold it: validation and conversion happen on save, never while typing. */
interface ModelFields {
  name: string;
  categoryId: string;
  description: string;
  /** Pesos, e.g. "189.00". */
  price: string;
  /** Grams. */
  weight: string;
  width: string;
  height: string;
  depth: string;
  /** Comma-separated. */
  materials: string;
}

/** One print chosen for the model. `priceOverride` is pesos text; empty means "use the base price". */
interface VariantDraft {
  printId: string;
  priceOverride: string;
  images: ImageAttrs[];
}

interface ProductFormState {
  model: ModelFields;
  sizeImage: ImageAttrs | null;
  selected: VariantDraft[];
}

/** What the server held when the editor loaded: the reference every diff is taken against. */
interface ProductBaseline {
  product: EditorProduct;
  variants: ExistingVariant[];
}

type ModelErrors = Partial<Record<keyof ModelFields, string>>;

interface ModelBody {
  name: string;
  category: string;
  description: string;
  /** MXN centavos. */
  basePrice: number;
  weightGrams: number;
  measurements: Measurements;
  materials: string[];
}

type CreateProductBody = ModelBody & { sizeImage?: ImageAttrs };
type UpdateProductBody = Partial<ModelBody> & { sizeImage?: ImageAttrs | null };

interface VariantPatch {
  images?: ImageAttrs[];
  /** `null` removes the override. */
  priceOverride?: number | null;
  isActive?: boolean;
}

interface VariantCreate {
  printId: string;
  priceOverride?: number;
  images: ImageAttrs[];
}

interface VariantPlan {
  create: VariantCreate[];
  update: { id: string; printId: string; patch: VariantPatch }[];
  retire: ExistingVariant[];
}

const EMPTY_MODEL: ModelFields = {
  name: "",
  categoryId: "",
  description: "",
  price: "",
  weight: "",
  width: "",
  height: "",
  depth: "",
  materials: "",
};

const emptyFormState = (): ProductFormState => ({ model: { ...EMPTY_MODEL }, sizeImage: null, selected: [] });

const measureText = (value: number | undefined): string => (value === undefined ? "" : String(value));

const draftFromExisting = (variant: ExistingVariant): VariantDraft => ({
  printId: variant.printId,
  priceOverride: variant.priceOverride === undefined ? "" : centsToPesosText(variant.priceOverride),
  images: variant.images,
});

const stateFromBaseline = ({ product, variants }: ProductBaseline): ProductFormState => ({
  model: {
    name: product.name,
    categoryId: product.categoryId,
    description: product.description,
    price: centsToPesosText(product.basePrice),
    weight: String(product.weightGrams),
    width: measureText(product.measurements.widthCm),
    height: measureText(product.measurements.heightCm),
    depth: measureText(product.measurements.depthCm),
    materials: product.materials.join(", "),
  },
  sizeImage: product.sizeImage ?? null,
  selected: variants.filter((variant) => variant.isActive).map(draftFromExisting),
});

const MEASURE_PATTERN = /^\d+(\.\d+)?$/;
const WEIGHT_PATTERN = /^\d+$/;

const parseMaterials = (text: string): string[] =>
  text
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const measureError = (text: string): string | undefined => {
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  const valid = MEASURE_PATTERN.test(trimmed) && Number(trimmed) <= PRODUCT_MEASURE_MAX;
  return valid ? undefined : `Escribe una medida entre 0 y ${PRODUCT_MEASURE_MAX} cm.`;
};

const validateModel = (model: ModelFields): ModelErrors => {
  const errors: ModelErrors = {};

  const name = model.name.trim();
  if (name.length < PRODUCT_NAME_MIN) errors.name = `El nombre debe tener al menos ${PRODUCT_NAME_MIN} caracteres.`;
  else if (name.length > PRODUCT_NAME_MAX) errors.name = `El nombre no puede exceder ${PRODUCT_NAME_MAX} caracteres.`;

  if (!model.categoryId) errors.categoryId = "Elige una categoría.";

  const price = parsePesos(model.price);
  if (price === null) errors.price = "Escribe el precio en pesos, por ejemplo 189.00.";
  else if (price > PRODUCT_BASE_PRICE_MAX) {
    errors.price = `El precio no puede pasar de $${centsToPesosText(PRODUCT_BASE_PRICE_MAX)}.`;
  }

  const weight = model.weight.trim();
  if (!weight) errors.weight = "Indica el peso en gramos para cotizar el envío.";
  else if (!WEIGHT_PATTERN.test(weight) || Number(weight) < PRODUCT_WEIGHT_MIN || Number(weight) > PRODUCT_WEIGHT_MAX) {
    errors.weight = `El peso debe ser un entero entre ${PRODUCT_WEIGHT_MIN} y ${PRODUCT_WEIGHT_MAX} g.`;
  }

  const width = measureError(model.width);
  const height = measureError(model.height);
  const depth = measureError(model.depth);
  if (width) errors.width = width;
  if (height) errors.height = height;
  if (depth) errors.depth = depth;

  if (model.description.trim().length > PRODUCT_DESCRIPTION_MAX) {
    errors.description = `La descripción no puede exceder ${PRODUCT_DESCRIPTION_MAX} caracteres.`;
  }

  const materials = parseMaterials(model.materials);
  if (materials.length > PRODUCT_MATERIALS_MAX) {
    errors.materials = `No puedes registrar más de ${PRODUCT_MATERIALS_MAX} materiales.`;
  } else if (materials.some((material) => material.length > PRODUCT_MATERIAL_MAX)) {
    errors.materials = `Cada material puede tener hasta ${PRODUCT_MATERIAL_MAX} caracteres.`;
  }

  return errors;
};

/** Errors by printId. An empty override is valid: the variant simply uses the base price. */
const validateVariantPrices = (selected: readonly VariantDraft[]): Record<string, string> => {
  const errors: Record<string, string> = {};
  for (const draft of selected) {
    const text = draft.priceOverride.trim();
    if (!text) continue;
    const cents = parsePesos(text);
    if (cents === null) errors[draft.printId] = "Escribe el precio en pesos, por ejemplo 209.00.";
    else if (cents > VARIANT_PRICE_OVERRIDE_MAX) {
      errors[draft.printId] = `El precio no puede pasar de $${centsToPesosText(VARIANT_PRICE_OVERRIDE_MAX)}.`;
    }
  }
  return errors;
};

/** Assumes `validateModel` passed: `parsePesos`/`Number` cannot fail on what it accepted. */
const toModelBody = (model: ModelFields): ModelBody => {
  const measurements: Measurements = {};
  if (model.width.trim()) measurements.widthCm = Number(model.width);
  if (model.height.trim()) measurements.heightCm = Number(model.height);
  if (model.depth.trim()) measurements.depthCm = Number(model.depth);
  return {
    name: model.name.trim(),
    category: model.categoryId,
    description: model.description.trim(),
    basePrice: parsePesos(model.price) ?? 0,
    weightGrams: Number(model.weight),
    measurements,
    materials: parseMaterials(model.materials),
  };
};

const toCreateBody = (state: ProductFormState): CreateProductBody => ({
  ...toModelBody(state.model),
  ...(state.sizeImage ? { sizeImage: state.sizeImage } : {}),
});

/** Only what changed, or `null` when nothing did (no request, no `updatedAt` bump). */
const toUpdateBody = (state: ProductFormState, baseline: ProductBaseline): UpdateProductBody | null => {
  const next = toModelBody(state.model);
  const previous = toModelBody(stateFromBaseline(baseline).model);
  const body: UpdateProductBody = {};
  for (const key of Object.keys(next) as (keyof ModelBody)[]) {
    if (JSON.stringify(next[key]) !== JSON.stringify(previous[key])) {
      (body as Record<string, unknown>)[key] = next[key];
    }
  }
  const before = baseline.product.sizeImage?.publicId;
  const after = state.sizeImage?.publicId;
  if (before !== after) body.sizeImage = state.sizeImage ?? null;
  return Object.keys(body).length > 0 ? body : null;
};

/** Picks a print for the model. A print whose variant was retired comes back with its old price and photos. */
const addPrint = (state: ProductFormState, printId: string, existing: readonly ExistingVariant[]): ProductFormState => {
  if (state.selected.some((draft) => draft.printId === printId)) return state;
  const previous = existing.find((variant) => variant.printId === printId);
  const draft: VariantDraft = previous ? draftFromExisting(previous) : { printId, priceOverride: "", images: [] };
  return { ...state, selected: [...state.selected, draft] };
};

const removePrint = (state: ProductFormState, printId: string): ProductFormState => ({
  ...state,
  selected: state.selected.filter((draft) => draft.printId !== printId),
});

const updateDraft = (state: ProductFormState, printId: string, patch: Partial<VariantDraft>): ProductFormState => ({
  ...state,
  selected: state.selected.map((draft) => (draft.printId === printId ? { ...draft, ...patch } : draft)),
});

const setDraftPrice = (state: ProductFormState, printId: string, priceOverride: string): ProductFormState =>
  updateDraft(state, printId, { priceOverride });

const setDraftImages = (state: ProductFormState, printId: string, images: ImageAttrs[]): ProductFormState =>
  updateDraft(state, printId, { images });

const sameImages = (a: readonly ImageAttrs[], b: readonly ImageAttrs[]): boolean =>
  a.length === b.length && a.every((image, index) => image.publicId === b[index]?.publicId);

const overrideOf = (draft: VariantDraft): number | undefined => {
  if (!draft.priceOverride.trim()) return undefined;
  return parsePesos(draft.priceOverride) ?? undefined;
};

/** What has to happen on the server so its variants match the selection. */
const planVariantChanges = (selected: readonly VariantDraft[], existing: readonly ExistingVariant[]): VariantPlan => {
  const byPrint = new Map(existing.map((variant) => [variant.printId, variant]));
  const plan: VariantPlan = { create: [], update: [], retire: [] };

  for (const draft of selected) {
    const price = overrideOf(draft);
    const current = byPrint.get(draft.printId);
    if (!current) {
      plan.create.push({
        printId: draft.printId,
        ...(price !== undefined ? { priceOverride: price } : {}),
        images: draft.images,
      });
      continue;
    }
    const patch: VariantPatch = {};
    if (!current.isActive) patch.isActive = true;
    if (!sameImages(current.images, draft.images)) patch.images = draft.images;
    if (price !== current.priceOverride) patch.priceOverride = price ?? null;
    if (Object.keys(patch).length > 0) plan.update.push({ id: current.id, printId: draft.printId, patch });
  }

  const chosen = new Set(selected.map((draft) => draft.printId));
  plan.retire = existing.filter((variant) => variant.isActive && !chosen.has(variant.printId));
  return plan;
};

const planIsEmpty = (plan: VariantPlan): boolean =>
  plan.create.length === 0 && plan.update.length === 0 && plan.retire.length === 0;

/** True when saving would do something. `baseline === null` is the create form. */
const isDirty = (state: ProductFormState, baseline: ProductBaseline | null): boolean => {
  if (!baseline) return JSON.stringify(state) !== JSON.stringify(emptyFormState());
  return toUpdateBody(state, baseline) !== null || !planIsEmpty(planVariantChanges(state.selected, baseline.variants));
};

export {
  EMPTY_MODEL,
  emptyFormState,
  stateFromBaseline,
  validateModel,
  validateVariantPrices,
  toCreateBody,
  toUpdateBody,
  addPrint,
  removePrint,
  setDraftPrice,
  setDraftImages,
  planVariantChanges,
  isDirty,
};
export type {
  ModelFields,
  ModelErrors,
  VariantDraft,
  ProductFormState,
  ProductBaseline,
  CreateProductBody,
  UpdateProductBody,
  VariantPatch,
  VariantCreate,
  VariantPlan,
};
```

- [ ] **Step 4: Ver que pasa**

Run: `pnpm --filter @gira/web test -- tests/lib/catalog/productForm.test.ts`
Expected: PASS. Si falla el test «descripción indefinida» del `baseline()` (usa `undefined as never` para quitar la descripción), ajustar el helper de test, no el código.

- [ ] **Step 5: Punto de revisión** (sin commit).

---

### Task 12: `lib/catalog` — opciones de catálogo y archivo de imagen

**Files:**
- Create: `apps/web/src/lib/catalog/catalogOptions.ts`
- Create: `apps/web/src/lib/catalog/imageFile.ts`
- Test: `apps/web/tests/lib/catalog/catalogOptions.test.ts`, `apps/web/tests/lib/catalog/imageFile.test.ts`

- [ ] **Step 1: Escribir los tests que fallan**

Create `apps/web/tests/lib/catalog/catalogOptions.test.ts`:

```ts
import type { Print, PrintFamily, ProductCategory, Wire } from "@gira/shared";
import { describe, expect, it } from "vitest";
import { toCatalogOptions, toPickerPrint, withCurrentCategory } from "@/lib/catalog/catalogOptions";
import { makeImage, PUBLIC_ID_SENTINEL, SLUG_SENTINEL } from "../../helpers/catalog";

const category = (id: string, name: string): Wire<ProductCategory> => ({ id, name, slug: SLUG_SENTINEL, isActive: true });
const family = (id: string, name: string): Wire<PrintFamily> => ({ id, name, slug: SLUG_SENTINEL, isActive: true });
const print = (id: string, name: string, familyId: string, familyName: string): Wire<Print> => ({
  id,
  name,
  slug: SLUG_SENTINEL,
  sku: name.slice(0, 3).toUpperCase(),
  family: { id: familyId, name: familyName, slug: SLUG_SENTINEL },
  image: makeImage(name, PUBLIC_ID_SENTINEL),
  isActive: true,
});

describe("toCatalogOptions", () => {
  it("ordena por nombre en español y recorta lo que la UI no pinta", () => {
    const options = toCatalogOptions(
      [category("c2", "Totes"), category("c1", "Álbumes")],
      [family("f2", "Tradición"), family("f1", "Flora")],
      [print("p2", "Zorro", "f1", "Flora"), print("p1", "Águila", "f2", "Tradición")],
    );
    expect(options.categories.map((o) => o.label)).toEqual(["Álbumes", "Totes"]);
    expect(options.families.map((o) => o.label)).toEqual(["Flora", "Tradición"]);
    expect(options.prints.map((p) => p.name)).toEqual(["Águila", "Zorro"]);
    expect(JSON.stringify(options)).not.toContain(SLUG_SENTINEL);
    expect(JSON.stringify(options)).not.toContain(PUBLIC_ID_SENTINEL);
  });
});

describe("toPickerPrint", () => {
  it("expone solo lo que el selector pinta", () => {
    expect(toPickerPrint(print("p1", "Nopal", "f1", "Flora"))).toEqual({
      id: "p1",
      name: "Nopal",
      sku: "NOP",
      familyId: "f1",
      familyName: "Flora",
      imageUrl: "https://res.cloudinary.com/gira/Nopal.jpg",
    });
  });
});

describe("withCurrentCategory", () => {
  it("agrega la categoría actual si ya no está entre las activas", () => {
    const options = [{ value: "c1", label: "Totes" }];
    expect(withCurrentCategory(options, "c9", "Retirada")).toEqual([
      { value: "c1", label: "Totes" },
      { value: "c9", label: "Retirada (retirada)" },
    ]);
  });

  it("no duplica una que ya está", () => {
    const options = [{ value: "c1", label: "Totes" }];
    expect(withCurrentCategory(options, "c1", "Totes")).toBe(options);
  });
});
```

Create `apps/web/tests/lib/catalog/imageFile.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { validateImageFile } from "@/lib/catalog/imageFile";

const file = (type: string, size: number, name = "foto"): File => {
  const blob = new File(["x"], name, { type });
  Object.defineProperty(blob, "size", { value: size });
  return blob;
};

describe("validateImageFile", () => {
  it("acepta JPG, PNG, WEBP y AVIF de hasta 5 MB", () => {
    for (const type of ["image/jpeg", "image/png", "image/webp", "image/avif"]) {
      expect(validateImageFile(file(type, 1024))).toBeNull();
    }
    expect(validateImageFile(file("image/png", 5 * 1024 * 1024))).toBeNull();
  });

  it("rechaza otros tipos y archivos grandes con un mensaje en español", () => {
    expect(validateImageFile(file("application/pdf", 10, "x.pdf"))).toMatch(/JPG, PNG, WEBP o AVIF/);
    expect(validateImageFile(file("image/gif", 10, "x.gif"))).toMatch(/JPG, PNG, WEBP o AVIF/);
    expect(validateImageFile(file("image/png", 5 * 1024 * 1024 + 1, "grande.png"))).toMatch(/5 MB/);
  });
});
```

- [ ] **Step 2: Ver que fallan**

Run: `pnpm --filter @gira/web test -- tests/lib/catalog/catalogOptions.test.ts tests/lib/catalog/imageFile.test.ts`
Expected: FAIL (módulos inexistentes).

- [ ] **Step 3: Implementar**

Create `apps/web/src/lib/catalog/catalogOptions.ts`:

```ts
import type { Print, PrintFamily, ProductCategory, Wire } from "@gira/shared";

interface Option {
  value: string;
  label: string;
}

/** A print as the picker paints it: no slug, no storage id. */
interface PickerPrint {
  id: string;
  name: string;
  sku: string;
  familyId: string;
  familyName: string;
  imageUrl: string;
}

interface CatalogOptions {
  categories: Option[];
  families: Option[];
  prints: PickerPrint[];
}

const EMPTY_CATALOG_OPTIONS: CatalogOptions = { categories: [], families: [], prints: [] };

const byLabel = (a: Option, b: Option): number => a.label.localeCompare(b.label, "es");
const byName = (a: PickerPrint, b: PickerPrint): number => a.name.localeCompare(b.name, "es");

const toPickerPrint = (print: Wire<Print>): PickerPrint => ({
  id: print.id,
  name: print.name,
  sku: print.sku,
  familyId: print.family.id,
  familyName: print.family.name,
  imageUrl: print.image.url,
});

const toCategoryOptions = (categories: readonly Wire<ProductCategory>[]): Option[] =>
  categories.map((category) => ({ value: category.id, label: category.name })).sort(byLabel);

const toCatalogOptions = (
  categories: readonly Wire<ProductCategory>[],
  families: readonly Wire<PrintFamily>[],
  prints: readonly Wire<Print>[],
): CatalogOptions => ({
  categories: toCategoryOptions(categories),
  families: families.map((family) => ({ value: family.id, label: family.name })).sort(byLabel),
  prints: prints.map(toPickerPrint).sort(byName),
});

/** A product whose category was retired still has to show it in the select, flagged as retired. */
const withCurrentCategory = (options: Option[], categoryId: string, categoryName: string): Option[] =>
  options.some((option) => option.value === categoryId)
    ? options
    : [...options, { value: categoryId, label: `${categoryName} (retirada)` }];

export { EMPTY_CATALOG_OPTIONS, toCatalogOptions, toCategoryOptions, toPickerPrint, withCurrentCategory };
export type { Option, PickerPrint, CatalogOptions };
```

Create `apps/web/src/lib/catalog/imageFile.ts`:

```ts
import { UPLOAD_MAX_BYTES, UPLOAD_MIME_TYPES } from "@gira/shared";

/** Value for an `<input type="file" accept>`. */
const IMAGE_ACCEPT = UPLOAD_MIME_TYPES.join(",");

/** Pre-checks what the API enforces (type and 5 MB), so the operator sees the problem before the upload. `null` = fine. */
const validateImageFile = (file: File): string | null => {
  if (!(UPLOAD_MIME_TYPES as readonly string[]).includes(file.type)) {
    return `«${file.name}» no es una imagen válida. Usa JPG, PNG, WEBP o AVIF.`;
  }
  if (file.size > UPLOAD_MAX_BYTES) {
    return `«${file.name}» pesa más de ${UPLOAD_MAX_BYTES / 1024 / 1024} MB.`;
  }
  return null;
};

export { IMAGE_ACCEPT, validateImageFile };
```

- [ ] **Step 4: Ver que pasan**

Run: `pnpm --filter @gira/web test -- tests/lib/catalog`
Expected: PASS (todos los de `tests/lib/catalog`).

- [ ] **Step 5: Punto de revisión** (sin commit).

---

### Task 13: Clientes HTTP del catálogo

**Files:**
- Modify: `apps/web/src/lib/api/paths.ts`
- Create: `apps/web/src/lib/api/adminProducts.ts`
- Create: `apps/web/src/lib/api/adminCatalog.ts`
- Create: `apps/web/src/lib/api/adminUploads.ts`
- Modify: `apps/web/src/lib/api/adminVariants.ts`
- Test: `apps/web/tests/lib/adminCatalog-api.test.ts`

- [ ] **Step 1: Rutas**

In `apps/web/src/lib/api/paths.ts` agregar, tras `const ADMIN_VARIANTS_PATH = "/admin/variants";`:

```ts
const ADMIN_PRODUCTS_PATH = "/admin/products";
const ADMIN_CATEGORIES_PATH = "/admin/product-categories";
const ADMIN_FAMILIES_PATH = "/admin/print-families";
const ADMIN_PRINTS_PATH = "/admin/prints";
const ADMIN_UPLOADS_PATH = "/admin/uploads";
```

y agregarlas al `export { ... }` final.

- [ ] **Step 2: Escribir el test que falla**

Create `apps/web/tests/lib/adminCatalog-api.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isApiError } from "@/lib/api/ApiError";
import { createPrint, fetchCatalogOptions, fetchCategoryOptions } from "@/lib/api/adminCatalog";
import { getEditorProduct, listProducts, reactivateProduct, retireProduct, updateProduct, createProduct } from "@/lib/api/adminProducts";
import { uploadImage } from "@/lib/api/adminUploads";
import { createVariant, listProductVariants, updateVariant } from "@/lib/api/adminVariants";
import { jsonResponse } from "../helpers/fetchMock";
import {
  PRODUCT_ID,
  PRINT_A_ID,
  VARIANT_A_ID,
  makeImage,
  makeRawProduct,
  makeRawVariant,
  PUBLIC_ID_SENTINEL,
  SLUG_SENTINEL,
} from "../helpers/catalog";

const ok = (data: unknown, meta?: unknown) => jsonResponse(200, { status: "success", message: "ok", data, ...(meta ? { meta } : {}) });

// `stubFetch()` restores fetch after the FIRST test when called at module level, so the stub is (re)installed per test.
const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const lastCall = () => fetchMock.mock.calls.at(-1) as [string, RequestInit];

describe("adminProducts", () => {
  it("listProducts recorta cada fila en la frontera y conserva meta", async () => {
    fetchMock.mockResolvedValueOnce(ok({ products: [makeRawProduct()] }, { total: 1, page: 1, pages: 1, limit: 100 }));
    const { products, meta } = await listProducts("sort=category");
    expect(lastCall()[0]).toBe("http://api.test/api/v1/admin/products?sort=category");
    expect(products).toHaveLength(1);
    expect(JSON.stringify(products)).not.toContain(SLUG_SENTINEL);
    expect(JSON.stringify(products)).not.toContain(PUBLIC_ID_SENTINEL);
    expect(meta.total).toBe(1);
  });

  it("getEditorProduct valida el id antes de pedir nada", async () => {
    await expect(getEditorProduct("../x")).rejects.toSatisfy((failure) => isApiError(failure) && failure.kind === "parse");
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockResolvedValueOnce(ok({ product: makeRawProduct() }));
    expect((await getEditorProduct(PRODUCT_ID)).name).toBe("Cosmetiquera chica");
  });

  it("createProduct devuelve el id y manda el cuerpo como JSON", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(201, { status: "success", message: "ok", data: { product: makeRawProduct() } }));
    const id = await createProduct({
      name: "X",
      category: "c",
      description: "",
      basePrice: 100,
      weightGrams: 10,
      measurements: {},
      materials: [],
    });
    expect(id).toBe(PRODUCT_ID);
    const [url, init] = lastCall();
    expect(url).toBe("http://api.test/api/v1/admin/products");
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("include");
  });

  it("updateProduct, retireProduct y reactivateProduct usan PATCH/DELETE sobre el id", async () => {
    fetchMock.mockResolvedValue(ok({ product: makeRawProduct() }));
    await updateProduct(PRODUCT_ID, { name: "Nuevo" });
    expect(lastCall()[1].method).toBe("PATCH");
    await retireProduct(PRODUCT_ID);
    expect(lastCall()[1].method).toBe("DELETE");
    await reactivateProduct(PRODUCT_ID);
    expect(lastCall()[1].method).toBe("PATCH");
    expect(lastCall()[1].body).toBe(JSON.stringify({ isActive: true }));
  });

  it("retireProduct propaga el 409 del API con su mensaje", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(409, { status: "fail", message: "No puedes retirar un producto con variantes activas." }));
    await expect(retireProduct(PRODUCT_ID)).rejects.toMatchObject({ status: 409, message: /variantes activas/ });
  });
});

describe("adminVariants (catálogo)", () => {
  it("listProductVariants pide las imágenes y todas las variantes del modelo", async () => {
    fetchMock.mockResolvedValueOnce(ok({ variants: [makeRawVariant()] }));
    const variants = await listProductVariants(PRODUCT_ID);
    const url = new URL(lastCall()[0]);
    expect(url.searchParams.get("product")).toBe(PRODUCT_ID);
    expect(url.searchParams.get("withImages")).toBe("true");
    expect(url.searchParams.has("isActive")).toBe(false);
    expect(variants[0]).toMatchObject({ printId: PRINT_A_ID, sku: "COSMETIQUERA-CHICA-NOP" });
    expect(variants[0]?.images).toHaveLength(2);
  });

  it("createVariant y updateVariant devuelven la variante del editor", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(201, { status: "success", message: "ok", data: { variant: makeRawVariant() } }));
    const created = await createVariant({ product: PRODUCT_ID, print: PRINT_A_ID, images: [], priceOverride: 100 });
    expect(created.id).toBe(VARIANT_A_ID);
    expect(lastCall()[1].method).toBe("POST");
    fetchMock.mockResolvedValueOnce(ok({ variant: makeRawVariant({ isActive: false }) }));
    const updated = await updateVariant(VARIANT_A_ID, { priceOverride: null });
    expect(updated.isActive).toBe(false);
    expect(lastCall()[1].body).toBe(JSON.stringify({ priceOverride: null }));
  });

  it("updateVariant valida el id", async () => {
    await expect(updateVariant("nope", { isActive: false })).rejects.toMatchObject({ kind: "parse" });
  });
});

describe("adminCatalog", () => {
  it("fetchCatalogOptions pide categorías, familias y estampas activas", async () => {
    fetchMock
      .mockResolvedValueOnce(ok({ categories: [{ id: "c1", name: "Totes", slug: "t", isActive: true }] }))
      .mockResolvedValueOnce(ok({ families: [{ id: "f1", name: "Flora", slug: "f", isActive: true }] }))
      .mockResolvedValueOnce(
        ok({ prints: [{ id: "p1", name: "Nopal", slug: "n", sku: "NOP", family: { id: "f1", name: "Flora", slug: "f" }, image: makeImage("n"), isActive: true }] }),
      );
    const options = await fetchCatalogOptions();
    const urls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(urls.some((u) => u.includes("/admin/product-categories?isActive=true"))).toBe(true);
    expect(urls.some((u) => u.includes("/admin/print-families?isActive=true"))).toBe(true);
    expect(urls.some((u) => u.includes("/admin/prints?isActive=true"))).toBe(true);
    expect(options.prints[0]?.familyName).toBe("Flora");
  });

  it("fetchCategoryOptions solo pide categorías", async () => {
    fetchMock.mockResolvedValueOnce(ok({ categories: [{ id: "c1", name: "Totes", slug: "t", isActive: true }] }));
    expect(await fetchCategoryOptions()).toEqual([{ value: "c1", label: "Totes" }]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("createPrint devuelve la estampa lista para el selector", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(201, {
        status: "success",
        message: "ok",
        data: { print: { id: "p9", name: "Cassette", slug: "c", sku: "CAS", family: { id: "f1", name: "Retro", slug: "r" }, image: makeImage("c"), isActive: true } },
      }),
    );
    const print = await createPrint({ name: "Cassette", sku: "CAS", family: "f1", image: makeImage("c") });
    expect(print).toMatchObject({ id: "p9", familyName: "Retro" });
  });
});

describe("adminUploads", () => {
  it("manda un multipart con folder y file, sin content-type manual", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(201, { status: "success", message: "ok", data: { image: makeImage("subida") } }));
    const file = new File(["x"], "foto.png", { type: "image/png" });
    const image = await uploadImage(file, "variants");
    expect(image.publicId).toBe("gira/subida");
    const [url, init] = lastCall();
    expect(url).toBe("http://api.test/api/v1/admin/uploads");
    expect(init.body).toBeInstanceOf(FormData);
    const form = init.body as FormData;
    expect(form.get("folder")).toBe("variants");
    expect((form.get("file") as File).name).toBe("foto.png");
    expect((init.headers as Record<string, string>)["content-type"]).toBeUndefined();
  });
});
```

- [ ] **Step 3: Ver que falla**

Run: `pnpm --filter @gira/web test -- tests/lib/adminCatalog-api.test.ts`
Expected: FAIL (módulos inexistentes).

- [ ] **Step 4: Implementar `adminProducts.ts`**

Create `apps/web/src/lib/api/adminProducts.ts`:

```ts
import type { AdminProduct, ApiMeta } from "@gira/shared";
import { toEditorProduct, type EditorProduct } from "@/lib/catalog/editorProduct";
import { toPanelProduct, type PanelProduct } from "@/lib/catalog/panelProduct";
import { assertProductId } from "@/lib/catalog/productId";
import type { CreateProductBody, UpdateProductBody } from "@/lib/catalog/productForm";
import { browserRequest } from "./browser";
import { ADMIN_PRODUCTS_PATH } from "./paths";
import { expectData } from "./request";

/**
 * Browser-side client for /admin/products. Everything goes through
 * `browserRequest`: the list refreshes in the client and every mutation must
 * leave with a real Origin header (see browser.ts). Product endpoints wrap
 * their payload in a named key (`products`, `product`).
 */

const productApiPath = (id: string): string => `${ADMIN_PRODUCTS_PATH}/${assertProductId(id)}`;

const listProducts = async (query: string): Promise<{ products: PanelProduct[]; meta: ApiMeta }> => {
  const result = await browserRequest<{ products: AdminProduct[] }>(`${ADMIN_PRODUCTS_PATH}?${query}`);
  const { products } = expectData(result);
  return {
    products: products.map(toPanelProduct),
    meta: result.meta ?? { total: products.length, page: 1, pages: 1, limit: products.length },
  };
};

const getEditorProduct = async (id: string): Promise<EditorProduct> =>
  toEditorProduct(expectData(await browserRequest<{ product: AdminProduct }>(productApiPath(id))).product);

/** Creates the model and answers its id; the variants are created afterwards, one by one. */
const createProduct = async (body: CreateProductBody): Promise<string> =>
  expectData(await browserRequest<{ product: AdminProduct }>(ADMIN_PRODUCTS_PATH, { method: "POST", body })).product.id;

const updateProduct = async (id: string, body: UpdateProductBody): Promise<void> => {
  await browserRequest<{ product: AdminProduct }>(productApiPath(id), { method: "PATCH", body });
};

/** Soft delete. The API answers 409 (with its own Spanish message) while the model still has active variants. */
const retireProduct = async (id: string): Promise<void> => {
  await browserRequest<{ product: AdminProduct }>(productApiPath(id), { method: "DELETE" });
};

const reactivateProduct = async (id: string): Promise<void> => {
  await browserRequest<{ product: AdminProduct }>(productApiPath(id), { method: "PATCH", body: { isActive: true } });
};

export { listProducts, getEditorProduct, createProduct, updateProduct, retireProduct, reactivateProduct };
```

- [ ] **Step 5: Implementar `adminCatalog.ts` y `adminUploads.ts`**

Create `apps/web/src/lib/api/adminCatalog.ts`:

```ts
import type { ImageAttrs, Print, PrintFamily, ProductCategory } from "@gira/shared";
import {
  toCatalogOptions,
  toCategoryOptions,
  toPickerPrint,
  type CatalogOptions,
  type Option,
  type PickerPrint,
} from "@/lib/catalog/catalogOptions";
import { browserRequest } from "./browser";
import { ADMIN_CATEGORIES_PATH, ADMIN_FAMILIES_PATH, ADMIN_PRINTS_PATH } from "./paths";
import { expectData } from "./request";

/**
 * Read-only lists that feed the catalog selects and the print picker. Active
 * records only, one page of the API's maximum: the catalog is small, and a
 * catalog past 100 prints is a pending item (the picker would need search).
 */
const QUERY = "isActive=true&limit=100&page=1";

const fetchCategoryOptions = async (): Promise<Option[]> =>
  toCategoryOptions(expectData(await browserRequest<{ categories: ProductCategory[] }>(`${ADMIN_CATEGORIES_PATH}?${QUERY}`)).categories);

const fetchCatalogOptions = async (): Promise<CatalogOptions> => {
  const [categories, families, prints] = await Promise.all([
    browserRequest<{ categories: ProductCategory[] }>(`${ADMIN_CATEGORIES_PATH}?${QUERY}`),
    browserRequest<{ families: PrintFamily[] }>(`${ADMIN_FAMILIES_PATH}?${QUERY}`),
    browserRequest<{ prints: Print[] }>(`${ADMIN_PRINTS_PATH}?${QUERY}`),
  ]);
  return toCatalogOptions(
    expectData(categories).categories,
    expectData(families).families,
    expectData(prints).prints,
  );
};

interface CreatePrintBody {
  name: string;
  sku: string;
  family: string;
  image: ImageAttrs;
}

const createPrint = async (body: CreatePrintBody): Promise<PickerPrint> =>
  toPickerPrint(expectData(await browserRequest<{ print: Print }>(ADMIN_PRINTS_PATH, { method: "POST", body })).print);

export { fetchCategoryOptions, fetchCatalogOptions, createPrint };
export type { CreatePrintBody };
```

Create `apps/web/src/lib/api/adminUploads.ts`:

```ts
import type { ImageAttrs } from "@gira/shared";
import { browserRequest } from "./browser";
import { ADMIN_UPLOADS_PATH } from "./paths";
import { expectData } from "./request";

type UploadFolder = "prints" | "variants" | "products";

/** Generous: the API streams the file to Cloudinary before it answers. */
const UPLOAD_TIMEOUT_MS = 30_000;

/**
 * Uploads one image and answers the object the catalog stores as-is
 * (`{ url, publicId, width, height }`). The text field goes before the file so
 * the multipart parser has `folder` by the time the file arrives.
 */
const uploadImage = async (file: File, folder: UploadFolder): Promise<ImageAttrs> => {
  const form = new FormData();
  form.append("folder", folder);
  form.append("file", file);
  return expectData(
    await browserRequest<{ image: ImageAttrs }>(ADMIN_UPLOADS_PATH, { method: "POST", body: form, timeoutMs: UPLOAD_TIMEOUT_MS }),
  ).image;
};

export { uploadImage };
export type { UploadFolder };
```

- [ ] **Step 6: Ampliar `adminVariants.ts`**

In `apps/web/src/lib/api/adminVariants.ts`:

1. Cambiar el import de tipos de la primera línea a: `import type { AdminVariant, AdminVariantActivity, ApiMeta, ImageAttrs, InventoryStats, Wire } from "@gira/shared";`
2. Agregar los imports:

```ts
import { toExistingVariant, type ExistingVariant } from "@/lib/catalog/editorProduct";
import { assertProductId } from "@/lib/catalog/productId";
import type { VariantPatch } from "@/lib/catalog/productForm";
```

3. Antes del `export { listVariants, ... }` agregar:

```ts
/** Every variant of one model (active or not), with its photos, for the editor. One page: a model never has 100 prints. */
const listProductVariants = async (productId: string): Promise<ExistingVariant[]> => {
  const query = new URLSearchParams({
    product: assertProductId(productId),
    withImages: "true",
    sort: "sku",
    page: "1",
    limit: "100",
  });
  const { variants } = expectData(await browserRequest<{ variants: AdminVariant[] }>(`${ADMIN_VARIANTS_PATH}?${query.toString()}`));
  return variants.map(toExistingVariant);
};

interface CreateVariantBody {
  product: string;
  print: string;
  images: ImageAttrs[];
  priceOverride?: number;
}

const createVariant = async (body: CreateVariantBody): Promise<ExistingVariant> =>
  toExistingVariant(
    expectData(await browserRequest<{ variant: AdminVariant }>(ADMIN_VARIANTS_PATH, { method: "POST", body })).variant,
  );

/** Photos, price override (`null` removes it) and the active flag: the only things the catalog edits on a variant. */
const updateVariant = async (id: string, patch: VariantPatch): Promise<ExistingVariant> =>
  toExistingVariant(
    expectData(await browserRequest<{ variant: AdminVariant }>(variantPath(id), { method: "PATCH", body: patch })).variant,
  );
```

4. Cambiar el export final a: `export { listVariants, fetchInventoryCounts, updateStock, getVariantActivity, listProductVariants, createVariant, updateVariant };` y agregar `export type { CreateVariantBody };`.

- [ ] **Step 7: Ver que pasa**

Run: `pnpm --filter @gira/web test -- tests/lib/adminCatalog-api.test.ts tests/lib/adminVariants-api.test.ts`
Expected: PASS (el test viejo de variantes sigue verde).

- [ ] **Step 8: Typecheck**

Run: `pnpm --filter @gira/web exec tsc --noEmit`
Expected: sin errores.

- [ ] **Step 9: Punto de revisión** (sin commit).

---
# PARTE 3 · WEB — hooks y componentes

### Task 14: Hooks de datos (lista, opciones, editor, subida, guardado)

**Files:**
- Create: `apps/web/src/hooks/useProductList.ts`
- Create: `apps/web/src/hooks/useCategoryOptions.ts`
- Create: `apps/web/src/hooks/useProductEditorData.ts`
- Create: `apps/web/src/hooks/useImageUpload.ts`
- Create: `apps/web/src/hooks/useProductSave.ts`
- Test: `apps/web/tests/hooks/useImageUpload.test.tsx`, `apps/web/tests/hooks/useProductSave.test.tsx`

`useProductList`, `useCategoryOptions` y `useProductEditorData` son delgados y se cubren desde los tests de componentes (Tasks 16 y 19); `useImageUpload` y `useProductSave` llevan lógica propia y tienen test directo.

- [ ] **Step 1: Escribir los tests que fallan**

Create `apps/web/tests/hooks/useImageUpload.test.tsx`:

```tsx
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/ApiError";
import { useImageUpload } from "@/hooks/useImageUpload";
import { makeImage } from "../helpers/catalog";

const api = vi.hoisted(() => ({ uploadImage: vi.fn() }));
vi.mock("@/lib/api/adminUploads", () => api);

const png = (size = 10) => {
  const file = new File(["x"], "foto.png", { type: "image/png" });
  Object.defineProperty(file, "size", { value: size });
  return file;
};

beforeEach(() => api.uploadImage.mockReset());

describe("useImageUpload", () => {
  it("un archivo inválido se rechaza sin llamar al API", async () => {
    const { result } = renderHook(() => useImageUpload());
    let outcome: Awaited<ReturnType<typeof result.current.upload>> | undefined;
    await act(async () => {
      outcome = await result.current.upload(new File(["x"], "a.pdf", { type: "application/pdf" }), "variants");
    });
    expect(outcome).toMatchObject({ ok: false, message: expect.stringMatching(/JPG, PNG, WEBP o AVIF/) });
    expect(api.uploadImage).not.toHaveBeenCalled();
  });

  it("sube y devuelve la imagen", async () => {
    api.uploadImage.mockResolvedValue(makeImage("ok"));
    const { result } = renderHook(() => useImageUpload());
    let outcome: Awaited<ReturnType<typeof result.current.upload>> | undefined;
    await act(async () => {
      outcome = await result.current.upload(png(), "products");
    });
    expect(outcome).toEqual({ ok: true, image: makeImage("ok") });
    expect(api.uploadImage).toHaveBeenCalledWith(expect.any(File), "products");
    expect(result.current.busy).toBe(false);
  });

  it("un fallo del API vuelve como mensaje, sin lanzar", async () => {
    api.uploadImage.mockRejectedValue(new ApiError("El archivo no es una imagen válida.", "http", 400));
    const { result } = renderHook(() => useImageUpload());
    let outcome: Awaited<ReturnType<typeof result.current.upload>> | undefined;
    await act(async () => {
      outcome = await result.current.upload(png(), "variants");
    });
    expect(outcome).toEqual({ ok: false, message: "El archivo no es una imagen válida." });
  });

  it("busy es true mientras sube", async () => {
    let finish: (image: ReturnType<typeof makeImage>) => void = () => {};
    api.uploadImage.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const { result } = renderHook(() => useImageUpload());
    let pending: Promise<unknown> = Promise.resolve();
    act(() => {
      pending = result.current.upload(png(), "variants");
    });
    expect(result.current.busy).toBe(true);
    await act(async () => {
      finish(makeImage("x"));
      await pending;
    });
    expect(result.current.busy).toBe(false);
  });
});
```

Create `apps/web/tests/hooks/useProductSave.test.tsx`:

```tsx
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/ApiError";
import { toEditorProduct, toExistingVariant } from "@/lib/catalog/editorProduct";
import {
  addPrint,
  emptyFormState,
  removePrint,
  setDraftImages,
  setDraftPrice,
  stateFromBaseline,
  type ModelFields,
  type ProductFormState,
} from "@/lib/catalog/productForm";
import { useProductSave } from "@/hooks/useProductSave";
import {
  CATEGORY_ID,
  PRINT_A_ID,
  PRINT_B_ID,
  PRODUCT_ID,
  VARIANT_A_ID,
  makeImage,
  makeRawProduct,
  makeRawVariant,
} from "../helpers/catalog";

const products = vi.hoisted(() => ({ createProduct: vi.fn(), updateProduct: vi.fn() }));
vi.mock("@/lib/api/adminProducts", () => products);
const variants = vi.hoisted(() => ({ createVariant: vi.fn(), updateVariant: vi.fn() }));
vi.mock("@/lib/api/adminVariants", () => variants);

const MODEL: ModelFields = {
  name: "Cosmetiquera chica",
  categoryId: CATEGORY_ID,
  description: "",
  price: "189.00",
  weight: "140",
  width: "",
  height: "",
  depth: "",
  materials: "",
};
const NAMES = new Map([
  [PRINT_A_ID, "Nopal en flor"],
  [PRINT_B_ID, "Monarca"],
]);

const newState = (): ProductFormState => {
  let state: ProductFormState = { ...emptyFormState(), model: MODEL };
  state = setDraftPrice(addPrint(state, PRINT_A_ID, []), PRINT_A_ID, "209.00");
  state = setDraftImages(state, PRINT_A_ID, [makeImage("a")]);
  return addPrint(state, PRINT_B_ID, []);
};

beforeEach(() => {
  Object.values(products).forEach((mock) => mock.mockReset());
  Object.values(variants).forEach((mock) => mock.mockReset());
});

describe("useProductSave · crear", () => {
  it("crea el modelo y luego una variante por estampa, en orden", async () => {
    products.createProduct.mockResolvedValue(PRODUCT_ID);
    variants.createVariant.mockResolvedValue({});
    const { result } = renderHook(() => useProductSave());
    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.saveNew(newState(), NAMES);
    });
    expect(outcome).toEqual({ ok: true, productId: PRODUCT_ID, failures: [] });
    expect(products.createProduct).toHaveBeenCalledWith(expect.objectContaining({ name: "Cosmetiquera chica", basePrice: 18900 }));
    expect(variants.createVariant).toHaveBeenNthCalledWith(1, {
      product: PRODUCT_ID,
      print: PRINT_A_ID,
      images: [makeImage("a")],
      priceOverride: 20900,
    });
    expect(variants.createVariant).toHaveBeenNthCalledWith(2, { product: PRODUCT_ID, print: PRINT_B_ID, images: [] });
  });

  it("si una variante falla, el resto sigue y el fallo nombra la estampa", async () => {
    products.createProduct.mockResolvedValue(PRODUCT_ID);
    variants.createVariant
      .mockRejectedValueOnce(new ApiError("Ya existe una variante con ese SKU.", "http", 409))
      .mockResolvedValueOnce({});
    const { result } = renderHook(() => useProductSave());
    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.saveNew(newState(), NAMES);
    });
    expect(outcome).toEqual({
      ok: true,
      productId: PRODUCT_ID,
      failures: [{ printName: "Nopal en flor", message: "Ya existe una variante con ese SKU." }],
    });
    expect(variants.createVariant).toHaveBeenCalledTimes(2);
  });

  it("si el modelo no se crea, no se intenta ninguna variante", async () => {
    products.createProduct.mockRejectedValue(new ApiError("La categoría no existe.", "http", 400));
    const { result } = renderHook(() => useProductSave());
    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.saveNew(newState(), NAMES);
    });
    expect(outcome).toEqual({ ok: false, message: "La categoría no existe." });
    expect(variants.createVariant).not.toHaveBeenCalled();
  });

  it("un segundo guardado mientras hay uno en curso se rechaza", async () => {
    let finish: (id: string) => void = () => {};
    products.createProduct.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    variants.createVariant.mockResolvedValue({});
    const { result } = renderHook(() => useProductSave());
    let first: Promise<unknown> = Promise.resolve();
    act(() => {
      first = result.current.saveNew(newState(), NAMES);
    });
    let second: unknown;
    await act(async () => {
      second = await result.current.saveNew(newState(), NAMES);
    });
    expect(second).toEqual({ ok: false, message: "Ya hay un guardado en curso." });
    await act(async () => {
      finish(PRODUCT_ID);
      await first;
    });
    expect(products.createProduct).toHaveBeenCalledTimes(1);
  });
});

describe("useProductSave · editar", () => {
  const existing = toExistingVariant(makeRawVariant({ images: [makeImage("a1")] }));
  const baseline = { product: toEditorProduct(makeRawProduct()), variants: [existing] };

  it("sin cambios no hace ninguna petición", async () => {
    const { result } = renderHook(() => useProductSave());
    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.saveExisting(PRODUCT_ID, stateFromBaseline(baseline), baseline, NAMES);
    });
    expect(outcome).toEqual({ ok: true, productId: PRODUCT_ID, failures: [] });
    expect(products.updateProduct).not.toHaveBeenCalled();
    expect(variants.updateVariant).not.toHaveBeenCalled();
  });

  it("solo manda lo que cambió y retira las estampas deseleccionadas", async () => {
    products.updateProduct.mockResolvedValue(undefined);
    variants.updateVariant.mockResolvedValue({});
    const state = removePrint(stateFromBaseline(baseline), PRINT_A_ID);
    const renamed = { ...state, model: { ...state.model, name: "Cosmetiquera mini" } };
    const { result } = renderHook(() => useProductSave());
    await act(async () => {
      await result.current.saveExisting(PRODUCT_ID, renamed, baseline, NAMES);
    });
    expect(products.updateProduct).toHaveBeenCalledWith(PRODUCT_ID, { name: "Cosmetiquera mini" });
    expect(variants.updateVariant).toHaveBeenCalledWith(VARIANT_A_ID, { isActive: false });
  });

  it("si el PATCH del modelo falla, no toca las variantes", async () => {
    products.updateProduct.mockRejectedValue(new ApiError("El nombre es obligatorio.", "http", 400));
    const state = stateFromBaseline(baseline);
    const renamed = removePrint({ ...state, model: { ...state.model, name: "Otro" } }, PRINT_A_ID);
    const { result } = renderHook(() => useProductSave());
    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.saveExisting(PRODUCT_ID, renamed, baseline, NAMES);
    });
    expect(outcome).toEqual({ ok: false, message: "El nombre es obligatorio." });
    expect(variants.updateVariant).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Ver que fallan**

Run: `pnpm --filter @gira/web test -- tests/hooks/useImageUpload.test.tsx tests/hooks/useProductSave.test.tsx`
Expected: FAIL (hooks inexistentes).

- [ ] **Step 3: Implementar `useImageUpload` y `useProductSave`**

Create `apps/web/src/hooks/useImageUpload.ts`:

```ts
"use client";

import type { ImageAttrs } from "@gira/shared";
import { useCallback, useState } from "react";
import { uploadImage, type UploadFolder } from "@/lib/api/adminUploads";
import { isApiError } from "@/lib/api/ApiError";
import { validateImageFile } from "@/lib/catalog/imageFile";

type UploadOutcome = { ok: true; image: ImageAttrs } | { ok: false; message: string };

interface UseImageUpload {
  /** True while any upload is in flight: disable the controls that would race with it. */
  busy: boolean;
  /** Never throws. A bad file or a failed upload comes back as `{ ok: false, message }`. */
  upload: (file: File, folder: UploadFolder) => Promise<UploadOutcome>;
}

const GENERIC_ERROR = "No se pudo subir la imagen. Inténtalo de nuevo.";

/** Uploads one image at a time on request. The file is checked first so an invalid one never leaves the browser. */
const useImageUpload = (): UseImageUpload => {
  const [inFlight, setInFlight] = useState(0);

  const upload = useCallback(async (file: File, folder: UploadFolder): Promise<UploadOutcome> => {
    const invalid = validateImageFile(file);
    if (invalid) return { ok: false, message: invalid };
    setInFlight((count) => count + 1);
    try {
      return { ok: true, image: await uploadImage(file, folder) };
    } catch (failure) {
      return { ok: false, message: isApiError(failure) ? failure.message : GENERIC_ERROR };
    } finally {
      setInFlight((count) => count - 1);
    }
  }, []);

  return { busy: inFlight > 0, upload };
};

export type { UploadOutcome, UseImageUpload };
export { useImageUpload };
```

Create `apps/web/src/hooks/useProductSave.ts`:

```ts
"use client";

import { useCallback, useRef, useState } from "react";
import { createProduct, updateProduct } from "@/lib/api/adminProducts";
import { createVariant, updateVariant } from "@/lib/api/adminVariants";
import { isApiError } from "@/lib/api/ApiError";
import {
  planVariantChanges,
  toCreateBody,
  toUpdateBody,
  type ProductBaseline,
  type ProductFormState,
  type VariantPlan,
} from "@/lib/catalog/productForm";

interface SaveFailure {
  printName: string;
  message: string;
}

type SaveOutcome = { ok: true; productId: string; failures: SaveFailure[] } | { ok: false; message: string };

/** printId -> name, to say WHICH print a failed variant belonged to. */
type PrintNames = ReadonlyMap<string, string>;

interface UseProductSave {
  saving: boolean;
  saveNew: (state: ProductFormState, printNames: PrintNames) => Promise<SaveOutcome>;
  saveExisting: (
    productId: string,
    state: ProductFormState,
    baseline: ProductBaseline,
    printNames: PrintNames,
  ) => Promise<SaveOutcome>;
}

const GENERIC_ERROR = "Inténtalo de nuevo en un momento.";
const BUSY_MESSAGE = "Ya hay un guardado en curso.";

const messageOf = (failure: unknown): string => (isApiError(failure) ? failure.message : GENERIC_ERROR);

/**
 * Runs the variant plan one request at a time (retire, update, create). A
 * failure never stops the rest: it is collected with the print's name so the
 * operator knows exactly which variants are still pending.
 */
const runPlan = async (productId: string, plan: VariantPlan, printNames: PrintNames): Promise<SaveFailure[]> => {
  const failures: SaveFailure[] = [];
  const attempt = async (printId: string, action: () => Promise<unknown>) => {
    try {
      await action();
    } catch (failure) {
      failures.push({ printName: printNames.get(printId) ?? "una estampa", message: messageOf(failure) });
    }
  };

  for (const variant of plan.retire) {
    await attempt(variant.printId, () => updateVariant(variant.id, { isActive: false }));
  }
  for (const { id, printId, patch } of plan.update) {
    await attempt(printId, () => updateVariant(id, patch));
  }
  for (const draft of plan.create) {
    await attempt(draft.printId, () =>
      createVariant({
        product: productId,
        print: draft.printId,
        images: draft.images,
        ...(draft.priceOverride !== undefined ? { priceOverride: draft.priceOverride } : {}),
      }),
    );
  }
  return failures;
};

/**
 * Saves the editor. The model goes first (a failure there stops everything: no
 * variant is attempted without its model), then the variants. Never throws; the
 * ref blocks a second save in the same tick, which state alone cannot.
 */
const useProductSave = (): UseProductSave => {
  const [saving, setSaving] = useState(false);
  const inFlight = useRef(false);

  const guarded = useCallback(async (run: () => Promise<SaveOutcome>): Promise<SaveOutcome> => {
    if (inFlight.current) return { ok: false, message: BUSY_MESSAGE };
    inFlight.current = true;
    setSaving(true);
    try {
      return await run();
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }, []);

  const saveNew: UseProductSave["saveNew"] = useCallback(
    (state, printNames) =>
      guarded(async () => {
        let productId: string;
        try {
          productId = await createProduct(toCreateBody(state));
        } catch (failure) {
          return { ok: false, message: messageOf(failure) };
        }
        const failures = await runPlan(productId, planVariantChanges(state.selected, []), printNames);
        return { ok: true, productId, failures };
      }),
    [guarded],
  );

  const saveExisting: UseProductSave["saveExisting"] = useCallback(
    (productId, state, baseline, printNames) =>
      guarded(async () => {
        const body = toUpdateBody(state, baseline);
        if (body) {
          try {
            await updateProduct(productId, body);
          } catch (failure) {
            return { ok: false, message: messageOf(failure) };
          }
        }
        const failures = await runPlan(productId, planVariantChanges(state.selected, baseline.variants), printNames);
        return { ok: true, productId, failures };
      }),
    [guarded],
  );

  return { saving, saveNew, saveExisting };
};

export type { SaveFailure, SaveOutcome, PrintNames, UseProductSave };
export { useProductSave };
```

- [ ] **Step 4: Implementar los tres hooks de lectura**

Create `apps/web/src/hooks/useProductList.ts`:

```ts
"use client";

import type { ApiMeta } from "@gira/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { listProducts } from "@/lib/api/adminProducts";
import { isApiError } from "@/lib/api/ApiError";
import { buildProductListQuery, type CatalogFilters } from "@/lib/catalog/filters";
import type { PanelProduct } from "@/lib/catalog/panelProduct";

type ProductListStatus = "loading" | "error" | "ready";

interface ProductListState {
  status: ProductListStatus;
  products: PanelProduct[];
  meta: ApiMeta | null;
  error: string | null;
}

interface UseProductList extends ProductListState {
  /** Re-fetches in place: the cards stay on screen instead of flashing a skeleton. */
  refresh: () => void;
}

const INITIAL: ProductListState = { status: "loading", products: [], meta: null, error: null };
const GENERIC_ERROR = "No se pudo cargar el catálogo.";

/**
 * Fetches one page of products. A change of filters resets to the loading
 * state (and drops the stale response if it arrives late); `refresh` re-runs
 * the same query silently. No polling.
 */
const useProductList = (
  filters: CatalogFilters,
  limit?: number,
  /** Called with the last existing page when the requested one came back empty. */
  onPageOutOfRange?: (lastPage: number) => void,
): UseProductList => {
  const query = buildProductListQuery(filters, limit);
  const [state, setState] = useState<ProductListState>(INITIAL);
  const [version, setVersion] = useState(0);
  const lastQuery = useRef<string | null>(null);
  const outOfRange = useRef(onPageOutOfRange);
  useEffect(() => {
    outOfRange.current = onPageOutOfRange;
  });

  useEffect(() => {
    let cancelled = false;
    const isNewQuery = lastQuery.current !== query;
    if (isNewQuery) {
      lastQuery.current = query;
      setState(INITIAL);
    }

    listProducts(query)
      .then(({ products, meta }) => {
        if (cancelled) return;
        if (products.length === 0 && filters.page > 1 && outOfRange.current) {
          outOfRange.current(Math.max(1, meta.pages));
          return;
        }
        setState({ status: "ready", products, meta, error: null });
      })
      .catch((failure: unknown) => {
        if (cancelled) return;
        const error = isApiError(failure) ? failure.message : GENERIC_ERROR;
        // A failed silent refresh keeps the cards on screen (with the error beside them); a failed first load has nothing to show.
        setState((previous) =>
          !isNewQuery && previous.status === "ready"
            ? { ...previous, error }
            : { status: "error", products: [], meta: null, error },
        );
      });

    return () => {
      cancelled = true;
    };
  }, [query, version, filters.page]);

  const refresh = useCallback(() => setVersion((current) => current + 1), []);

  return { ...state, refresh };
};

export type { ProductListStatus, UseProductList };
export { useProductList };
```

Create `apps/web/src/hooks/useCategoryOptions.ts`:

```ts
"use client";

import { useEffect, useState } from "react";
import { fetchCategoryOptions } from "@/lib/api/adminCatalog";
import type { Option } from "@/lib/catalog/catalogOptions";

/**
 * Options for the category filter, loaded once. If the read fails the select
 * simply stays on "Todas": the list and the search box keep working, and
 * nothing here is worth an error banner.
 */
const useCategoryOptions = (): Option[] => {
  const [options, setOptions] = useState<Option[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetchCategoryOptions()
      .then((loaded) => {
        if (!cancelled) setOptions(loaded);
      })
      .catch(() => {
        // Swallowed on purpose: see above.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return options;
};

export { useCategoryOptions };
```

Create `apps/web/src/hooks/useProductEditorData.ts`:

```ts
"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchCatalogOptions } from "@/lib/api/adminCatalog";
import { getEditorProduct } from "@/lib/api/adminProducts";
import { isApiError } from "@/lib/api/ApiError";
import { listProductVariants } from "@/lib/api/adminVariants";
import { EMPTY_CATALOG_OPTIONS, type CatalogOptions, type PickerPrint } from "@/lib/catalog/catalogOptions";
import type { ProductBaseline } from "@/lib/catalog/productForm";

interface EditorData {
  options: CatalogOptions;
  /** `null` on the create form. */
  baseline: ProductBaseline | null;
}

type EditorStatus = "loading" | "error" | "ready";

interface UseProductEditorData {
  status: EditorStatus;
  data: EditorData | null;
  error: string | null;
  /** Bumps every time fresh data lands: the form is keyed by it, so it starts over from the new baseline. */
  dataVersion: number;
  reload: () => void;
  /** A print created from the editor joins the picker without a new request. */
  addCreatedPrint: (print: PickerPrint) => void;
}

const GENERIC_ERROR = "No se pudo cargar el editor.";

/**
 * Loads what the editor needs in parallel: the active categories, families and
 * prints, and (when editing) the product with ALL its variants and their photos.
 * A failed reload replaces the form with the error: showing the old form would
 * let a stale baseline be saved over what the server now holds.
 */
const useProductEditorData = (productId: string | null): UseProductEditorData => {
  const [status, setStatus] = useState<EditorStatus>("loading");
  const [data, setData] = useState<EditorData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dataVersion, setDataVersion] = useState(0);
  const [requested, setRequested] = useState(0);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetchCatalogOptions(),
      productId ? getEditorProduct(productId) : Promise.resolve(null),
      productId ? listProductVariants(productId) : Promise.resolve([]),
    ])
      .then(([options, product, variants]) => {
        if (cancelled) return;
        setData({ options, baseline: product ? { product, variants } : null });
        setStatus("ready");
        setError(null);
        setDataVersion((current) => current + 1);
      })
      .catch((failure: unknown) => {
        if (cancelled) return;
        setStatus("error");
        setError(isApiError(failure) ? failure.message : GENERIC_ERROR);
      });
    return () => {
      cancelled = true;
    };
  }, [productId, requested]);

  const reload = useCallback(() => setRequested((current) => current + 1), []);

  const addCreatedPrint = useCallback((print: PickerPrint) => {
    setData((previous) =>
      previous
        ? {
            ...previous,
            options: {
              ...previous.options,
              prints: [...previous.options.prints, print].sort((a, b) => a.name.localeCompare(b.name, "es")),
            },
          }
        : previous,
    );
  }, []);

  return { status, data: data ?? (status === "ready" ? { options: EMPTY_CATALOG_OPTIONS, baseline: null } : null), error, dataVersion, reload, addCreatedPrint };
};

export type { EditorData, EditorStatus, UseProductEditorData };
export { useProductEditorData };
```

- [ ] **Step 5: Ver que pasan**

Run: `pnpm --filter @gira/web test -- tests/hooks`
Expected: PASS (los de hooks nuevos y los existentes).

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter @gira/web exec tsc --noEmit`
Expected: sin errores.

- [ ] **Step 7: Punto de revisión** (sin commit).

---

### Task 15: Piezas visuales compartidas (`ImageTile`, `UploadTile`, `EditorSection`)

**Files:**
- Create: `apps/web/src/components/catalog/ImageTile.tsx`
- Create: `apps/web/src/components/catalog/UploadTile.tsx`
- Create: `apps/web/src/components/catalog/EditorSection.tsx`
- Test: `apps/web/tests/components/catalogParts.test.tsx`

- [ ] **Step 1: Escribir el test que falla**

Create `apps/web/tests/components/catalogParts.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { EditorSection } from "@/components/catalog/EditorSection";
import { ImageTile } from "@/components/catalog/ImageTile";
import { UploadTile } from "@/components/catalog/UploadTile";

describe("ImageTile", () => {
  it("pinta la imagen con su texto alternativo", () => {
    render(<ImageTile url="https://res.cloudinary.com/gira/a.jpg" alt="Foto 1" />);
    expect(screen.getByRole("img", { name: "Foto 1" })).toHaveAttribute("src", "https://res.cloudinary.com/gira/a.jpg");
  });

  it("sin URL, o si la imagen no carga, muestra la marca IMG y no un icono roto", () => {
    const { rerender } = render(<ImageTile url={undefined} alt="" />);
    expect(screen.getByText("IMG")).toBeInTheDocument();
    rerender(<ImageTile url="https://res.cloudinary.com/gira/rota.jpg" alt="Rota" />);
    fireEvent.error(screen.getByRole("img", { name: "Rota" }));
    expect(screen.getByText("IMG")).toBeInTheDocument();
  });
});

describe("UploadTile", () => {
  it("entrega los archivos elegidos y limpia el input para poder repetir el mismo", async () => {
    const onFiles = vi.fn();
    render(<UploadTile label="Subir fotos" multiple onFiles={onFiles} />);
    const input = screen.getByLabelText(/Subir fotos/) as HTMLInputElement;
    const file = new File(["x"], "foto.png", { type: "image/png" });
    await userEvent.upload(input, file);
    expect(onFiles).toHaveBeenCalledWith([file]);
    expect(input.value).toBe("");
  });

  it("ocupado o deshabilitado no deja elegir", () => {
    render(<UploadTile label="Subir" busy onFiles={() => {}} />);
    expect(screen.getByText("Subiendo…")).toBeInTheDocument();
    expect(screen.getByLabelText(/Subiendo/)).toBeDisabled();
  });
});

describe("EditorSection", () => {
  it("lleva su título, su pista y su contenido", () => {
    render(
      <EditorSection title="Estampas" hint="Cada una crea una variante" aside={<span>2 elegidas</span>}>
        <p>contenido</p>
      </EditorSection>,
    );
    expect(screen.getByRole("region", { name: "Estampas" })).toBeInTheDocument();
    expect(screen.getByText("Cada una crea una variante")).toBeInTheDocument();
    expect(screen.getByText("2 elegidas")).toBeInTheDocument();
    expect(screen.getByText("contenido")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Ver que falla**

Run: `pnpm --filter @gira/web test -- tests/components/catalogParts.test.tsx`
Expected: FAIL (componentes inexistentes).

- [ ] **Step 3: Implementar**

Create `apps/web/src/components/catalog/ImageTile.tsx`:

```tsx
"use client";

import { useState } from "react";
import { T_LABEL } from "@/components/ui/typography";
import { cn } from "@/lib/cn";

interface ImageTileProps {
  url?: string | undefined;
  /** Empty when the neighbouring text already names the picture. */
  alt: string;
  className?: string;
  /** Retired models read as switched off. */
  grayscale?: boolean;
}

/**
 * A picture that fills its box, or an "IMG" tile when there is none or it
 * cannot load (a dead URL, no network). Never a broken-image icon. The caller
 * sets the size and the border; this only decides what goes inside.
 */
const ImageTile = ({ url, alt, className, grayscale = false }: ImageTileProps) => {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  if (!url || failedUrl === url) {
    return (
      <span
        {...(alt ? { role: "img", "aria-label": alt } : { "aria-hidden": true })}
        className={cn(T_LABEL, "grid place-items-center bg-surface-sunken text-text-muted", className)}
      >
        IMG
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- Cloudinary URL from the API; no next/image loader is configured
    <img
      src={url}
      alt={alt}
      loading="lazy"
      onError={() => setFailedUrl(url)}
      className={cn("object-cover", grayscale && "grayscale", className)}
    />
  );
};

export type { ImageTileProps };
export { ImageTile };
```

Create `apps/web/src/components/catalog/UploadTile.tsx`:

```tsx
"use client";

import { UploadSimpleIcon } from "@phosphor-icons/react/dist/ssr";
import { Icon } from "@/components/ui/Icon";
import { T_CAPTION } from "@/components/ui/typography";
import { cn } from "@/lib/cn";
import { IMAGE_ACCEPT } from "@/lib/catalog/imageFile";

interface UploadTileProps {
  label: string;
  hint?: string;
  multiple?: boolean;
  busy?: boolean;
  disabled?: boolean;
  className?: string;
  onFiles: (files: File[]) => void;
}

/**
 * The dashed "drop a photo here" tile. It is a label around a visually hidden
 * file input, so the click, the keyboard and a screen reader all work with no
 * extra code. The input is cleared after every pick so choosing the same file
 * twice still fires.
 */
const UploadTile = ({ label, hint, multiple = false, busy = false, disabled = false, className, onFiles }: UploadTileProps) => (
  <label
    className={cn(
      "grid cursor-pointer place-content-center justify-items-center gap-1 rounded-nb-sm border-2 border-dashed border-ink bg-surface-raised p-3 text-center text-sm text-text-primary",
      "hover:bg-brand-subtle focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus",
      (busy || disabled) && "pointer-events-none opacity-60",
      className,
    )}
  >
    <Icon icon={UploadSimpleIcon} size={20} />
    <span className="font-bold">{busy ? "Subiendo…" : label}</span>
    {hint ? <span className={T_CAPTION}>{hint}</span> : null}
    <input
      type="file"
      accept={IMAGE_ACCEPT}
      multiple={multiple}
      disabled={busy || disabled}
      className="sr-only"
      onChange={(event) => {
        const files = Array.from(event.target.files ?? []);
        event.target.value = "";
        if (files.length > 0) onFiles(files);
      }}
    />
  </label>
);

export type { UploadTileProps };
export { UploadTile };
```

Create `apps/web/src/components/catalog/EditorSection.tsx`:

```tsx
import type { ReactNode } from "react";
import { NB_SURFACE } from "@/components/ui/styles";
import { T_PANEL_HINT, T_PANEL_TITLE } from "@/components/ui/typography";
import { cn } from "@/lib/cn";

interface EditorSectionProps {
  title: string;
  hint?: string;
  /** Top-right slot: a counter, a link. */
  aside?: ReactNode;
  children: ReactNode;
}

/** One island of the editor. Islands never nest (DESIGN.md), so the sections are siblings. */
const EditorSection = ({ title, hint, aside, children }: EditorSectionProps) => (
  <section aria-label={title} className={cn(NB_SURFACE, "flex flex-col gap-4 p-6")}>
    <div className="flex items-start justify-between gap-3">
      <div>
        <h2 className={T_PANEL_TITLE}>{title}</h2>
        {hint ? <p className={T_PANEL_HINT}>{hint}</p> : null}
      </div>
      {aside}
    </div>
    {children}
  </section>
);

export type { EditorSectionProps };
export { EditorSection };
```

- [ ] **Step 4: Ver que pasa**

Run: `pnpm --filter @gira/web test -- tests/components/catalogParts.test.tsx`
Expected: PASS.

- [ ] **Step 5: Punto de revisión** (sin commit).

---

### Task 16: Lista de productos (`ProductCard`, `CategorySection`, `ProductFilters`, `ProductEmpty`, `NewProductButton`, `ProductsPage`)

**Files:**
- Create: `apps/web/src/components/catalog/ProductCard.tsx`
- Create: `apps/web/src/components/catalog/CategorySection.tsx`
- Create: `apps/web/src/components/catalog/ProductFilters.tsx`
- Create: `apps/web/src/components/catalog/NewProductButton.tsx`
- Create: `apps/web/src/components/catalog/ProductEmpty.tsx`
- Create: `apps/web/src/components/catalog/ProductsPage.tsx`
- Test: `apps/web/tests/components/ProductsPage.test.tsx`

- [ ] **Step 1: Escribir el test que falla**

Create `apps/web/tests/components/ProductsPage.test.tsx`:

```tsx
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProductsPage } from "@/components/catalog/ProductsPage";
import { ApiError } from "@/lib/api/ApiError";
import { parseCatalogFilters } from "@/lib/catalog/filters";
import { toPanelProduct, type PanelProduct } from "@/lib/catalog/panelProduct";
import { makeRawProduct } from "../helpers/catalog";

const products = vi.hoisted(() => ({ listProducts: vi.fn() }));
vi.mock("@/lib/api/adminProducts", () => products);
const catalog = vi.hoisted(() => ({ fetchCategoryOptions: vi.fn() }));
vi.mock("@/lib/api/adminCatalog", () => catalog);

const { replaceMock, pushMock } = vi.hoisted(() => ({ replaceMock: vi.fn(), pushMock: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/productos",
  useRouter: () => ({ replace: replaceMock, push: pushMock, refresh: vi.fn() }),
}));

const COSMETIQUERA = "aaaaaaaaaaaaaaaaaaaaaaa1";
const PLAYERAS = "bbbbbbbbbbbbbbbbbbbbbbb2";

const product = (id: string, name: string, categoryId: string, categoryName: string, overrides = {}): PanelProduct =>
  toPanelProduct(
    makeRawProduct({ id, name, category: { id: categoryId, name: categoryName, slug: "x" }, ...overrides }),
  );

const CHICA = product("111111111111111111111111", "Cosmetiquera chica", COSMETIQUERA, "Cosmetiquera");
const GRANDE = product("222222222222222222222222", "Cosmetiquera grande", COSMETIQUERA, "Cosmetiquera", { basePrice: 24900 });
const OVERSIZE = product("333333333333333333333333", "Playera oversize", PLAYERAS, "Playeras", { isActive: false });

const page = (items: PanelProduct[]) => ({
  products: items,
  meta: { total: items.length, page: 1, pages: 1, limit: 100 },
});

const renderPage = (params: Record<string, string> = {}) =>
  render(<ProductsPage initialFilters={parseCatalogFilters(params)} />);

beforeEach(() => {
  products.listProducts.mockReset().mockResolvedValue(page([CHICA, GRANDE, OVERSIZE]));
  catalog.fetchCategoryOptions.mockReset().mockResolvedValue([
    { value: COSMETIQUERA, label: "Cosmetiquera" },
    { value: PLAYERAS, label: "Playeras" },
  ]);
  replaceMock.mockReset();
  pushMock.mockReset();
});

describe("ProductsPage", () => {
  it("agrupa las tarjetas por categoría y enlaza cada una a su editor", async () => {
    renderPage();
    const cosmetiquera = await screen.findByRole("region", { name: "Cosmetiquera" });
    expect(within(cosmetiquera).getAllByRole("link")).toHaveLength(2);
    const link = within(cosmetiquera).getByRole("link", { name: /Cosmetiquera chica/ });
    expect(link).toHaveAttribute("href", "/productos/111111111111111111111111");
    expect(within(cosmetiquera).getByText("$189.00")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Playeras" })).toBeInTheDocument();
  });

  it("un modelo retirado se marca como tal", async () => {
    renderPage({ estado: "todos" });
    const playeras = await screen.findByRole("region", { name: "Playeras" });
    expect(within(playeras).getByText("Retirado")).toBeInTheDocument();
  });

  it("pide al API lo que dicen los filtros de la URL", async () => {
    renderPage({ categoria: COSMETIQUERA, estado: "retirados", q: "tote", orden: "-basePrice" });
    await screen.findByRole("region", { name: "Cosmetiquera" });
    const query = new URLSearchParams(products.listProducts.mock.calls[0]?.[0] as string);
    expect(query.get("category")).toBe(COSMETIQUERA);
    expect(query.get("isActive")).toBe("false");
    expect(query.get("search")).toBe("tote");
    expect(query.get("sort")).toBe("-basePrice");
  });

  it("cambiar un filtro escribe la URL en español y vuelve a la página 1", async () => {
    renderPage();
    await screen.findByRole("region", { name: "Cosmetiquera" });
    await userEvent.selectOptions(screen.getByLabelText("Estado"), "retired");
    expect(replaceMock).toHaveBeenCalledWith("/productos?estado=retirados", { scroll: false });
    await userEvent.selectOptions(screen.getByLabelText("Ordenar por"), "name");
    expect(replaceMock).toHaveBeenLastCalledWith("/productos?estado=retirados&orden=name", { scroll: false });
  });

  it("la búsqueda espera a que se deje de escribir", async () => {
    renderPage();
    await screen.findByRole("region", { name: "Cosmetiquera" });
    await userEvent.type(screen.getByLabelText("Buscar"), "tote");
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/productos?q=tote", { scroll: false }));
    expect(replaceMock).toHaveBeenCalledTimes(1);
  });

  it("muestra el esqueleto mientras carga", () => {
    products.listProducts.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(document.querySelector('[aria-busy="true"]')).toBeInTheDocument();
  });

  it("sin modelos y sin filtros invita a crear el primero", async () => {
    products.listProducts.mockResolvedValue(page([]));
    renderPage();
    expect(await screen.findByText("Todavía no hay modelos")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Nuevo producto/ }));
    expect(pushMock).toHaveBeenCalledWith("/productos/nuevo");
  });

  it("sin resultados con filtros ofrece limpiarlos", async () => {
    products.listProducts.mockResolvedValue(page([]));
    renderPage({ q: "zzz" });
    expect(await screen.findByText("Ningún modelo coincide")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Limpiar filtros" }));
    expect(replaceMock).toHaveBeenCalledWith("/productos", { scroll: false });
  });

  it("un error de carga muestra el mensaje y Reintentar vuelve a pedir", async () => {
    products.listProducts.mockRejectedValueOnce(new ApiError("No hay conexión con el servidor.", "network"));
    renderPage();
    expect(await screen.findByText("No hay conexión con el servidor.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByRole("region", { name: "Cosmetiquera" })).toBeInTheDocument();
    expect(products.listProducts).toHaveBeenCalledTimes(2);
  });

  it("solo hay un botón principal en la pantalla: el de la cabecera vive en la página, no aquí", async () => {
    renderPage();
    await screen.findByRole("region", { name: "Cosmetiquera" });
    expect(screen.queryByRole("button", { name: /Nuevo producto/ })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Ver que falla**

Run: `pnpm --filter @gira/web test -- tests/components/ProductsPage.test.tsx`
Expected: FAIL (componentes inexistentes).

- [ ] **Step 3: `NewProductButton` y `ProductCard`**

Create `apps/web/src/components/catalog/NewProductButton.tsx`:

```tsx
"use client";

import { PlusIcon } from "@phosphor-icons/react/dist/ssr";
import { useRouter } from "next/navigation";
import { Button, type ButtonVariant } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";

interface NewProductButtonProps {
  /** The header's is the screen's one primary (yellow) button; any other instance must not be. */
  variant?: ButtonVariant;
}

const NewProductButton = ({ variant = "primary" }: NewProductButtonProps) => {
  const router = useRouter();
  return (
    <Button variant={variant} onClick={() => router.push("/productos/nuevo")}>
      <Icon icon={PlusIcon} />
      Nuevo producto
    </Button>
  );
};

export type { NewProductButtonProps };
export { NewProductButton };
```

Create `apps/web/src/components/catalog/ProductCard.tsx`:

```tsx
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { NB_PRESSABLE, NB_SURFACE } from "@/components/ui/styles";
import { T_DATA } from "@/components/ui/typography";
import { cn } from "@/lib/cn";
import { formatPesos } from "@/lib/catalog/money";
import type { PanelProduct } from "@/lib/catalog/panelProduct";
import { productPath } from "@/lib/catalog/productId";
import { ImageTile } from "./ImageTile";

interface ProductCardProps {
  product: PanelProduct;
}

const printsLabel = (count: number): string => {
  if (count === 0) return "Sin estampas";
  return count === 1 ? "1 estampa" : `${count} estampas`;
};

/**
 * One model: its cover, name, base price (mono) and up to five print
 * thumbnails. The whole card is the link to the editor. A retired model is
 * greyed and flagged, never hidden: the "Estado" filter decides what is listed.
 */
const ProductCard = ({ product }: ProductCardProps) => {
  const hidden = product.activeVariantCount - product.prints.length;

  return (
    <Link href={productPath(product.id)} className={cn(NB_SURFACE, NB_PRESSABLE, "block overflow-hidden")}>
      <div className="relative">
        <ImageTile
          url={product.cover?.url}
          alt=""
          grayscale={!product.isActive}
          className="aspect-square w-full border-b-2 border-ink"
        />
        {!product.isActive ? <Badge className="absolute right-2 top-2">Retirado</Badge> : null}
      </div>
      <div className="flex flex-col gap-2 p-3">
        <h3 className="text-sm font-bold leading-snug">{product.name}</h3>
        <div className="flex items-baseline justify-between gap-2">
          <span className={T_DATA}>{formatPesos(product.basePrice)}</span>
          <span className="text-xs text-text-secondary">{printsLabel(product.activeVariantCount)}</span>
        </div>
        {product.prints.length > 0 ? (
          <div className="flex items-center gap-1" aria-hidden="true">
            {product.prints.map((print) => (
              <ImageTile
                key={print.id}
                url={print.image.url}
                alt=""
                className="h-7 w-7 rounded-full border-2 border-ink"
              />
            ))}
            {hidden > 0 ? <span className="font-mono text-2xs text-text-muted">+{hidden}</span> : null}
          </div>
        ) : null}
      </div>
    </Link>
  );
};

export type { ProductCardProps };
export { ProductCard };
```

- [ ] **Step 4: `CategorySection`, `ProductFilters`, `ProductEmpty`**

Create `apps/web/src/components/catalog/CategorySection.tsx`:

```tsx
import { useId } from "react";
import { T_SECTION_TITLE } from "@/components/ui/typography";
import type { ProductGroup } from "@/lib/catalog/groupByCategory";
import { ProductCard } from "./ProductCard";

interface CategorySectionProps {
  group: ProductGroup;
}

const modelsLabel = (count: number): string => (count === 1 ? "1 modelo" : `${count} modelos`);

/** A category's heading (on the green page, so inverse text) and its grid of cards. The count describes the loaded page only. */
const CategorySection = ({ group }: CategorySectionProps) => {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId}>
      <div className="mb-3 flex items-baseline gap-3">
        <h2 id={headingId} className={T_SECTION_TITLE}>
          {group.name}
        </h2>
        <span className="font-mono text-xs text-text-inverse-secondary">{modelsLabel(group.products.length)}</span>
      </div>
      <ul className="grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-[repeat(auto-fill,minmax(14rem,1fr))]">
        {group.products.map((product) => (
          <li key={product.id}>
            <ProductCard product={product} />
          </li>
        ))}
      </ul>
    </section>
  );
};

export type { CategorySectionProps };
export { CategorySection };
```

Create `apps/web/src/components/catalog/ProductFilters.tsx`:

```tsx
"use client";

import { MagnifyingGlassIcon } from "@phosphor-icons/react/dist/ssr";
import { useEffect, useState } from "react";
import { Field } from "@/components/ui/Field";
import { SelectField, type SelectOption } from "@/components/ui/SelectField";
import type { Option } from "@/lib/catalog/catalogOptions";
import { DEFAULT_SORT, type CatalogFilterPatch, type CatalogFilters, type CatalogStatus } from "@/lib/catalog/filters";

interface ProductFiltersProps {
  filters: CatalogFilters;
  categories: Option[];
  onChange: (patch: CatalogFilterPatch) => void;
}

const SEARCH_DEBOUNCE_MS = 300;

const STATUS_OPTIONS: SelectOption[] = [
  { value: "active", label: "Activos" },
  { value: "retired", label: "Retirados" },
  { value: "all", label: "Todos" },
];

const SORT_OPTIONS: SelectOption[] = [
  { value: "category", label: "Categoría y nombre (A–Z)" },
  { value: "name", label: "Nombre (A–Z)" },
  { value: "basePrice", label: "Precio base, menor primero" },
  { value: "-basePrice", label: "Precio base, mayor primero" },
  { value: "-updatedAt", label: "Actualizados recientemente" },
];

/**
 * Search (debounced 300 ms), category, state and order. The URL is the source
 * of truth: a change from outside pulls the search box along without
 * clobbering what the operator is still typing.
 */
const ProductFilters = ({ filters, categories, onChange }: ProductFiltersProps) => {
  const [searchText, setSearchText] = useState(filters.search ?? "");
  const [seenSearch, setSeenSearch] = useState(filters.search);

  if (filters.search !== seenSearch) {
    setSeenSearch(filters.search);
    setSearchText((typed) => ((filters.search ?? "") === typed.trim() ? typed : (filters.search ?? "")));
  }

  useEffect(() => {
    const trimmed = searchText.trim();
    if (trimmed === (filters.search ?? "")) return;
    const timer = setTimeout(() => onChange({ search: trimmed || undefined }), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchText, filters.search, onChange]);

  const sortValue = SORT_OPTIONS.some((option) => option.value === filters.sort) ? filters.sort : DEFAULT_SORT;

  return (
    <div className="flex flex-wrap items-end gap-3">
      <Field
        label="Buscar"
        placeholder="Nombre del modelo"
        icon={MagnifyingGlassIcon}
        value={searchText}
        maxLength={80}
        onChange={(event) => setSearchText(event.target.value)}
        containerClassName="min-w-52 flex-1"
      />
      <SelectField
        label="Categoría"
        options={[{ value: "", label: "Todas" }, ...categories]}
        value={filters.category ?? ""}
        onChange={(event) => onChange({ category: event.target.value || undefined })}
      />
      <SelectField
        label="Estado"
        options={STATUS_OPTIONS}
        value={filters.status}
        onChange={(event) => onChange({ status: event.target.value as CatalogStatus })}
      />
      <SelectField
        label="Ordenar por"
        options={SORT_OPTIONS}
        value={sortValue}
        onChange={(event) => onChange({ sort: event.target.value })}
      />
    </div>
  );
};

export type { ProductFiltersProps };
export { ProductFilters };
```

Create `apps/web/src/components/catalog/ProductEmpty.tsx`:

```tsx
import { MagnifyingGlassIcon, TShirtIcon } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { hasActiveFilters, type CatalogFilters } from "@/lib/catalog/filters";
import { NewProductButton } from "./NewProductButton";

interface ProductEmptyProps {
  filters: CatalogFilters;
  onClear: () => void;
}

/** Two different empties: "nothing matches your filters" (with a way out) and "the catalog is empty" (with the way in). */
const ProductEmpty = ({ filters, onClear }: ProductEmptyProps) =>
  hasActiveFilters(filters) ? (
    <EmptyState
      icon={MagnifyingGlassIcon}
      title="Ningún modelo coincide"
      description="Prueba con otra búsqueda, otra categoría o el estado «Todos»."
      action={
        <Button size="sm" onClick={onClear}>
          Limpiar filtros
        </Button>
      }
    />
  ) : (
    <EmptyState
      icon={TShirtIcon}
      title="Todavía no hay modelos"
      description="Crea el primero para empezar a armar el catálogo."
      action={<NewProductButton variant="secondary" />}
    />
  );

export type { ProductEmptyProps };
export { ProductEmpty };
```

- [ ] **Step 5: `ProductsPage`**

Create `apps/web/src/components/catalog/ProductsPage.tsx`:

```tsx
"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { Pagination } from "@/components/ui/Pagination";
import { Skeleton } from "@/components/ui/Skeleton";
import { NB_SURFACE } from "@/components/ui/styles";
import { useCategoryOptions } from "@/hooks/useCategoryOptions";
import { useProductList } from "@/hooks/useProductList";
import {
  applyFilterPatch,
  toSearchParams,
  type CatalogFilterPatch,
  type CatalogFilters,
} from "@/lib/catalog/filters";
import { groupProductsByCategory } from "@/lib/catalog/groupByCategory";
import { CategorySection } from "./CategorySection";
import { ProductEmpty } from "./ProductEmpty";
import { ProductFilters } from "./ProductFilters";

interface ProductsPageProps {
  initialFilters: CatalogFilters;
}

const SKELETON_CARDS = 6;

/**
 * The catalog workspace: filters in the URL, and the models as cards grouped
 * by category. Same URL discipline as Inventory: what this component writes
 * itself is not re-applied when the server hands it back; anything else
 * (sidebar link, back/forward) wins.
 */
const ProductsPage = ({ initialFilters }: ProductsPageProps) => {
  const router = useRouter();
  const pathname = usePathname();
  const [filters, setFilters] = useState(initialFilters);
  const writtenUrls = useRef(new Set<string>());
  const seenInitial = useRef(toSearchParams(initialFilters));

  const updateFiltersRef = useRef<(patch: CatalogFilterPatch) => void>(() => {});
  const list = useProductList(filters, undefined, (lastPage) => updateFiltersRef.current({ page: lastPage }));
  const categories = useCategoryOptions();
  const { refresh } = list;

  const updateFilters = useCallback(
    (patch: CatalogFilterPatch) => {
      const next = applyFilterPatch(filters, patch);
      setFilters(next);
      const query = toSearchParams(next);
      writtenUrls.current.add(query);
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [filters, pathname, router],
  );
  useEffect(() => {
    updateFiltersRef.current = updateFilters;
  });

  const incomingQuery = toSearchParams(initialFilters);
  useEffect(() => {
    if (seenInitial.current === incomingQuery) return;
    seenInitial.current = incomingQuery;
    if (writtenUrls.current.delete(incomingQuery)) return;
    setFilters(initialFilters);
  }, [incomingQuery, initialFilters]);

  const groups = useMemo(() => groupProductsByCategory(list.products), [list.products]);
  const clearFilters = () => updateFilters({ category: undefined, search: undefined, status: "active" });

  return (
    <div className="flex flex-col gap-6">
      <div className={`${NB_SURFACE} p-4`}>
        <ProductFilters filters={filters} categories={categories} onChange={updateFilters} />
      </div>

      {list.status === "ready" && list.error ? (
        <Notice variant="warning" title="No se pudo actualizar la lista">
          <p>{list.error} Estás viendo la última lista cargada.</p>
          <Button size="sm" className="mt-2" onClick={refresh}>
            Reintentar
          </Button>
        </Notice>
      ) : null}

      {list.status === "error" ? (
        <Notice variant="danger" title="No se pudo cargar el catálogo">
          <p>{list.error}</p>
          <Button size="sm" className="mt-2" onClick={refresh}>
            Reintentar
          </Button>
        </Notice>
      ) : list.status === "loading" ? (
        <div className="grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-[repeat(auto-fill,minmax(14rem,1fr))]" aria-busy="true">
          {Array.from({ length: SKELETON_CARDS }, (_, index) => (
            <Skeleton key={index} className="aspect-[4/5] w-full" />
          ))}
        </div>
      ) : groups.length === 0 ? (
        <div className={NB_SURFACE}>
          <ProductEmpty filters={filters} onClear={clearFilters} />
        </div>
      ) : (
        <>
          {groups.map((group) => (
            <CategorySection key={group.id} group={group} />
          ))}
          {list.meta ? (
            <div className={`${NB_SURFACE} px-4 py-3`}>
              <Pagination
                page={list.meta.page}
                limit={list.meta.limit}
                total={list.meta.total}
                onPageChange={(page) => updateFilters({ page })}
                className="mt-0"
              />
            </div>
          ) : null}
        </>
      )}
    </div>
  );
};

export type { ProductsPageProps };
export { ProductsPage };
```

- [ ] **Step 6: Ver que pasa**

Run: `pnpm --filter @gira/web test -- tests/components/ProductsPage.test.tsx`
Expected: PASS. Si «cambiar un filtro escribe la URL» falla por el orden de `replaceMock`, revisar que `onChange` de `ProductFilters` llame a `updateFilters` con un solo parche por cambio. Si el test del esqueleto no encuentra `aria-busy`, confirmar que el `div` lo lleva.

- [ ] **Step 7: Typecheck**

Run: `pnpm --filter @gira/web exec tsc --noEmit`
Expected: sin errores.

- [ ] **Step 8: Punto de revisión** (sin commit).

---

### Task 17: Rutas de la lista y activación en el menú

**Files:**
- Create: `apps/web/src/app/(admin)/productos/page.tsx`
- Create: `apps/web/src/app/(admin)/productos/loading.tsx`
- Modify: `apps/web/src/lib/navigation.ts`
- Modify: `apps/web/tests/lib/navigation.test.ts`

- [ ] **Step 1: Actualizar el test de navegación (falla primero)**

In `apps/web/tests/lib/navigation.test.ts` línea 12 cambiar:

```ts
    expect(available).toEqual(["summary", "orders", "variants"]);
```

por:

```ts
    expect(available).toEqual(["summary", "orders", "products", "variants"]);
```

Run: `pnpm --filter @gira/web test -- tests/lib/navigation.test.ts` → Expected: FAIL.

- [ ] **Step 2: Activar la entrada**

In `apps/web/src/lib/navigation.ts`, en el item `key: "products"` cambiar `available: false,` por `available: true,`. Agregar `"modelos", "modelo"` a sus `keywords` (queda `["productos", "catalogo", "modelos", "modelo"]`).

- [ ] **Step 3: La página de la lista**

Create `apps/web/src/app/(admin)/productos/page.tsx`:

```tsx
import type { Metadata } from "next";
import { NewProductButton } from "@/components/catalog/NewProductButton";
import { ProductsPage } from "@/components/catalog/ProductsPage";
import { SectionError } from "@/components/resumen/SectionError";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { PageHeader } from "@/components/ui/PageHeader";
import { parseCatalogFilters } from "@/lib/catalog/filters";

const metadata: Metadata = { title: "Productos" };

const RENDER_CRASH_MESSAGE = "Esta sección no se pudo mostrar. Actualiza la página para reintentar.";

interface ProductosPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Filters live in the URL, so a filtered view can be shared or reloaded. The
 * list itself loads in the client (it refreshes after the operator's own
 * actions); this server component only parses the query string.
 */
const ProductosPage = async ({ searchParams }: ProductosPageProps) => {
  const params = await searchParams;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Productos"
        subtitle="Modelos del catálogo, agrupados por categoría."
        actions={<NewProductButton />}
      />
      <ErrorBoundary fallback={<SectionError message={RENDER_CRASH_MESSAGE} />}>
        <ProductsPage initialFilters={parseCatalogFilters(params)} />
      </ErrorBoundary>
    </div>
  );
};

export { metadata };
export default ProductosPage;
```

Create `apps/web/src/app/(admin)/productos/loading.tsx`:

```tsx
import { PageHeader } from "@/components/ui/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";

/** Same geometry as the real page (filters island, grid of cards), so nothing shifts when data lands. */
const ProductosLoading = () => (
  <div className="flex flex-col gap-6">
    <PageHeader title="Productos" />
    <Skeleton className="h-20 w-full" />
    <div className="grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-[repeat(auto-fill,minmax(14rem,1fr))]">
      {Array.from({ length: 6 }, (_, index) => (
        <Skeleton key={index} className="aspect-[4/5] w-full" />
      ))}
    </div>
  </div>
);

export default ProductosLoading;
```

- [ ] **Step 4: Ver que pasa**

Run: `pnpm --filter @gira/web test -- tests/lib/navigation.test.ts tests/components/Sidebar.test.tsx tests/components/CommandPalette.test.tsx`
Expected: PASS. Si Sidebar o CommandPalette asumían «Productos» como «Pronto», ajustar esos tests (el cambio es esperado) y anotarlo en «Pendientes».

- [ ] **Step 5: Punto de revisión** (sin commit).

---
# PARTE 4 · WEB — editor, rutas, verificación y cierre

> Regla de estilo para los componentes del editor: **un estado, una rama de clase.** Los controles que cambian de fondo (seleccionado/no) usan un ternario (`selected ? "bg-brand-subtle" : "bg-surface"`), nunca una clase base `bg-surface` más una que la «sobrescribe»: es exactamente el bug del `Button` primary (`bg-surface` gana a `bg-cta`) que este milestone **no** arregla pero tampoco debe repetir.

### Task 18: Selector de estampas, precios especiales y fotos por variante

**Files:**
- Create: `apps/web/src/components/catalog/PrintPicker.tsx`
- Create: `apps/web/src/components/catalog/PrintPriceOverrides.tsx`
- Create: `apps/web/src/components/catalog/VariantPhotos.tsx`
- Test: `apps/web/tests/components/PrintPicker.test.tsx`, `apps/web/tests/components/VariantPhotos.test.tsx`

- [ ] **Step 1: Escribir los tests que fallan**

Create `apps/web/tests/components/PrintPicker.test.tsx`:

```tsx
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PrintPicker } from "@/components/catalog/PrintPicker";
import type { PickerPrint } from "@/lib/catalog/catalogOptions";

const print = (id: string, name: string, familyId: string, familyName: string): PickerPrint => ({
  id,
  name,
  sku: name.slice(0, 3).toUpperCase(),
  familyId,
  familyName,
  imageUrl: `https://res.cloudinary.com/gira/${id}.jpg`,
});

const PRINTS = [
  print("p1", "Nopal en flor", "f1", "Flora"),
  print("p2", "Monarca", "f1", "Flora"),
  print("p3", "Cassette", "f2", "Retro"),
];

const renderPicker = (overrides: Partial<React.ComponentProps<typeof PrintPicker>> = {}) => {
  const props = {
    prints: PRINTS,
    selectedIds: new Set<string>(),
    lockedIds: new Set<string>(),
    retiredIds: new Set<string>(),
    onToggle: vi.fn(),
    onCreate: vi.fn(),
    ...overrides,
  };
  render(<PrintPicker {...props} />);
  return props;
};

describe("PrintPicker", () => {
  it("muestra todas las estampas en una sola cuadrícula", () => {
    renderPicker();
    expect(screen.getByRole("button", { name: /Nopal en flor/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Cassette/ })).toBeInTheDocument();
  });

  it("el filtro de familia deja solo las de esa familia y «Todas» las devuelve", async () => {
    renderPicker();
    const filter = screen.getByRole("group", { name: "Filtrar por familia" });
    await userEvent.click(within(filter).getByRole("button", { name: "Retro" }));
    expect(screen.queryByRole("button", { name: /Nopal en flor/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Cassette/ })).toBeInTheDocument();
    await userEvent.click(within(filter).getByRole("button", { name: "Todas" }));
    expect(screen.getByRole("button", { name: /Nopal en flor/ })).toBeInTheDocument();
  });

  it("marca las elegidas con aria-pressed y avisa al elegir o quitar", async () => {
    const { onToggle } = renderPicker({ selectedIds: new Set(["p1"]) });
    expect(screen.getByRole("button", { name: /Nopal en flor/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /Monarca/ })).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(screen.getByRole("button", { name: /Monarca/ }));
    expect(onToggle).toHaveBeenCalledWith("p2");
  });

  it("una estampa con apartados no se puede quitar y lo dice", () => {
    renderPicker({ selectedIds: new Set(["p1"]), lockedIds: new Set(["p1"]) });
    const tile = screen.getByRole("button", { name: /Nopal en flor/ });
    expect(tile).toBeDisabled();
    expect(within(tile).getByText("Con apartados")).toBeInTheDocument();
  });

  it("una estampa con variante retirada se puede volver a elegir y se marca como retirada", () => {
    renderPicker({ retiredIds: new Set(["p2"]) });
    const tile = screen.getByRole("button", { name: /Monarca/ });
    expect(tile).toBeEnabled();
    expect(within(tile).getByText("Retirada")).toBeInTheDocument();
  });

  it("«Nueva estampa» pide crearla", async () => {
    const { onCreate } = renderPicker();
    await userEvent.click(screen.getByRole("button", { name: /Nueva estampa/ }));
    expect(onCreate).toHaveBeenCalledTimes(1);
  });
});
```

Create `apps/web/tests/components/VariantPhotos.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { VariantPhotos } from "@/components/catalog/VariantPhotos";
import { ToastProvider } from "@/components/ui/Toast";
import type { PickerPrint } from "@/lib/catalog/catalogOptions";
import type { VariantDraft } from "@/lib/catalog/productForm";
import { PRINT_A_ID, PRINT_B_ID, makeImage } from "../helpers/catalog";

const printOf = (id: string, name: string): PickerPrint => ({
  id,
  name,
  sku: name.slice(0, 3).toUpperCase(),
  familyId: "f1",
  familyName: "Flora",
  imageUrl: `https://res.cloudinary.com/gira/${id}.jpg`,
});
const PRINTS = new Map([
  [PRINT_A_ID, printOf(PRINT_A_ID, "Nopal en flor")],
  [PRINT_B_ID, printOf(PRINT_B_ID, "Monarca")],
]);

const A1 = makeImage("a1");
const A2 = makeImage("a2");
const DRAFTS: VariantDraft[] = [
  { printId: PRINT_A_ID, priceOverride: "", images: [A1, A2] },
  { printId: PRINT_B_ID, priceOverride: "", images: [] },
];

const renderPhotos = (overrides: Partial<React.ComponentProps<typeof VariantPhotos>> = {}) => {
  const props = {
    drafts: DRAFTS,
    prints: PRINTS,
    activePrintId: PRINT_A_ID as string | null,
    onSelect: vi.fn(),
    onImagesChange: vi.fn(),
    upload: vi.fn(),
    uploading: false,
    ...overrides,
  };
  render(
    <ToastProvider>
      <VariantPhotos {...props} />
    </ToastProvider>,
  );
  return props;
};

describe("VariantPhotos", () => {
  it("sin estampas elegidas explica qué hacer", () => {
    renderPhotos({ drafts: [], activePrintId: null });
    expect(screen.getByText(/Elige al menos una estampa/)).toBeInTheDocument();
  });

  it("muestra la galería de la estampa activa y la portada solo en la primera", () => {
    renderPhotos();
    const photos = screen.getByRole("list", { name: "Fotos de Nopal en flor" });
    expect(photos.querySelectorAll("img")).toHaveLength(2);
    expect(screen.getAllByText("Portada")).toHaveLength(1);
    expect(screen.getByRole("button", { name: /Nopal en flor/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("2 fotos")).toBeInTheDocument();
    expect(screen.getByText("0 fotos")).toBeInTheDocument();
  });

  it("elegir otra estampa avisa para cambiar de galería", async () => {
    const { onSelect } = renderPhotos();
    await userEvent.click(screen.getByRole("button", { name: /Monarca/ }));
    expect(onSelect).toHaveBeenCalledWith(PRINT_B_ID);
  });

  it("mover una foto cambia el orden; la primera no se mueve antes ni la última después", async () => {
    const { onImagesChange } = renderPhotos();
    const before = screen.getAllByRole("button", { name: "Mover antes" });
    const after = screen.getAllByRole("button", { name: "Mover después" });
    expect(before[0]).toBeDisabled();
    expect(after[1]).toBeDisabled();
    await userEvent.click(after[0] as HTMLElement);
    expect(onImagesChange).toHaveBeenCalledWith(PRINT_A_ID, [A2, A1]);
  });

  it("quitar una foto la saca de la lista", async () => {
    const { onImagesChange } = renderPhotos();
    await userEvent.click(screen.getAllByRole("button", { name: "Quitar foto" })[0] as HTMLElement);
    expect(onImagesChange).toHaveBeenCalledWith(PRINT_A_ID, [A2]);
  });

  it("subir fotos las agrega al final de la estampa activa", async () => {
    const upload = vi.fn().mockResolvedValue({ ok: true, image: makeImage("nueva") });
    const { onImagesChange } = renderPhotos({ upload });
    const file = new File(["x"], "nueva.png", { type: "image/png" });
    await userEvent.upload(screen.getByLabelText(/Subir fotos/), file);
    await waitFor(() => expect(onImagesChange).toHaveBeenCalledWith(PRINT_A_ID, [A1, A2, makeImage("nueva")]));
    expect(upload).toHaveBeenCalledWith(file, "variants");
  });

  it("una subida que falla avisa y no cambia las fotos", async () => {
    const upload = vi.fn().mockResolvedValue({ ok: false, message: "El archivo pesa demasiado." });
    const { onImagesChange } = renderPhotos({ upload });
    await userEvent.upload(screen.getByLabelText(/Subir fotos/), new File(["x"], "n.png", { type: "image/png" }));
    expect(await screen.findByText("El archivo pesa demasiado.")).toBeInTheDocument();
    expect(onImagesChange).not.toHaveBeenCalled();
  });

  it("con 10 fotos ya no deja subir más", () => {
    const ten = Array.from({ length: 10 }, (_, i) => makeImage(`f${i}`));
    renderPhotos({ drafts: [{ printId: PRINT_A_ID, priceOverride: "", images: ten }] });
    expect(screen.getByLabelText(/Subir fotos/)).toBeDisabled();
  });
});
```

- [ ] **Step 2: Ver que fallan**

Run: `pnpm --filter @gira/web test -- tests/components/PrintPicker.test.tsx tests/components/VariantPhotos.test.tsx`
Expected: FAIL (componentes inexistentes).

- [ ] **Step 3: `PrintPicker`**

Create `apps/web/src/components/catalog/PrintPicker.tsx`:

```tsx
"use client";

import { CheckCircleIcon, PlusCircleIcon } from "@phosphor-icons/react/dist/ssr";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";
import { Segmented } from "@/components/ui/Segmented";
import { NB_PRESSABLE } from "@/components/ui/styles";
import { T_CAPTION } from "@/components/ui/typography";
import { cn } from "@/lib/cn";
import type { PickerPrint } from "@/lib/catalog/catalogOptions";
import { ImageTile } from "./ImageTile";

interface PrintPickerProps {
  prints: PickerPrint[];
  selectedIds: ReadonlySet<string>;
  /** Chosen prints whose variant has reserved units: they cannot be removed. */
  lockedIds: ReadonlySet<string>;
  /** Prints that already had a variant which was retired: choosing one again reactivates it. */
  retiredIds: ReadonlySet<string>;
  onToggle: (printId: string) => void;
  onCreate: () => void;
}

const ALL = "all";

/**
 * One grid of every active print, with a family filter on top. A chosen print
 * becomes (or keeps) a variant of the model. Selection is a ternary of fills,
 * never a base fill plus an override, so the tile always shows the colour it
 * is meant to.
 */
const PrintPicker = ({ prints, selectedIds, lockedIds, retiredIds, onToggle, onCreate }: PrintPickerProps) => {
  const [family, setFamily] = useState<string>(ALL);

  const families = useMemo(() => {
    const seen = new Map<string, string>();
    for (const print of prints) seen.set(print.familyId, print.familyName);
    return [...seen].sort((a, b) => a[1].localeCompare(b[1], "es"));
  }, [prints]);

  const visible = family === ALL ? prints : prints.filter((print) => print.familyId === family);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por familia">
        <Segmented selected={family === ALL} onClick={() => setFamily(ALL)}>
          Todas
        </Segmented>
        {families.map(([id, name]) => (
          <Segmented key={id} selected={family === id} onClick={() => setFamily(id)}>
            {name}
          </Segmented>
        ))}
      </div>

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
        {visible.map((print) => {
          const selected = selectedIds.has(print.id);
          const locked = lockedIds.has(print.id);
          const retired = retiredIds.has(print.id) && !selected;
          return (
            <li key={print.id}>
              <button
                type="button"
                aria-pressed={selected}
                disabled={locked}
                onClick={() => onToggle(print.id)}
                className={cn(
                  "relative flex w-full flex-col gap-1 rounded-nb-sm border-2 border-ink p-2 text-left text-text-primary shadow-nb-sm",
                  NB_PRESSABLE,
                  selected ? "bg-brand-subtle" : "bg-surface",
                  locked && "cursor-not-allowed",
                )}
              >
                <ImageTile url={print.imageUrl} alt="" className="aspect-square w-full rounded-nb-sm border-2 border-ink" />
                {selected ? (
                  <Icon
                    icon={CheckCircleIcon}
                    size={22}
                    className="absolute right-3.5 top-3.5 rounded-full bg-surface text-brand"
                  />
                ) : null}
                <span className="text-sm font-bold leading-snug">{print.name}</span>
                <span className={T_CAPTION}>
                  {print.sku} · {print.familyName}
                </span>
                {locked ? <Badge variant="warn">Con apartados</Badge> : null}
                {retired ? <Badge>Retirada</Badge> : null}
              </button>
            </li>
          );
        })}
        <li>
          <button
            type="button"
            onClick={onCreate}
            className="grid h-full min-h-32 w-full place-content-center justify-items-center gap-1.5 rounded-nb-sm border-2 border-dashed border-ink bg-transparent p-3 text-center text-sm text-text-primary hover:bg-brand-subtle"
          >
            <Icon icon={PlusCircleIcon} size={28} />
            <span className="font-bold">Nueva estampa</span>
            <span className={T_CAPTION}>Súbela y elige su familia</span>
          </button>
        </li>
      </ul>
    </div>
  );
};

export type { PrintPickerProps };
export { PrintPicker };
```

Nota: la última tarjeta «Nueva estampa» está sobre el fondo hueso de la isla (`bg-transparent`), por eso lleva `text-text-primary` explícito.

- [ ] **Step 4: `PrintPriceOverrides`**

Create `apps/web/src/components/catalog/PrintPriceOverrides.tsx`:

```tsx
import { Field } from "@/components/ui/Field";
import { T_LABEL, T_PANEL_HINT } from "@/components/ui/typography";
import type { PickerPrint } from "@/lib/catalog/catalogOptions";
import type { VariantDraft } from "@/lib/catalog/productForm";
import { ImageTile } from "./ImageTile";

interface PrintPriceOverridesProps {
  drafts: VariantDraft[];
  prints: ReadonlyMap<string, PickerPrint>;
  /** Errors by printId. */
  errors: Record<string, string>;
  /** The model's base price (pesos text), shown as the placeholder: that is what an empty field charges. */
  basePricePlaceholder: string;
  onChange: (printId: string, value: string) => void;
}

/** One optional price per chosen print. Empty means "use the model's base price". Money is mono. */
const PrintPriceOverrides = ({ drafts, prints, errors, basePricePlaceholder, onChange }: PrintPriceOverridesProps) => {
  if (drafts.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className={`${T_LABEL} text-text-secondary`}>Precio especial (opcional)</p>
        <p className={T_PANEL_HINT}>Déjalo vacío para cobrar el precio base.</p>
      </div>
      <ul className="flex flex-col gap-3">
        {drafts.map((draft) => {
          const print = prints.get(draft.printId);
          const name = print?.name ?? "Estampa";
          return (
            <li key={draft.printId} className="flex flex-wrap items-center gap-3">
              <ImageTile url={print?.imageUrl} alt="" className="h-10 w-10 shrink-0 rounded-nb-sm border-2 border-ink" />
              <span className="min-w-0 flex-1 truncate text-sm font-bold">{name}</span>
              <Field
                label="Precio especial"
                aria-label={`Precio especial de ${name}`}
                inputMode="decimal"
                placeholder={basePricePlaceholder}
                value={draft.priceOverride}
                error={errors[draft.printId]}
                className="font-mono"
                containerClassName="w-44"
                onChange={(event) => onChange(draft.printId, event.target.value)}
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export type { PrintPriceOverridesProps };
export { PrintPriceOverrides };
```

- [ ] **Step 5: `VariantPhotos`**

Create `apps/web/src/components/catalog/VariantPhotos.tsx`:

```tsx
"use client";

import { VARIANT_IMAGES_MAX } from "@gira/shared";
import type { ImageAttrs } from "@gira/shared";
import { ArrowLeftIcon, ArrowRightIcon, TrashIcon } from "@phosphor-icons/react/dist/ssr";
import { Badge } from "@/components/ui/Badge";
import { IconButton } from "@/components/ui/IconButton";
import { NB_PRESSABLE } from "@/components/ui/styles";
import { useToast } from "@/components/ui/Toast";
import { T_PANEL_HINT } from "@/components/ui/typography";
import type { UseImageUpload } from "@/hooks/useImageUpload";
import { cn } from "@/lib/cn";
import type { PickerPrint } from "@/lib/catalog/catalogOptions";
import type { VariantDraft } from "@/lib/catalog/productForm";
import { ImageTile } from "./ImageTile";
import { UploadTile } from "./UploadTile";

interface VariantPhotosProps {
  drafts: VariantDraft[];
  prints: ReadonlyMap<string, PickerPrint>;
  activePrintId: string | null;
  onSelect: (printId: string) => void;
  onImagesChange: (printId: string, images: ImageAttrs[]) => void;
  upload: UseImageUpload["upload"];
  uploading: boolean;
}

const photosLabel = (count: number): string => (count === 1 ? "1 foto" : `${count} fotos`);

/**
 * Photos are per variant (print): pick the print first, and below it are ITS
 * photos. The first one is the cover. Reordering is by arrows (no dragging),
 * and while an upload is running the controls that would race with it are off.
 */
const VariantPhotos = ({ drafts, prints, activePrintId, onSelect, onImagesChange, upload, uploading }: VariantPhotosProps) => {
  const { toast } = useToast();
  const active = drafts.find((draft) => draft.printId === activePrintId);

  if (drafts.length === 0 || !active) {
    return <p className={T_PANEL_HINT}>Elige al menos una estampa para subir sus fotos.</p>;
  }

  const activeName = prints.get(active.printId)?.name ?? "la estampa";
  const full = active.images.length >= VARIANT_IMAGES_MAX;

  const move = (index: number, delta: number) => {
    const next = [...active.images];
    const [moved] = next.splice(index, 1);
    next.splice(index + delta, 0, moved as ImageAttrs);
    onImagesChange(active.printId, next);
  };

  const remove = (index: number) => onImagesChange(active.printId, active.images.filter((_, i) => i !== index));

  const handleFiles = async (files: File[]) => {
    const room = Math.max(0, VARIANT_IMAGES_MAX - active.images.length);
    const accepted = files.slice(0, room);
    if (files.length > accepted.length) {
      toast({
        variant: "warning",
        title: "Límite de fotos",
        description: `Cada estampa admite hasta ${VARIANT_IMAGES_MAX} fotos.`,
      });
    }
    const added: ImageAttrs[] = [];
    for (const file of accepted) {
      const outcome = await upload(file, "variants");
      if (outcome.ok) added.push(outcome.image);
      else toast({ variant: "error", title: "No se pudo subir la foto", description: outcome.message });
    }
    if (added.length > 0) onImagesChange(active.printId, [...active.images, ...added]);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-3" role="group" aria-label="Estampas del modelo">
        {drafts.map((draft) => {
          const print = prints.get(draft.printId);
          const selected = draft.printId === active.printId;
          return (
            <button
              key={draft.printId}
              type="button"
              aria-pressed={selected}
              onClick={() => onSelect(draft.printId)}
              className={cn(
                "flex items-center gap-3 rounded-nb-sm border-2 border-ink px-3 py-2 text-left shadow-nb-sm",
                NB_PRESSABLE,
                selected ? "bg-brand text-text-inverse" : "bg-surface text-text-primary",
              )}
            >
              <ImageTile
                url={draft.images[0]?.url ?? print?.imageUrl}
                alt=""
                className="h-10 w-10 rounded-nb-sm border-2 border-ink"
              />
              <span className="flex flex-col">
                <span className="text-sm font-bold">{print?.name ?? "Estampa"}</span>
                <span className={cn("font-mono text-2xs", selected ? "text-text-inverse-secondary" : "text-text-muted")}>
                  {photosLabel(draft.images.length)}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <ul aria-label={`Fotos de ${activeName}`} className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {active.images.map((image, index) => (
          <li
            key={`${image.publicId}-${index}`}
            className="relative aspect-square overflow-hidden rounded-nb-sm border-2 border-ink bg-surface-sunken"
          >
            <ImageTile url={image.url} alt={`Foto ${index + 1} de ${activeName}`} className="h-full w-full" />
            {index === 0 ? (
              <Badge variant="ok" className="absolute left-2 top-2">
                Portada
              </Badge>
            ) : null}
            <div className="absolute inset-x-2 bottom-2 flex items-center gap-2">
              <IconButton
                icon={ArrowLeftIcon}
                label="Mover antes"
                size="sm"
                disabled={uploading || index === 0}
                onClick={() => move(index, -1)}
              />
              <IconButton
                icon={ArrowRightIcon}
                label="Mover después"
                size="sm"
                disabled={uploading || index === active.images.length - 1}
                onClick={() => move(index, 1)}
              />
              <IconButton
                icon={TrashIcon}
                label="Quitar foto"
                size="sm"
                className="ml-auto"
                disabled={uploading}
                onClick={() => remove(index)}
              />
            </div>
          </li>
        ))}
        <li>
          <UploadTile
            label="Subir fotos"
            hint={`Hasta ${VARIANT_IMAGES_MAX} por estampa`}
            multiple
            busy={uploading}
            disabled={full}
            className="aspect-square h-full w-full"
            onFiles={(files) => void handleFiles(files)}
          />
        </li>
      </ul>
    </div>
  );
};

export type { VariantPhotosProps };
export { VariantPhotos };
```

- [ ] **Step 6: Ver que pasan**

Run: `pnpm --filter @gira/web test -- tests/components/PrintPicker.test.tsx tests/components/VariantPhotos.test.tsx`
Expected: PASS. Si `getByLabelText(/Subir fotos/)` falla por texto repetido, confirmar que el `UploadTile` envuelve el input en el `<label>` (así el nombre del input es el texto de la etiqueta).

- [ ] **Step 7: Punto de revisión** (sin commit).

---

### Task 19: Datos del modelo, foto de tamaño, retirar, barra de guardado y estampa nueva

**Files:**
- Create: `apps/web/src/components/catalog/ModelDataSection.tsx`
- Create: `apps/web/src/components/catalog/SizePhotoField.tsx`
- Create: `apps/web/src/components/catalog/RetireModelSection.tsx`
- Create: `apps/web/src/components/catalog/SaveBar.tsx`
- Create: `apps/web/src/components/catalog/NewPrintSlideOver.tsx`
- Test: `apps/web/tests/components/NewPrintSlideOver.test.tsx`

(`ModelDataSection`, `SizePhotoField`, `RetireModelSection` y `SaveBar` se prueban a través de `ProductEditor` en la Task 20; `NewPrintSlideOver` lleva su propio test porque tiene su propio formulario.)

- [ ] **Step 1: Escribir el test que falla**

Create `apps/web/tests/components/NewPrintSlideOver.test.tsx`:

```tsx
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NewPrintSlideOver } from "@/components/catalog/NewPrintSlideOver";
import { ToastProvider } from "@/components/ui/Toast";
import { ApiError } from "@/lib/api/ApiError";
import type { PickerPrint } from "@/lib/catalog/catalogOptions";
import { makeImage } from "../helpers/catalog";

const api = vi.hoisted(() => ({ createPrint: vi.fn() }));
vi.mock("@/lib/api/adminCatalog", () => api);

const CREATED: PickerPrint = {
  id: "p9",
  name: "Cassette",
  sku: "CAS",
  familyId: "f1",
  familyName: "Retro",
  imageUrl: "https://res.cloudinary.com/gira/c.jpg",
};

const setup = (overrides: Partial<React.ComponentProps<typeof NewPrintSlideOver>> = {}) => {
  const props = {
    open: true,
    onClose: vi.fn(),
    families: [
      { value: "f1", label: "Retro" },
      { value: "f2", label: "Flora" },
    ],
    onCreated: vi.fn(),
    upload: vi.fn().mockResolvedValue({ ok: true, image: makeImage("cassette") }),
    uploading: false,
    ...overrides,
  };
  render(
    <ToastProvider>
      <NewPrintSlideOver {...props} />
    </ToastProvider>,
  );
  return props;
};

const dialog = () => screen.getByRole("dialog");

beforeEach(() => api.createPrint.mockReset());

describe("NewPrintSlideOver", () => {
  it("cerrado no pinta nada", () => {
    setup({ open: false });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("sin datos muestra qué falta y no llama al API", async () => {
    setup();
    await userEvent.click(within(dialog()).getByRole("button", { name: "Crear estampa" }));
    expect(screen.getByText("El nombre debe tener entre 2 y 80 caracteres.")).toBeInTheDocument();
    expect(screen.getByText("El SKU debe tener de 2 a 24 caracteres: letras, números y guiones.")).toBeInTheDocument();
    expect(screen.getByText("Elige una familia.")).toBeInTheDocument();
    expect(screen.getByText("Sube la imagen de la estampa.")).toBeInTheDocument();
    expect(api.createPrint).not.toHaveBeenCalled();
  });

  it("el SKU se escribe en mayúsculas", async () => {
    setup();
    const sku = within(dialog()).getByLabelText("SKU");
    await userEvent.type(sku, "cas-1");
    expect(sku).toHaveValue("CAS-1");
  });

  it("crea la estampa, la entrega al selector y cierra", async () => {
    api.createPrint.mockResolvedValue(CREATED);
    const props = setup();
    await userEvent.type(within(dialog()).getByLabelText("Nombre"), "  Cassette ");
    await userEvent.type(within(dialog()).getByLabelText("SKU"), "cas");
    await userEvent.selectOptions(within(dialog()).getByLabelText("Familia"), "f1");
    await userEvent.upload(
      within(dialog()).getByLabelText(/Subir imagen/),
      new File(["x"], "cassette.png", { type: "image/png" }),
    );
    await waitFor(() => expect(props.upload).toHaveBeenCalledWith(expect.any(File), "prints"));
    await userEvent.click(within(dialog()).getByRole("button", { name: "Crear estampa" }));
    await waitFor(() => expect(props.onCreated).toHaveBeenCalledWith(CREATED));
    expect(api.createPrint).toHaveBeenCalledWith({
      name: "Cassette",
      sku: "CAS",
      family: "f1",
      image: makeImage("cassette"),
    });
    expect(props.onClose).toHaveBeenCalled();
  });

  it("un error del API se muestra en el panel y no cierra", async () => {
    api.createPrint.mockRejectedValue(new ApiError("Ya existe una estampa con ese SKU.", "http", 409));
    const props = setup();
    await userEvent.type(within(dialog()).getByLabelText("Nombre"), "Cassette");
    await userEvent.type(within(dialog()).getByLabelText("SKU"), "cas");
    await userEvent.selectOptions(within(dialog()).getByLabelText("Familia"), "f1");
    await userEvent.upload(
      within(dialog()).getByLabelText(/Subir imagen/),
      new File(["x"], "c.png", { type: "image/png" }),
    );
    await userEvent.click(within(dialog()).getByRole("button", { name: "Crear estampa" }));
    expect(await screen.findByText("Ya existe una estampa con ese SKU.")).toBeInTheDocument();
    expect(props.onClose).not.toHaveBeenCalled();
    expect(props.onCreated).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Ver que falla**

Run: `pnpm --filter @gira/web test -- tests/components/NewPrintSlideOver.test.tsx`
Expected: FAIL (componente inexistente).

- [ ] **Step 3: `ModelDataSection` y `SizePhotoField`**

Create `apps/web/src/components/catalog/SizePhotoField.tsx`:

```tsx
import { Button } from "@/components/ui/Button";
import { T_CAPTION, T_LABEL } from "@/components/ui/typography";
import { ImageTile } from "./ImageTile";
import { UploadTile } from "./UploadTile";

interface SizePhotoFieldProps {
  /** `null` when the model has no size photo. */
  imageUrl: string | null;
  busy: boolean;
  error?: string | undefined;
  onPick: (file: File) => void;
  onRemove: () => void;
}

/** The single photo (or diagram) that shows the model's real size. Replacing is just picking another file. */
const SizePhotoField = ({ imageUrl, busy, error, onPick, onRemove }: SizePhotoFieldProps) => (
  <div className="flex flex-col gap-1.5 sm:col-span-2">
    <span className={`${T_LABEL} text-text-secondary`}>Foto de tamaño</span>
    <div className="grid items-start gap-3 sm:grid-cols-[10rem_10rem_minmax(0,1fr)]">
      {imageUrl ? (
        <div className="flex flex-col gap-2">
          <ImageTile
            url={imageUrl}
            alt="Foto de tamaño del modelo"
            className="aspect-square w-full rounded-nb-sm border-2 border-ink"
          />
          <Button size="sm" variant="ghost" onClick={onRemove} disabled={busy}>
            Quitar foto
          </Button>
        </div>
      ) : null}
      <UploadTile
        label={imageUrl ? "Reemplazar foto" : "Subir foto de tamaño"}
        hint="JPG, PNG, WEBP o AVIF · 5 MB"
        busy={busy}
        className="aspect-square w-full"
        onFiles={(files) => onPick(files[0] as File)}
      />
      <p className={`${T_CAPTION} sm:self-center`}>
        Una foto o diagrama que muestre el tamaño real, por ejemplo junto a una mano o con las medidas marcadas. Es una
        sola por modelo y se muestra en la tienda junto a las medidas.
      </p>
    </div>
    {error ? (
      <p role="alert" className="text-xs text-danger">
        {error}
      </p>
    ) : null}
  </div>
);

export type { SizePhotoFieldProps };
export { SizePhotoField };
```

Create `apps/web/src/components/catalog/ModelDataSection.tsx`:

```tsx
"use client";

import { useId } from "react";
import { Field } from "@/components/ui/Field";
import { SelectField } from "@/components/ui/SelectField";
import { T_LABEL } from "@/components/ui/typography";
import { cn } from "@/lib/cn";
import type { Option } from "@/lib/catalog/catalogOptions";
import type { ModelErrors, ModelFields } from "@/lib/catalog/productForm";
import { EditorSection } from "./EditorSection";
import { SizePhotoField, type SizePhotoFieldProps } from "./SizePhotoField";

interface ModelDataSectionProps {
  model: ModelFields;
  errors: ModelErrors;
  categories: Option[];
  onChange: (patch: Partial<ModelFields>) => void;
  sizePhoto: SizePhotoFieldProps;
}

interface DescriptionFieldProps {
  value: string;
  error?: string | undefined;
  onChange: (value: string) => void;
}

/** There is no shared textarea in the kit: this one mirrors Field's label/error wiring and surface. */
const DescriptionField = ({ value, error, onChange }: DescriptionFieldProps) => {
  const id = useId();
  const messageId = useId();
  return (
    <div className="flex flex-col gap-1.5 sm:col-span-2">
      <label htmlFor={id} className={`${T_LABEL} text-text-secondary`}>
        Descripción
      </label>
      <textarea
        id={id}
        rows={3}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        {...(error ? { "aria-invalid": true, "aria-describedby": messageId } : {})}
        className={cn(
          "rounded-nb-sm border-2 bg-surface p-3 text-sm text-text-primary shadow-nb-sm",
          error ? "border-danger" : "border-ink",
        )}
      />
      {error ? (
        <p id={messageId} className="text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
};

/**
 * The model's own data: name, category, base price, weight, description,
 * measurements, materials and the size photo. Everything is text until save;
 * money is typed in pesos and shown in mono.
 */
const ModelDataSection = ({ model, errors, categories, onChange, sizePhoto }: ModelDataSectionProps) => (
  <EditorSection title="Datos del modelo">
    <div className="grid gap-4 sm:grid-cols-2">
      <Field
        label="Nombre"
        value={model.name}
        error={errors.name}
        onChange={(event) => onChange({ name: event.target.value })}
      />
      <SelectField
        label="Categoría"
        options={[{ value: "", label: "Elige una categoría" }, ...categories]}
        value={model.categoryId}
        error={errors.categoryId}
        onChange={(event) => onChange({ categoryId: event.target.value })}
      />
      <Field
        label="Precio base (MXN)"
        inputMode="decimal"
        placeholder="189.00"
        helper="Se cobra este precio salvo que una estampa tenga precio especial."
        value={model.price}
        error={errors.price}
        className="font-mono"
        onChange={(event) => onChange({ price: event.target.value })}
      />
      <Field
        label="Peso (g)"
        inputMode="numeric"
        placeholder="140"
        helper="Peso de una pieza empacada: cotiza el envío."
        value={model.weight}
        error={errors.weight}
        className="font-mono"
        onChange={(event) => onChange({ weight: event.target.value })}
      />
      <DescriptionField
        value={model.description}
        error={errors.description}
        onChange={(description) => onChange({ description })}
      />
      <div className="grid grid-cols-3 gap-3 sm:col-span-2">
        <Field
          label="Ancho (cm)"
          inputMode="decimal"
          value={model.width}
          error={errors.width}
          className="font-mono"
          onChange={(event) => onChange({ width: event.target.value })}
        />
        <Field
          label="Alto (cm)"
          inputMode="decimal"
          value={model.height}
          error={errors.height}
          className="font-mono"
          onChange={(event) => onChange({ height: event.target.value })}
        />
        <Field
          label="Profundidad (cm)"
          inputMode="decimal"
          value={model.depth}
          error={errors.depth}
          className="font-mono"
          onChange={(event) => onChange({ depth: event.target.value })}
        />
      </div>
      <Field
        label="Materiales"
        helper="Sepáralos con comas. Máximo 10."
        value={model.materials}
        error={errors.materials}
        containerClassName="sm:col-span-2"
        onChange={(event) => onChange({ materials: event.target.value })}
      />
      <SizePhotoField {...sizePhoto} />
    </div>
  </EditorSection>
);

export type { ModelDataSectionProps };
export { ModelDataSection };
```

- [ ] **Step 4: `RetireModelSection` y `SaveBar`**

Create `apps/web/src/components/catalog/RetireModelSection.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Notice } from "@/components/ui/Notice";
import { EditorSection } from "./EditorSection";

interface RetireModelSectionProps {
  productId: string;
  productName: string;
  isActive: boolean;
  /** Active variants the SERVER holds (not the unsaved selection). */
  activeVariantCount: number;
  /** May throw: the dialog shows the API's own Spanish message (a 409 while variants are active). */
  onRetire: () => Promise<void>;
  /** Never throws: the caller toasts a failure. */
  onReactivate: () => Promise<void>;
}

const variantsLabel = (count: number): string => (count === 1 ? "1 variante activa" : `${count} variantes activas`);

/**
 * Retiring is a soft delete the API only allows once no variant is active.
 * The panel mirrors that rule up front: it blocks, says why, and points at
 * the stock screen, instead of letting the operator hit the 409.
 */
const RetireModelSection = ({
  productId,
  productName,
  isActive,
  activeVariantCount,
  onRetire,
  onReactivate,
}: RetireModelSectionProps) => {
  const [confirming, setConfirming] = useState(false);
  const [reactivating, setReactivating] = useState(false);

  if (!isActive) {
    return (
      <EditorSection title="Modelo retirado">
        <Notice variant="info" title="Este modelo no aparece en el catálogo">
          <p>Reactívalo para volver a venderlo. Sus estampas hay que volver a elegirlas.</p>
        </Notice>
        <div>
          <Button
            loading={reactivating}
            onClick={async () => {
              setReactivating(true);
              await onReactivate();
              setReactivating(false);
            }}
          >
            Reactivar modelo
          </Button>
        </div>
      </EditorSection>
    );
  }

  const blocked = activeVariantCount > 0;

  return (
    <EditorSection title="Retirar este modelo">
      {blocked ? (
        <Notice variant="warning" title="No se puede retirar todavía">
          <p>
            Tiene {variantsLabel(activeVariantCount)}. Quita todas sus estampas de la sección Estampas y guarda; después
            podrás retirarlo.{" "}
            <Link href={`/inventario?modelo=${productId}`} className="font-bold underline">
              Ver en Inventario
            </Link>
          </p>
        </Notice>
      ) : (
        <p className="text-sm text-text-secondary">Dejará de mostrarse en el catálogo. Podrás reactivarlo después.</p>
      )}
      <div>
        <Button variant="danger" disabled={blocked} onClick={() => setConfirming(true)}>
          Retirar modelo
        </Button>
      </div>
      <ConfirmDialog
        open={confirming}
        tone="danger"
        title={`Retirar «${productName}»`}
        description="Dejará de mostrarse en el catálogo. Podrás reactivarlo después."
        confirmLabel="Retirar modelo"
        onCancel={() => setConfirming(false)}
        onConfirm={async () => {
          await onRetire();
          setConfirming(false);
        }}
      />
    </EditorSection>
  );
};

export type { RetireModelSectionProps };
export { RetireModelSection };
```

Create `apps/web/src/components/catalog/SaveBar.tsx`:

```tsx
import { Button } from "@/components/ui/Button";
import { T_CAPTION } from "@/components/ui/typography";

interface SaveBarProps {
  dirty: boolean;
  saving: boolean;
  submitLabel: string;
  /** Edit mode: nothing to save until something changed. Create mode always lets you try (validation explains what is missing). */
  requireDirty: boolean;
  onSave: () => void;
  onCancel: () => void;
}

/**
 * Fixed to the bottom of the content area (it starts after the sidebar on
 * desktop). It carries the screen's ONE yellow button, so the rest of the
 * editor never competes with it.
 */
const SaveBar = ({ dirty, saving, submitLabel, requireDirty, onSave, onCancel }: SaveBarProps) => (
  <div className="fixed inset-x-0 bottom-0 z-(--z-topbar) border-t-2 border-ink bg-surface text-text-primary lg:left-(--sidebar-width)">
    <div className="flex items-center gap-3 px-4 py-3 sm:px-8">
      <p className={`${T_CAPTION} flex-1`} aria-live="polite">
        {dirty ? "Cambios sin guardar" : "Sin cambios"}
      </p>
      <Button variant="ghost" onClick={onCancel} disabled={saving}>
        Cancelar
      </Button>
      <Button variant="primary" loading={saving} disabled={requireDirty && !dirty} onClick={onSave}>
        {submitLabel}
      </Button>
    </div>
  </div>
);

export type { SaveBarProps };
export { SaveBar };
```

- [ ] **Step 5: `NewPrintSlideOver`**

Create `apps/web/src/components/catalog/NewPrintSlideOver.tsx`:

```tsx
"use client";

import type { ImageAttrs } from "@gira/shared";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { SelectField } from "@/components/ui/SelectField";
import { SlideOver } from "@/components/ui/SlideOver";
import { useToast } from "@/components/ui/Toast";
import type { UseImageUpload } from "@/hooks/useImageUpload";
import { createPrint } from "@/lib/api/adminCatalog";
import { isApiError } from "@/lib/api/ApiError";
import type { Option, PickerPrint } from "@/lib/catalog/catalogOptions";
import { ImageTile } from "./ImageTile";
import { UploadTile } from "./UploadTile";

interface NewPrintSlideOverProps {
  open: boolean;
  onClose: () => void;
  families: Option[];
  onCreated: (print: PickerPrint) => void;
  upload: UseImageUpload["upload"];
  uploading: boolean;
}

type PrintFormErrors = {
  name?: string | undefined;
  sku?: string | undefined;
  family?: string | undefined;
  image?: string | undefined;
};

const SKU_PATTERN = /^[A-Z0-9-]{2,24}$/;
const GENERIC_ERROR = "Inténtalo de nuevo en un momento.";

interface NewPrintFormProps extends Omit<NewPrintSlideOverProps, "open"> {}

/** Mounted only while the panel is open, so every opening starts with an empty form. */
const NewPrintForm = ({ onClose, families, onCreated, upload, uploading }: NewPrintFormProps) => {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [familyId, setFamilyId] = useState("");
  const [image, setImage] = useState<ImageAttrs | null>(null);
  const [errors, setErrors] = useState<PrintFormErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const pickImage = async (file: File) => {
    const outcome = await upload(file, "prints");
    if (!outcome.ok) {
      setErrors((previous) => ({ ...previous, image: outcome.message }));
      return;
    }
    setImage(outcome.image);
    setErrors((previous) => ({ ...previous, image: undefined }));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;

    const trimmedName = name.trim();
    const found: PrintFormErrors = {};
    if (trimmedName.length < 2 || trimmedName.length > 80) found.name = "El nombre debe tener entre 2 y 80 caracteres.";
    if (!SKU_PATTERN.test(sku.trim())) found.sku = "El SKU debe tener de 2 a 24 caracteres: letras, números y guiones.";
    if (!familyId) found.family = "Elige una familia.";
    if (!image) found.image = "Sube la imagen de la estampa.";
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length > 0 || !image) return;

    setSaving(true);
    try {
      const print = await createPrint({ name: trimmedName, sku: sku.trim(), family: familyId, image });
      onCreated(print);
      toast({ variant: "success", title: `Estampa «${print.name}» creada` });
      onClose();
    } catch (failure) {
      setFormError(isApiError(failure) ? failure.message : GENERIC_ERROR);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-4" noValidate>
      <Field label="Nombre" value={name} error={errors.name} onChange={(event) => setName(event.target.value)} />
      <Field
        label="SKU"
        value={sku}
        error={errors.sku}
        helper="Letras, números y guiones. No se puede cambiar después sin afectar etiquetas."
        className="font-mono"
        onChange={(event) => setSku(event.target.value.toUpperCase())}
      />
      <SelectField
        label="Familia"
        options={[{ value: "", label: "Elige una familia" }, ...families]}
        value={familyId}
        error={errors.family}
        onChange={(event) => setFamilyId(event.target.value)}
      />
      <div className="flex flex-col gap-1.5">
        <div className="grid grid-cols-[8rem_minmax(0,1fr)] items-start gap-3">
          {image ? (
            <ImageTile url={image.url} alt="Imagen de la estampa" className="aspect-square w-full rounded-nb-sm border-2 border-ink" />
          ) : null}
          <UploadTile
            label={image ? "Reemplazar imagen" : "Subir imagen"}
            hint="JPG, PNG, WEBP o AVIF · 5 MB"
            busy={uploading}
            className="aspect-square w-32"
            onFiles={(files) => void pickImage(files[0] as File)}
          />
        </div>
        {errors.image ? (
          <p role="alert" className="text-xs text-danger">
            {errors.image}
          </p>
        ) : null}
      </div>
      {formError ? (
        <Notice variant="danger" title="No se pudo crear la estampa">
          <p>{formError}</p>
        </Notice>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button onClick={onClose} disabled={saving}>
          Cancelar
        </Button>
        <Button type="submit" variant="primary" loading={saving} disabled={uploading}>
          Crear estampa
        </Button>
      </div>
    </form>
  );
};

/** Creates a print without leaving the product: the new one joins the picker at once. The full Estampas screen is M11b. */
const NewPrintSlideOver = ({ open, onClose, ...rest }: NewPrintSlideOverProps) => (
  <SlideOver open={open} onClose={onClose} title="Nueva estampa">
    <NewPrintForm onClose={onClose} {...rest} />
  </SlideOver>
);

export type { NewPrintSlideOverProps };
export { NewPrintSlideOver };
```

- [ ] **Step 6: Ver que pasa**

Run: `pnpm --filter @gira/web test -- tests/components/NewPrintSlideOver.test.tsx`
Expected: PASS. Si el test «crea la estampa» no encuentra `/Subir imagen/`, es porque tras subirla el rótulo cambia a «Reemplazar imagen»: el test sube una sola vez antes de ese cambio, así que no debería ocurrir; si ocurre, revisar que `pickImage` no se dispare dos veces.

- [ ] **Step 7: Typecheck**

Run: `pnpm --filter @gira/web exec tsc --noEmit`
Expected: sin errores.

- [ ] **Step 8: Punto de revisión** (sin commit).

---

### Task 20: `ProductEditor` — el editor completo

**Files:**
- Create: `apps/web/src/components/catalog/ProductEditor.tsx`
- Test: `apps/web/tests/components/ProductEditor.test.tsx`

- [ ] **Step 1: Escribir el test que falla**

Create `apps/web/tests/components/ProductEditor.test.tsx`:

```tsx
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProductEditor } from "@/components/catalog/ProductEditor";
import { ToastProvider } from "@/components/ui/Toast";
import { ApiError } from "@/lib/api/ApiError";
import type { CatalogOptions } from "@/lib/catalog/catalogOptions";
import { toEditorProduct, toExistingVariant } from "@/lib/catalog/editorProduct";
import {
  CATEGORY_ID,
  PRINT_A_ID,
  PRINT_B_ID,
  PRODUCT_ID,
  VARIANT_A_ID,
  makeImage,
  makeRawProduct,
  makeRawVariant,
} from "../helpers/catalog";

const catalog = vi.hoisted(() => ({ fetchCatalogOptions: vi.fn(), createPrint: vi.fn() }));
vi.mock("@/lib/api/adminCatalog", () => catalog);
const products = vi.hoisted(() => ({
  getEditorProduct: vi.fn(),
  createProduct: vi.fn(),
  updateProduct: vi.fn(),
  retireProduct: vi.fn(),
  reactivateProduct: vi.fn(),
}));
vi.mock("@/lib/api/adminProducts", () => products);
const variants = vi.hoisted(() => ({ listProductVariants: vi.fn(), createVariant: vi.fn(), updateVariant: vi.fn() }));
vi.mock("@/lib/api/adminVariants", () => variants);
const uploads = vi.hoisted(() => ({ uploadImage: vi.fn() }));
vi.mock("@/lib/api/adminUploads", () => uploads);

const { replaceMock, pushMock } = vi.hoisted(() => ({ replaceMock: vi.fn(), pushMock: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/productos",
  useRouter: () => ({ replace: replaceMock, push: pushMock, refresh: vi.fn() }),
}));

const OPTIONS: CatalogOptions = {
  categories: [{ value: CATEGORY_ID, label: "Cosmetiquera" }],
  families: [{ value: "f1", label: "Flora" }],
  prints: [
    { id: PRINT_A_ID, name: "Nopal en flor", sku: "NOP", familyId: "f1", familyName: "Flora", imageUrl: "https://res.cloudinary.com/gira/nopal.jpg" },
    { id: PRINT_B_ID, name: "Monarca", sku: "MON", familyId: "f1", familyName: "Flora", imageUrl: "https://res.cloudinary.com/gira/monarca.jpg" },
  ],
};

const EXISTING_A = toExistingVariant(makeRawVariant({ images: [makeImage("a1")] }));

const renderEditor = (productId: string | null) =>
  render(
    <ToastProvider>
      <ProductEditor productId={productId} />
    </ToastProvider>,
  );

const picker = () => screen.getByRole("region", { name: "Estampas" });

beforeEach(() => {
  [catalog, products, variants, uploads].forEach((group) => Object.values(group).forEach((mock) => mock.mockReset()));
  replaceMock.mockReset();
  pushMock.mockReset();
  catalog.fetchCatalogOptions.mockResolvedValue(OPTIONS);
  products.getEditorProduct.mockResolvedValue(toEditorProduct(makeRawProduct()));
  variants.listProductVariants.mockResolvedValue([EXISTING_A]);
});

describe("ProductEditor · crear", () => {
  it("con datos faltantes marca los campos, no llama al API y avisa", async () => {
    renderEditor(null);
    await screen.findByLabelText("Nombre");
    await userEvent.click(screen.getByRole("button", { name: "Crear producto" }));
    expect(products.createProduct).not.toHaveBeenCalled();
    expect(screen.getByText("Elige una categoría.")).toBeInTheDocument();
    expect(screen.getByText("Indica el peso en gramos para cotizar el envío.")).toBeInTheDocument();
    expect(screen.getByText("Revisa los campos marcados")).toBeInTheDocument();
  });

  it("crea el modelo y sus variantes, y pasa al editor del modelo nuevo", async () => {
    products.createProduct.mockResolvedValue(PRODUCT_ID);
    variants.createVariant.mockResolvedValue({});
    renderEditor(null);
    await userEvent.type(await screen.findByLabelText("Nombre"), "Cosmetiquera chica");
    await userEvent.selectOptions(screen.getByLabelText("Categoría"), CATEGORY_ID);
    await userEvent.type(screen.getByLabelText("Precio base (MXN)"), "189");
    await userEvent.type(screen.getByLabelText("Peso (g)"), "140");
    await userEvent.click(within(picker()).getByRole("button", { name: /Nopal en flor/ }));
    await userEvent.click(screen.getByRole("button", { name: "Crear producto" }));

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith(`/productos/${PRODUCT_ID}`));
    expect(products.createProduct).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Cosmetiquera chica", category: CATEGORY_ID, basePrice: 18900, weightGrams: 140 }),
    );
    expect(variants.createVariant).toHaveBeenCalledWith({ product: PRODUCT_ID, print: PRINT_A_ID, images: [] });
  });

  it("si una variante falla, el modelo ya existe: avisa cuál quedó pendiente y pasa a editar", async () => {
    products.createProduct.mockResolvedValue(PRODUCT_ID);
    variants.createVariant.mockRejectedValue(new ApiError("Ya existe una variante con ese SKU.", "http", 409));
    renderEditor(null);
    await userEvent.type(await screen.findByLabelText("Nombre"), "Cosmetiquera chica");
    await userEvent.selectOptions(screen.getByLabelText("Categoría"), CATEGORY_ID);
    await userEvent.type(screen.getByLabelText("Precio base (MXN)"), "189");
    await userEvent.type(screen.getByLabelText("Peso (g)"), "140");
    await userEvent.click(within(picker()).getByRole("button", { name: /Nopal en flor/ }));
    await userEvent.click(screen.getByRole("button", { name: "Crear producto" }));

    expect(await screen.findByText(/Nopal en flor: Ya existe una variante con ese SKU\./)).toBeInTheDocument();
    expect(screen.getByText("Guardado con pendientes")).toBeInTheDocument();
    expect(replaceMock).toHaveBeenCalledWith(`/productos/${PRODUCT_ID}`);
  });

  it("un error del API al crear el modelo se muestra y no cambia de pantalla", async () => {
    products.createProduct.mockRejectedValue(new ApiError("La categoría no existe.", "http", 400));
    renderEditor(null);
    await userEvent.type(await screen.findByLabelText("Nombre"), "Cosmetiquera chica");
    await userEvent.selectOptions(screen.getByLabelText("Categoría"), CATEGORY_ID);
    await userEvent.type(screen.getByLabelText("Precio base (MXN)"), "189");
    await userEvent.type(screen.getByLabelText("Peso (g)"), "140");
    await userEvent.click(screen.getByRole("button", { name: "Crear producto" }));
    expect(await screen.findByText("La categoría no existe.")).toBeInTheDocument();
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it("sube la foto de tamaño a la carpeta products y la muestra", async () => {
    uploads.uploadImage.mockResolvedValue(makeImage("tamano"));
    renderEditor(null);
    await screen.findByLabelText("Nombre");
    await userEvent.upload(
      screen.getByLabelText(/Subir foto de tamaño/),
      new File(["x"], "tamano.png", { type: "image/png" }),
    );
    expect(await screen.findByRole("img", { name: "Foto de tamaño del modelo" })).toBeInTheDocument();
    expect(uploads.uploadImage).toHaveBeenCalledWith(expect.any(File), "products");
  });

  it("«Nueva estampa» abre el panel", async () => {
    renderEditor(null);
    await screen.findByLabelText("Nombre");
    await userEvent.click(within(picker()).getByRole("button", { name: /Nueva estampa/ }));
    expect(await screen.findByRole("dialog", { name: "Nueva estampa" })).toBeInTheDocument();
  });
});

describe("ProductEditor · editar", () => {
  it("carga el modelo con sus estampas y no deja guardar sin cambios", async () => {
    renderEditor(PRODUCT_ID);
    expect(await screen.findByLabelText("Nombre")).toHaveValue("Cosmetiquera chica");
    expect(screen.getByLabelText("Precio base (MXN)")).toHaveValue("189.00");
    expect(within(picker()).getByRole("button", { name: /Nopal en flor/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Guardar cambios" })).toBeDisabled();
  });

  it("quitar una estampa con variante pide confirmar y, al guardar, la retira", async () => {
    variants.updateVariant.mockResolvedValue({});
    renderEditor(PRODUCT_ID);
    await screen.findByLabelText("Nombre");
    await userEvent.click(within(picker()).getByRole("button", { name: /Nopal en flor/ }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/Tiene 12 en mano/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Quitar estampa" }));

    const save = screen.getByRole("button", { name: "Guardar cambios" });
    expect(save).toBeEnabled();
    await userEvent.click(save);
    await waitFor(() => expect(variants.updateVariant).toHaveBeenCalledWith(VARIANT_A_ID, { isActive: false }));
    expect(products.updateProduct).not.toHaveBeenCalled();
  });

  it("cambiar un dato solo manda ese dato", async () => {
    products.updateProduct.mockResolvedValue(undefined);
    renderEditor(PRODUCT_ID);
    const name = await screen.findByLabelText("Nombre");
    await userEvent.clear(name);
    await userEvent.type(name, "Cosmetiquera mini");
    await userEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(products.updateProduct).toHaveBeenCalledWith(PRODUCT_ID, { name: "Cosmetiquera mini" }));
    expect(variants.updateVariant).not.toHaveBeenCalled();
  });

  it("una estampa con apartados no se puede quitar", async () => {
    variants.listProductVariants.mockResolvedValue([{ ...EXISTING_A, reserved: 2 }]);
    renderEditor(PRODUCT_ID);
    await screen.findByLabelText("Nombre");
    expect(within(picker()).getByRole("button", { name: /Nopal en flor/ })).toBeDisabled();
  });

  it("un error de carga muestra el mensaje y Reintentar vuelve a pedir", async () => {
    products.getEditorProduct.mockRejectedValueOnce(new ApiError("El producto no existe.", "http", 404));
    renderEditor(PRODUCT_ID);
    expect(await screen.findByText("El producto no existe.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByLabelText("Nombre")).toBeInTheDocument();
  });
});

describe("ProductEditor · retirar", () => {
  it("con variantes activas bloquea el botón y manda a Inventario", async () => {
    renderEditor(PRODUCT_ID);
    await screen.findByLabelText("Nombre");
    expect(screen.getByRole("button", { name: "Retirar modelo" })).toBeDisabled();
    expect(screen.getByText(/Tiene 2 variantes activas/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver en Inventario" })).toHaveAttribute(
      "href",
      `/inventario?modelo=${PRODUCT_ID}`,
    );
  });

  it("sin variantes activas pide confirmar y retira", async () => {
    products.getEditorProduct.mockResolvedValue(toEditorProduct(makeRawProduct({ activeVariantCount: 0, variantCount: 0 })));
    variants.listProductVariants.mockResolvedValue([]);
    products.retireProduct.mockResolvedValue(undefined);
    renderEditor(PRODUCT_ID);
    await screen.findByLabelText("Nombre");
    await userEvent.click(screen.getByRole("button", { name: "Retirar modelo" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Retirar modelo" }));
    await waitFor(() => expect(products.retireProduct).toHaveBeenCalledWith(PRODUCT_ID));
  });

  it("si el API responde 409 el diálogo muestra su mensaje y no cierra", async () => {
    products.getEditorProduct.mockResolvedValue(toEditorProduct(makeRawProduct({ activeVariantCount: 0, variantCount: 0 })));
    variants.listProductVariants.mockResolvedValue([]);
    products.retireProduct.mockRejectedValue(new ApiError("No puedes retirar un producto con variantes activas.", "http", 409));
    renderEditor(PRODUCT_ID);
    await screen.findByLabelText("Nombre");
    await userEvent.click(screen.getByRole("button", { name: "Retirar modelo" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Retirar modelo" }));
    expect(await within(dialog).findByText("No puedes retirar un producto con variantes activas.")).toBeInTheDocument();
  });

  it("un modelo retirado ofrece reactivarlo", async () => {
    products.getEditorProduct.mockResolvedValue(toEditorProduct(makeRawProduct({ isActive: false, activeVariantCount: 0 })));
    variants.listProductVariants.mockResolvedValue([]);
    products.reactivateProduct.mockResolvedValue(undefined);
    renderEditor(PRODUCT_ID);
    await screen.findByLabelText("Nombre");
    await userEvent.click(screen.getByRole("button", { name: "Reactivar modelo" }));
    await waitFor(() => expect(products.reactivateProduct).toHaveBeenCalledWith(PRODUCT_ID));
  });
});
```

- [ ] **Step 2: Ver que falla**

Run: `pnpm --filter @gira/web test -- tests/components/ProductEditor.test.tsx`
Expected: FAIL (componente inexistente).

- [ ] **Step 3: Implementar**

Create `apps/web/src/components/catalog/ProductEditor.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { BreadcrumbLabel } from "@/components/shell/BreadcrumbLabel";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Notice } from "@/components/ui/Notice";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { useImageUpload } from "@/hooks/useImageUpload";
import { useProductEditorData } from "@/hooks/useProductEditorData";
import { useProductSave } from "@/hooks/useProductSave";
import { reactivateProduct, retireProduct } from "@/lib/api/adminProducts";
import { isApiError } from "@/lib/api/ApiError";
import { withCurrentCategory, type CatalogOptions, type PickerPrint } from "@/lib/catalog/catalogOptions";
import type { ExistingVariant } from "@/lib/catalog/editorProduct";
import { centsToPesosText } from "@/lib/catalog/money";
import { productPath } from "@/lib/catalog/productId";
import {
  addPrint,
  emptyFormState,
  isDirty,
  removePrint,
  setDraftImages,
  setDraftPrice,
  stateFromBaseline,
  validateModel,
  validateVariantPrices,
  type ModelErrors,
  type ProductBaseline,
  type ProductFormState,
} from "@/lib/catalog/productForm";
import { EditorSection } from "./EditorSection";
import { ModelDataSection } from "./ModelDataSection";
import { NewPrintSlideOver } from "./NewPrintSlideOver";
import { PrintPicker } from "./PrintPicker";
import { PrintPriceOverrides } from "./PrintPriceOverrides";
import { RetireModelSection } from "./RetireModelSection";
import { SaveBar } from "./SaveBar";
import { VariantPhotos } from "./VariantPhotos";

interface ProductEditorProps {
  /** `null` is the create form. */
  productId: string | null;
}

interface EditorFormProps {
  options: CatalogOptions;
  baseline: ProductBaseline | null;
  onReload: () => void;
  onPrintCreated: (print: PickerPrint) => void;
}

const GENERIC_ERROR = "Inténtalo de nuevo en un momento.";

const piecesLabel = (count: number): string => (count === 1 ? "1 en mano" : `${count} en mano`);

const EditorForm = ({ options, baseline, onReload, onPrintCreated }: EditorFormProps) => {
  const router = useRouter();
  const { toast } = useToast();
  const uploader = useImageUpload();
  const saver = useProductSave();
  const formRef = useRef<HTMLDivElement>(null);

  const [state, setState] = useState<ProductFormState>(() => (baseline ? stateFromBaseline(baseline) : emptyFormState()));
  const [errors, setErrors] = useState<ModelErrors>({});
  const [priceErrors, setPriceErrors] = useState<Record<string, string>>({});
  const [sizeError, setSizeError] = useState<string | undefined>(undefined);
  const [activePrintId, setActivePrintId] = useState<string | null>(null);
  const [newPrintOpen, setNewPrintOpen] = useState(false);
  const [pendingRemoval, setPendingRemoval] = useState<ExistingVariant | null>(null);

  const existing = useMemo<ExistingVariant[]>(() => baseline?.variants ?? [], [baseline]);
  const dirty = isDirty(state, baseline);

  // A browser-level guard for reloads and tab closes; in-app navigation is not blocked.
  useEffect(() => {
    if (!dirty) return;
    const guard = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty]);

  const printsById = useMemo(() => new Map(options.prints.map((print) => [print.id, print])), [options.prints]);
  const printNames = useMemo(() => new Map(options.prints.map((print) => [print.id, print.name])), [options.prints]);
  const selectedIds = useMemo(() => new Set(state.selected.map((draft) => draft.printId)), [state.selected]);
  const lockedIds = useMemo(
    () => new Set(existing.filter((variant) => variant.isActive && variant.reserved > 0).map((variant) => variant.printId)),
    [existing],
  );
  const retiredIds = useMemo(
    () => new Set(existing.filter((variant) => !variant.isActive).map((variant) => variant.printId)),
    [existing],
  );
  const categories = baseline
    ? withCurrentCategory(options.categories, baseline.product.categoryId, baseline.product.categoryName)
    : options.categories;
  const activeId = selectedIds.has(activePrintId ?? "") ? activePrintId : (state.selected[0]?.printId ?? null);

  const togglePrint = (printId: string) => {
    if (selectedIds.has(printId)) {
      const current = existing.find((variant) => variant.printId === printId && variant.isActive);
      if (current) setPendingRemoval(current);
      else setState((previous) => removePrint(previous, printId));
      return;
    }
    setState((previous) => addPrint(previous, printId, existing));
    setActivePrintId(printId);
  };

  const pickSizeImage = async (file: File) => {
    setSizeError(undefined);
    const outcome = await uploader.upload(file, "products");
    if (!outcome.ok) {
      setSizeError(outcome.message);
      return;
    }
    setState((previous) => ({ ...previous, sizeImage: outcome.image }));
  };

  const save = async () => {
    const modelErrors = validateModel(state.model);
    const variantErrors = validateVariantPrices(state.selected);
    setErrors(modelErrors);
    setPriceErrors(variantErrors);
    if (Object.keys(modelErrors).length > 0 || Object.keys(variantErrors).length > 0) {
      toast({ variant: "error", title: "Revisa los campos marcados", description: "Hay datos por corregir antes de guardar." });
      requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }

    const outcome = baseline
      ? await saver.saveExisting(baseline.product.id, state, baseline, printNames)
      : await saver.saveNew(state, printNames);

    if (!outcome.ok) {
      toast({ variant: "error", title: "No se pudo guardar", description: outcome.message });
      return;
    }
    if (outcome.failures.length > 0) {
      toast({
        variant: "warning",
        title: "Guardado con pendientes",
        description: outcome.failures.map((failure) => `${failure.printName}: ${failure.message}`).join(" · "),
      });
    } else {
      toast({ variant: "success", title: baseline ? "Cambios guardados" : "Producto creado" });
    }
    if (baseline) onReload();
    else router.replace(productPath(outcome.productId));
  };

  const retire = async () => {
    if (!baseline) return;
    await retireProduct(baseline.product.id);
    toast({ variant: "success", title: `«${baseline.product.name}» retirado` });
    onReload();
  };

  const reactivate = async () => {
    if (!baseline) return;
    try {
      await reactivateProduct(baseline.product.id);
      toast({ variant: "success", title: `«${baseline.product.name}» reactivado` });
      onReload();
    } catch (failure) {
      toast({ variant: "error", title: "No se pudo reactivar", description: isApiError(failure) ? failure.message : GENERIC_ERROR });
    }
  };

  const basePricePlaceholder = state.model.price.trim() || (baseline ? centsToPesosText(baseline.product.basePrice) : "189.00");

  return (
    <div ref={formRef} className="flex flex-col gap-6 pb-24">
      <ModelDataSection
        model={state.model}
        errors={errors}
        categories={categories}
        onChange={(patch) => setState((previous) => ({ ...previous, model: { ...previous.model, ...patch } }))}
        sizePhoto={{
          imageUrl: state.sizeImage?.url ?? null,
          busy: uploader.busy,
          error: sizeError,
          onPick: (file) => void pickSizeImage(file),
          onRemove: () => setState((previous) => ({ ...previous, sizeImage: null })),
        }}
      />

      <EditorSection
        title="Estampas"
        hint="Cada estampa elegida es una variante de este modelo."
        aside={
          <span className="font-mono text-sm font-bold">
            {state.selected.length === 1 ? "1 elegida" : `${state.selected.length} elegidas`}
          </span>
        }
      >
        <PrintPicker
          prints={options.prints}
          selectedIds={selectedIds}
          lockedIds={lockedIds}
          retiredIds={retiredIds}
          onToggle={togglePrint}
          onCreate={() => setNewPrintOpen(true)}
        />
        <PrintPriceOverrides
          drafts={state.selected}
          prints={printsById}
          errors={priceErrors}
          basePricePlaceholder={basePricePlaceholder}
          onChange={(printId, value) => setState((previous) => setDraftPrice(previous, printId, value))}
        />
      </EditorSection>

      <EditorSection title="Fotos por estampa" hint="Elige la estampa y sube sus fotos. La primera es la portada.">
        <VariantPhotos
          drafts={state.selected}
          prints={printsById}
          activePrintId={activeId}
          onSelect={setActivePrintId}
          onImagesChange={(printId, images) => setState((previous) => setDraftImages(previous, printId, images))}
          upload={uploader.upload}
          uploading={uploader.busy}
        />
      </EditorSection>

      {baseline ? (
        <RetireModelSection
          productId={baseline.product.id}
          productName={baseline.product.name}
          isActive={baseline.product.isActive}
          activeVariantCount={baseline.product.activeVariantCount}
          onRetire={retire}
          onReactivate={reactivate}
        />
      ) : null}

      <SaveBar
        dirty={dirty}
        saving={saver.saving}
        submitLabel={baseline ? "Guardar cambios" : "Crear producto"}
        requireDirty={baseline !== null}
        onSave={() => void save()}
        onCancel={() => router.push("/productos")}
      />

      <NewPrintSlideOver
        open={newPrintOpen}
        onClose={() => setNewPrintOpen(false)}
        families={options.families}
        onCreated={onPrintCreated}
        upload={uploader.upload}
        uploading={uploader.busy}
      />

      <ConfirmDialog
        open={pendingRemoval !== null}
        title="Quitar estampa"
        description={
          pendingRemoval
            ? `La variante ${pendingRemoval.sku} se retirará al guardar. Tiene ${piecesLabel(pendingRemoval.onHand)}; el stock se conserva y puedes volver a elegir la estampa.`
            : undefined
        }
        confirmLabel="Quitar estampa"
        tone="danger"
        onCancel={() => setPendingRemoval(null)}
        onConfirm={() => {
          if (pendingRemoval) setState((previous) => removePrint(previous, pendingRemoval.printId));
          setPendingRemoval(null);
        }}
      />
    </div>
  );
};

const EditorSkeleton = () => (
  <div className="flex flex-col gap-6" aria-busy="true">
    <Skeleton className="h-96 w-full" />
    <Skeleton className="h-72 w-full" />
    <Skeleton className="h-56 w-full" />
  </div>
);

/**
 * Create or edit one model on a single page: data, prints (each a variant),
 * and the photos of each print. Loads everything it needs in parallel, then
 * hands a frozen baseline to a form that is keyed by the data version, so a
 * reload after saving starts over from what the server now holds.
 */
const ProductEditor = ({ productId }: ProductEditorProps) => {
  const editor = useProductEditorData(productId);

  if (editor.status === "loading") return <EditorSkeleton />;
  if (editor.status === "error" || !editor.data) {
    return (
      <Notice variant="danger" title="No se pudo cargar el editor">
        <p>{editor.error}</p>
        <Button size="sm" className="mt-2" onClick={editor.reload}>
          Reintentar
        </Button>
      </Notice>
    );
  }

  return (
    <>
      <BreadcrumbLabel label={editor.data.baseline?.product.name ?? "Nuevo producto"} />
      <EditorForm
        key={editor.dataVersion}
        options={editor.data.options}
        baseline={editor.data.baseline}
        onReload={editor.reload}
        onPrintCreated={editor.addCreatedPrint}
      />
    </>
  );
};

export type { ProductEditorProps };
export { ProductEditor };
```

- [ ] **Step 4: Simplificar el retorno del hook (código muerto)**

In `apps/web/src/hooks/useProductEditorData.ts`, en el `return` final, reemplazar la expresión `data: data ?? (status === "ready" ? { options: EMPTY_CATALOG_OPTIONS, baseline: null } : null),` por `data,` y quitar el import no usado `EMPTY_CATALOG_OPTIONS` (queda `import type { CatalogOptions, PickerPrint } from "@/lib/catalog/catalogOptions";`).

- [ ] **Step 5: Ver que pasa**

Run: `pnpm --filter @gira/web test -- tests/components/ProductEditor.test.tsx`
Expected: PASS. Puntos que suelen requerir ajuste fino del test y no del componente: (a) varios elementos con el mismo nombre accesible tras seleccionar una estampa (usar siempre `within(picker())`); (b) el texto del diálogo «Tiene 12 en mano» sale del `onHand` de `makeRawVariant` (12); (c) `ConfirmDialog` y `SlideOver` se pintan en un portal en `document.body`, por eso se consultan con `screen`.

- [ ] **Step 6: Typecheck y lint**

Run: `pnpm --filter @gira/web exec tsc --noEmit` y `pnpm exec eslint apps/web/src/components/catalog apps/web/src/hooks apps/web/src/lib/catalog apps/web/src/lib/api`
Expected: sin errores. (Los 5 errores de lint preexistentes están en `apps/api/.../enviaShippingProvider.ts`, no aquí.)

- [ ] **Step 7: Punto de revisión** (sin commit).

---

### Task 21: Rutas del editor

**Files:**
- Create: `apps/web/src/app/(admin)/productos/nuevo/page.tsx`
- Create: `apps/web/src/app/(admin)/productos/[id]/page.tsx`
- Create: `apps/web/src/app/(admin)/productos/[id]/loading.tsx`

- [ ] **Step 1: Crear las páginas**

Create `apps/web/src/app/(admin)/productos/nuevo/page.tsx`:

```tsx
import type { Metadata } from "next";
import { ProductEditor } from "@/components/catalog/ProductEditor";
import { SectionError } from "@/components/resumen/SectionError";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { PageHeader } from "@/components/ui/PageHeader";

const metadata: Metadata = { title: "Nuevo producto" };

const RENDER_CRASH_MESSAGE = "Esta sección no se pudo mostrar. Actualiza la página para reintentar.";

const NuevoProductoPage = () => (
  <div className="flex flex-col gap-6">
    <PageHeader title="Nuevo producto" subtitle="Un modelo y las estampas con las que se vende." />
    <ErrorBoundary fallback={<SectionError message={RENDER_CRASH_MESSAGE} />}>
      <ProductEditor productId={null} />
    </ErrorBoundary>
  </div>
);

export { metadata };
export default NuevoProductoPage;
```

Create `apps/web/src/app/(admin)/productos/[id]/page.tsx`:

```tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProductEditor } from "@/components/catalog/ProductEditor";
import { SectionError } from "@/components/resumen/SectionError";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { PageHeader } from "@/components/ui/PageHeader";
import { isProductId } from "@/lib/catalog/productId";

const metadata: Metadata = { title: "Editar producto" };

const RENDER_CRASH_MESSAGE = "Esta sección no se pudo mostrar. Actualiza la página para reintentar.";

interface EditarProductoPageProps {
  params: Promise<{ id: string }>;
}

/** The id comes from the URL: anything that is not an id is a 404 before the client asks the API for it. */
const EditarProductoPage = async ({ params }: EditarProductoPageProps) => {
  const { id } = await params;
  if (!isProductId(id)) notFound();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Editar producto" subtitle="Datos del modelo, estampas y fotos." />
      <ErrorBoundary fallback={<SectionError message={RENDER_CRASH_MESSAGE} />}>
        <ProductEditor productId={id} />
      </ErrorBoundary>
    </div>
  );
};

export { metadata };
export default EditarProductoPage;
```

Create `apps/web/src/app/(admin)/productos/[id]/loading.tsx`:

```tsx
import { PageHeader } from "@/components/ui/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";

/** Same geometry as the editor (three islands), so nothing shifts when data lands. */
const EditarProductoLoading = () => (
  <div className="flex flex-col gap-6">
    <PageHeader title="Editar producto" />
    <Skeleton className="h-96 w-full" />
    <Skeleton className="h-72 w-full" />
    <Skeleton className="h-56 w-full" />
  </div>
);

export default EditarProductoLoading;
```

- [ ] **Step 2: Typecheck y build de rutas**

Run: `pnpm --filter @gira/web exec tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Punto de revisión** (sin commit).

---

### Task 22: Verificación completa

Usar `superpowers:verification-before-completion`: cada afirmación lleva su salida real.

- [ ] **Step 1: Compilar shared y tipos**

```bash
pnpm --filter @gira/shared build
pnpm --filter @gira/api typecheck
pnpm --filter @gira/web exec tsc --noEmit
```
Expected: sin errores en los tres.

- [ ] **Step 2: Lint**

```bash
pnpm exec eslint apps/web
```
Expected: 0 errores. (Los 5 `no-base-to-string` de `apps/api/.../enviaShippingProvider.ts` son preexistentes: no se tocan.)

- [ ] **Step 3: Tests**

```bash
pnpm --filter @gira/web test
pnpm --filter @gira/api test
```
Expected: web todo verde (el conteo sube respecto a los 680 de M10); API todo verde (~1351 + los nuevos). Si el API falla `shippingLabel` «éxito tardío» u otro archivo conocido, re-correrlo aislado antes de investigar.

- [ ] **Step 4: Build de producción**

```bash
NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1 pnpm --filter @gira/web build
```
Expected: compila y lista las rutas `/productos`, `/productos/nuevo` y `/productos/[id]`.

- [ ] **Step 5: Recorrido visual en Chromium (1440 y 390)**

Seguir las notas prácticas del encargo. Resumen operativo:

1. `mongod` local en el puerto 27018 con el scratchpad como `--dbpath`, `initiate` con el driver de mongoose (no hay `mongosh`). **Nunca** `.env.development.local` (apunta a Atlas).
2. API con `MONGODB_URI` local, Stripe/Resend/Telegram/Cloudinary/Envía en `""` (`MAIL_FROM` también vacío), con el scratchpad como cwd para que no lea `.env.development.local`. Sin Cloudinary el API usa el stub de subida: las URLs devueltas son `https://stub.local/...`, que la CSP bloquea, así que las fotos subidas se verán como la marca «IMG». Es esperado; el seed usa URLs `https://res.cloudinary.com/demo/image/upload/sample.jpg` para ver imágenes reales.
3. Seed en el scratchpad (`.mts` con symlink `node_modules` → `apps/api/node_modules`) que **se niega a correr** si el host no es `127.0.0.1:27018`: 1 admin con 2FA (secreto TOTP guardado en el scratchpad; `admin@example.com` / `Admin1234`), 4 categorías, 3 familias, 8 estampas, 6 modelos (uno retirado, uno sin variantes, uno con 6+ estampas para el «+N»), variantes con y sin fotos y con `reserved > 0` en una.
4. `next dev` con `NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1` (con `run_in_background`). Playwright-core 1.63 de `~/.npm/_npx/e41f203b7505f1fb`. Entrar por `/login`.
5. Recorrer a 1440 y 390 y registrar `console`/`pageerror` vacíos:
   - **Lista:** tarjetas agrupadas por categoría y A-Z; cambiar «Ordenar por», «Estado» y «Categoría» (la URL queda en español y recargar conserva el filtro); búsqueda con debounce; estado vacío con y sin filtros; estado de carga (throttling o `listProducts` lento); error (API detenida) con «Reintentar»; un modelo retirado en gris con su insignia; un solo botón amarillo.
   - **Crear:** validación (campos marcados, foco al primero, toast); crear con 2 estampas y fotos; «Nueva estampa» (panel lateral, crear, aparece elegida en la cuadrícula); foto de tamaño.
   - **Editar:** quitar una estampa (diálogo con piezas en mano), una con apartados bloqueada, reordenar con las flechas con **separación visible entre botones**, quitar el precio especial, guardar y ver que el modelo se recarga limpio; recargar con cambios sin guardar muestra el aviso del navegador.
   - **Retirar:** bloqueado con variantes activas y enlace a `/inventario?modelo=`; permitido sin ellas; reactivar.
   - **Móvil 390:** sin scroll horizontal (`document.documentElement.scrollWidth <= innerWidth`), barra fija sin tapar el último campo, tarjetas a 2 columnas, estampas y fotos a 2 columnas.
6. Guardar las capturas en el scratchpad y reportar a Manuel las rutas completas.

- [ ] **Step 6: Reporte final de verificación**

Pegar a Manuel la salida real de los pasos 1-4 y el resultado del recorrido. Si algo no se pudo comprobar (por ejemplo, la subida real a Cloudinary), decirlo explícitamente.

- [ ] **Step 7: Punto de revisión.** `git status --short` y `git diff --stat`; entregar a Manuel los comandos (sin ejecutarlos):

```bash
git add packages/shared apps/api apps/web docs/superpowers/specs/2026-10-20-m11a-catalog-products-design.md docs/superpowers/plans/2026-10-20-m11a-catalog-products.md
git commit -m "FEAT: M11a panel de productos (lista por categoría, editor con estampas, fotos por variante y foto de tamaño)"
```

---

### Task 23: Revisión de código

- [ ] **Step 1:** Invocar `superpowers:requesting-code-review` con el diff de la rama contra `main`. El revisor (subagente) debe **verificar contra el API real** (rutas, formas de respuesta, guardas 409) y correr `pnpm exec eslint apps/web`. Foco explícito: (a) que ningún slug, `publicId` o descripción llegue a `PanelProduct` ni a las props de la lista; (b) que toda mutación salga por `browserRequest` y todo id pase por `assertProductId`/`assertVariantId`; (c) carreras del guardado secuencial y de las subidas; (d) el `$lookup` de `adminProductService` (índices, huérfanos); (e) que no haya colores ni fuentes fuera de `tokens.css`/`fonts.ts`.
- [ ] **Step 2:** Aplicar con `superpowers:receiving-code-review` lo que sea correcto; re-correr los comandos de la Task 22 que el cambio afecte.

---

### Task 24: Cierre del milestone

- [ ] **Step 1: Llenar «Pendientes conocidos»** al final de este archivo (sección siguiente), con lo realmente observado. Candidatos ya conocidos al escribir el plan:
  - Fotos subidas y luego quitadas o no guardadas quedan huérfanas en Cloudinary (también las de variantes cuya creación falló).
  - El guardado no es transaccional: modelo y variantes son peticiones separadas; un fallo parcial deja lo creado (se avisa y se reintenta desde el editor).
  - El selector carga hasta 100 estampas activas; más de 100 requiere búsqueda/paginación.
  - Los conteos «N modelos» de cada categoría describen solo la página cargada (100).
  - Sin bloqueo optimista: dos administradores editando el mismo modelo se pisan (gana el último guardado).
  - Las subidas del stub (`https://stub.local`) las bloquea la CSP: solo se ven con Cloudinary real.
  - Retirar una variante con piezas en mano se permite (con confirmación); no se bloquea por stock en mano.
  - `PATCH /variants/:id` y `POST /variants` ahora responden `AdminVariant`: cualquier consumidor externo de `PublicVariant` (id suelto) debe revisarse.
  - Los 3 tests/commands de Sidebar/CommandPalette que asumían «Productos» como «Pronto», si hubo que tocarlos.
  - El `Button` primary sin amarillo en reposo sigue pendiente (System Design).
  - M11b: Estampas, Familias y Categorías (el panel «Nueva estampa» ya crea estampas desde el editor).
- [ ] **Step 2: Actualizar las memorias** (`/Users/manuelarteaga/.claude/projects/-Users-manuelarteaga-Documents-Gira-Clothing/memory/`):
  - `project_milestone_status.md`: agregar un párrafo «M11a (Productos) implementada y verificada el AAAA-MM-DD en rama `feat/m11-catalog-panel` (sin commitear: Manuel hace commit/merge; confirmar con `git merge-base --is-ancestor`)», con spec y plan, dirección visual A, decisiones (foto por variante, foto de tamaño, retirar bloqueando, «Nueva estampa» en panel lateral), cambios al API, conteos de verificación y «sigue M11b» + System Design pospuesto.
  - `project_standards_debt.md`: agregar una línea «ACTUALIZACIÓN (M11a)» con lo resuelto (admin products/variants con DTO propio, `priceOverride` removible) y lo que sigue pendiente.
  - Actualizar la línea del índice `MEMORY.md` de «Milestone status» para mencionar M11a.
- [ ] **Step 3:** Reportar a Manuel y esperar sus comandos de commit/merge. **No** ejecutar `git add`/`commit`/`push`.

---

## Autorrevisión del plan contra el spec

| Requisito del spec | Tarea |
|---|---|
| Dirección A, tarjetas por categoría, filtros (buscar, categoría, estado, orden) en la URL en español | 10, 16 |
| `AdminProduct` (variantCount, activeVariantCount, cover, prints, updatedAt) y orden por categoría | 1, 4 |
| `sizeImage` + carpeta `products` | 2, 3, 19 (SizePhotoField), 20 |
| Fotos por variante (elegir estampa → galería, portada, flechas) | 5, 18 (VariantPhotos) |
| Selector visual de estampas con filtro por familia, «Con apartados», retiradas | 18 (PrintPicker), 11 |
| Precio especial por estampa y `priceOverride: null` | 5, 11, 18 (PrintPriceOverrides) |
| Retirar bloqueando con enlace a Inventario; 409 mostrado | 19 (RetireModelSection), 20 |
| Guardado secuencial con fallos parciales | 14 (useProductSave), 20 |
| Quitar estampa con variante = retirar (confirmación; bloqueo con apartados) | 11 (plan), 20 |
| «Nueva estampa» en panel lateral | 19 (NewPrintSlideOver), 13 (createPrint) |
| Aviso «Cambios sin guardar» + `beforeunload` | 19 (SaveBar), 20 |
| Estados vacío/carga/error con «Reintentar» | 16, 20, 21 |
| Datos recortados en la frontera, `browserRequest`, ids validados | 8, 9, 13 |
| Un solo botón amarillo por pantalla | 16 (NewProductButton variante), 19 (SaveBar) |
| `navigation.ts` activa Productos; breadcrumbs con el nombre | 17, 20 (BreadcrumbLabel) |

Desviaciones con respecto al spec: ver la sección al inicio. En particular, **actualizar el spec** con la desviación 1 (`images` opcional con `withImages`) y la 2 (`cover` cae a `sizeImage`) al cerrar el milestone.

---

## Pendientes conocidos

M11a implementada y verificada el 2026-10-20 (rama `feat/m11-catalog-panel`, sin commitear). Ejecutada con subagentes por lotes (API, lib web, hooks+lista, editor), recorrido visual en Chromium (1440 y 390) contra mongod local 27018 y revisión de código con subagente.

**Verificación:** shared build, tsc API y web, `eslint apps/web` limpios; web 825 tests; `next build` lista `/productos`, `/productos/nuevo`, `/productos/[id]`; API 1373 tests (en la corrida completa falla 1-3 por el flake conocido, distinto en cada corrida: shippingLabel «éxito tardío», adminPrintFamilies, inventoryStats, inventory, un reembolso; todos pasan aislados). Recorrido: lista agrupada y filtros en la URL en español, crear (con «Nueva estampa» y fotos por el stub), editar (quitar estampa con confirmación, bloqueo por apartados, `priceOverride` removido, reordenar), retirar/reactivar, sidebar y breadcrumbs; sin errores de consola.

**Desviaciones respecto al spec:** `AdminVariant.images` solo con `withImages`/lectura individual; `cover` cae a `sizeImage`; «Con apartados» en lugar de «Ya en el modelo»; Estado como `SelectField`; errores de campo del API solo van a toast (el API devuelve un mensaje unido sin llaves de campo); `NewProductButton` usa `router.push`.

**Pendientes conocidos:**
- **Botón primary sin amarillo en reposo** (preexistente): «Nuevo producto», «Crear producto/Guardar cambios» y «Crear estampa» se ven blancos hasta el hover. Milestone de System Design.
- Fotos subidas y luego quitadas, o de variantes cuya creación falló, quedan huérfanas en Cloudinary.
- Fallo parcial al guardar: el guardado no es transaccional; tras un fallo el editor se recarga desde el servidor y las fotos de esas estampas hay que subirlas de nuevo (el aviso lo dice).
- Cada petición de variante/producto relee con la agregación y `productService.updateProduct/deactivateProduct` aún llaman a `getProduct` al final: contra Atlas (~330 ms/op) crear un modelo con 10 estampas tarda ~10-15 s. Quitar el `getProduct` redundante de los servicios.
- Selector de estampas y opciones leen una página de 100 estampas activas: una variante cuya estampa queda fuera es invisible en el selector.
- Los conteos «N modelos» de cada categoría describen solo la página cargada (100).
- Sin bloqueo optimista: dos administradores editando el mismo modelo se pisan.
- Las subidas del stub (`https://stub.local`) las bloquea la CSP; las fotos solo se ven con Cloudinary real (no comprobado con una subida real).
- `activeVariantCount` excluye variantes cuya estampa no existe (`$unwind`) y la guarda del API las cuenta: en ese borde el botón «Retirar» se habilita y el API responde 409 (el diálogo muestra el mensaje).
- Menores del revisor sin aplicar: `NewProductButton` debería ser `Link` (prefetch/nueva pestaña), `EditorSection` usa `aria-label` además del `h2` (usar `aria-labelledby`), errores de subida sin `aria-describedby`, `PanelProduct.variantCount` sin uso, `productService.listProducts` y `variantService.getVariant` ya sin uso, comentario de `adapters/upload/types.ts` aún dice «prints | variants», los validadores del API repiten los límites que ya están en `@gira/shared/constants/catalog` (riesgo de deriva), «Limpiar filtros» conserva `orden`.
- `apps/web/src/app/globals.css` (regla global de cursor en botones) estaba modificado antes de M11a: no es de este milestone; decidir si va a System Design.
- Siguiente: **M11b** (Estampas, Familias, Categorías).
- Nota de proceso: el subagente del recorrido usó los puertos 4100/3100 y, al limpiar, mató y reinició el `next dev` del puerto 3000 de Manuel.
