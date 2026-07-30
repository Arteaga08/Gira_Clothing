# Mockups — Panel admin (Bloque 2)

Referencia estática, **no** es la app. HTML + CSS plano, sin build. Sirve para cerrar la dirección
visual antes de escribir `apps/web`.

```bash
python3 -m http.server 5050 -d mockups
# → http://localhost:5050
```

| Archivo | Qué es |
|---|---|
| `index.html` | Visor: las 4 pantallas en los tres breakpoints (390 / 834 / 1440) |
| `resumen-a.html` | Resumen, dirección **A “Tablero”** — métricas primero, riel derecho |
| `resumen-b.html` | Resumen, dirección **B “Operación”** — alertas primero, KPIs compactos |
| `pedidos.html` | Plantilla de lista: pestañas, filtros, tabla/tarjetas, 3 estados, paginación |
| `pedido-detalle.html` | Panel lateral de detalle sobre la lista |
| `tokens.css` | **El único archivo con colores y fuentes.** Destino: `apps/web/src/styles/tokens.css` |
| `mockup.css` | Layout y componentes. En la app se reescribe como Tailwind v4 + `@layer components` |
| `icons.svg` | Sprite generado de Phosphor Icons, peso **bold** |

## Dirección visual

Neobrutalismo **en el tratamiento de tarjetas y componentes**, sobre el layout y la jerarquía de la
referencia. Concretamente:

- Bordes sólidos de **2px** en `--color-ink`.
- Sombra dura **`4px 4px 0 0`**, blur cero y alpha cero. Una sombra con alpha se enloda sobre el
  neutro claro del fondo.
- Radio **12px**. Rellenos **planos**: cero gradientes, en ningún lado.
- El estado presionado **se traslada dentro de su sombra** en vez de escalar.
- Un solo acento saturado (`--color-brand`) para nav activo, botón primario y serie principal de la
  gráfica. Nunca más de un KPI acentuado por pantalla.
- El fondo de página y el riel del sidebar **no** llevan el tratamiento: son neutros y calmos.

## Placeholders

**Paleta y tipografía son provisionales.** Los dos puntos de swap:

1. **Paleta** → `tokens.css`, bloques `BRAND` + `SURFACES` + `INK`. El resto deriva: los chips de
   estado y las sombras leen `--color-ink` y sus propias variables `--status-*`. Ningún componente
   escribe un hex.
2. **Tipografía** → en la app real, `apps/web/src/app/fonts.ts` (tres llamadas `next/font` con
   `variable:`) más las líneas `--font-sans` / `--font-mono` de `tokens.css`. Aquí es un stack de
   sistema. Ningún componente nombra una familia.

Los colores están en OKLCH y los neutros van teñidos hacia el matiz de marca (`--brand-hue`), así
que mover ese único número reencuadra todos los grises de golpe.

## Iconos

Phosphor Icons, peso **bold** — el peso regular se adelgaza y desaparece junto a un borde de 2px.
El sprite se generó de `@phosphor-icons/core@2.1.1`; son paths **rellenos** en un box `0 0 256 256`,
por eso el CSS usa `fill: currentColor` y nunca `stroke-width`.

En la app real se usa el paquete, no el sprite:

```tsx
import { ShoppingBagOpen } from "@phosphor-icons/react";
<ShoppingBagOpen weight="bold" />;
```

Los nombres mapean 1 a 1: `ph-shopping-bag-open` aquí es `ShoppingBagOpen` allá.

## De dónde salen los datos

La base `gira-dev` está vacía en este equipo, así que **no** hay respuestas capturadas: los valores
salen de los DTO de los servicios, que son la fuente de verdad, y las etiquetas en español salen del
código. Lo que importa es que ningún mockup muestra un campo que el API no devuelve, ni omite uno que
sí devuelve.

Cuando haya datos, capturar de verdad y contrastar:

```bash
curl -c /tmp/gira.txt -H 'Origin: http://localhost:3000' -H 'Content-Type: application/json' \
  -d '{"email":"...","password":"..."}' http://localhost:4000/api/v1/auth/login
curl -b /tmp/gira.txt 'http://localhost:4000/api/v1/admin/stats/overview?days=30' | jq
```

### Mapeo elemento → campo

| Elemento de UI | Origen |
|---|---|
| KPI “Pedidos” | `data.orders.period.totalOrders` / `paidOrders` |
| KPI “Ingresos MXN” / “Ingresos USD” | `data.orders.period.revenue[]` — **una tarjeta por moneda** |
| KPI “Unidades vendidas” | `data.orders.period.unitsSold` |
| “394 disponibles” | `data.inventory.unitsAvailable` |
| Gráfica de barras | `GET /admin/stats/timeseries?days=` → `series[].orders` *(endpoint nuevo, Fase 1)* |
| Distribución por estado | `data.orders.byStatus` |
| “Requiere atención” (5 contadores) | `data.orders.alerts` |
| “Más vendidos” | `data.orders.period.topProducts[]` — trae `sku`, `productName`, `printName`, `units` |
| “Stock bajo” | `data.inventory.lowStockItems[]` |
| Umbral “3” | `data.inventory.lowStockThreshold` — **del API, nunca hardcodeado** |
| Salud de notificaciones | `GET /admin/notifications/health` *(endpoint nuevo, Fase 1)* |
| Tabla de pedidos | `GET /admin/orders` → `data.orders[]` + `meta` |
| Etiquetas de estado | `LABELS` de `apps/api/src/utils/orderTransitions.ts:38` |
| Etiquetas de envío | `LABELS` de `apps/api/src/utils/shipmentTransitions.ts` |

### Tres cosas que el diseño respeta a propósito

1. **MXN y USD nunca se suman.** `orderStatsService` agrupa el ingreso por moneda porque “MXN + USD”
   es un número que no significa nada. Por eso hay dos tarjetas de ingreso, no un total.
2. **`lowStockItems` solo trae `{id, sku, available}`.** No hay nombre de producto en ese bloque, así
   que el panel muestra el SKU y enlaza a Inventario en vez de inventarse un nombre.
3. **Solo 4 transiciones de estado son de un humano.** `ADMIN_ALLOWED` en `orderTransitions.ts:31`
   permite `paid→processing`, `processing→shipped`, `shipped→delivered` y
   `pending_payment→cancelled`. El detalle solo renderiza el botón legal para el estado actual; un
   403 o 409 del API sería un bug, no un camino de la interfaz. “Solicitar reembolso” **pide** el
   reembolso al proveedor: el estado `refunded` lo escribe el webhook.

## Responsive

| Ancho | Comportamiento |
|---|---|
| 390 (móvil) | Sidebar → cajón con hamburguesa; tabla → tarjetas; KPIs en 2 columnas; gráfica con scroll horizontal propio |
| 834 (tableta) | Sigue el cajón; tabla ya visible; KPIs en 2 columnas; paneles a ancho completo |
| 1024 | Sidebar fija de 248px |
| 1280 (escritorio) | KPIs en 4 columnas; gráfica 2/3 + riel 1/3 (dirección A) |

El cuerpo nunca hace scroll horizontal: lo hacen los contenedores anchos (gráfica, tabla, pestañas).

## Accesibilidad incluida en la referencia

Skip link, `aria-current="page"` en el nav, roles de `dialog` con `aria-modal` y `aria-labelledby` en
el panel lateral, `role="tablist"` en pestañas, `role="img"` con `aria-label` descriptivo en gráfica
y barra de distribución, foco visible con outline **fuera** de la sombra dura (nunca se quita la
sombra al enfocar), y `prefers-reduced-motion` anulando transiciones y el translate de presión.

## Qué falta decidir

- Cuál dirección: **A** o **B**. Se puede mezclar (p. ej. la banda de alertas de B con el riel de A).
- Paleta y tipografía oficiales.
- Si el sidebar en tableta (834) debe ser un riel de iconos en vez de cajón.
