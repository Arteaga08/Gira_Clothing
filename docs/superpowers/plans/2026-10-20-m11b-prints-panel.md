# M11b · Panel de Estampas — Plan de implementación

> **Para agentes:** usar superpowers:subagent-driven-development o superpowers:executing-plans. Los pasos usan casillas `- [ ]`. **Regla del proyecto: NO ejecutar `git add/commit/push`**; donde otro plan diría «commit», aquí se detiene y se muestra `git status`/`git diff` a Manuel.

**Goal:** pantalla `/estampas` (dirección A «Vitrina») para listar, crear, editar y retirar/reactivar estampas, con el panel lateral y el retiro bloqueado cuando hay variantes activas.

**Architecture:** el API gana un DTO de admin (`AdminPrint`: conteos + modelos en uso) servido por una agregación (patrón `adminProductService`), y el SKU deja de ser editable. La web replica el patrón de M11a (filtros en la URL en español, hook de lista con refresco silencioso, datos recortados en la frontera, `browserRequest`), con el formulario de estampa generalizado (`PrintForm`) y compartido con el editor de productos.

**Tech Stack:** Express + Mongoose + Joi + Vitest/supertest (API); Next.js App Router + React + Tailwind v4 + Vitest/Testing Library (web); `@gira/shared`.

Spec: `docs/superpowers/specs/2026-10-20-m11b-prints-panel-design.md`. Patrones de referencia: `apps/api/src/services/adminProductService.ts`, `apps/web/src/lib/catalog/filters.ts`, `hooks/useProductList.ts`, `components/catalog/ProductsPage.tsx`.

Comandos base (desde la raíz): `pnpm --filter @gira/shared build` · `pnpm --filter @gira/api exec vitest run <archivo>` · `pnpm --filter @gira/web exec vitest run <archivo>`.

---

## Mapa de archivos

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `packages/shared/src/types/catalog.ts` | modificar | tipo `AdminPrint` |
| `packages/shared/src/constants/catalog.ts` | modificar | `PRINT_NAME_*`, `PRINT_SKU_*` |
| `packages/shared/src/index.ts` | modificar | exportar lo nuevo |
| `apps/api/src/services/adminPrintService.ts` | crear | lectura de admin: agregación con conteos y modelos |
| `apps/api/src/services/printService.ts` | modificar | mutaciones responden `AdminPrint`; sin `sku` en update |
| `apps/api/src/controllers/printController.ts` | modificar | list/detail usan `adminPrintService` |
| `apps/api/src/validators/printValidator.ts` | modificar | límites compartidos; `sku` prohibido en PATCH; orden permitido |
| `apps/api/tests/integration/adminPrints.test.ts` | modificar | tests nuevos |
| `apps/web/src/lib/prints/{printId,filters,panelPrint,printForm}.ts` | crear | ids, filtros de URL, DTO recortado, validación del formulario |
| `apps/web/src/lib/api/adminPrints.ts` | crear | cliente del navegador |
| `apps/web/src/lib/api/adminCatalog.ts` | modificar | `createPrint` se mueve a `adminPrints.ts` |
| `apps/web/src/hooks/{usePrintList,usePrintSave}.ts` | crear | lista con refresco silencioso; guardado/retiro |
| `apps/web/src/components/prints/*` | crear | `PrintsPage`, `PrintFilters`, `PrintCard`, `PrintEmpty`, `PrintForm`, `PrintSlideOver`, `RetirePrintSection`, `NewPrintButton` |
| `apps/web/src/components/catalog/NewPrintSlideOver.tsx` | modificar | usa `PrintForm` |
| `apps/web/src/app/(admin)/estampas/{page,loading}.tsx` | crear | ruta |
| `apps/web/src/lib/navigation.ts` | modificar | `prints.available = true` |

---

## Task 1: Tipos y constantes compartidos

**Files:** `packages/shared/src/types/catalog.ts`, `constants/catalog.ts`, `index.ts`.

- [ ] **Step 1:** en `types/catalog.ts` agregar tras `AdminProduct`:

```ts
/** A model that still has an active variant of a print: the retire guard names them. */
interface AdminPrintProduct {
  id: string;
  name: string;
}

/** Admin catalog row/detail: a print with how much of the catalog uses it. */
interface AdminPrint extends Print {
  /** Every variant of this print, retired or not. */
  variantCount: number;
  activeVariantCount: number;
  /** Models with an active variant of this print, A-Z, at most 10 (one variant per model, so `activeVariantCount` is the true total). */
  activeProducts: AdminPrintProduct[];
  updatedAt: Date;
}
```

