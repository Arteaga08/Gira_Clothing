# M8 · Resumen — segunda ronda de ajustes (dinero solo MXN, productos por periodo, stock por nombre)

> **Al aprobar:** copiar este archivo a `docs/superpowers/plans/2026-08-03-m8-resumen-ajustes-2.md`
> (convención del repo) antes de empezar. Ejecutar con `executing-plans`, tarea por tarea.
> **Rama:** el trabajo de la ronda anterior (`docs/.../2026-08-02-m8-resumen-ajustes.md`) sigue sin
> commitear sobre `main`. Este plan asume que **primero** se resuelve eso (rama nueva +
> commits, ya propuesto y pendiente de tu decisión) antes de arrancar Tarea 1 aquí, para no mezclar
> dos rondas de cambios sin commitear. Si prefieres seguir acumulando sin commitear, dilo y ajusto.

---

## Context

Revisando el mockup en el navegador, Manuel abrió por confusión `resumen-a.html` (la dirección
vieja, previa a como quedó implementado `/resumen` — con panel "Pedidos recientes" que ya no existe
en la app real) en vez de `resumen-c.html` (el mockup de la ronda anterior). De los 5 puntos que
señaló, confirmó que **"Pedidos recientes" no aplica** (era de la pantalla vieja) y pidió avanzar
con los otros cuatro, que sí aplican a la pantalla real:

1. La tarjeta de dinero debe mostrar **solo pesos** — nada de MXN/USD por separado, ni siquiera como
   renglón secundario (la ronda anterior sí dejaba un "+ USD ..." secundario; esto lo quita).
2. Nueva **gráfica de barras** de productos vendidos, con filtro **Hoy/Semana/Mes** y un selector de
   **fecha específica** que reemplaza el rango cuando se usa.
3. El panel **"Más vendidos"** gana el mismo filtro Hoy/Semana/Mes (confirmado: es una pieza
   separada de la gráfica nueva, no la misma cosa — las dos comparten el mismo selector de periodo).
4. **"Stock bajo"** debe mostrar el **nombre del producto**, no el SKU.

**Decisión de alcance para "Hoy/Semana/Mes/fecha específica":** son periodos **anclados al
calendario actual** (hoy = desde medianoche local de hoy; semana = desde el lunes de la semana ISO
en curso; mes = desde el día 1 del mes en curso; fecha específica = ese día calendario completo),
**no** un rango rodante de N días como el resto de la pantalla. Es un patrón común de dashboard
("hoy / este mes") y es la lectura más natural de "vendidos en el día, semanas y mes" — lo trato como
la interpretación de trabajo; si al ver el mockup no es lo que esperabas, se ajusta ahí.

Esto es **independiente** del selector Vista/Rango de la gráfica principal (`?dias=`/`?vista=`): ese
sigue siendo un rango rodante para la tendencia general; este es "qué se vendió en este periodo
puntual", con su propio endpoint y su propio control, porque mezclar ambos conceptos en una sola
API es donde nacen los bugs de "el número no cuadra con lo que dice el selector".

---

## Hallazgos técnicos (ya confirmados por lectura de código)

- **`InventoryStats.lowStockItems`** (`apps/api/src/services/inventoryStatsService.ts`) hoy proyecta
  solo `{ sku, available }` desde `Variant.aggregate`. `Variant.product` es un `ObjectId` hacia
  `Product` — agregar el nombre requiere un `$lookup` a `products` + `$unwind` + proyectar
  `name` como `productName`. Cambio contenido, sin tocar el modelo.
- **No existe agregación por periodo-calendario-actual** en ningún lado: `orderStatsService.ts`
  usa `parseStatsRange` (rango rodante de N días) y `timeseriesStatsService.ts` usa
  `parseDayRange` + `statsBucketing.ts` (rango rodante + bucketing). Ninguno resuelve "desde el
  lunes de esta semana" o "un día calendario específico" — hace falta una función nueva,
  reusando `localDayKey`/`localMidnightUtc` de `parseDayRange.ts` y `mondayOf` de
  `statsBucketing.ts` (ya existen, no se duplican).
- **`GET /admin/orders`/`GET /admin/orders/:id` ya existen** (`adminOrderRoutes.ts`) — quedan sin
  usar aquí porque se descartó "Pedidos recientes", pero confirma que M9 no necesita este trabajo
  repetido.
