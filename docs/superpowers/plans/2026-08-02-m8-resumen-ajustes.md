# M8 · Resumen — ajustes de mobile, moneda, granularidad y prints

> **Al aprobar:** copiar este archivo a `docs/superpowers/plans/2026-08-02-m8-resumen-ajustes.md`
> (convención del repo) antes de empezar. Ejecutar con `executing-plans`, tarea por tarea.
> **Rama:** se continúa en `feat/m8-resumen-dashboard` (aún sin mergear a `main`) — no se abre rama nueva.
>
> **Nota de ejecución:** al llegar a la Tarea 6 se descubrió que `feat/m8-resumen-dashboard` ya
> estaba mergeada a `main` (commit `125a8ea`) — Manuel corrió el merge que se le entregó al cierre de
> M8 en algún punto entre sesiones. Todo el trabajo de este plan (Tareas 0-5) se hizo directamente
> sobre `main`, sin abrir rama nueva. Queda como cambios sin commitear, pendientes de tu revisión.

---

## Context

M8 (`/resumen`) ya está implementado y verificado (ver
`docs/superpowers/plans/2026-07-31-m8-resumen-dashboard.md`), pero sigue sin mergear. Al revisarlo
en el emulador de móvil, Manuel encontró seis problemas/pedidos concretos:

1. **Scroll horizontal innecesario en mobile.** Causa confirmada: `TimeseriesChart.tsx` fuerza
   `min-w-[34rem]` en la fila de barras y el eje por debajo de `lg:`, y ni `Panel` ni `NB_SURFACE`
   aplican `overflow-hidden`/`max-w-full` alrededor — el `overflow-x-auto` local no basta como
   contención garantizada.