y exportar `AdminPrint`, `AdminPrintProduct` en el `export type {}`.

- [ ] **Step 2:** en `constants/catalog.ts` agregar y exportar:

```ts
const PRINT_NAME_MIN = 2;
const PRINT_NAME_MAX = 80;
const PRINT_SKU_MIN = 2;
const PRINT_SKU_MAX = 24;
/** Uppercase letters, digits and hyphens: the SKU feeds every variant SKU. */
const PRINT_SKU_PATTERN = /^[A-Z0-9-]+$/;
```

- [ ] **Step 3:** reexportar ambos en `packages/shared/src/index.ts` (mismo estilo que las demás constantes y tipos de catálogo).
- [ ] **Step 4:** `pnpm --filter @gira/shared build` → compila sin errores.

---

## Task 2: API — `adminPrintService` (TDD)

**Files:** crear `apps/api/src/services/adminPrintService.ts`; tests en `apps/api/tests/integration/adminPrints.test.ts`.

- [ ] **Step 1: tests que fallan** (agregar al `describe` existente, reutilizando `createPrint(cookie, familyId, overrides)` y los helpers de variantes de `adminVariants.test.ts`; para crear variantes usar el helper que ese archivo ya usa, o `POST /admin/variants`):
  - `GET /` devuelve por cada estampa `variantCount`, `activeVariantCount`, `activeProducts` (nombre + id, A-Z) y `updatedAt`.
  - Una estampa con 2 variantes activas y 1 retirada → `variantCount 3`, `activeVariantCount 2`, `activeProducts` con 2 modelos.
  - `activeProducts` se corta a 10 (12 modelos activos → 10 nombres, `activeVariantCount 12`).
  - `?sort=sku` y `?sort=-updatedAt` ordenan; `?sort=family` (no permitido) cae a `name`.
  - `GET /:id` trae lo mismo y 404 si no existe.
  - `?search=` busca en nombre y SKU; `?family=` y `?isActive=` filtran; la `family` viene poblada (`{id,name,slug}`).
- [ ] **Step 2:** `pnpm --filter @gira/api exec vitest run tests/integration/adminPrints.test.ts` → FALLAN los nuevos.
- [ ] **Step 3: implementar** `adminPrintService.ts`:

```ts
import { Types, type PipelineStage } from "mongoose";
import type { AdminPrint, ApiMeta, ImageAttrs } from "@gira/shared";
import { Print } from "../models/Print.js";
import { AppError } from "../utils/AppError.js";
import { parseListQuery, buildMeta, type ListQueryConfig } from "../utils/parseListQuery.js";

/**
 * Admin read model for prints: the print, its family, and how much of the
 * catalog uses it (variant counts and the models behind the active ones),
 * resolved in one aggregation. The variant lookup runs AFTER the page is cut.
 */

const LIST_CONFIG: ListQueryConfig = {
  sortable: ["name", "sku", "updatedAt"],
  searchable: ["name", "sku"],
  defaultSort: "name",
  defaultLimit: 24,
};

const ACTIVE_PRODUCTS_LIMIT = 10;

interface AdminPrintListQuery {
  page?: unknown;
  limit?: unknown;
  sort?: unknown;
  search?: unknown;
  family?: string;
  isActive?: boolean;
}

interface AdminPrintRow {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  sku: string;
  image: ImageAttrs;
  isActive: boolean;
  updatedAt: Date;
  familyDoc: { _id: Types.ObjectId; name: string; slug: string };
  variantDocs: { isActive: boolean; productDoc?: { _id: Types.ObjectId; name: string } }[];
}

const byName = (a: { name: string }, b: { name: string }): number => a.name.localeCompare(b.name, "es");

const toAdminPrint = (row: AdminPrintRow): AdminPrint => {
  const active = row.variantDocs.filter((variant) => variant.isActive);
  const products = active
    .flatMap((variant) => (variant.productDoc ? [{ id: String(variant.productDoc._id), name: variant.productDoc.name }] : []))
    .sort(byName)
    .slice(0, ACTIVE_PRODUCTS_LIMIT);
  return {
    id: String(row._id),
    name: row.name,
    slug: row.slug,
    sku: row.sku,
    family: { id: String(row.familyDoc._id), name: row.familyDoc.name, slug: row.familyDoc.slug },
    image: row.image,
    isActive: row.isActive,
    variantCount: row.variantDocs.length,
    activeVariantCount: active.length,
    activeProducts: products,
    updatedAt: row.updatedAt,
  };
};

const FAMILY_STAGES: PipelineStage[] = [
  { $lookup: { from: "printfamilies", localField: "family", foreignField: "_id", as: "familyDoc" } },
  { $unwind: "$familyDoc" },
];

/** Variants of the print with the model's name; only what the card and the retire guard paint. */
const VARIANTS_LOOKUP: PipelineStage.Lookup = {
  $lookup: {
    from: "variants",
    let: { printId: "$_id" },
    pipeline: [
      { $match: { $expr: { $eq: ["$print", "$$printId"] } } },
      { $project: { isActive: 1, product: 1 } },
      { $lookup: { from: "products", localField: "product", foreignField: "_id", as: "productDoc" } },
      { $unwind: { path: "$productDoc", preserveNullAndEmptyArrays: true } },
      { $project: { isActive: 1, "productDoc._id": 1, "productDoc.name": 1 } },
    ],
    as: "variantDocs",
  },
};

const listAdminPrints = async (
  query: AdminPrintListQuery,
): Promise<{ items: AdminPrint[]; meta: ApiMeta }> => {
  const filters: Record<string, unknown> = {};
  if (query.family) filters.family = new Types.ObjectId(query.family);
  if (query.isActive !== undefined) filters.isActive = query.isActive;

  const { filter, sort, skip, limit, page } = parseListQuery(query, LIST_CONFIG, filters);

  const [result] = await Print.aggregate<{ rows: AdminPrintRow[]; total: { n: number }[] }>([
    { $match: filter },
    ...FAMILY_STAGES,
    {
      $facet: {
        rows: [{ $sort: sort }, { $skip: skip }, { $limit: limit }, VARIANTS_LOOKUP],
        total: [{ $count: "n" }],
      },
    },
  ]);

  const total = result?.total[0]?.n ?? 0;
  return { items: (result?.rows ?? []).map(toAdminPrint), meta: buildMeta(total, { page, limit }) };
};

const getAdminPrintOrThrow = async (id: string): Promise<AdminPrint> => {
  const [row] = await Print.aggregate<AdminPrintRow>([
    { $match: { _id: new Types.ObjectId(id) } },
    ...FAMILY_STAGES,
    VARIANTS_LOOKUP,
  ]);
  if (!row) throw new AppError("El estampado no existe.", 404);
  return toAdminPrint(row);
};

export type { AdminPrintListQuery };
export { listAdminPrints, getAdminPrintOrThrow };
```

  Nota: el orden por `name` usa el índice de collation por defecto de Mongo (sensible a mayúsculas); es el mismo comportamiento que el listado actual, no se cambia.
- [ ] **Step 4:** `printController.list` y `detail` llaman a `listAdminPrints` / `getAdminPrintOrThrow` (quitar `listPrints`/`getPrint` de ese import). El mensaje de respuesta no cambia.
- [ ] **Step 5:** correr el archivo de tests → PASAN.

## Task 3: API — mutaciones con DTO de admin y SKU fijo (TDD)

**Files:** `printService.ts`, `printValidator.ts`, `printController.ts`, `adminPrints.test.ts`.

- [ ] **Step 1: tests que fallan:**
  - `PATCH` con `{ sku: "OTRO-1" }` → 400 y mensaje «El SKU no se puede cambiar.»; el SKU no cambia.
  - `PATCH` con `{ name, family }` sin `sku` sigue funcionando y responde `AdminPrint` (con `variantCount`, `activeProducts`).
  - `POST`, `PATCH` y `DELETE` responden `print` con `variantCount`/`activeVariantCount`/`activeProducts`.
  - `DELETE` con una variante activa → 409 «No puedes retirar un estampado con variantes activas…».
  - `POST` con nombre de 1 carácter / SKU con minúsculas inválidas (`"fl r"`) → 400.
- [ ] **Step 2:** correr → FALLAN.
- [ ] **Step 3:** `printValidator.ts`: importar `PRINT_NAME_MIN/MAX`, `PRINT_SKU_MIN/MAX`, `PRINT_SKU_PATTERN` de `@gira/shared` en vez de los números sueltos; en `updatePrintSchema` reemplazar `sku,` por:

```ts
  sku: Joi.any().forbidden().messages({ "any.unknown": "El SKU no se puede cambiar." }),
```

  y en `printListQuerySchema` no hace falta cambiar nada (el orden lo valida `parseListQuery`).