- **No hay componente Modal/Dialog en `components/ui/`** — tampoco hace falta ya, al descartarse el
  punto 3.
- **El pipeline de `topProducts`** en `orderStatsService.ts` (agrupar por `lines.sku`, sumar `qty`,
  ordenar, topar) es exactamente la forma que este nuevo endpoint necesita — se reusa el patrón,
  parametrizado por la ventana nueva en vez de `parseStatsRange`.

---

## Decisiones de esta ronda

| Decisión | Elección | Por qué |
|---|---|---|
| **Tarjeta de dinero** | Una sola cifra en pesos (`totalMxnEquivalent`), sin mención a USD en la tarjeta. Se conserva una nota de una línea debajo del grupo de KPIs explicando que el equivalente usa la tasa de cada pedido (no un número nuevo, solo texto). | Pedido explícito: "solo debería mostrarse en pesos". La nota no rompe eso — no muestra una cifra en USD, solo explica de dónde sale el peso mostrado. |
| **Nuevo endpoint** | `GET /admin/stats/top-products?period=today\|week\|month\|custom&fecha=YYYY-MM-DD` (fecha obligatoria solo si `period=custom`). Servicio nuevo, reusa la forma del pipeline de `topProducts` ya existente. | Mezclar esto con `/admin/orders/stats` (que ya tiene su propio `?days=`) sería dos selectores de tiempo peleando por la misma URL/estado. Un endpoint chico y de propósito único es más simple de razonar y de testear. |
| **Resolución de periodo** | Nuevo util `apps/api/src/utils/resolveCurrentPeriod.ts`, reusando `localDayKey`/`localMidnightUtc` (`parseDayRange.ts`) y `mondayOf` (`statsBucketing.ts`). `today`/`week`/`month` van desde su ancla hasta **ahora**; `custom` es el día completo (medianoche a medianoche) de la fecha pedida. | Ancla de calendario, no ventana rodante — "esta semana" significa lunes a hoy, no "los últimos 7 días". Reusar los helpers existentes evita una tercera implementación de "qué es medianoche local". |
| **Widget cliente, no RSC puro** | `TopProductsSection.tsx` (`"use client"`) maneja el periodo activo y refetchea con `browserRequest` cada vez que cambia — la página sigue pasando un `initialProducts`/`initialPeriod` (`period=week` por defecto) para que no haya parpadeo en la primera pintura. | El selector de fecha específica es interacción de formulario (`<input type="date">`), y forzar cada cambio de fecha a una navegación de página completa (URL) sería peor UX que un fetch de cliente — es exactamente el mismo patrón que `NotificationBell`/`useOutboxHealth` ya usan para datos que cambian sin recargar la pantalla. |
| **Gráfica de barras nueva** | `TopProductsBarChart.tsx`, mismo tratamiento neobrutalista que `TimeseriesChart` (barras `bg-brand`, borde de tinta), una barra por producto del periodo, alto = unidades, etiqueta = nombre corto del producto. Vive dentro de `TopProductsSection`, arriba de la lista rankeada existente. | Confirmado: son dos piezas (lista + gráfica), no una sola. Comparten el mismo selector de periodo y el mismo fetch — no tiene sentido pedir los datos dos veces. |
| **Stock bajo: nombre en vez de SKU** | `$lookup` a `products` en `inventoryStatsService.ts`, nuevo campo `productName` en `LowStockItem`. El SKU se conserva como subtítulo en mono (sigue siendo el identificador accionable para reabastecer), el nombre del producto pasa a ser el título. | Pedido explícito. El SKU no desaparece del todo porque sigue siendo lo que se busca en Inventario — solo deja de ser lo primero que se lee. |
| **`topProducts` de `/admin/stats/overview` no se toca** | Sigue existiendo tal cual (rango rodante `?dias=`), es una fuente de datos distinta a este endpoint nuevo. | Nada en esta ronda depende de romper ese contrato; el nuevo widget es aditivo. |

---

## Fuera de alcance

- **"Pedidos recientes" + modal.** Descartado — Manuel confirmó que fue confusión por el mockup
  viejo (`resumen-a.html`). Nada que construir aquí.
- **Cambiar el selector Vista/Rango de la gráfica principal.** Sigue siendo el rango rodante de la
  ronda anterior; el periodo Hoy/Semana/Mes es exclusivo del widget de productos.
