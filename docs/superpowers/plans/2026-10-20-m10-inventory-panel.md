# M10 · Panel de inventario: plan de implementación

Spec: `docs/superpowers/specs/2026-10-20-m10-inventory-panel-design.md`. Rama `feat/m10-inventory-panel` desde `main` (M9c ya mergeada). TDD (Vitest, y Jest/Vitest del API según el repo) en toda la lógica no trivial. Sin `git add/commit/push`: Manuel hace commit y merge.

## Fase 0 · Texto «en preparación» → «en proceso» (resto de M9c)

Unificar el texto que M9c dejó fuera, con su test: correo al cliente (`apps/api/src/templates/orderEmails.ts`, test `tests/unit/orderEmails.test.ts`), `apps/web/src/components/resumen/OutboxHealthPanel.tsx` y `apps/web/src/lib/stats/attention.ts` (con `AttentionBand.test.tsx`). Es un cambio de copy: se verifica con los tests puntuales de esos archivos.

## Fase 1 · Shared (`packages/shared`)

1. `types/catalog.ts`: `AdminVariant` (con `product.category`), `AdminVariantActivity` (`{ id, action, createdAt, actorName, before?: number, after?: number, delta?, reason? }`). Corregir `Product.category` y `Print.family`, hoy `string`, a objetos poblados `{ id, name, slug }` en los DTOs admin.
2. `labels/stock.ts` (nuevo): `STOCK_STATUS_LABELS`, `stockStatusOf(available, threshold)`, etiquetas de `STOCK_SET` y `STOCK_ADJUSTED`. Reexportar en `index.ts`. Test de `stockStatusOf` (0, negativo, igual al umbral, umbral 0).
3. `enums/notification.ts`: `TEAM_STOCK_LOW`, `TEAM_STOCK_OUT`.
4. `pnpm --filter @gira/shared build`.

## Fase 2 · API (TDD)

Archivos: `apps/api/src/{models/Variant.ts, services/{variantService,inventoryService,stockAlertService,notificationService}.ts, validators/variantValidator.ts, controllers/variantController.ts, routes/v1/admin/variantRoutes.ts}`, plantilla de Telegram, tests en `apps/api/tests/integration/`.

1. **Listado**: `listVariants` pasa a agregación (`$lookup` de producto, categoría y print; proyección a `AdminVariant`). Validador: `stock`, `category`, `search` hasta 80, `sort` en lista blanca. El umbral se lee de `Settings`. Tests: cada filtro, combinación, búsqueda con caracteres de regex, sort por `available`, `meta` correcto.
2. **Ajuste con motivo**: `stockUpdateSchema` suma `reason` (trim, máx. 200). `setOnHand` y `adjustOnHand` lo guardan en `after.reason` y devuelven `AdminVariant`. Tests: con y sin motivo, 409 sin audit, `reason` largo → 400.
3. **Actividad**: `GET /:id/activity` (id validado, 404 si no existe). Consulta el audit con `module=inventory` y `targetId`, los últimos 20, con el actor por nombre y solo los campos mapeados. Tests.
4. **Alerta**: `stockAlertService.evaluate(variantIds)`: reclamo atómico (`findOneAndUpdate` con `stockAlertLevel: { $ne: level }`), encola con `enqueueNotification` fuera de transacción y con su propio `.catch`, rearma a `null` al superar el umbral. Se llama tras ajuste y recuento, y tras la reserva y liberación. Tests: un solo aviso con 20 ajustes concurrentes, `low → out` vuelve a avisar, rearme al reponer, el fallo de la notificación no rompe el ajuste.
5. Plantilla de Telegram en español (modelo, print, SKU, disponible, umbral).
6. Actualizar `adminVariants.test.ts`, `inventory.test.ts` e `inventoryStats.test.ts`; typecheck y suite completa del API (flake: re-correr aislado).

## Fase 3 · Web, lógica pura y datos (TDD)

Rutas bajo `apps/web/src`:

1. `lib/inventory/filters.ts` (`parseInventoryFilters`, `applyFilterPatch`, `buildVariantListQuery`, `toSearchParams`; URL en español) + `filters.test.ts` al estilo de `lib/orders/filters.test.ts`.
2. `lib/inventory/panelVariant.ts` (recorte), `variantId.ts` (`isVariantId`, `assertVariantId`), `adjust.ts` (validar Recuento y Movimiento: entero, ≠ 0, rangos del API, no menos de lo apartado) + tests. `groupByCategory.ts`: agrupa las filas de la página por categoría, ordena por disponible, y calcula conteos y total por grupo. Tests.
3. `lib/api/paths.ts` (`ADMIN_VARIANTS_PATH`), `adminVariants.ts` (mutaciones y lecturas del navegador) y `adminVariantsServer.ts` (lecturas del servidor) + tests con `stubFetch`.
4. Hooks: `useVariantList`, `useInventoryStats`, `useStockActions` (`isBusy`, `inFlight`), `useVariantActivity` + tests con `renderHook` (patrón `useOrderList` y `useOrderActions`).

## Fase 4 · Web, UI

1. `SelectField`: flecha propia con `appearance-none`, padding derecho y ícono con `pointer-events-none`. Test del componente. Revisar visualmente Pedidos.
2. `components/inventory/*` (ver spec). **`CategoryGroup` arranca cerrada** (`aria-expanded=false`); se abre sola solo con búsqueda o filtros activos; el estado abierto o cerrado vive en el cliente y no en la URL. Tests de comportamiento: arranque cerrado, abrir y cerrar con teclado, apertura por búsqueda, selección conservada al cerrar.
3. `app/(admin)/inventario/{page.tsx,loading.tsx}`, `metadata.title = "Inventario"`; `lib/navigation.ts` con `available: true`; `LowStockPanel` enlaza a `/inventario?estado=bajo` y `?estado=agotado`.
4. Test de `OrdersPage`-style para `InventoryPage`: carga, vacío con y sin filtros, error con "Reintentar", ajuste exitoso, 409 con mensaje, URL resincronizada.

## Fase 5 · Verificación y cierre

- `pnpm --filter @gira/shared build`, typecheck del API y de web, `pnpm exec eslint apps/web`, `pnpm --filter @gira/web test`, `NEXT_PUBLIC_API_URL=http://localhost:4000 pnpm --filter @gira/web build`, suite del API.
- Recorrido real con `mongod` local (puerto 27018), API con proveedores en `""`, seed en el scratchpad que se niega fuera de `127.0.0.1:27018`, y Playwright (1.63): filtrar por estado, abrir una categoría, ajustar con motivo, ver el historial, llegar a 0 y comprobar que se encola un solo `TEAM_STOCK_OUT`, consola limpia, capturas a 390 y 1440.
- Code review con subagente (verifica contra el API y corre eslint) y `verification-before-completion`.
- Actualizar las memorias `project_milestone_status` y `project_standards_debt`.

## Pendientes conocidos

(Se llena al cerrar el milestone.)