- [ ] **Step 4:** `printService.ts`: quitar `sku` de `UpdatePrintInput` y la línea `if (input.sku !== undefined) print.sku = input.sku;`; `createPrint`, `updatePrint` y `deactivatePrint` terminan con `return getAdminPrintOrThrow(id)` (en `createPrint`, con `created.id`); quitar `listPrints`, `getPrint`, `toPublicPrint`, `PublicPrint` y los tipos que queden sin uso. Antes de borrar, `grep -rn "listPrints\|getPrint\b\|PublicPrint" apps/api/src` para confirmar que nadie más los usa (el catálogo público tiene los suyos en `catalogService`).
- [ ] **Step 5:** correr `adminPrints.test.ts`, `adminPrintFamilies.test.ts` y `pnpm --filter @gira/api exec tsc --noEmit` → verde. Si algún test viejo asumía `sku` editable, actualizarlo al nuevo contrato.
- [ ] **Step 6:** parada: mostrar `git diff --stat` del API.

---

## Task 4: Web — `lib/prints` (TDD)

**Files (cada uno con su test en `apps/web/tests/lib/prints/`):** `printId.ts`, `filters.ts`, `panelPrint.ts`, `printForm.ts`.

- [ ] **Step 1: tests que fallan:**
  - `printId`: `assertPrintId` acepta un ObjectId y lanza `ApiError` («El identificador de la estampa no es válido.») con otro; `printPath` no aplica (no hay página propia).
  - `filters`: `parsePrintFilters({})` → `{ status: "active", sort: "name", page: 1 }`; lee `q`, `familia` (solo ObjectId), `estado` (`activas|retiradas|todas`), `orden` (`name|sku|updatedAt` con `-`), `page`; `estampa` se ignora aquí; `buildPrintListQuery` produce `isActive`, `family`, `search`, `sort`, `page`, `limit=24`; `toSearchParams` omite valores por defecto; `applyFilterPatch` vuelve a la página 1 salvo cambio de `page`; `hasActiveFilters`.
  - `panelPrint`: recorta a `{ id, name, sku, family: {id,name}, imageUrl, isActive, variantCount, activeVariantCount, activeProducts }` y no deja `slug` ni `publicId`.
  - `printForm`: `validatePrintForm({ name, sku, familyId, image }, "create")` devuelve errores en español (nombre 2-80, SKU `[A-Z0-9-]{2,24}`, familia requerida, imagen requerida); en modo `"edit"` no valida SKU; `toCreateBody`/`toUpdateBody` (solo envía lo que cambió: nombre, familia, imagen; nunca `sku`).
- [ ] **Step 2:** correr → FALLAN.
- [ ] **Step 3: implementar.** `filters.ts` es `lib/catalog/filters.ts` con estos cambios: nombres (`PrintFilters`, `PrintFilterPatch`, `PrintStatus`), `family` en lugar de `category` (URL `familia`), estado `activas|retiradas|todas`, `PRINT_SORT_FIELDS = ["name", "sku", "updatedAt"]`, `DEFAULT_SORT = "name"`, `DEFAULT_LIMIT = 24`, y `parsePrintFilters` también devuelve `selected?: "new" | <id>` solo en una función aparte `parseSelectedPrint(params): string | undefined` (`estampa=nueva` → `"nueva"`, un ObjectId válido → ese id, otra cosa → `undefined`). `toSearchParams(filters, selected?)` agrega `estampa` cuando hay.
  `panelPrint.ts`:

```ts
import type { AdminPrint, Wire } from "@gira/shared";

/** A print as the list and the panel hold it: no slug, no storage id. */
interface PanelPrint {
  id: string;
  name: string;
  sku: string;
  family: { id: string; name: string };
  imageUrl: string;
  isActive: boolean;
  variantCount: number;
  activeVariantCount: number;
  /** At most 10; `activeVariantCount` is the true total. */
  activeProducts: { id: string; name: string }[];
}

const toPanelPrint = (print: Wire<AdminPrint>): PanelPrint => ({
  id: print.id,
  name: print.name,
  sku: print.sku,
  family: { id: print.family.id, name: print.family.name },
  imageUrl: print.image.url,
  isActive: print.isActive,
  variantCount: print.variantCount,
  activeVariantCount: print.activeVariantCount,
  activeProducts: print.activeProducts.map((product) => ({ id: product.id, name: product.name })),
});

export { toPanelPrint };
export type { PanelPrint };
```

  `printForm.ts`: reutiliza las constantes de `@gira/shared` y los mensajes de `NewPrintSlideOver` actuales («El nombre debe tener entre 2 y 80 caracteres.», «El SKU debe tener de 2 a 24 caracteres: letras, números y guiones.», «Elige una familia.», «Sube la imagen de la estampa.»).