- **Componente Modal/Dialog reusable.** Ya no hace falta sin el punto 3; se construye cuando M9 lo
  necesite de verdad.

---

## Tarea 1: Backend — resolución de periodo + endpoint de top-products (TDD)

**Files:** new `apps/api/src/utils/resolveCurrentPeriod.ts`,
`apps/api/src/services/topProductsPeriodService.ts` (o función nueva en `orderStatsService.ts` —
decidir al implementar cuál mantiene el archivo más legible); new
`apps/api/src/validators/topProductsValidator.ts`; modify
`apps/api/src/routes/v1/admin/statsRoutes.ts`, `apps/api/src/controllers/statsController.ts`

- [ ] **Paso 1:** tests primero para `resolveCurrentPeriod`: `today` da `[medianoche local de hoy,
  ahora]`; `week` da `[lunes de esta semana ISO, ahora]` (incluir un caso donde "hoy" cae en
  domingo, para que el lunes de esa semana quede en el pasado reciente, no adelante); `month` da
  `[día 1 del mes actual, ahora]`; `custom` con `fecha=YYYY-MM-DD` da exactamente ese día completo
  (medianoche a medianoche), **sin** recortar a "ahora" aunque la fecha sea futura o pasada;
  `fecha` faltante con `period=custom` es un error de validación (400 vía Joi, no un throw del
  util).
- [ ] **Paso 2:** implementar `resolveCurrentPeriod`, reusando `localDayKey`/`localMidnightUtc` de
  `parseDayRange.ts` y `mondayOf` de `statsBucketing.ts` (exportar `mondayOf` si no lo está ya).
- [ ] **Paso 3:** nuevo validador Joi: `period` en `["today","week","month","custom"]` requerido,
  `fecha` como fecha ISO (`YYYY-MM-DD`) requerida solo cuando `period === "custom"` (`Joi.when`).
- [ ] **Paso 4:** nuevo servicio: mismo pipeline que `topProducts` en `orderStatsService.ts`
  (`$match` por `REVENUE_STATUSES` + rango, `$unwind lines`, `$group` por sku, `$sort`, `$limit` —
  usar un límite mayor, p. ej. 10, ya que esta vista es la protagonista, no un resumen lateral).
  Reusar el tipo `TopProduct` de `@gira/shared`, sin inventar un tipo paralelo.
- [ ] **Paso 5:** ruta `GET /admin/stats/top-products`, controlador, respuesta
  `{ period, range: {from,to}, products: TopProduct[] }`.

**Verificación:** `pnpm --filter @gira/api test` (archivos nuevos + tocados) + `pnpm typecheck`.

---

## Tarea 2: Backend — nombre de producto en stock bajo (TDD)

**Files:** modify `apps/api/src/services/inventoryStatsService.ts`,
`packages/shared/src/types/stats.ts`

- [ ] **Paso 1:** test primero: un `Variant` de bajo stock cuyo `Product` tiene `name: "Playera
  oversize"` devuelve `lowStockItems[0].productName === "Playera oversize"` (además de `sku`,
  que se conserva).
- [ ] **Paso 2:** agregar `$lookup: { from: "products", localField: "product", foreignField:
  "_id", as: "productDoc" }` + `$unwind` + proyectar `productName: "$productDoc.name"` en el
  pipeline de `lowStockItems`. Agregar `productName: string` a `LowStockItem` en
  `packages/shared/src/types/stats.ts` y al tipo local del servicio.

**Verificación:** `pnpm --filter @gira/api test` (inventoryStats + statsOverview, que ya cubre este
bloque) + `pnpm typecheck`.

---

## Tarea 3: Frontend — capa de datos del nuevo endpoint

**Files:** new `apps/web/src/lib/api/topProducts.ts`; modify `apps/web/src/lib/api/paths.ts`

- [ ] **Paso 1:** `STATS_TOP_PRODUCTS_PATH` en `paths.ts`.
- [ ] **Paso 2:** `fetchTopProductsForPeriod(period, fecha?)` sobre `browserRequest` (navegador,
  para el widget cliente) **y** una variante servidor `getTopProductsForPeriod(period, fecha?)`
  sobre `serverRequest` (para el fetch inicial de la página, `period=week` por defecto) — mismo
  patrón de dos módulos que ya existe para `/admin/notifications/health`
  (`stats.ts` servidor vs. `outbox.ts` navegador), por la misma razón: `next/headers` no puede
  llegar al bundle de cliente.

