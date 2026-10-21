# M11c · Familias y Categorías · Plan

Spec: `docs/superpowers/specs/2026-10-20-m11c-families-categories-panel-design.md`. TDD en API y en `lib/`/hooks. Sin `git add/commit/push`.

## Tareas

- [x] **1 · Shared:** tipos `AdminPrintFamily`, `AdminProductCategory`; constantes; reexport en `index.ts`; build.
- [x] **2 · API familias:** tests de DTO (conteos, `activePrints` A–Z y máx. 10, retiradas, orden `-updatedAt`, mutaciones con DTO admin) → `adminPrintFamilyService` + controller + validador con constantes.
- [x] **3 · API categorías:** igual con `adminProductCategoryService`.
- [x] **4 · Web lib:** `lib/taxonomy/{filters,panelTaxon,taxonForm,config}` + `lib/api/adminPrintFamilies|adminProductCategories` con tests.
- [x] **5 · Hooks:** `useTaxonList`, `useTaxonSave` con tests.
- [x] **6 · UI base:** `Modal` (trap de foco, Escape, velo, pie, hoja en móvil) con tests.
- [x] **7 · Componentes:** tabla, filtros, vacío, formulario, sección de retiro, modal, página; tests de retiro bloqueado, panel desde la URL, 404, filtros con `chooseOption`.
- [x] **8 · Rutas y navegación:** `/familias`, `/categorias`, `navigation.ts`, breadcrumbs, ⌘K.
- [x] **9 · Revisión de código y verificación** (shared build, typecheck API/web, eslint, tests web/API, `next build` en copia, recorrido Chromium en copia con `mongod` local 27018, API 4100, web 3100).
- [x] **10 · Cierre:** «Pendientes conocidos», memoria, entregar `git status`/`diff --stat` y comandos.

---

## Pendientes conocidos

M11c implementada y verificada el 2026-10-20 (rama `feat/m11c-families-categories-panel`, sin commitear). Lista en tabla (variante A) y **modal centrado** (variante D, decisión de Manuel; Estampas y Productos siguen con `SlideOver`) de 4 mockups en el scratchpad (no van al repo). Componentes genéricos en `components/taxonomy/`. Ejecutada en línea con TDD en API y `lib/`/hooks, revisión de código con subagente (0 críticos; 3 medios y 1 bajo corregidos) y recorrido en Chromium contra una copia del repo con `mongod` local (27018), API 4100, web 3100; el `next dev` y el API de Manuel (3000/4000) no se tocaron.

**Verificación:** `@gira/shared` build, `tsc` de API y web y `eslint apps/web` limpios; web 1007 tests (126 archivos); `next build` limpio en la copia (`/familias`, `/categorias`); API 1401 tests: en la corrida completa falló 1 distinto cada vez (`shippingLabel`, antes `adminOrderAddress`/`adminPrintFamilies` por 401 de login), todos pasan aislados. Recorrido 1440/390: lista, filtros en la URL en español, abrir/editar/renombrar, retiro bloqueado con enlaces (estampa → `/estampas?estampa=`, modelo → `/productos/<id>`, listado filtrado), confirmar retiro apilado sobre el modal (Escape cierra solo la confirmación), retirar/reactivar, crear con validación, búsqueda, `?familia=` inexistente (404 amable), enlace profundo, categorías, móvil sin desbordes, sin errores de consola salvo el 404 esperado.

**Desviaciones respecto al plan:**
- La página del servidor pasa `kind` (string) y no el `config`: el config lleva funciones y no cruza la frontera servidor→cliente (lo destapó el recorrido, no los tests unitarios; ahora hay `tests/app/taxonomyPages.test.tsx` que lo vigila). `TAXON_PARAMS` evita un aviso del React Compiler.
- Del código viejo se quitaron `listPrintFamilies/getPrintFamily` y equivalentes de categorías (sin consumidores).
- `formatShortDate` nuevo en `lib/format.ts` (la fecha larga no cabía en la celda).
- Correcciones de la revisión: el modal no se puede cerrar mientras guarda ni descarta texto sin confirmar («¿Descartar los cambios?»), una respuesta tardía no cierra lo abierto después, el modal de carga/error tiene `key` propia (foco tras «Reintentar»), orden por nombre con colación `es` (acentos y mayúsculas).

**Pendientes conocidos:**
- **Botón primary sin amarillo en reposo** (preexistente, System Design): «Nueva familia/categoría» y «Guardar cambios» se ven blancos; `Segmented` seleccionado se parchea con `bg-brand!` solo en `TaxonFilters` (mismo parche que `PrintFilters`). Arreglar de raíz y quitar ambos parches.
- CSP sin `img-src` de Cloudinary (de M10); no aplica a estas pantallas.
- `writtenUrls` (patrón heredado de Estampas/Productos) puede conservar una entrada sin consumir si se escriben dos URLs seguidas; una navegación externa a esa misma consulta se ignoraría. Unificar en los tres paneles.
- Las opciones de familia/categoría (`fetchFamilyOptions`, `fetchCatalogOptions`) ahora pagan el `$lookup` de hijos que no usan (100 filas); ofrecer una lectura ligera si el catálogo crece.
- Al fallar el envío, el foco no va al primer campo inválido y el foco inicial del modal cae en la X.
- El orden por nombre de Estampas y Productos sigue siendo binario (solo Familias/Categorías tienen colación).
- Los nombres de familia/categoría pueden repetirse (el slug se desambigua); sin bloqueo optimista entre administradores.
- La lista de hijos del retiro sale de la página cargada: si otro administrador cambió estampas/modelos, muestra datos viejos hasta refrescar.
- Siguiente: **M12** (cupones, clientes, auditoría y ajustes).