- [ ] **Step 4:** correr → PASAN.

## Task 5: Web — cliente HTTP y hooks (TDD)

**Files:** `lib/api/adminPrints.ts`, `hooks/usePrintList.ts`, `hooks/usePrintSave.ts`, tests en `tests/lib/api/adminPrints.test.ts` y `tests/hooks/usePrintList.test.ts` (seguir el estilo de los de productos).

- [ ] **Step 1: tests que fallan:** `listPrints(query)` → `{ prints: PanelPrint[], meta }`; `getPrint(id)`; `createPrint(body)`; `updatePrint(id, body)`; `retirePrint(id)` (DELETE) y `reactivatePrint(id)` (PATCH `{ isActive: true }`), todas con `browserRequest`, el id validado con `assertPrintId` antes de armar la ruta (un id roto no sale a la red); `usePrintList`: carga, cambio de filtros vuelve a «loading», `refresh` silencioso conserva las tarjetas si falla, página fuera de rango llama al callback.
- [ ] **Step 2:** correr → FALLAN.
- [ ] **Step 3: implementar.** `adminPrints.ts` calca `adminProducts.ts` (`ADMIN_PRINTS_PATH`, respuesta `{ prints }` / `{ print }`). `createPrint` pasa de `adminCatalog.ts` a este archivo y devuelve `PickerPrint` como hoy (el editor de productos lo sigue usando; `adminCatalog.ts` lo reexporta si hay más consumidores, si no se borra). `usePrintList` es `useProductList` con `listPrints`/`buildPrintListQuery`/`PanelPrint` y `GENERIC_ERROR = "No se pudieron cargar las estampas."`. `usePrintSave` expone `save(mode, form)`, `retire(id)`, `reactivate(id)` con `{ saving, error }`, mensajes de `ApiError` tal cual (en español) y mensaje genérico «Inténtalo de nuevo en un momento.».
- [ ] **Step 4:** correr → PASAN.

---

## Task 6: Web — componentes de la lista

**Files:** `components/prints/{PrintCard,PrintFilters,PrintEmpty,NewPrintButton}.tsx`, tests en `tests/components/prints/`.

- [ ] **Step 1: tests que fallan:**
  - `PrintCard` (un `<button>`, nombre accesible «Rosas de verano, FLR-001, 6 variantes»; «Sin variantes» con 0, «1 variante» con 1; chip «Retirada» y gris si `!isActive`; llama `onOpen(id)`).
  - `PrintFilters`: búsqueda con debounce de 300 ms (`onChange({ search })`), `SelectField` Familia («Todas» + familias), segmentado Estado (Activas/Retiradas/Todas), `SelectField` «Ordenar por».
  - `PrintEmpty`: con filtros → «Ninguna estampa coincide» + «Limpiar filtros»; sin filtros → «Todavía no hay estampas» + botón secundario «Nueva estampa».
  - `NewPrintButton`: variante `primary` por defecto; llama `onClick`.
- [ ] **Step 2:** correr → FALLAN.
- [ ] **Step 3: implementar**, calcando `ProductCard`/`ProductFilters`/`ProductEmpty`/`NewProductButton`:
  - `PrintCard`: `<button type="button">` con `NB_SURFACE` + `NB_PRESSABLE`, `ImageTile` cuadrada con `border-b-2 border-ink` (`grayscale={!isActive}`), chip «Retirada» arriba a la derecha (`Badge`), nombre en `text-sm font-bold`, fila SKU (`T_DATA`) + chip de familia (`Badge`), línea «N variantes» en `text-xs text-text-secondary`.
  - Rejilla: `grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-[repeat(auto-fill,minmax(14rem,1fr))]` (igual que Productos).
  - `PrintFilters`: `Field` Buscar (`placeholder="Nombre o SKU"`, `maxLength=80`), `SelectField` Familia, `Segmented` Estado, `SelectField` Orden con opciones «Nombre (A–Z)», «SKU», «Actualizadas recientemente».
  - `NewPrintButton`: `Button` con `PlusIcon` y texto «Nueva estampa» (`variant` y `onClick`).
- [ ] **Step 4:** correr → PASAN.

## Task 7: Web — panel lateral (`PrintForm`, `RetirePrintSection`, `PrintSlideOver`)