**Verificación:** `pnpm --filter @gira/web test tests/lib` + `pnpm typecheck`.

---

## Tarea 4: Frontend — `TopProductsSection` (lista + gráfica + selector de periodo)

**Files:** new `apps/web/src/components/resumen/{TopProductsSection,TopProductsBarChart,
PeriodSelector}.tsx`; modify `apps/web/src/components/resumen/TopProductsPanel.tsx` (o se
convierte en sub-componente de la lista, reusado dentro de la nueva sección); modify
`apps/web/src/app/(admin)/resumen/page.tsx`

- [ ] **Paso 1:** `PeriodSelector` — cuatro controles (Hoy/Semana/Mes + `<input type="date">` para
  "otro día"), estado de cliente (el periodo activo), sin URL — coherente con la decisión de que
  este widget vive fuera del ciclo RSC de la página.
- [ ] **Paso 2:** `TopProductsBarChart` — una barra por producto (`units`), etiqueta = nombre corto,
  mismo tratamiento visual que `TimeseriesChart` (barras `bg-brand`, borde de tinta, `role="img"`
  con `aria-label` describiendo el periodo y el total).
- [ ] **Paso 3:** `TopProductsSection` — junta `PeriodSelector` + `TopProductsBarChart` + la lista
  rankeada (la UI que hoy tiene `TopProductsPanel`, reusada como sub-componente o inline). Recibe
  `initialProducts`/`initialPeriod` de la página, refetchea con `fetchTopProductsForPeriod` en cada
  cambio de periodo, con su propio estado de carga/error (no `SectionError` de la página, ya que
  esto vive fuera de su `Promise.allSettled`).
- [ ] **Paso 4:** `page.tsx` — reemplaza el uso actual de `TopProductsPanel` (alimentado por
  `overview.orders.period.topProducts`) por `TopProductsSection`, alimentado por
  `getTopProductsForPeriod("week")` en el `Promise.allSettled` inicial de la página.

**Verificación:** `pnpm --filter @gira/web test` (suites nuevas + `resumenPage.test.tsx` actualizado)
+ `pnpm lint`.

---

## Tarea 5: Frontend — tarjeta de dinero solo en pesos

**Files:** modify `apps/web/src/components/resumen/KpiRow.tsx`, `tests/components/KpiRow.test.tsx`

- [ ] **Paso 1:** tests primero: con pedidos en MXN y USD, la tarjeta de ingresos muestra **solo**
  `totalMxnEquivalent` formateado, **sin** ningún texto que mencione "USD" en la tarjeta misma.
- [ ] **Paso 2:** quitar el renglón secundario `+ USD ...` de `KpiRow`. El `foot` de la tarjeta pasa
  a ser algo simple (`{paidOrders} pedidos`, o el conteo total de pedidos con ingreso). La nota
  debajo del grupo de KPIs se simplifica a una sola frase sobre la tasa de cambio, sin cifras en
  USD.

**Verificación:** `pnpm --filter @gira/web test tests/components/KpiRow.test.tsx`.

---

## Tarea 6: Cierre

- [ ] **Paso 1:** `pnpm -r build && pnpm typecheck && pnpm lint && pnpm -r test && pnpm audit --prod --audit-level=high`.
- [ ] **Paso 2:** recorrido manual: `GET /admin/stats/top-products?period=today`,
  `...?period=week`, `...?period=month`, `...?period=custom&fecha=2026-07-01` contra la API real;
  `/resumen` con la tarjeta de dinero mostrando solo pesos; cambiar el selector Hoy/Semana/Mes y la
  fecha específica en el widget sin recargar la página; Stock bajo mostrando nombre de producto.
- [ ] **Paso 3:** `git status` + `git diff`, mostrar a Manuel, esperar aprobación explícita antes de
  cualquier `git add`/`commit`.

---

## Gotchas a recordar

1. **`week`/`month` son anclas de calendario, no ventanas rodantes** — "esta semana" es lunes a
   hoy, no "los últimos 7 días". No confundir con el `?dias=`/`?vista=` de la gráfica principal.
