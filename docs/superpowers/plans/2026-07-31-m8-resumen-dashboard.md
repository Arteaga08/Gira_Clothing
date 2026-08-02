# M8 · Resumen (híbrido A+B) — Implementation Plan

> **Al aprobar:** copiar este archivo a `docs/superpowers/plans/2026-07-31-m8-resumen-dashboard.md`
> (convención del repo) antes de empezar. Ejecutar con `executing-plans`, tarea por tarea.

**Goal:** que `/resumen` exista y sea la pantalla de trabajo del admin. Al cerrar M8, iniciar sesión
aterriza en una pantalla real —banda de atención, KPIs, gráfica, distribución, más vendidos, stock
bajo y salud del outbox—, alimentada por datos reales de `/admin/stats/overview`,
`/admin/stats/timeseries` y `/admin/notifications/health`.

**Rama:** `feat/m8-resumen-dashboard`

---

## Context

M7 está mergeado en `main` (`24e5726`): shell `(admin)`, guard server-side contra `/auth/me`, login
con 2FA y cliente HTTP (`request` → `browserRequest` / `serverRequest`). El UI kit de M6 tiene 17
componentes y `tokens.css` es el único archivo con color.

Pero **`/resumen` no existe**. Es el destino del login (`router.replace("/resumen")`), el objetivo
del ítem «Resumen» del sidebar (`available: true` en `navigation.ts`) y el destino del crumb «Panel».
Hoy los tres llevan a un 404 dentro del shell. M7 lo documentó como «Hueco conocido» y lo confirmó
en vivo contra el API real. **Esta pantalla es exactamente lo que cierra ese hueco.**

Los tres endpoints existen desde M5 y sus DTOs están exportados desde `@gira/shared`
(`Overview`, `TimeseriesStats`, `OutboxHealth`), así que M8 **no toca `apps/api` ni
`packages/shared`**: es un milestone puramente de `apps/web`.

Tres restricciones del contrato del API condicionan el diseño y conviene tenerlas escritas:

1. **`revenue` es un arreglo por moneda, nunca una suma.** `orders.period.revenue: RevenueEntry[]`,
   una entrada por `Currency` presente. El API lo agrupa así a propósito («MXN + USD es un número
   que no significa nada» — [orderStatsService.ts](apps/api/src/services/orderStatsService.ts)). La
   UI muestra dos KPIs de ingreso, jamás un total. Y todo el dinero son **enteros en centavos**.
2. **`alerts` e `inventory` ignoran el rango.** `orders.alerts` se calcula con ventanas absolutas
   (24 h / 72 h / 14 d) y `inventory` es una foto de ahora. Cambiar el selector de 30 a 7 días **no
   los mueve**, y la UI tiene que decirlo o el admin creerá que los números no cuadran.
3. **`byStatus` es disperso.** `Partial<Record<OrderStatus, number>>`, `{}` con base vacía. Cualquier
   estado ausente vale 0; iterar sobre las llaves presentes en vez de sobre el enum produce una
   distribución que cambia de forma según los datos.

**Resultado esperado:** `pnpm dev` + API arriba → login aterriza en `/resumen` con datos reales,
`?dias=7|30|90` funciona con back/forward, el selector de serie cambia la gráfica sin refetch, la
campana del TopBar refleja la cola de notificaciones, y `pnpm -r build/typecheck/lint/test` en verde.

---

## Decisiones cerradas en esta sesión (vinculantes)