**Files:** `components/prints/{PrintForm,RetirePrintSection,PrintSlideOver}.tsx`, `components/catalog/NewPrintSlideOver.tsx`; tests en `tests/components/prints/` y el existente `NewPrintSlideOver.test.tsx`.

- [ ] **Step 1: tests que fallan:**
  - `PrintForm` crear: errores de campo en español sin salir a la red; con datos válidos llama `onSubmit` con `{ name, sku, family, image }` recortados; el SKU se escribe en mayúsculas.
  - `PrintForm` editar: el SKU es `readOnly` con texto de ayuda «Fijo una vez creada: las variantes ya lo usan.»; «Guardar cambios» deshabilitado sin cambios; solo envía lo cambiado (nombre/familia/imagen); la familia retirada actual aparece como «Nombre (retirada)».
  - Subida de imagen: usa `useImageUpload` (carpeta `prints`); error de subida junto al campo.
  - `RetirePrintSection`: con `activeVariantCount > 0` → botón «Retirar estampa» deshabilitado, aviso «Esta estampa está en N variantes activas…», enlaces a cada modelo (`/productos/<id>`), «y N más» si `activeVariantCount > activeProducts.length`, y enlace «Ver las N variantes en Inventario» a `/inventario?print=<id>`; sin variantes → «Retirar estampa» pide confirmación (`ConfirmDialog`) y llama `onRetire`; estampa retirada → botón «Reactivar estampa»; un 409 del API se muestra bajo el botón.
  - `PrintSlideOver`: título «Nueva estampa» o el nombre; cierra con Escape y con la X; tras guardar/retirar/reactivar llama `onSaved` (para refrescar la lista) y cierra.
  - `NewPrintSlideOver` (editor de productos) sigue creando y devolviendo la estampa al selector.
- [ ] **Step 2:** correr → FALLAN.
- [ ] **Step 3: implementar.** `PrintForm` extrae el formulario actual de `NewPrintSlideOver` (campos, `pickImage`, validación de `printForm.ts`) con props `{ mode: "create" | "edit", print?: PanelPrint, families: Option[], upload, uploading, saving, error, onSubmit, onCancel }`; el pie con «Cancelar» y el botón `primary` («Crear estampa» / «Guardar cambios») vive en el formulario. `SelectField` de Familia usa `withCurrentCategory`-equivalente (`withCurrentFamily`, nueva función en `lib/catalog/catalogOptions.ts` con su test). `RetirePrintSection` solo se muestra en modo edición. `PrintSlideOver` envuelve el `SlideOver` existente y monta el formulario solo mientras está abierto (como `NewPrintSlideOver` hoy). `NewPrintSlideOver` pasa a ser un envoltorio delgado de `PrintForm` en modo `create`.
- [ ] **Step 4:** correr → PASAN.

---

## Task 8: Web — `PrintsPage`, ruta y navegación

**Files:** `components/prints/PrintsPage.tsx`, `app/(admin)/estampas/{page,loading}.tsx`, `lib/navigation.ts`; tests en `tests/components/prints/PrintsPage.test.tsx` y `tests/lib/navigation.test.ts` (o el que ya cubra Sidebar/CommandPalette).

- [ ] **Step 1: tests que fallan** (mismo armado que `ProductsPage.test.tsx`): pide al API lo que dicen los filtros de la URL; cambiar un filtro escribe la URL en español y vuelve a la página 1; abrir una tarjeta escribe `?estampa=<id>` y abre el panel con esa estampa; «Nueva estampa» escribe `?estampa=nueva`; cerrar el panel lo quita; con `?estampa=<id>` inválido no abre nada; estados de carga (`aria-busy`), vacío con y sin filtros, error con «Reintentar» y refresco fallido que conserva las tarjetas; tras guardar/retirar se refresca la lista; «Estampas» ya no sale como «Pronto» en Sidebar/CommandPalette (ajustar los tests que asumían lo contrario).
- [ ] **Step 2:** correr → FALLAN.
- [ ] **Step 3: implementar.** `PrintsPage` calca `ProductsPage` (URL como fuente de verdad, `writtenUrls`, `seenInitial`) más `selected` en el estado: se abre el panel con la estampa de la lista o, si el id no está en la página cargada, se carga con `getPrint(id)`; las familias salen de `fetchCatalogOptions`-equivalente (`useFamilyOptions`, hook nuevo mínimo que llama a `GET /admin/print-families?limit=100` con `browserRequest` y devuelve `Option[]`, con su test). `page.tsx` calca `productos/page.tsx` (`PageHeader` «Estampas», subtítulo «Las estampas que dan vida a cada modelo.», `ErrorBoundary`, `parsePrintFilters` y `parseSelectedPrint`); el botón amarillo «Nueva estampa» vive en el header de la página como componente cliente (`PrintsHeaderAction` si hace falta para escribir la URL, o se mueve el `PageHeader` dentro de `PrintsPage`; elegir lo que mantenga el Server Component simple). `loading.tsx` con `Skeleton` en la misma geometría. `navigation.ts`: `prints.available = true`.
- [ ] **Step 4:** correr → PASAN. `breadcrumbs.ts` ya resuelve `/estampas` desde la navegación; verificar con su test.

