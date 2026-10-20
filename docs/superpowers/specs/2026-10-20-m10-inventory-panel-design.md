# M10 · Panel de inventario (diseño)

Fecha 2026-10-20 · rama `feat/m10-inventory-panel` (desde `main`, con M9c mergeada) · depende de M9c · **extiende el API** (listado, ajuste con motivo, historial, alerta de Telegram).

## Decisiones aprobadas

- **Dirección visual C, "Bandeja con vista previa, agrupada por categoría de producto"** (mockup en el scratchpad de la sesión, `m10/c`). Pestañas por estado (Agotado · Stock bajo · OK · Todos, con conteos de `GET /variants/stats`), filtros dentro de una isla de hueso (Buscar, Categoría, Modelo, Print), lista agrupada por `ProductCategory` y vista previa fija en `lg+`. En móvil la fila abre un `SlideOver` con la misma vista previa.
- **Las categorías arrancan cerradas** al entrar. Cada una muestra su resumen (variantes, chips de agotados y bajos, disponible total). Se abre con el botón de flecha (`aria-expanded`). Una búsqueda o un filtro de estado, modelo o print abre solo las categorías con coincidencias. Cerrar una categoría no pierde la variante seleccionada.
- Una variante es **Modelo × Print** (sin tallas). Disponible = en mano − apartado. Estado: agotado `≤ 0`, bajo `≤ umbral` (`Settings.inventory.lowStockThreshold`, nunca hardcodeado), OK en otro caso.
- Dentro de cada categoría, las filas se ordenan por disponible ascendente (lo urgente arriba).
- Ajuste de stock con dos modos: **Recuento** ("hay en total") y **Movimiento** ("+24 o −2"), con motivo opcional (máx. 200). No puede dejar el disponible en negativo (el API responde 409).
- Un solo botón amarillo por pantalla ("Guardar ajuste"). Dinero y cantidades en mono. Sin colores ni fuentes fuera de `tokens.css` y `fonts.ts`.
- **Selects con flecha propia y espacio** (no la flecha nativa pegada al borde): se corrige `SelectField`, lo que también mejora los filtros de Pedidos.
- Notificaciones: **solo Telegram de un disparo** (agotado y bajo). La campana del TopBar queda para después.
- Datos recortados en la frontera HTTP (patrón `PanelOrder`): `PanelVariant`, sin campos que la UI no use. Mutaciones solo por `browserRequest`; ids validados antes de armar rutas.

## API (cambios)

- `AdminVariant` en shared: `{ id, sku, product: { id, name, slug, category: { id, name, slug } }, print: { id, name, sku, image }, priceOverride?, onHand, reserved, available, isActive, updatedAt }`.
- `GET /admin/variants`: agregación con `$lookup`; filtros `stock=out|low|ok`, `category`, `product`, `print`, `isActive`; búsqueda por SKU, modelo o print; orden en lista blanca `sku | available | -available | updatedAt`.
- `PATCH /admin/variants/:id/stock`: `reason` opcional, responde `AdminVariant`.
- `GET /admin/variants/:id/activity`: últimos 20 movimientos del audit (`targetId` = variante).
- Alerta: `Variant.stockAlertLevel` (`null|low|out`) + `stockAlertedAt`; `stockAlertService.evaluate`; `TEAM_STOCK_LOW` y `TEAM_STOCK_OUT`; reclamo atómico, un aviso por nivel, se rearma al reponer.

## Estados y reglas de la UI

- Cada vista tiene estado de carga (skeleton con la geometría real), vacío (distinto con filtros que sin ellos) y error con "Reintentar". Un refresco silencioso que falla deja las filas y muestra un aviso.
- Filtros en la URL en español (`estado`, `categoria`, `modelo`, `print`, `q`, `orden`, `page`) y resincronizados cuando cambia desde fuera.
- Un ajuste exitoso reemplaza la fila con el `AdminVariant` devuelto, refresca los conteos de las pestañas y muestra un toast con el SKU.

## Componentes nuevos

`CategoryGroup` (isla plegable), `VariantRow`, `StockBadge`, `StockFigures`, `AdjustStockForm`, `VariantActivity`, `InventoryFilters`, `InventoryTabs`, `InventoryEmpty`, `InventoryPage`. Se reutilizan `Tabs`, `Badge`, `SelectField` (con la flecha corregida), `Field`, `Segmented`, `SlideOver`, `Toast`, `EmptyState`, `Notice`, `Skeleton` y `Pagination`.

## Fuera de alcance

Crear o editar variantes, precios e imágenes (M11); editar el umbral global (M12c); campana del TopBar; pestaña de apartados; umbral por variante; guardia optimista `expectedOnHand`.