2. **`custom` nunca se recorta a "ahora"** — si Manuel elige un día pasado, el rango es ese día
   completo (medianoche a medianoche), sin importar cuándo se consulta.
3. **Reusar `localDayKey`/`localMidnightUtc`/`mondayOf` existentes** — no escribir una tercera
   versión de "qué es medianoche local en Ciudad de México".
4. **El widget de productos vive fuera del `Promise.allSettled` de la página** — tiene su propio
  estado de carga/error porque su selector de periodo cambia sin recargar la pantalla.
5. **La tarjeta de dinero no menciona USD en ningún texto visible**, ni siquiera como conversión
   secundaria — eso fue explícitamente lo que se pidió quitar de la ronda anterior.
6. **`git`:** ninguna tarea ejecuta `git add`/`commit`/`push` sin mostrar el diff y recibir
   aprobación explícita de Manuel.

---

## Cierre (Tarea 6)

- **`pnpm -r build`** (los 3 paquetes, `NEXT_PUBLIC_API_URL` seteada) — verde.
- **`pnpm typecheck`** / **`pnpm lint`** (raíz, los 3 paquetes) — verde.
- **`pnpm -r test`** — `@gira/api` 57 archivos/639 tests verde (sin el flake de `adminVariants.test.ts`
  esta vez), `@gira/web` 45 archivos/272 tests verde. Ambos en cero sin necesidad de reintento.
- **`pnpm audit --prod --audit-level=high`** — sin vulnerabilidades. `git diff` de los cuatro
  `package.json` + `pnpm-lock.yaml` vacío — cero dependencias nuevas.
- **`designTokens.test.ts`** verde — esta ronda no tocó `tokens.css`.
- **Recorrido manual end-to-end** (API real, servidor Next real, cookie de sesión real):
  - `GET /admin/stats/top-products?period=today|week|month` → `200`, `products: []` en base vacía,
    nunca `null`.
  - `GET /admin/stats/top-products?period=custom&fecha=2026-07-01` → rango exacto
    `2026-07-01T06:00:00.000Z` a `2026-07-02T06:00:00.000Z` (medianoche a medianoche en
    America/Mexico_City, UTC-6) — confirma en vivo el caso de "fecha específica" del gotcha #2.
  - Validación: `period=abc` → 400; `period=custom` sin `fecha` → 400; `period=today` con `fecha` →
    400 (rechazado por el `Joi.forbidden()` fuera de `custom`).
  - `GET /admin/stats/overview` con base vacía → `lowStockItems: []`, `topPrints: []`,
    `totalMxnEquivalent: 0` — estructura intacta.
  - `GET /resumen?dias=90&vista=week` con sesión real → `200`; `grep -c "USD"` sobre el HTML
    completo de la página **da 0** — confirma que ninguna mención a USD sobrevive en ningún texto
    visible ni oculto, ni siquiera un `aria-label`; "Más vendidos" presente; el input de fecha
    específica (`aria-label="Buscar un día específico"`) presente; cero "No se pudo cargar esta
    sección"; cero `NaN`.
  - **No verificado con datos reales de productos/stock bajo** (la base de desarrollo está vacía de
    pedidos y variantes en este momento) — la cobertura de `productName` en Stock bajo y del widget
    de productos vendidos descansa en los tests automatizados (que sí siembran datos) más la
    confirmación de que el endpoint no lanza contra la base real. Recomendado un vistazo visual una
    vez que haya pedidos/variantes de verdad en el ambiente.
- **Nota de tooling:** la producción de `pnpm -r build` comparte el directorio `.next` con el
  servidor de desarrollo que quedó corriendo de sesiones anteriores; correr ambos a la vez corrompió
  el caché del dev server dos veces durante esta verificación (`ENOENT` sobre un vendor-chunk). Se
  resolvió matando el proceso, borrando `apps/web/.next` y reiniciando `pnpm dev` limpio — no es un
  bug del código, es fricción del entorno de esta sesión.
- **Pendiente:** tu revisión visual de la pantalla real (el widget de "Más vendidos" con la gráfica
  de barras, el selector Hoy/Semana/Mes/fecha específica, y Stock bajo mostrando nombre de producto)
  una vez que haya datos reales que mostrar — el trabajo de código está completo y verificado por
  los medios anteriores, pero no reemplaza tu propia revisión visual con datos reales.