| Decisión | Elección | Por qué |
|---|---|---|
| **Riel derecho** | «Stock bajo» + «Más vendidos» apilados en la columna de 1/3. La izquierda (2/3) lleva gráfica + distribución. | *(Decidido por Manuel.)* Al subir «Requiere atención» a banda de ancho completo, el riel de la dirección A queda vacío. Estos dos paneles ya vienen dentro de `/stats/overview`, así que la pantalla se alimenta **solo** de los tres endpoints acordados: cero endpoints nuevos, cero DTOs nuevos. |
| **Salud de notificaciones** | Una 6ª tile «Notificaciones fallidas» en la banda de atención **más** el panel completo al fondo. Un solo fetch alimenta ambos. | *(Decidido por Manuel.)* La tile hace que una cola rota salte donde salta todo lo urgente; el panel conserva el detalle (desglose de la cola + último error) que una tile no puede dar. |
| **Campana en el TopBar** | Sí: `NotificationBell` con contador (`pending + failed`) y polling de 60 s condicionado a `document.visibilityState === "visible"`, más el `IconButton` «Actualizar datos» del mockup. | *(Decidido por Manuel.)* Es el patrón de datos de `DASHBOARD_GUIDELINES` §4 y cierra el pendiente que M7 difirió explícitamente a M8. Vive en el shell, así que su fallo **nunca** puede romper una pantalla: los errores se tragan en silencio (sin badge). |
| **Rango por URL, serie en cliente** | `?dias=7\|30\|90` son `<Link>` reales sobre una página RSC. El selector Pedidos/Ingresos/Unidades es estado cliente **sin refetch**. | *(Decidido por Manuel.)* El rango cambia lo que el servidor tiene que pedir → pertenece a la URL (deep-link, back/forward, cero `useEffect`). La serie **no**: `timeseries` ya devuelve `orders`, `unitsSold` y `revenue[]` en cada punto, así que pedir de nuevo sería tráfico por un dato que ya está en memoria. |
| **Rango en lista blanca `{7, 30, 90}`** | Cualquier otro valor de `?dias=` cae a 30, sin error. | El API acepta 1–365, pero la UI solo ofrece tres. Aceptar `?dias=45` deja el control **sin ningún segmento activo**: un estado que nadie diseñó y que ningún test cubre. La lista blanca hace que `aria-current` sea total y que la tabla de tests sea finita. No es validación de seguridad (el guard y el API ya la hacen), es cierre de estados. |
| **Gráfica a mano, en HTML/CSS** | Barras `<span>` con `style={{ height }}` en un flex, como el mockup. **Ni SVG, ni librería de gráficas.** | El mockup aprobado ya está resuelto así ([resumen-a.html](mockups/resumen-a.html#L190-L253)) y el resultado es idéntico con menos piezas. Agregar `recharts`/`d3` por 30 barras contradice la línea del repo (`cn.ts` sin `clsx`, UI kit sin Radix) y mete su propia capa de tokens a pelear con `tokens.css`. M6 ya lo dejó agendado: «`MiniBarChart` es de M8». |
| **El rayado del día-cero es un token** | `--pattern-zero-bar` en `tokens.css`, consumido como `bg-[image:var(--pattern-zero-bar)]`. | El `repeating-linear-gradient` del mockup referencia dos colores. Escribirlo en el componente es exactamente lo que `designTokens.test.ts` existe para impedir. Mismo razonamiento que `--color-scrim` en M7. |
| **Días sin pedidos se dibujan** | Barra al 6 % con rayado diagonal y `data-zero="true"`, nunca un hueco. | Del mockup, y es correcto: un espacio vacío se lee como «falta el dato», no como «no hubo ventas». El API ya rellena los huecos con ceros (`parseDayRange` garantiza `series.length === days`), así que la UI solo tiene que no esconderlos. |
| **Serie «Ingresos» = MXN** | La gráfica de ingresos grafica solo la entrada `Currency.MXN`, y la leyenda lo dice. | Consecuencia directa de la restricción 1: no hay una serie de «ingresos» que se pueda dibujar sin elegir moneda. MXN es la moneda capturada; USD es derivada ([money.ts](packages/shared/src/enums/money.ts)). |
| **Tres fetches con `Promise.allSettled`, error por sección** | La página pide overview + timeseries + health en paralelo y cada bloque renderiza sus datos **o** su propio `<Notice variant="danger">`. | Un `Promise.all` convierte el fallo del endpoint menos importante (health) en una pantalla en blanco. `ErrorBoundary` no sirve aquí: solo atrapa errores de render de componentes cliente, no un `await` que lanza en un RSC. El aislamiento tiene que ser explícito. |
| **`paths.ts` compartido** | Las tres rutas del API viven en `src/lib/api/paths.ts`, importable desde ambos lados. | `/admin/notifications/health` lo consumen dos módulos: `stats.ts` (servidor, para el panel) y `outbox.ts` (navegador, para la campana). **No pueden ser el mismo archivo**: `server.ts` importa `next/headers`, y arrastrar eso al bundle de un Client Component es error de build. Un archivo de constantes puras es la costura correcta; dos literales que deben coincidir no lo son. |
| **Saludo y fecha en el `PageHeader`, no en el TopBar** | Se respeta la decisión de M7 al pie de la letra, aunque el mockup los dibuje en el TopBar. | Un `TopBar` que renderiza «hoy» es un hydration mismatch garantizado en **las once** pantallas. Aquí lo renderiza el servidor una vez, con `timeZone` explícito, dentro de la única pantalla que trata de hoy. El comentario de [TopBar.tsx](apps/web/src/components/shell/TopBar.tsx#L9-L14) ya reserva este momento. |
| **Segmentado de serie a mano, sin `Tabs`** | Cinco líneas de `role="group"` + `aria-pressed` dentro de `TimeseriesChart`, como el mockup. | `Tabs` del kit emite `role="tab"`, que la APW exige emparejar con un `tabpanel` y `aria-controls`. Aquí no hay tres paneles, hay una gráfica que cambia de serie: `aria-pressed` lo describe con precisión y sin deuda de ARIA. Mismo criterio que el `<kbd>⌘K</kbd>` inline de M7. |
| **Cero componentes nuevos en `components/ui/`** | Todo lo de M8 vive en `src/components/resumen/`. El kit no crece. | Ninguna de estas piezas tiene un segundo consumidor todavía. `StatCard`, `Panel`, `PageHeader`, `Notice`, `EmptyState`, `Skeleton*` y `ORDER_STATUS_BG` cubren el 80 % de la pantalla tal como están. |
| **Cero dependencias nuevas** | Ni librería de gráficas, ni de fechas, ni SWR. Fechas y dinero con `Intl`. | `Intl.NumberFormat`/`DateTimeFormat` resuelven los dos casos con `locale` y `timeZone` explícitos, que es justo lo que un wrapper suele dejar implícito. M8 mantiene la racha: M7 tampoco agregó ninguna. |

---

## Fuera de alcance (no-negociable #5)

- **«Reintentar fallidas».** El botón está en el mockup pero **no existe el endpoint**:
  `notificationRoutes.ts` monta únicamente `GET /health`. Construirlo es trabajo de `apps/api`, no
  de esta pantalla. El panel de salud es de solo lectura y no lleva ese botón.
- **La tile «Estancadas» del panel de salud.** `OutboxHealth.stale` está **hardcodeado a `0`** en
  `notificationService.ts` (campo reservado, documentado en los pendientes de M5). Una métrica que
  siempre vale cero es ruido: se omite. *Si prefieres conservarla por fidelidad al mockup, es una
  tile más y esta viñeta desaparece.*
- **«Pedidos recientes» / «Cola de trabajo».** Los paneles de pedidos del mockup necesitan
  `GET /admin/orders` y acciones de transición: son **M9**.
- **Toast.** Sigue diferido a M9 (M7 lo revisó consumidor por consumidor). M8 no tiene una sola
  mutación: los tres endpoints son GET y el «Actualizar» es un `router.refresh()`.
- **Que las tiles y las filas enlacen a otras pantallas.** En el mockup son `<a href="pedidos.html">`;
  aquí `/pedidos` e `/inventario` no existen hasta M9/M10 y enlazarlos produce 404s. Se renderizan
  como elementos no interactivos y se convierten en `<Link>` en su milestone. Misma regla que el
  `available: false` del sidebar.
- **Modo oscuro, i18n, borrar `mockups/`.** `mockups/` se borra al cerrar M12.

---

## Estructura de archivos

### Nuevos en `apps/web/src`

| Archivo | Responsabilidad |
|---|---|
| `lib/api/paths.ts` | Las tres rutas del API como constantes. Importable desde servidor y navegador. |
| `lib/api/stats.ts` | **Servidor.** `getOverview(days)`, `getTimeseries(days)`, `getOutboxHealth()` sobre `serverRequest` + `expectData`. |
| `lib/api/outbox.ts` | **Navegador.** `fetchOutboxHealth()` sobre `browserRequest`. Solo para la campana. |
| `lib/stats/range.ts` | `RANGE_OPTIONS` (7/30/90) + `parseRangeDays(raw)` puro. |
| `lib/stats/chart.ts` | `CHART_SERIES` + `toChartBars(series, kind)` → `{day, value, heightPercent, isZero}[]` + resumen (total/máx/promedio/días en cero). |
| `lib/stats/attention.ts` | `attentionTilesFrom(alerts, health)` → las 6 tiles con `level: "warn" \| "danger" \| "clear"`. |
| `lib/stats/distribution.ts` | `distributionFrom(byStatus)` → segmentos ordenados con porcentaje + total, sobre el enum completo. |
| `lib/format.ts` | `formatMoneyParts(cents, currency)`, `formatInteger`, `formatLongDate`, `formatShortDay`, `greetingFor`. Todo con `locale` y `timeZone` explícitos. |
| `hooks/useOutboxHealth.ts` | Fetch + `setInterval(60s)` + `visibilitychange` + cleanup con flag `cancelled`. |
| `components/resumen/AttentionBand.tsx` | La banda de ancho completo, cabecera en tinta inversa. |
| `components/resumen/KpiRow.tsx` | Los 4 `StatCard` + la nota de moneda. |
| `components/resumen/RangeSelector.tsx` | Tres `<Link>` a `?dias=`, `aria-current` en el activo. |
| `components/resumen/TimeseriesChart.tsx` | **Cliente.** Segmentado de serie + barras + eje + leyenda. |
| `components/resumen/DistributionPanel.tsx` | Barra apilada `role="img"` + leyenda. |
| `components/resumen/TopProductsPanel.tsx` | «Más vendidos», lista con rango numerado. |
| `components/resumen/LowStockPanel.tsx` | «Stock bajo», SKU + chip con el disponible. |
| `components/resumen/OutboxHealthPanel.tsx` | Tiles de la cola + `Notice` del último error. |
| `components/resumen/SectionError.tsx` | El `Notice variant="danger"` que sustituye a una sección cuyo fetch falló. |
| `components/shell/NotificationBell.tsx` | **Cliente.** Campana + badge numérico. |
| `components/shell/RefreshButton.tsx` | **Cliente.** `router.refresh()`. |
| `app/(admin)/resumen/page.tsx` | RSC: `searchParams`, `Promise.allSettled`, composición. |
| `app/(admin)/resumen/loading.tsx` | Esqueleto con la misma geometría (cero CLS). |

### Existentes a modificar

| Archivo | Cambio |
|---|---|
| `src/styles/tokens.css` | + `--pattern-zero-bar`. **Único cambio de tokens.** |
| `src/components/shell/TopBar.tsx` | + `RefreshButton` y `NotificationBell` a la derecha, antes del disparador ⌘K. |

`src/lib/navigation.ts` **no se toca**: «Resumen» ya está en `available: true`.

---

## Tarea 0: Rama de trabajo

- [ ] **Paso 1:** verificar estado limpio y que M7 quedó mergeado

```bash
git status --short && git branch --show-current
git merge-base --is-ancestor 24e5726 main && echo "M7 en main ✓"
```

Expected: status vacío, rama `main`.

- [ ] **Paso 2:** pedir aprobación a Manuel y crear la rama

```bash
git checkout -b feat/m8-resumen-dashboard
```

> **Regla de ramas:** ninguna rama de milestone se borra sin que
> `git merge-base --is-ancestor feat/m8-resumen-dashboard main` haya salido en verde antes. Ninguna
> tarea ejecuta `git add`/`commit`/`push` sin mostrar `git status` + `git diff` y recibir aprobación
> explícita de Manuel.

---

## Tarea 1: Capa de datos (`lib/api/`) — TDD

**Depends on:** 0. **Files:** create `src/lib/api/{paths,stats,outbox}.ts`, `tests/lib/stats-api.test.ts`

- [ ] **Paso 1:** `paths.ts` — constantes puras, sin imports

```ts
/**
 * Endpoint paths, relative to NEXT_PUBLIC_API_URL (which already ends in
 * /api/v1). They live apart from the modules that call them because
 * `/admin/notifications/health` has two callers on two sides of the
 * server/client boundary: stats.ts (server, next/headers) and outbox.ts
 * (browser). Importing the server module from a Client Component is a build
 * error, and two hand-written copies of a path is a silent 404.
 */
const STATS_OVERVIEW_PATH = "/admin/stats/overview";
const STATS_TIMESERIES_PATH = "/admin/stats/timeseries";
const OUTBOX_HEALTH_PATH = "/admin/notifications/health";
```

- [ ] **Paso 2:** tests primero (`tests/lib/stats-api.test.ts`), con `stubFetch`/`jsonResponse` de
  `tests/helpers/fetchMock.ts` y `vi.mock("next/headers")` como en
  [tests/lib/server.test.ts](apps/web/tests/lib/server.test.ts):

| Caso | Aserción |
|---|---|
| URL de overview | `getOverview(7)` pega a `http://api.test/api/v1/admin/stats/overview?days=7` |
| URL de timeseries | `getTimeseries(90)` lleva `?days=90` |
| health sin query | `getOutboxHealth()` pega a la ruta **pelada**, sin `?days` (el endpoint no acepta query) |
| cookie reenviada | las tres llevan `headers.cookie` y `cache: "no-store"` (herencia de `serverRequest`) |
| desempaquetado | `data` se esparce directo, **sin llave nombrada**: `result.orders.period.totalOrders` |
| 401 | propaga `ApiError` con `status: 401` — la página decide qué hacer, el módulo no traga nada |
| sin `data` | `expectData` lanza `kind: "parse"` |
| navegador | `fetchOutboxHealth()` lleva `credentials: "include"` |

> **Ojo con el desempaquetado:** los endpoints de stats **esparcen `data` directo**
> (`data.orders`, `data.series`, `data.pending`), a diferencia de los CRUD admin que envuelven en
> llave nombrada (`data.product`). Confirmado en `statsOverview.test.ts` y `statsTimeseries.test.ts`.
> Es `request<Overview>` → `expectData(result)`, **sin** `.overview`.

- [ ] **Paso 3:** implementar. Firmas exactas:

```ts
// stats.ts — server only (serverRequest is GET-only by type)
const getOverview = async (days: number): Promise<Wire<Overview>> =>
  expectData(await serverRequest<Overview>(`${STATS_OVERVIEW_PATH}?days=${days}`));
const getTimeseries = async (days: number): Promise<Wire<TimeseriesStats>>;
const getOutboxHealth = async (): Promise<Wire<OutboxHealth>>;

// outbox.ts — browser only
const fetchOutboxHealth = async (): Promise<Wire<OutboxHealth>>;
```

`Wire<T>` ya lo aplica `request<T>()`: `range.from` llega como `string` y
`oldestPendingAt` como `string | null`. **No declarar `Date` en ningún tipo de `apps/web`.**

**Verificación:** `pnpm --filter @gira/web test tests/lib/stats-api.test.ts && pnpm --filter @gira/web typecheck`

---

## Tarea 2: Funciones puras de la pantalla (TDD)

**Depends on:** 0. **Files:** create `src/lib/stats/{range,chart,attention,distribution}.ts`,
`src/lib/format.ts` + un archivo de test por módulo en `tests/lib/`

Van juntas y antes que cualquier componente: son la lógica real de la pantalla y se testean como
tablas, sin DOM y sin `fetch`.

- [ ] **Paso 1:** `range.ts` + `tests/lib/statsRange.test.ts`

```ts
const RANGE_OPTIONS = [7, 30, 90] as const;
const DEFAULT_RANGE_DAYS = 30;
type RangeDays = (typeof RANGE_OPTIONS)[number];
const parseRangeDays = (raw: string | string[] | undefined): RangeDays;
```

Tabla: `"7"`→7 · `"30"`→30 · `"90"`→90 · `undefined`→30 · `"45"`→30 · `"abc"`→30 · `"-1"`→30 ·
`"1e3"`→30 · `["7","90"]`→30 (Next entrega arreglo si el parámetro se repite; un arreglo es entrada
ambigua, no la primera coincidencia).

- [ ] **Paso 2:** `format.ts` + `tests/lib/format.test.ts`

```ts
const LOCALE = "es-MX";
const TIMEZONE = "America/Mexico_City";   // matches parseDayRange in apps/api

/** Money is integer minor units everywhere in the API. Split so the KPI can
 *  render the fraction smaller, as the mockup does: "$34,175" + ".00". */
const formatMoneyParts = (cents: number, currency: Currency): { amount: string; fraction: string };
const formatInteger = (value: number): string;
/** "miércoles, 29 de julio de 2026" — explicit timeZone, never the runtime default. */
const formatLongDate = (instant: Date): string;
/** Day-of-month for the chart axis, from a "YYYY-MM-DD" key. */
const formatShortDay = (dayKey: string): string;
/** "Buenos días" (<12) · "Buenas tardes" (12–18) · "Buenas noches" (>=19), Mexico City hour. */
const greetingFor = (instant: Date): string;
```

Tests: `3417500` MXN → `{amount: "$34,175", fraction: ".00"}` · `0` → `{amount: "$0", fraction: ".00"}`
· USD usa su propio símbolo · `formatLongDate` con una fecha fija devuelve el string exacto **con
`TZ` del proceso cambiado**, para probar que la zona es explícita y no heredada · `greetingFor` en
las tres fronteras · `formatShortDay("2026-07-01")` → `"1"` **sin desfase de un día** (el bug clásico
de parsear `"YYYY-MM-DD"` como UTC y formatearlo en local: parsear los tres números a mano, no con
`new Date(dayKey)`).

- [ ] **Paso 3:** `chart.ts` + `tests/lib/chart.test.ts`

```ts
type ChartSeriesKind = "orders" | "revenue" | "units";
interface ChartBar { day: string; value: number; heightPercent: number; isZero: boolean }
interface ChartSummary { total: number; max: number; average: number; zeroDays: number }
const toChartBars = (series: readonly Wire<TimeseriesPoint>[], kind: ChartSeriesKind):
  { bars: ChartBar[]; summary: ChartSummary };
```

- `revenue` toma **solo** la entrada `Currency.MXN` de cada punto; ausente ⇒ 0.
- `heightPercent = max > 0 ? Math.max(round(value / max * 100), MIN_BAR_PERCENT) : ZERO_BAR_PERCENT`
  con `ZERO_BAR_PERCENT = 6`; `isZero` cuando `value === 0`.
- Tests: máximo → 100 % · serie **toda en cero** → ningún `NaN` ni división por cero, todas
  `isZero` · un día con `revenue: []` cuenta como cero, no se salta · `bars.length ===
  series.length` siempre (los huecos ya vienen rellenos del API) · `summary.average` con un decimal.

- [ ] **Paso 4:** `attention.ts` + `tests/lib/attention.test.ts`

```ts
type AttentionLevel = "warn" | "danger" | "clear";
interface AttentionTile { key: string; label: string; count: number; level: AttentionLevel }
const attentionTilesFrom = (
  alerts: OrderStatsAlerts | undefined,
  health: Wire<OutboxHealth> | undefined,
): AttentionTile[];
```

Tabla de niveles (copia literal de las etiquetas del mockup):

| key | label | > 0 ⇒ | Por qué |
|---|---|---|---|
| `awaitingPreparation` | `Pagadas sin preparar (+24 h)` | `warn` | Trabajo pendiente, no un fallo |
| `stuckInProcessing` | `Atoradas en preparación (+72 h)` | `danger` | Ya se pasó de todo plazo razonable |
| `inTransitTooLong` | `En tránsito demasiado tiempo (+14 d)` | `warn` | Depende de la paquetería |
| `disputed` | `En disputa` | `danger` | Dinero en riesgo |
| `pendingPayment` | `Pendientes de pago (flujo normal)` | **siempre `clear`** | Es el flujo normal; pintarlo de ámbar entrena a ignorar la banda |
| `failedNotifications` | `Notificaciones fallidas` | `danger` | La 6ª tile de la decisión de esta sesión |

Todo en 0 ⇒ `clear`. `alerts`/`health` en `undefined` (su fetch falló) ⇒ esa tile **no se emite**,
no se emite en cero: un cero inventado sobre un fetch caído es mentira.

- [ ] **Paso 5:** `distribution.ts` + `tests/lib/distribution.test.ts`

```ts
interface DistributionSegment { status: OrderStatus; label: string; count: number; percent: number }
const distributionFrom = (byStatus: Partial<Record<OrderStatus, number>>):
  { segments: DistributionSegment[]; total: number };
```

Itera sobre `Object.values(OrderStatus)` (no sobre las llaves presentes), descarta los ceros, ordena
descendente por `count`, y toma `label` de `ORDER_STATUS_LABELS` de `@gira/shared` — **nunca un mapa
local**, misma regla que `StatusChip`. Tests: `{}` → `{segments: [], total: 0}` sin dividir entre
cero · los porcentajes suman ~100 · el orden es descendente · un estado inventado en la entrada no
aparece.

**Verificación:** `pnpm --filter @gira/web test tests/lib && pnpm --filter @gira/web typecheck`

---

## Tarea 3: Token del rayado + `RangeSelector` + `KpiRow` (TDD)

**Depends on:** 2. **Files:** modify `src/styles/tokens.css`; create
`src/components/resumen/{RangeSelector,KpiRow,SectionError}.tsx`,
`tests/components/RangeSelector.test.tsx`

- [ ] **Paso 1:** al final de `tokens.css`, después del bloque `LAYERING`:

```css
  /* ── PATTERNS ── the only gradient in the project ──────────────────────── */
  /* A day with zero orders still draws a bar: an empty slot reads as "missing
     data", a hatched one reads as "no sales". Lives here because it names two
     colours — written in a component it would fail designTokens.test.ts. */
  --pattern-zero-bar: repeating-linear-gradient(
    45deg,
    var(--color-surface-sunken) 0 4px,
    var(--color-surface) 4px 8px
  );
```

- [ ] **Paso 2:** `RangeSelector` (RSC — son enlaces, no hay estado). Tests: renderiza tres enlaces
  `7 d` / `30 d` / `90 d`; el `href` es `/resumen?dias=N`; **solo** el activo lleva
  `aria-current="page"`; el grupo lleva `aria-label="Rango del periodo"`.

> El mockup usa `<button aria-pressed>`; aquí son `<Link>` porque el rango vive en la URL, y para un
> enlace el atributo correcto es `aria-current`, no `aria-pressed`. Mismo control, ARIA honesto.

- [ ] **Paso 3:** `KpiRow` (RSC) — cuatro `StatCard` en `grid-cols-2 xl:grid-cols-4`:

| Label | Valor | `unit` | `foot` | icono |
|---|---|---|---|---|
| `Pedidos` | `period.totalOrders` | — | `{paidOrders} con pago confirmado` | `ShoppingBagOpenIcon` |
| `Ingresos MXN` **(`accent`)** | `formatMoneyParts(mxn.revenue).amount` | `.fraction` | `{mxn.orders} pedidos · ticket {…}` | `CurrencyDollarIcon` |
| `Ingresos USD` | idem con USD | idem | idem | `CurrencyDollarIcon` |
| `Unidades vendidas` | `period.unitsSold` | — | `{inventory.unitsAvailable} disponibles en inventario` | `PackageIcon` |

`accent` va **solo** en «Ingresos MXN» (spec §4: nunca más de un KPI acentuado por pantalla). Una
moneda ausente en `revenue[]` se renderiza en cero, no se oculta: cuatro tarjetas siempre, para que
la fila no cambie de forma entre rangos. Debajo, la nota del mockup en `text-xs text-text-muted`:
«Los ingresos se muestran por moneda: MXN y USD nunca se suman.»

- [ ] **Paso 4:** `SectionError` — `<Notice variant="danger" title="No se pudo cargar esta sección">`
  con el mensaje del `ApiError`. Sin botón de reintento (sería un componente cliente por un
  `location.reload()`); el «Actualizar» del TopBar ya cubre el caso.

**Verificación:**

```bash
pnpm --filter @gira/web test tests/components/RangeSelector.test.tsx tests/designTokens.test.ts
```

Expected: la guardia de tokens sigue verde con `--pattern-zero-bar` dentro del archivo exento.

---

## Tarea 4: `AttentionBand` (TDD)

**Depends on:** 2, 3. **Files:** create `src/components/resumen/AttentionBand.tsx`,
`tests/components/AttentionBand.test.tsx`

- [ ] **Paso 1:** tests. La banda renderiza una tile por entrada de `attentionTilesFrom`; cada tile
  lleva `data-level` con su nivel (los tests leen el atributo, nunca la clase); el conteo va en
  `font-mono`; la sección es `<section aria-labelledby>` con `<h2>Requiere atención</h2>`; con
  `health` en `undefined` hay **cinco** tiles, no seis.
- [ ] **Paso 2:** implementar. `Card`-like a mano porque la banda es la única superficie con
  `shadow-nb-lg` (cabecera en tinta con texto inverso, cuerpo con la rejilla). Rejilla
  `grid-cols-2 md:grid-cols-3 xl:grid-cols-6`. Fondos por nivel: `warn` →
  `bg-[var(--status-pending_payment)]`, `danger` → `bg-[var(--status-disputed)]`, `clear` →
  `bg-surface-raised shadow-none` con texto `text-text-muted`.
- [ ] **Paso 3:** el hint de la cabecera dice lo que la restricción 2 obliga a decir:
  «Ahora mismo, sin importar el rango.» Las tiles **no son enlaces** en M8 (`/pedidos` llega en M9).

**Verificación:** `pnpm --filter @gira/web test tests/components/AttentionBand.test.tsx`

---

## Tarea 5: `TimeseriesChart` (TDD)

**Depends on:** 2. **Files:** create `src/components/resumen/TimeseriesChart.tsx`,
`tests/components/TimeseriesChart.test.tsx`

- [ ] **Paso 1:** tests:
  1. Renderiza exactamente `series.length` barras; las de días en cero llevan `data-zero="true"`.
  2. El contenedor es `role="img"` y su `aria-label` nombra el rango, el total y el máximo.
  3. Click en «Ingresos» cambia la leyenda y las alturas **sin llamar a `fetch`** (`stubFetch` con
     `expect(fetchMock).not.toHaveBeenCalled()`). Es la aserción que protege la decisión de diseño.
  4. `aria-pressed` está en uno y solo uno de los tres botones.
  5. Serie toda en cero → sin `NaN` en ningún `style` y la leyenda dice «Total 0».
  6. El eje etiqueta uno de cada cinco días y es `aria-hidden="true"`.

- [ ] **Paso 2:** implementar (`"use client"`). Estado: `useState<ChartSeriesKind>("orders")`. Datos
  ya serializados por props desde el RSC (`series`, `rangeLabel`) — **nunca** un fetch propio.

```tsx
<span
  className="relative min-w-[8px] flex-1 rounded-t-[4px] border-[1.5px] border-ink bg-brand"
  style={{ height: `${bar.heightPercent}%` }}
  data-zero={bar.isZero ? "true" : undefined}
/>
```

La barra de día cero cambia a `bg-[image:var(--pattern-zero-bar)]`. Scroll horizontal **solo** en el
contenedor (`overflow-x-auto` + `min-w-[34rem] lg:min-w-0`): el body nunca hace scroll horizontal.

- [ ] **Paso 3:** cabecera del `Panel`: título «Pedidos por día» / «Ingresos por día» / «Unidades por
  día» según la serie, `hint` con el rango + `range.timezone` que el API ya devuelve, y el segmentado
  a la derecha. Leyenda: «Pedidos creados» · «Día sin pedidos» · `Total N · Máx N · Prom N/día`.
  Con la serie en ingresos, la leyenda dice **«Ingresos MXN»** explícitamente.

**Verificación:** `pnpm --filter @gira/web test tests/components/TimeseriesChart.test.tsx && pnpm lint`

---

## Tarea 6: Paneles de listas y distribución (TDD)

**Depends on:** 2, 3. **Files:** create
`src/components/resumen/{DistributionPanel,TopProductsPanel,LowStockPanel,OutboxHealthPanel}.tsx`,
`tests/components/resumenPanels.test.tsx`

Los cuatro comparten forma: `Panel` + lista + `EmptyState` cuando no hay datos. Un solo archivo de
test, como `kit-misc.test.tsx` ya hace con nueve componentes del kit.

- [ ] **Paso 1:** `DistributionPanel` — barra apilada de 34 px, `role="img"` con un `aria-label`
  construido de las etiquetas y conteos («14 enviadas, 11 entregadas, …»), leyenda en
  `grid-cols-2 lg:grid-cols-3`. Los fondos salen de `ORDER_STATUS_BG` de
  [components/ui/styles.ts](apps/web/src/components/ui/styles.ts) — el `Record<OrderStatus, string>`
  que ya existe y que tsc obliga a mantener completo. Anchos por `style={{ width: "N%" }}`.
  Vacío ⇒ `EmptyState` con `ChartBarIcon`: «Sin pedidos en el periodo».
- [ ] **Paso 2:** `TopProductsPanel` — filas con rango numerado, `{productName} · {printName}` y el
  `sku` en mono; unidades a la derecha en mono. Vacío ⇒ «Aún no hay ventas en este periodo».
- [ ] **Paso 3:** `LowStockPanel` — SKU en mono como título, «Agotada» / «Stock bajo» como subtítulo,
  y un chip con el número disponible: rojo (`disputed`) en 0, ámbar (`pending_payment`) si
  `0 < available <= threshold`. El `hint` es `Umbral: {lowStockThreshold} · {outOfStock} agotadas,
  {lowStock} bajas` — el umbral **siempre** del payload, nunca una constante. Vacío ⇒ «Todo el stock
  está por encima del umbral». Sin nombre de producto: el API no lo devuelve en este bloque y
  inventarlo sería peor que omitirlo.
- [ ] **Paso 4:** `OutboxHealthPanel` — tiles `Enviadas` / `Pendientes` / `Fallidas` (sin
  «Estancadas», ver Fuera de alcance) y, si `failedSample` trae algo, un `Notice variant="warning"`
  con `type`, `channel`, `attempts` y `lastError` **truncado por el API a 200 caracteres**. Si
  `oldestPendingAt` no es `null`, la línea «La más antigua en cola espera desde las HH:MM». `channel`
  y `type` se muestran con etiqueta en español desde un mapa local `Record<NotificationType, string>`
  — es la única familia de enums sin labels en `@gira/shared`, y tsc obliga a cubrir los siete.

Test transversal de los cuatro: con datos, la lista; con arreglo vacío, el `EmptyState` y **ninguna**
fila.

**Verificación:** `pnpm --filter @gira/web test tests/components/resumenPanels.test.tsx`

---

## Tarea 7: Campana + «Actualizar» en el TopBar (TDD)

**Depends on:** 1. **Files:** create `src/hooks/useOutboxHealth.ts`,
`src/components/shell/{NotificationBell,RefreshButton}.tsx`,
`tests/hooks/useOutboxHealth.test.tsx`, `tests/components/NotificationBell.test.tsx`; modify
`src/components/shell/TopBar.tsx`

Esta tarea toca el **shell**, o sea las once pantallas. La regla que la gobierna: la campana nunca
puede romper una pantalla.

- [ ] **Paso 1:** `useOutboxHealth()` — tests con `vi.useFakeTimers()`:
  - Pide una vez al montar.
  - Vuelve a pedir a los 60 s.
  - Con `document.visibilityState === "hidden"` **no** pide (mock del getter en `document`).
  - Al desmontar limpia el intervalo y el listener, y un fetch en vuelo **no** hace `setState`
    (flag `cancelled`) — de lo contrario cada navegación deja un warning de React.
  - Un rechazo deja `health` en `null` y **no** lanza.

```ts
const POLL_INTERVAL_MS = 60_000;
const useOutboxHealth = (): Wire<OutboxHealth> | null;
```

- [ ] **Paso 2:** `NotificationBell` (`"use client"`). Badge con `pending + failed`; sin datos o en
  cero, **sin badge**. `aria-label` dinámico: `Notificaciones: N pendientes` / `Notificaciones: sin
  pendientes`, y el número del badge va `aria-hidden` porque ya está en el label. **No abre nada** en
  M8 (el mockup tampoco tiene popover): es un indicador. Como no es interactivo más allá de eso, se
  renderiza como `<span role="status">`, no como `<button>` sin acción.

> Un botón que no hace nada al pulsarlo es peor que ningún botón: promete una acción que no existe.
> Cuando M12 traiga una pantalla de notificaciones, se vuelve `<Link>`.

- [ ] **Paso 3:** `RefreshButton` — `IconButton` con `ArrowClockwiseIcon`, `label="Actualizar datos"`,
  `onClick={() => router.refresh()}`, `aria-busy` mientras `useTransition` esté pendiente.
- [ ] **Paso 4:** montarlos en `TopBar` entre el hueco flexible y el disparador ⌘K, en el orden del
  mockup: actualizar → campana → buscar. El test existente de `TopBar` debe seguir verde; si el
  `getByRole("button")` sin nombre se vuelve ambiguo, **corregir el test para que consulte por
  nombre accesible**, no relajar la aserción.

**Verificación:**

```bash
pnpm --filter @gira/web test tests/hooks tests/components/NotificationBell.test.tsx tests/components/TopBar.test.tsx
pnpm lint    # react-hooks: deps del efecto de polling
```

---

## Tarea 8: La página (TDD)

**Depends on:** 3, 4, 5, 6. **Files:** create `src/app/(admin)/resumen/{page.tsx,loading.tsx}`,
`tests/app/resumenPage.test.tsx`

**Es el archivo que cierra el hueco de M7.**

- [ ] **Paso 1:** tests, con el patrón de `adminLayout.test.tsx` (la función `async` se invoca y su
  resultado se pasa a `render`), mockeando `@/lib/api/stats`:

| Caso | Aserción |
|---|---|
| Camino feliz | `<h1>Resumen</h1>`, las 6 tiles, los 4 KPIs, la gráfica, los cuatro paneles |
| `?dias=7` | `getOverview` y `getTimeseries` reciben `7`; el enlace «7 d» lleva `aria-current` |
| `?dias=abc` | ambos reciben `30` y no lanza |
| Falla `timeseries` | la gráfica se sustituye por `SectionError`; **los KPIs siguen ahí** |
| Falla `health` | la banda muestra **5** tiles y el panel de salud es `SectionError` |
| Falla `overview` | KPIs, banda, distribución y las dos listas son `SectionError`; la gráfica sigue |
| Base vacía | ceros en los KPIs y `EmptyState` en los cuatro paneles, **sin `NaN` en el DOM** |

- [ ] **Paso 2:** implementar:

```tsx
export const metadata = { title: "Resumen" };

const ResumenPage = async ({ searchParams }: { searchParams: Promise<SearchParams> }) => {
  const days = parseRangeDays((await searchParams).dias);
  const [overview, timeseries, health] = await Promise.allSettled([
    getOverview(days), getTimeseries(days), getOutboxHealth(),
  ]);
  // …cada sección lee su propio settled result
};
```

- `searchParams` es una `Promise` en Next 15: hay que `await`.
- La página **no** declara `<main>` ni padding propio: `AdminShell` ya envuelve en
  `<main id="main-content" className="flex-1 p-4 lg:px-6">`, y su `PageHeader` es el único `<h1>`.
- `PageHeader`: `title="Resumen"`, `subtitle="{saludo}, {nombre} · {fecha larga}"` renderizado en el
  servidor con `timeZone` explícito, `actions={<RangeSelector/>}`. El nombre sale de `loadSession()`
  — barato, el guard del layout ya calentó la ruta y el resultado no se cachea entre peticiones.
- Rejilla: banda → KPIs → `xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]` con izquierda
  `[gráfica, distribución]` y riel `[stock bajo, más vendidos]` → panel de salud a lo ancho.

- [ ] **Paso 3:** `loading.tsx` — misma geometría con `SkeletonStatCard`, `Skeleton` y `SkeletonRows`.
  Las alturas deben coincidir con las reales o el CLS aparece justo en la pantalla de entrada.

**Verificación:** `pnpm --filter @gira/web test tests/app/resumenPage.test.tsx`

---

## Tarea 9: Verificación de cierre (los 7 puntos del spec §8)

**Depends on:** todas.

- [ ] **Paso 1:** suite completa

```bash
pnpm -r build && pnpm typecheck && pnpm lint && pnpm -r test && pnpm audit --prod --audit-level=high
```

> `pnpm -r build` necesita `NEXT_PUBLIC_API_URL` en el entorno: `lib/config.ts` lanza al importarse.
> **Flake conocido:** `apps/api` falla intermitentemente bajo suite completa por contención de CPU
> (documentado en M5/M6/M7 y en la memoria del proyecto). M8 **no toca `apps/api`**, así que
> cualquier fallo ahí se revalida en aislamiento y se documenta; no es una regresión de este
> milestone. Un fallo en `@gira/web` sí lo es.

- [ ] **Paso 2:** guardias específicas de M8

```bash
pnpm --filter @gira/web test tests/designTokens.test.ts        # ningún color nuevo fuera de tokens.css
grep -rn "z-\[[0-9]\|z-50\|z-40" apps/web/src || echo "sin z-index ad-hoc ✓"
grep -rn "next/headers" apps/web/src/components apps/web/src/hooks || echo "servidor fuera del bundle cliente ✓"
grep -rn "credentials" apps/web/src/lib/api                     # solo en browser.ts
grep -rn "Date(" apps/web/src/lib/stats apps/web/src/components/resumen  # cero Date sobre campos Wire<>
git diff --stat main -- apps/api packages/shared                # debe salir vacío
```

- [ ] **Paso 3:** recorrido manual end-to-end con `apps/api` levantada: login → aterriza en
  `/resumen` **con contenido** (el 404 de M7 desaparece) · `?dias=7`, `?dias=90` y back/forward ·
  `?dias=abc` no rompe · selector de serie sin petición nueva (pestaña Network) · campana con la cola
  real · «Actualizar» refresca los tres bloques · API apagada a media sesión → cada sección muestra
  su propio error y la pantalla no se cae.
- [ ] **Paso 4:** los tres estados forzados por sección (carga con `loading.tsx`, vacío con base
  limpia, error apagando el API), tres breakpoints **390 / 834 / 1440** sin scroll horizontal del
  body —solo la gráfica scrollea—, pasada **solo con teclado** con el foco visible y fuera de la
  sombra dura, y `prefers-reduced-motion: reduce` sin transiciones en las barras.
- [ ] **Paso 5:** checklist de seguridad
  - Cero `Authorization: Bearer`; cero mutaciones (M8 solo hace GET).
  - `serverRequest` sigue siendo GET-only por tipo; `browserRequest` solo en `outbox.ts`.
  - Cero `dangerouslySetInnerHTML`. `lastError` viene del proveedor: se renderiza como texto, nunca
    como HTML.
  - Ninguna variable `NEXT_PUBLIC_*` nueva; ninguna dependencia nueva.
  - El panel de salud no muestra `to` ni `payload` — el API ya los omite, y la UI no los pide.
- [ ] **Paso 6:** escribir la sección **«Pendientes conocidos (post-review)»** al final del plan
  copiado en `docs/superpowers/plans/`, y **borrar de él la sección «Hueco conocido»** del plan de
  M7 dejando la nota de que M8 la cerró.
- [ ] **Paso 7:** mostrar `git status` + `git diff` completo y **esperar aprobación explícita de
  Manuel** antes de cualquier `git add`/`commit`. **Este plan no hace commit por su cuenta.**

---

## Verificación end-to-end (resumen)

| Qué | Comando / evidencia |
|---|---|
| Tipos | `pnpm typecheck` (los 3 paquetes) |
| Build | `pnpm -r build` con `NEXT_PUBLIC_API_URL` seteada |
| Lint | `pnpm lint` |
| Tests | `pnpm -r test` — `@gira/web` con ~12 suites nuevas |
| Dependencias | `pnpm audit --prod --audit-level=high` — M8 **no agrega ninguna** |
| Un solo lugar para color | `designTokens.test.ts` verde con `--pattern-zero-bar` |
| M8 no toca el backend | `git diff --stat main -- apps/api packages/shared` vacío |
| Serie sin refetch | Test 3 de `TimeseriesChart` + pestaña Network |
| Rango en la URL | Deep-link `?dias=90` + back/forward |
| Hueco de M7 cerrado | Login aterriza en `/resumen` con contenido, no en 404 |
| A11y | `role="img"` + `aria-label` en gráfica y distribución; `aria-current` en el rango; teclado completo |
| Responsive | 390 / 834 / 1440 sin scroll horizontal del body |

---

## Gotchas a recordar durante la ejecución

1. **`searchParams` es una `Promise` en Next 15.** `const { dias } = await searchParams`. Sin el
   `await` se obtiene un objeto de promesas y `parseRangeDays` cae al default en silencio.
2. **`byStatus` es disperso.** Iterar sobre `Object.values(OrderStatus)`, no sobre las llaves del
   payload, o la distribución cambia de forma según los datos.
3. **`alerts` e `inventory` ignoran `?dias=`.** La UI tiene que decirlo («Ahora mismo, sin importar
   el rango»); si no, los números parecen inconsistentes con los KPIs.
4. **`revenue: []` es el caso normal**, no un error. `revenue[0]` **no existe** con base vacía:
   siempre buscar por `currency`, nunca por índice.
5. **Dinero en centavos.** Dividir entre 100 **una sola vez**, dentro de `formatMoneyParts`. Un
   `value / 100` suelto en un componente es el bug que reaparece en cada pantalla.
6. **`new Date("2026-07-01")` se parsea como UTC** y formateado en local puede caer un día antes. Las
   llaves `"YYYY-MM-DD"` de `series[].day` se parten a mano en tres números.
7. **`next/headers` envenena el bundle cliente.** `stats.ts` es solo servidor; la campana usa
   `outbox.ts`. Por eso `paths.ts` existe.
8. **`browserRequest` lanza en el servidor** a propósito. El hook solo lo llama dentro de
   `useEffect`, jamás durante el render.
9. **`matchMedia` no existe en jsdom.** El responsive sigue siendo solo CSS (`xl:`), sin
   `useMediaQuery` — introducir uno rompería de golpe todos los tests del shell (gotcha de M7).
10. **El flake de `apps/api`.** M8 no toca el backend: `git diff --stat main -- apps/api` vacío es la
    prueba de que un fallo ahí no es de este milestone.
11. **`Wire<T>` ya está aplicado por `request<T>()`.** Nada en `apps/web` declara `Date`;
    `range.from` es `string` y `oldestPendingAt` es `string | null`.
12. **`stale` siempre vale 0** (hardcodeado en el API, campo reservado). Por eso su tile no se
    construye.
13. **Git:** ninguna tarea ejecuta `git add`/`commit`/`push` sin mostrar el diff y recibir aprobación
    explícita.

---

## Pendientes conocidos (post-review)

**Ejecutado el 2026-07-31.** Verificación final: `pnpm -r build` limpio (`@gira/shared` + `@gira/api` +
`next build`, con `NEXT_PUBLIC_API_URL` seteada en el entorno de build), `pnpm typecheck` limpio (los
3 paquetes), `pnpm lint` limpio (`eslint .` en la raíz). Suites: `@gira/web` en **224/224** verde en
cada corrida (40 archivos de test, ~12 suites nuevas de M8). `@gira/api` en **595/595** verde en la
corrida aislada; en la corrida de `pnpm -r test` completa, `catalogPublic.test.ts` e
`inventoryStats.test.ts` (ninguno tocado por M8) fallaron bajo contención de CPU de la suite completa
y dieron **23/23** en aislamiento — mismo flake documentado en la memoria del proyecto y en el cierre
de M5/M6/M7 (no siempre son los mismos archivos los que lo muestran, lo que confirma que es
contención del host, no un test roto). `git diff --stat main -- apps/api packages/shared` sale vacío:
M8 no tocó ni el backend ni los tipos compartidos. `pnpm audit --prod --audit-level=high`: sin
vulnerabilidades, M8 no agregó dependencias.

### 0. Rama arrancó con estado sucio (no de esta sesión)

Al crear la rama, `main` tenía 6 archivos modificados sin commit (`TopBar.tsx`, `CommandPalette.tsx`,
`Field.tsx`, `StatCard.tsx`, `layout.tsx`, y el plan de M6) — cambios cosméticos de sintaxis Tailwind
v4 (`z-[var(--x)]` → `z-(--x)`) y de formateo, sin lógica nueva. Manuel confirmó llevarlos a la rama de
M8 en vez de descartarlos. Aparecen mezclados en el diff final de esta rama junto con el trabajo de
M8; separarlos en dos commits (o no) es su decisión al revisar `git diff` antes de aprobar.

### 1. Recorrido end-to-end real contra API + MongoDB local (no solo mocks)

Sin navegador disponible en esta sesión (igual que M6/M7), pero se corrió el flujo completo con `curl`
contra `apps/api` real (`next dev` en :3000, API en :4000, Mongo local vía `mongod`) y `apps/web` en
`next start` (build de producción, puerto :3010):

- Se creó un admin de prueba (`m8test-admin2@gira.mx`, sin 2FA — el flujo de 2FA ya quedó verificado
  en vivo en M7), login → `200` + `Set-Cookie` `HttpOnly; SameSite=Strict`.
- `GET /resumen` con esa cookie → **200**, con las seis secciones presentes en el HTML servido:
  KPIs (`Ingresos MXN`, etc.), `Pedidos por día`, `Distribución por estado`, `Más vendidos`,
  `Stock bajo`, `Salud de notificaciones`. Saludo y fecha reales: «Buenas tardes, M8 Test Admin 2 ·
  viernes, 31 de julio de 2026». **Cero** ocurrencias de `NaN` y **cero** `SectionError` en el HTML —
  base vacía (sin pedidos) responde con ceros limpios en vez de errores.
- `?dias=7` → el `<a href="/resumen?dias=7">` correcto lleva `aria-current="page"`; `?dias=abc` →
  `200` sin lanzar (cae a 30, confirmado también por el test unitario de `parseRangeDays`).
- `GET /login` con cookie de admin → `307` a `/resumen` (guard inverso, sin cambios de M7).
- `GET /resumen` sin cookie → `307` a `/login` (guard, sin cambios de M7).
- En build de producción (`next start`): `/kit` sin cookie → `307` a `/login`; con cookie de admin →
  `404` real (mismo comportamiento de doble capa documentado en M7, no afectado por M8); `/resumen`
  con cookie de admin → `200`.
- El usuario de prueba se borró de la base al cerrar la verificación.

**Lo que sigue pendiente y requiere un navegador real:** los tres breakpoints (390/834/1440) vistos,
el scroll horizontal solo en la gráfica (nunca en el body), una pasada solo con teclado de principio a
fin (foco visible fuera de la sombra dura, orden lógico banda → KPIs → gráfica → riel → salud),
`prefers-reduced-motion: reduce` real sobre las barras y el segmentado de la gráfica, y confirmar
visualmente el tratamiento neobrutalista de la banda (`shadow-nb-lg`, cabecera en tinta inversa). Los
224 tests automatizados cubren el mecanismo (niveles de la banda, `aria-pressed`, `aria-current`,
`role="img"` con su `aria-label`, cero-refetch al cambiar de serie) pero no el criterio visual.

### 2. La campana no tiene destino todavía

`NotificationBell` es un `role="status"`, no un enlace ni un botón — decisión explícita de esta
sesión, porque no existe pantalla de notificaciones hasta M12. El día que esa pantalla exista, es un
cambio de `<span>` a `<Link>` en un solo archivo.

### 3. "Reintentar fallidas" y la tile "Estancadas" quedan fuera

Documentado en el plan (`Fuera de alcance`): el endpoint de reintento no existe en `apps/api`
(`notificationRoutes.ts` solo monta `GET /health`), y `OutboxHealth.stale` está hardcodeado a `0` en
`notificationService.ts`. Ninguno de los dos es competencia de este milestone de frontend.

### 4. `/admin/notifications/health` no tiene query params

Confirmado contra el código real (`notificationController.ts`): el controlador ignora `_req` por
completo. La campana y el panel de salud no envían ni esperan ningún parámetro.