---

## Task 9: Revisión, verificación y cierre

- [ ] **Step 1:** `requesting-code-review` (subagente) sobre el diff completo de la rama; corregir lo que corresponda.
- [ ] **Step 2: verificación** (evidencia real, sin afirmar sin correr):

```
pnpm --filter @gira/shared build
pnpm --filter @gira/api exec tsc --noEmit
pnpm --filter @gira/web exec tsc --noEmit
pnpm exec eslint apps/web
pnpm --filter @gira/web test
NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1 pnpm --filter @gira/web build
pnpm --filter @gira/api test   # flake conocido: si falla 1-3, re-correr aislado antes de investigar
```

- [ ] **Step 3: recorrido en el navegador** contra http://localhost:3000 (el `next dev` de Manuel; el API solo acepta ese origen; no reiniciarlo) a 1440 y 390: lista y filtros en la URL en español, crear (con imagen), editar nombre/familia/imagen, SKU de solo lectura, retiro bloqueado con enlaces, retirar y reactivar una estampa sin variantes, reactivar con la familia retirada (409 visible), listas desplegables propias sin recortes, consola sin errores.
- [ ] **Step 4: memorias:** `project_milestone_status` (M11b hecho, sigue M11c; rama `feat/m11b-prints-panel` por commitear), `project_standards_debt` (línea de M11b), índice `MEMORY.md`.
- [ ] **Step 5:** «Pendientes conocidos» al final de este archivo, con lo realmente observado.
- [ ] **Step 6:** mostrar `git status` y `git diff --stat` y entregar los comandos de commit/merge. **No ejecutarlos.**

---

## Autorrevisión contra el spec

| Requisito del spec | Tarea |
|---|---|
| `AdminPrint` + `activeProducts` (máx. 10) | 1, 2 |
| Agregación, filtros, orden en lista blanca | 2 |
| Mutaciones con DTO de admin, sin relectura redundante | 3 |
| SKU fijo en API (400) y UI (solo lectura) | 3, 7 |
| Constantes compartidas | 1, 3, 4 |
| Filtros en la URL en español; panel en `?estampa=` | 4, 8 |
| Tarjeta de la dirección A, retirada en gris, 2 columnas en móvil | 6 |
| Panel lateral crear/editar con `PrintForm`; `NewPrintSlideOver` lo reutiliza | 7 |
| Retiro bloqueado con modelos, enlace a Inventario y 409 visible | 7 |
| Familia retirada visible y 409 al reactivar | 7, 8 |
| Estados carga/vacío/error con «Reintentar», refresco silencioso | 5, 8 |
| Un solo botón amarillo | 6, 8 |
| Navegación activa | 8 |

---

## Pendientes conocidos

M11b implementada y verificada el 2026-10-20 (rama `feat/m11b-prints-panel`, sin commitear). Dirección A «Vitrina», elegida por Manuel entre 3 mockups (scratchpad, no van al repo). Ejecutada en línea, con TDD en API y `lib/`, revisión de código con subagente (0 críticos, 2 importantes corregidos) y recorrido en Chromium contra una copia del repo con `mongod` local (27018), API en 4100 y web en 3100; el `next dev` y la API de Manuel (3000/4000) no se tocaron.

**Verificación:** `@gira/shared` build, `tsc` de API y web, `eslint apps/web` limpios; web 923 tests (114 archivos); `next build` limpio (hecho en la copia, para no pisar el `.next` del `next dev`; lista `/estampas`); API 1383 tests: en la corrida completa falló 1 (`jobs.test.ts`, `printRes.body.data` indefinido, el flake conocido) y pasa aislado (33/33). Recorrido: lista, filtros en la URL en español, abrir/editar/renombrar, SKU de solo lectura, retiro bloqueado con enlaces a modelos e Inventario, retirar/reactivar, 409 al reactivar con familia retirada, `?estampa=` inexistente (404 amable), lista desplegable propia dentro del panel, móvil 390 sin desbordes, sin errores de consola salvo los 409/404 esperados.