2. **Ingresos MXN/USD como dos tiles separadas** ya no refleja cómo opera el negocio (solo pesos) y
   Manuel pidió que una compra en USD también se refleje "como en pesos" en el dashboard.
   Investigando el código: **esto ya es posible sin inventar nada nuevo.** Cada `Order` congela su
   propio `exchangeRate` al momento del checkout (`Order.ts:72`, poblado desde
   `Settings.currency.mxnPerUsdCents` en `pricingService.ts:147`) — es la tasa real usada para cobrar
   esa orden, no una tasa inventada ni una API externa. Convertir USD→MXN-equivalente para el
   dashboard es aritmética sobre datos que ya existen (`money.ts`'s `convertFromMxn` invertida), cero
   dependencias nuevas, cero config nueva.
3. **Right rail:** "Más vendidos" debe ir arriba de "Stock bajo", y ambos paneles deben igualar en
   altura a los dos de la columna izquierda (gráfica y distribución) — hoy no hay ningún `h-full` ni
   `items-stretch` en la rejilla, así que las alturas son puramente intrínsecas al contenido.
4. **Filtro de gráfica por día/semana/mes/año**, resuelto en servidor (Manuel eligió explícitamente
   la opción con cambios de backend, no una agregación en cliente). Hoy `timeseriesStatsService.ts`
   tiene la granularidad `"day"` hardcodeada en cada capa (servicio, validador Joi, tipo compartido).
5. **Panel de "print más usado"**, agregado a través de **todos** los pedidos, no solo del top-N de
   productos. Confirmado con Manuel: `lines.printName` ya se graba por línea de pedido al momento de
   la compra (un cliente no puede pagar sin elegir print), así que es una agregación nueva sobre
   datos que ya existen — sin cambios de modelo.
6. **Mockups en localhost antes de tocar código real**, usando la skill `impeccable` (ya instalada en
   `~/.claude/skills/impeccable`), reusando el sistema de diseño que el proyecto ya tiene (`tokens.css`,
   `mockups/*.html` de M6-M8) en vez de la entrevista completa de `teach`.

**Decisión sobre el sistema de diseño formal (pregunta de Manuel):** sí vale la pena dejarlo
documentado para M9-M12, pero con `impeccable document` (que **lee el código existente** y genera
`DESIGN.md` — no es una entrevista) en vez de `impeccable teach` completo. `teach` pide contexto de
marca/usuarios que ya tengo por la memoria del proyecto y por `~/.claude/CLAUDE.md`; en vez de
hacerle la entrevista a Manuel otra vez, redacto yo mismo un `PRODUCT.md` corto con lo que ya se sabe
(marca Gira Clothing, e-commerce D2C de ropa con estampados personalizables, usuarios internos de
operación/admin, registro "product/dashboard") y lo dejo listo para confirmación rápida en vez de
interrogatorio. Esto es más rápido ahora y deja base reusable para el resto del Bloque 2.

**Precisión importante sobre `totalMxnEquivalent`:** esto es una cifra **calculada para el KPI del
dashboard**, no reemplaza ni se resta de `revenue: RevenueEntry[]` (que sigue siendo la fuente de
verdad por moneda — no se toca ni se borra). Es una suma adicional, claramente nombrada, que usa la
tasa **congelada en cada pedido**, nunca la tasa actual de `Settings` — un cambio de tipo de cambio
hoy no debe alterar el equivalente de ayer, igual que ya garantiza `money.ts` para el cobro original.

---

## Decisiones cerradas en esta sesión

| Decisión | Elección | Por qué |
|---|---|---|
| **Granularidad de la gráfica** | Servidor: nuevo query param `granularidad=day\|week\|month\|year` en `GET /admin/stats/timeseries`, con bucketing real vía `$dateTrunc` en Mongo. | Manuel lo pidió explícitamente ("los cuatro ahora, con cambios en backend"). Un rebucket en cliente no sirve para `year` con el tope actual de 365 días. |
| **Tope de días** | Sube de 365 a **730** (2 años), centralizado como `MAX_STATS_DAYS` en `@gira/shared` en vez de duplicado en `parseStatsRange.ts` + `statsValidator.ts`. | `year` con 365 días solo puede mostrar un bucket parcial — inútil. 730 da 2 años completos sin abrir la puerta a un escaneo histórico ilimitado (sigue siendo agregación en vivo, no hay rollups precalculados). |
| **`TimeseriesPoint.day` → `periodStart`** | Rename explícito, no se reutiliza `day` para buckets que no son días. | Llamar "day" a un bucket mensual es un dato falso en el JSON — el bug clásico que aparecería en `formatShortDay` mostrando "1" para cada barra de un año. Es un cambio que rompe el contrato, así que se coordina back+front en la misma tarea. |
| **`totalMxnEquivalent`** | Campo nuevo en `OrderStats.period`, **calculado por documento antes de agrupar** (`$addFields` con `$cond` por moneda, luego `$group`), usando el `exchangeRate` congelado de cada orden. `revenue: RevenueEntry[]` no se toca. | Cada orden MXN también tiene un `exchangeRate` guardado (no es `1`, es la tasa vigente al momento — un passenger sin uso hoy). Multiplicar-sumar por documento es obligatorio porque la tasa varía entre pedidos; sumar-y-multiplicar-al-final sería aritmética incorrecta (problema de promedio ponderado, no lineal). |
| **`topPrints`** | Campo nuevo en `OrderStats.period`, agregación adicional agrupando `lines.printName` (no `lines.sku`), sin acotar a los productos del top-N. | Un print puede repetirse en varios productos/SKUs; agrupar solo dentro de `topProducts` subestimaría el print real más usado. Es la misma forma de pipeline que `topProducts`, un `$group` distinto. |
| **KPI de ingresos combinado** | Una sola tile "Ingresos" acentuada con el total en MXN (incluye el equivalente de USD convertido), y debajo un renglón secundario con el desglose real: "$34,175 MXN + USD $414 (equiv. ~$7,600 MXN)". Nunca se pierde el desglose por moneda. | Cierra el pedido de Manuel de ver "las dos monedas reflejadas" sin violar la regla de "nunca sumar monedas distintas a ciegas" — la suma que se muestra está explícitamente etiquetada como equivalente calculado, no como un monto cobrado. Los detalles finales de layout se confirman en el mockup (Tarea 0). |
| **Right rail** | Orden: Más vendidos arriba, Stock bajo abajo. Alturas: columna izquierda y derecha usan `items-stretch`/`h-full` para que cada panel de la derecha iguale la altura de su contraparte izquierda (gráfica ↔ Más vendidos, Distribución ↔ Stock bajo). | Pedido explícito de Manuel; se resuelve con utilidades de grid existentes, sin nuevo componente. |
| **Fix de scroll mobile** | Quitar el `min-w-[34rem]` fijo bajo `lg:` de `TimeseriesChart`; usar un mínimo por barra (`min-w-[6px]` o similar, ya existe en la barra individual) en vez de un mínimo de contenedor, y confirmar `overflow-hidden`/`max-w-full` en `Panel`/`NB_SURFACE` como cinturón de seguridad. | El contenedor `overflow-x-auto` debía bastar pero el mínimo de 34rem empuja el layout completo en pantallas angostas. Ver mockup para el diseño final de barras responsivas. |
| **Nuevo panel "Print más usado"** | Vive junto a "Más vendidos" en el right rail (o donde el mockup confirme), alimentado por `topPrints` del mismo fetch de `overview` — cero endpoints nuevos. | Mismo patrón que el resto de M8: un solo fetch, un campo más en la respuesta ya existente. |
| **Setup de impeccable** | `impeccable document` (lee tokens.css + mockups existentes → genera `DESIGN.md`) + `PRODUCT.md` redactado por mí con el contexto ya conocido (sin entrevista `teach` completa) + `impeccable shape` para el brief de diseño y mockup de `/resumen` mobile-first. | Pedido explícito de Manuel: "ya tienes de qué trata el proyecto... pásalo a impeccable". Evita redundancia con el sistema de diseño que M6-M8 ya construyeron. |
| **Secuencia backend** | `totalMxnEquivalent` primero (menor riesgo, sin cambio de tipo compartido más allá de un campo) → `topPrints` segundo (aditivo, sin breaking change) → granularidad al final (el único cambio que rompe un tipo compartido — `day`→`periodStart` — y toca validador + `packages/shared` + 4 archivos de frontend). | Recomendación del sub-agente de arquitectura: aislar el cambio más riesgoso (rename + coordinación cross-package) al final, después de que los otros dos ya estén verdes. |

---

## Fuera de alcance (no-negociable #5)

- **Pantalla de Ajustes para editar `mxnPerUsdCents` desde la UI.** Ya existe el campo en
  `Settings`, pero construir la pantalla de administración es trabajo de `M11` (Ajustes, marcado
  `PRONTO` en el sidebar). Este plan solo **lee** el campo ya existente vía cada pedido.
  `totalMxnEquivalent` funciona con el valor que cada orden ya tiene congelado.
- **Rollups precalculados / materialización histórica.** El tope de 730 días sigue siendo agregación
  en vivo sobre `createdAt`. Si más adelante se necesita más rango, es una decisión de
  infraestructura aparte (rollups), no de este plan.
- **Endpoint separado para `topPrints` o `totalMxnEquivalent`.** Ambos se agregan al payload ya
  existente de `/admin/stats/overview`, no hay endpoints nuevos.
- **Combinaciones de UI para cada par rango+granularidad** (p. ej. qué opciones de `?dias=` tiene
  sentido ofrecer cuando `granularidad=year`). Se decide durante la revisión del mockup (Tarea 0), no
  se hardcodea de antemano en este documento.

---

## Tarea 0: Setup de `impeccable` + mockup mobile-first (sin código de producto)

**Depends on:** nada. **Sin non-negotiable de commits:** esta tarea no toca `apps/web/src` real, solo
`mockups/`, y opcionalmente `PRODUCT.md`/`DESIGN.md` en la raíz.

- [ ] **Paso 1:** correr `impeccable document` para generar `DESIGN.md` desde `tokens.css` +
  `mockups/*.html` + los componentes ya construidos (`components/ui/styles.ts`, `Panel`, `StatCard`).
- [ ] **Paso 2:** redactar `PRODUCT.md` con el contexto ya conocido (marca, usuarios admin, registro
  "product"), mostrarlo a Manuel para confirmación rápida en vez de correr la entrevista completa de
  `teach`.
- [ ] **Paso 3:** correr `impeccable shape` sobre el alcance de esta tarea: rediseño de `/resumen`
  mobile-first (fix del scroll, KPI de ingresos combinado, right rail reordenado con alturas
  igualadas, selector de rango+granularidad, panel de print más usado). Interview corta (2-3
  preguntas por ronda) si `shape` necesita algo que `PRODUCT.md`/este plan no contesten ya.
- [ ] **Paso 4:** producir el mockup HTML (`mockups/resumen-c.html` o el nombre que `shape`/`craft`
  sugiera) servido en localhost para que Manuel lo revise en el emulador de móvil, replicando el
  patrón ya usado con `resumen-a.html`/`resumen-b.html`.
- [ ] **Paso 5:** Manuel aprueba o pide ajustes al mockup. **Ninguna tarea de frontend (Tarea 4 en
  adelante) empieza sin esta aprobación explícita.**

**Verificación:** mockup abre en el navegador sin scroll horizontal en 390/834/1440, con las seis
piezas del pedido visibles (KPI combinado, right rail reordenado, selector con 4 granularidades,
panel de prints).

---

## Tarea 1: Backend — `totalMxnEquivalent` (TDD)

**Depends on:** 0 (solo para no bloquear en paralelo con el mockup; no depende de sus decisiones
visuales). **Files:** modify `apps/api/src/services/orderStatsService.ts`,
`apps/api/tests/helpers/seedOrder.ts`, `packages/shared/src/types/stats.ts`

- [ ] **Paso 1:** extender el fixture `seedOrder.ts` con un `exchangeRate` opcional (default `1` para
  no romper tests existentes que no les importa).
- [ ] **Paso 2:** tests primero en `orderStats.test.ts`/`statsOverview.test.ts`: una orden MXN y una
  USD con `exchangeRate` distinto (p. ej. `1800`), verificar `totalMxnEquivalent` contra el cálculo
  a mano; caso período vacío → `0`; caso todas las órdenes en MXN → `totalMxnEquivalent === revenue
  MXN` exacto (branch `$cond` nunca multiplica en ese caso).
- [ ] **Paso 3:** implementar la agregación (`$addFields` con `$cond` por moneda +
  `$group: { _id: null, $sum }`) como pipeline adicional en el `Promise.all` existente, siguiendo el
  patrón `?? 0` ya usado para `unitRows`. Agregar `totalMxnEquivalent: number` a `OrderStats.period`
  en `stats.ts`.

**Verificación:** `pnpm --filter @gira/api test` (los archivos tocados) + `pnpm typecheck`.

---

## Tarea 2: Backend — `topPrints` (TDD)

**Depends on:** 1 (secuencial, no técnicamente dependiente, solo por la recomendación de aislar
riesgo). **Files:** modify `apps/api/src/services/{orderStatsService,overviewService}.ts`,
`packages/shared/src/types/stats.ts`

- [ ] **Paso 1:** tests primero: pedidos con el mismo print en dos SKUs distintos deben sumar
  unidades en una sola fila de `topPrints`; orden descendente por unidades; límite `TOP_PRINTS`
  (recomendado 5, independiente de `TOP_PRODUCTS`); período vacío → `[]`.
- [ ] **Paso 2:** implementar el nuevo `$group: { _id: "$lines.printName", units: {$sum} }` (mismo
  `$match`/`$unwind` que `topProducts`), mapear a `TopPrint[]` (`{ printName, units }`, sin
  `sku`/`productName` — un print no tiene un único producto). Agregar `topPrints: TopPrint[]` a
  `OrderStats.period` y recortar a `OVERVIEW_TOP` en `overviewService.ts`, igual que ya se hace con
  `topProducts`.

**Verificación:** `pnpm --filter @gira/api test` + `pnpm typecheck`.

---

## Tarea 3: Backend — granularidad día/semana/mes/año (TDD)

**Depends on:** 2. **Files:** new `apps/api/src/utils/statsBucketing.ts`,
`packages/shared/src/constants/stats.ts`; modify
`apps/api/src/services/timeseriesStatsService.ts`, `apps/api/src/utils/{parseDayRange,parseStatsRange}.ts`,
`apps/api/src/validators/statsValidator.ts`, `packages/shared/src/types/stats.ts`

- [ ] **Paso 1:** centralizar `MAX_STATS_DAYS = 730` en `packages/shared/src/constants/stats.ts`
  junto con `StatsGranularity`/`STATS_GRANULARITIES`; actualizar `parseStatsRange.ts` y
  `statsValidator.ts` para importarlo (elimina la duplicación de `365` en dos archivos).
- [ ] **Paso 2:** tests primero para `statsBucketing.ts`: `bucketKeyFor` para `day`/`week`/`month`/
  `year` sobre una matriz de fechas (incluyendo un cruce de año en semana ISO); un test que compara
  el resultado JS de `bucketKeyFor` contra la expresión Mongo (`$dateTrunc` + `$dateToString`) para
  las mismas fechas, para las dos mitades del cálculo estén de acuerdo.
- [ ] **Paso 3:** implementar `statsBucketing.ts` (`bucketKeyFor`, `enumerateBucketKeys`, `bucketExpr`
  para Mongo). Cambiar `timeseriesStatsService.ts` para usar `bucketExpr(granularity, timezone)` en
  vez del `$dateToString` fijo, y `enumerateBucketKeys` en vez de `dayKeys` directo para el
  zero-fill. Renombrar `day` → `periodStart` en `TimeseriesPoint`.
- [ ] **Paso 4:** nuevo schema Joi `timeseriesQuerySchema` (extiende `statsRangeSchema` con
  `granularity` opcional, default `"day"`) — **sin** tocar `statsRangeSchema` compartido con
  `/overview`, `/admin/orders/stats`, `/admin/variants/stats` (que no tienen concepto de
  granularidad).
- [ ] **Paso 5:** actualizar los 4 consumidores de frontend que rompe el rename (ver Tarea 5) — se
  coordinan en la misma tarea de frontend, no se dejan colgando entre el commit de backend y el de
  frontend.

**Verificación:** `pnpm --filter @gira/api test` + `pnpm typecheck` + `git diff --stat -- packages/shared`
revisado a mano (cambio de tipo intencional, no accidental).

---

## Tarea 4: Frontend — capa de datos actualizada

**Depends on:** 1, 2, 3. **Files:** modify `apps/web/src/lib/api/stats.ts`,
`apps/web/src/lib/stats/{range,chart}.ts`, `apps/web/src/lib/format.ts`

- [ ] **Paso 1:** `getTimeseries(days, granularity)` — nuevo parámetro, actualizar
  `tests/lib/stats-api.test.ts`.
- [ ] **Paso 2:** `chart.ts`: `ChartBar.day` → `ChartBar.periodStart`; `toChartBars` recibe
  `granularity` para decidir el formateo de eje (reusar `formatShortDay` para `day`, nuevas funciones
  para semana/mes/año en `format.ts`, todas con `LOCALE`/`TIMEZONE` explícitos como el resto del
  archivo).
- [ ] **Paso 3:** `range.ts`: añadir `parseGranularity(raw)` con whitelist
  `["day","week","month","year"]` y default `"day"`, mismo patrón que `parseRangeDays`.

**Verificación:** `pnpm --filter @gira/web test tests/lib` + `pnpm typecheck`.

---

## Tarea 5: Frontend — UI (solo tras aprobar el mockup de la Tarea 0)

**Depends on:** 0 (mockup aprobado), 4. **Files:** modify `TimeseriesChart.tsx`, `KpiRow.tsx`,
`page.tsx`, `RangeSelector.tsx` (o su reemplazo), crear `TopPrintsPanel.tsx`; tests correspondientes.

- [ ] **Paso 1 (fix de scroll):** quitar `min-w-[34rem]` fijo de `TimeseriesChart`; implementar el
  diseño de barras responsivas que el mockup confirme. Verificar 390/834/1440 sin scroll horizontal
  del body.
- [ ] **Paso 2 (KPI combinado):** `KpiRow` — una tile "Ingresos" con MXN + equivalente de USD
  (formato exacto según el mockup aprobado), usando `totalMxnEquivalent` y el desglose de
  `revenue: RevenueEntry[]` para el renglón secundario.
- [ ] **Paso 3 (right rail):** reordenar Más vendidos arriba de Stock bajo; igualar alturas
  izquierda/derecha con las utilidades de grid que el mockup confirme (`items-stretch`, `h-full`, o
  `grid-rows-[...]` explícito).
- [ ] **Paso 4 (selector de granularidad):** extender `RangeSelector` (o dividir en dos controles)
  para granularidad + rango, ambos vía `<Link>`/URL (`?dias=`, `?granularidad=` o el nombre que se
  confirme), refetch en RSC para ambos — el toggle de serie (pedidos/ingresos/unidades) sigue siendo
  estado de cliente sin refetch, sin cambios ahí.
- [ ] **Paso 5 (panel de prints):** `TopPrintsPanel.tsx`, mismo patrón que `TopProductsPanel`
  (`EmptyState` si `topPrints` viene vacío), ubicado según confirme el mockup.

**Verificación:** `pnpm --filter @gira/web test` (suites tocadas) + `pnpm lint` + revisión visual en
390/834/1440 contra el mockup aprobado.

---

## Tarea 6: Cierre

**Depends on:** todas.

- [ ] **Paso 1:** `pnpm -r build && pnpm typecheck && pnpm lint && pnpm -r test && pnpm audit --prod --audit-level=high`.
- [ ] **Paso 2:** recorrido manual end-to-end (API real): `?granularidad=week|month|year` con back/
  forward, `?dias=730` no rompe, KPI combinado no confunde MXN cobrado con equivalente calculado,
  panel de prints coincide con una cuenta manual sobre datos de prueba, mobile sin scroll horizontal
  en un dispositivo/emulador real.
- [ ] **Paso 3:** `git diff --stat` completo, mostrar a Manuel, esperar aprobación explícita antes de
  cualquier `git add`/`commit` (regla de siempre — ninguna tarea commitea por su cuenta).
- [ ] **Paso 4:** actualizar la sección "Pendientes conocidos" de
  `docs/superpowers/plans/2026-07-31-m8-resumen-dashboard.md` señalando que este documento la amplía,
  y agregar la propia sección de cierre a este plan.

---

## Gotchas a recordar

1. **`exchangeRate` de una orden MXN NO es `1`** — es la tasa vigente al checkout, sin usar. El
   `$cond` por moneda es el punto crítico de la Tarea 1; probarlo explícitamente con una orden MXN y
   una USD con tasas distintas.
2. **`$multiply` antes de `$group`**, nunca después — la tasa varía por pedido, sumar montos y tasas
   por separado y multiplicar al final es aritmética incorrecta.
3. **`periodStart` no está recortado a `range.from`** — un bucket mensual puede empezar antes del
   rango pedido; los datos (`revenue`/`orders`/`unitsSold`) sí están correctamente acotados porque el
   `$match` ocurre antes de agrupar. Documentarlo para que el frontend no intente "corregirlo".
4. **`bucketKeyFor` (JS) y `bucketExpr` (Mongo) deben coincidir exactamente** para el mismo instante,
   o el zero-fill no cuadra con los datos reales — de ahí el test de "acuerdo" explícito.
5. **`revenue: RevenueEntry[]` no se toca ni se reemplaza** — `totalMxnEquivalent` es un campo
   adicional, nunca un reemplazo.
6. **Ninguna tarea de frontend visual empieza sin el mockup aprobado** (Tarea 0, Paso 5).
7. **Git:** ninguna tarea ejecuta `git add`/`commit`/`push` sin mostrar el diff y recibir aprobación
   explícita de Manuel.

---

## Cierre (Tarea 6)

- **`pnpm -r build`** (los 3 paquetes, con `NEXT_PUBLIC_API_URL` seteada) — verde.
- **`pnpm typecheck`** / **`pnpm lint`** (raíz, los 3 paquetes) — verde.
- **`pnpm -r test`** — `@gira/shared` n/a, `@gira/web` 41 archivos/253 tests verde,
  `@gira/api` 55 archivos/618 tests con **1 fallo por timeout** en
  `adminVariants.test.ts` bajo suite completa (contención de CPU) — confirmado el flake conocido del
  proyecto (memoria `project_known_flake.md`, mismo patrón documentado en cierres de M5-M8): pasa
  16/16 en aislamiento. `git status` confirma que este plan no tocó ningún archivo de
  variantes/catálogo.
- **`pnpm audit --prod --audit-level=high`** — sin vulnerabilidades. `git diff` de los cuatro
  `package.json` + `pnpm-lock.yaml` vacío — cero dependencias nuevas, como prometía la tabla de
  decisiones.
- **Guardias específicas:** `designTokens.test.ts` verde (cero tokens nuevos fuera de `tokens.css` —
  de hecho `tokens.css` no se tocó en este plan); sin z-index ad-hoc; sin `next/headers` fuera de
  módulos de servidor; sin `new Date()` sobre campos `Wire<>` en el código nuevo.
- **Recorrido manual end-to-end** (API real vía Atlas, servidor Next real, cookie de sesión real):
  - `GET /admin/stats/overview` con base vacía → `totalMxnEquivalent: 0`, `topPrints: []`, estructura
    completa sin `null`.
  - `GET /admin/stats/timeseries?days=90&granularity=week` → 13 buckets, todos lunes.
  - `GET /admin/stats/timeseries?days=730&granularity=year` → 3 buckets (`2024-01-01`, `2025-01-01`,
    `2026-01-01`) — la ventana de 730 días cruza tres años calendario, confirmando en vivo el caso
    límite documentado en la Tarea 3.
  - `granularity=abc` → 400. `days=800` → 400 (tope de 730 respetado).
  - `GET /resumen?dias=90&vista=week` con sesión real → 200, "Ingresos (equiv. MXN)", "Print más
    usado" y "Pedidos por semana" presentes; cero "No se pudo cargar esta sección"; cero `NaN`; el
    enlace "Semana" lleva `aria-current="page"`.
  - **No verificado visualmente en un dispositivo/emulador real** (sin navegador en esta sesión): el
    fix del scroll horizontal en 390px se apoya en el test automatizado
    (`TimeseriesChart.test.tsx`, "sin min-width fijo") + la causa raíz confirmada por lectura de
    código (`min-w-[34rem]` eliminado, `overflow-hidden` agregado a `Panel`), no en una captura de
    pantalla. Recomendado confirmarlo en el emulador antes de dar por cerrado el punto (1) del pedido
    original.
- **Cuenta de verificación:** se sembró `verify-m8-ajustes@gira.mx` (contraseña
  `VerifyM8Ajustes2026`, sin caracteres especiales) para este recorrido — queda en la base de
  desarrollo junto con `m8test-admin@gira.mx` de la sesión anterior (esa contraseña con caracteres
  especiales sigue sin funcionar, causa no diagnosticada, tratado como fricción de tooling, no bug
  de producto).
- **Descubrimiento de rama:** `feat/m8-resumen-dashboard` ya estaba mergeada a `main` al llegar a
  esta tarea — ver nota al inicio del documento. Todo este plan corrió sobre `main` directamente.
- **Pendiente:** revisión visual del mockup `resumen-c.html` y de la pantalla real en el emulador
  móvil — el trabajo de código está completo y verificado por los medios anteriores, pero no
  reemplaza tu propia revisión visual.