**Desviaciones respecto al plan:**
- `usePrintSave` no expone `fieldErrors`: el formulario valida y muestra sus errores; el hook solo conserva la guardia que impide mandar un cuerpo inválido.
- `createPrint` (devuelve `PickerPrint` para el selector del editor de productos) sigue en `adminCatalog.ts`; el panel usa `createAdminPrint` en `adminPrints.ts`. `NewPrintSlideOver` solo reutiliza el formulario (`PrintForm`), no el hook.
- El `PageHeader` y el botón «Nueva estampa» viven en `PrintsPage` (cliente), no en la página del servidor, porque el botón escribe la URL.
- **Fuera del alcance original, pedido por Manuel:** `SelectField` reescrito como combobox con lista propia en portal (flecha espaciada, sin recortes, teclado completo) y `onChange(value)` en vez del evento; los 7 consumidores y 13 tests migrados (`tests/helpers/select.ts`). Memoria `feedback-custom-select-dropdowns`.
- `createdAt` salió de los órdenes permitidos del listado admin de estampas (no hay consumidores en la web).
- Correcciones del recorrido: el panel abierto desde la URL desajustaba la hidratación (React #418): ahora espera a estar hidratado; el filtro «Estado» no marcaba la opción elegida (ver el primer pendiente) y lleva una clase propia.
- Correcciones de la revisión: valor fuera de las opciones en `SelectField` (no marca ninguna y muestra «Elige una opción»; el filtro conserva una familia retirada como «Familia retirada»), 404 del panel (mensaje y solo «Cerrar»), índice activo acotado y lista que se cierra si el campo se desactiva.

**Pendientes conocidos:**
- **Botón primary sin amarillo en reposo** (preexistente, System Design): «Nueva estampa» y «Crear estampa / Guardar cambios» se ven blancos. Misma raíz: el relleno base de `NB_CONTROL` (`bg-surface`) le gana en la hoja de estilos al de las variantes; `Segmented` seleccionado tiene el mismo problema y aquí se evitó con `bg-brand!` solo en `PrintFilters`. Conviene arreglarlo de raíz en System Design (y quitar ese parche).
- **CSP sin `img-src` de Cloudinary** (de M10): con Cloudinary real las imágenes de estampas no se verían; en el recorrido se usaron imágenes `data:`. La subida real no se probó.
- Reemplazar la imagen de una estampa deja la anterior huérfana en Cloudinary (igual que las fotos de M11a).
- Las opciones de familia (filtro y formulario) leen una página de 100 familias activas.
- El orden por nombre/SKU en Mongo es binario (mayúsculas antes que minúsculas, acentos al final), mientras que `activeProducts` se ordena con `localeCompare("es")`. Igual que el listado anterior.
- Una estampa cuya familia ya no existe desaparece del listado (el detalle responde 404): `$unwind` sin `preserveNull`.
- «y N más» del aviso de retiro sale de `activeVariantCount - activeProducts.length`: con una variante activa cuyo modelo ya no existe, se infla (datos corruptos).
- `SelectField`: la lista queda fuera del `role="dialog"` del panel; falta probarlo con VoiceOver. Pulsar el velo del panel con la lista abierta cierra lista y panel; pulsar la etiqueta con la lista abierta la cierra y la reabre.
- `NewPrintSlideOver` repite el `try/catch` de `usePrintSave.create` (podría usar el hook); `withCurrentCategory` se usa también para familias (solo el nombre engaña).
- Cobertura que se podría ampliar: API con más de una página y `-name`; `usePrintList` descartando una respuesta tardía.
- Sin bloqueo optimista: dos administradores editando la misma estampa se pisan.
- El panel se abre desde la lista cargada; si esa copia está vieja (otro administrador cambió variantes), el aviso de retiro mostrará datos viejos hasta que se refresque la lista.
- Nota de proceso: `next build` pisa el `.next` del `next dev` de Manuel; se compiló en una copia del repo. Los puertos 5051/5052 de la sesión tenían servidores Python viejos (otra sesión) y mi servidor de mockups quedó en `127.0.0.1:5052`.
- Siguiente: **M11c** (Familias y Categorías, mismo patrón: nombre, retirar bloqueado si tiene hijos).
