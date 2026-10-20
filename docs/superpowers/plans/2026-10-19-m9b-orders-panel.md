# M9b Panel de pedidos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Regla del repo: NO ejecutar `git add/commit/push`.** Donde una skill genérica diga "commit", se omite; al final se entrega el diff y los comandos.

**Goal:** Panel de pedidos en `apps/web` (lista con pestañas por estado + vista previa, detalle con tarjeta de logística y acciones) sobre la API existente.

**Architecture:** Lista = Client Component con filtros en la URL; detalle = Server Component que carga el pedido y delega acciones a un hook cliente. Lógica no trivial en funciones puras (`lib/orders/*`) probadas con Vitest; HTTP por `browserRequest` (mutaciones) y `serverRequest` (lecturas del servidor). Diseño: DESIGN.md (neobrutalismo verde bosque), mockup C aprobado. Spec: `docs/superpowers/specs/2026-10-19-m9b-orders-panel-design.md`.

**Tech Stack:** Next.js 15 (App Router), React 19, Tailwind v4 (solo tokens y recetas de `components/ui/styles.ts`), Phosphor Icons, Vitest + Testing Library (`tests/helpers/fetchMock.ts`), `@gira/shared`.

**Convenciones del repo (obligatorias):** código en inglés, textos de UI en español; exports al final del archivo; cero colores/fuentes literales fuera de `tokens.css`/`fonts.ts` (`tests/designTokens.test.ts`); componentes pequeños; nombres de test en español. Verificación por tarea = el test puntual; la suite completa solo al final.

---

## File Structure

| Archivo | Responsabilidad |
|---|---|
| `packages/shared/src/labels/orderStatus.ts` (mod) | Etiquetas de estado en masculino |
| `packages/shared/src/labels/shipping.ts` (mod) | `SHIPPING_LABEL_STATUS_LABELS` |
| `apps/web/src/styles/tokens.css` (mod) | `--ship-*` completos |
| `apps/web/src/lib/orders/status.ts` | Pestañas, transiciones manuales, `canEditShippingAddress` |
| `apps/web/src/lib/orders/logistics.ts` | `logisticsStateOf` (qué botones y qué copy) |
| `apps/web/src/lib/orders/filters.ts` | URL ⇄ filtros ⇄ query de la API |
| `apps/web/src/lib/orders/money.ts` | `formatMoney(cents)` |
| `apps/web/src/lib/api/paths.ts` (mod) + `adminOrders.ts` + `adminOrdersServer.ts` | Cliente HTTP de pedidos |
| `apps/web/src/components/ui/{Toast,SlideOver,Toggle,ConfirmDialog}.tsx` | Primitivas |
| `apps/web/src/components/orders/*Chip.tsx`, `PriorityBadge.tsx`, `DisputeBadge.tsx` | Chips independientes |
| `apps/web/src/hooks/{useOrderList,useOrderSummary,useOrderActions}.ts` | Datos y mutaciones |
| `apps/web/src/components/orders/*` | Lista, vista previa y tarjetas del detalle |
| `apps/web/src/app/(admin)/pedidos/{page,loading}.tsx`, `[id]/{page,loading}.tsx` | Rutas |
| `apps/web/src/lib/breadcrumbs.ts`, `components/shell/{Breadcrumbs,BreadcrumbLabel}.tsx` | Folio en la ruta de migas |
| `apps/web/src/lib/navigation.ts` (mod) | Pedidos disponible, sin Envíos |

---

### Task 1: Etiquetas en shared

**Files:** Modify `packages/shared/src/labels/orderStatus.ts`, `packages/shared/src/labels/shipping.ts`; tests API que dependan del texto.

- [ ] **Step 1:** Cambiar `ORDER_STATUS_LABELS` a: `pago pendiente`, `pagado`, `en proceso`, `enviado`, `recibido`, `cancelado`, `expirado`, `reembolsado`.
- [ ] **Step 2:** Agregar en `shipping.ts` (importando `ShippingLabelStatus` de `../enums/shipping.js`, exportado al final):

```ts
const SHIPPING_LABEL_STATUS_LABELS: Record<ShippingLabelStatus, string> = {
  [ShippingLabelStatus.PENDING]: "Guía en cola",
  [ShippingLabelStatus.REQUESTED]: "Generando guía",
  [ShippingLabelStatus.READY]: "Guía lista",
  [ShippingLabelStatus.FAILED]: "Guía con error",
  [ShippingLabelStatus.NEEDS_REVIEW]: "Guía por revisar",
  [ShippingLabelStatus.CANCEL_PENDING]: "Cancelando guía",
  [ShippingLabelStatus.CANCELLED]: "Guía cancelada",
};
```

- [ ] **Step 3:** Verificar que `packages/shared/src/index.ts` reexporta `labels/shipping` (si ya lo hace con `export *`, no hay cambio).
- [ ] **Step 4:** `grep -rnE "pagada|enviada|en preparación|pendiente de pago|cancelada|expirada|reembolsada" apps/api/tests apps/api/src` y ajustar solo las aserciones de texto que usen las etiquetas viejas (los textos de correos al cliente no se tocan).
- [ ] **Step 5:** `pnpm --filter @gira/shared build` y `pnpm --filter @gira/api test -- orderTransitions` (y cada archivo que el grep haya tocado). Esperado: PASS.

### Task 2: Tokens de envío

**Files:** Modify `apps/web/src/styles/tokens.css`.

- [ ] **Step 1:** Reemplazar el bloque "Reservados para la tarjeta de logística de M9b" por los 8 estados (los 5 existentes + `label_created: oklch(90% 0.02 90)`, `picked_up: oklch(89% 0.07 230)`, `exception: oklch(87% 0.12 45)`); el comentario pasa a "Estados de rastreo del paquete (tarjeta de logística)". Corregir "nine statuses" → "eight" en este archivo y en `Badge.tsx`.
- [ ] **Step 2:** `pnpm --filter @gira/web test -- designTokens`. Esperado: PASS.

### Task 3: `lib/orders/status.ts` (TDD)

**Files:** Create `apps/web/src/lib/orders/status.ts`, test `apps/web/tests/lib/orders/status.test.ts`.

- [ ] **Step 1: test**

```ts
import { OrderStatus } from "@gira/shared";
import { describe, expect, it } from "vitest";
import { ORDER_TABS, canEditShippingAddress, isManualTransitionAllowed } from "@/lib/orders/status";

describe("ORDER_TABS", () => {
  it("define las pestañas en el orden del flujo y termina con Todos", () => {
    expect(ORDER_TABS.map((t) => t.id)).toEqual(["pending_payment", "paid", "processing", "shipped", "delivered", "all"]);
  });
  it("usa los textos pedidos por la operación", () => {
    expect(ORDER_TABS.map((t) => t.label)).toEqual(["Pago pendiente", "Pagado", "En proceso", "Enviado", "Recibido", "Todos"]);
  });
});

describe("isManualTransitionAllowed", () => {
  it("permite paid → processing y pending_payment → cancelled", () => {
    expect(isManualTransitionAllowed(OrderStatus.PAID, OrderStatus.PROCESSING)).toBe(true);
    expect(isManualTransitionAllowed(OrderStatus.PENDING_PAYMENT, OrderStatus.CANCELLED)).toBe(true);
  });
  it("nunca ofrece shipped ni delivered", () => {
    expect(isManualTransitionAllowed(OrderStatus.PROCESSING, OrderStatus.SHIPPED)).toBe(false);
    expect(isManualTransitionAllowed(OrderStatus.SHIPPED, OrderStatus.DELIVERED)).toBe(false);
  });
});

describe("canEditShippingAddress", () => {
  it.each([OrderStatus.PENDING_PAYMENT, OrderStatus.PAID, OrderStatus.PROCESSING])("%s sí", (s) => {
    expect(canEditShippingAddress(s)).toBe(true);
  });
  it.each([OrderStatus.SHIPPED, OrderStatus.DELIVERED, OrderStatus.CANCELLED, OrderStatus.EXPIRED, OrderStatus.REFUNDED])("%s no", (s) => {
    expect(canEditShippingAddress(s)).toBe(false);
  });
});
```

- [ ] **Step 2:** correr → FAIL (módulo no existe).
- [ ] **Step 3: implementación**

```ts
import { OrderStatus, ORDER_STATUS_LABELS } from "@gira/shared";

type OrderTabId = OrderStatus.PENDING_PAYMENT | OrderStatus.PAID | OrderStatus.PROCESSING | OrderStatus.SHIPPED | OrderStatus.DELIVERED | "all";

interface OrderTabConfig {
  id: OrderTabId;
  label: string;
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

const statusTab = (status: Exclude<OrderTabId, "all">): OrderTabConfig => ({
  id: status,
  label: capitalize(ORDER_STATUS_LABELS[status]),
});

/** Pestañas de la lista: un estado por pestaña; "Todos" cubre cancelados, expirados y reembolsados. */
const ORDER_TABS: readonly OrderTabConfig[] = [
  statusTab(OrderStatus.PENDING_PAYMENT),
  statusTab(OrderStatus.PAID),
  statusTab(OrderStatus.PROCESSING),
  statusTab(OrderStatus.SHIPPED),
  statusTab(OrderStatus.DELIVERED),
  { id: "all", label: "Todos" },
];

/** Espejo de ADMIN_ALLOWED del API: shipped/delivered nunca salen de un cambio manual. */
const MANUAL_TRANSITIONS: Readonly<Record<string, readonly OrderStatus[]>> = {
  [OrderStatus.PAID]: [OrderStatus.PROCESSING],
  [OrderStatus.PENDING_PAYMENT]: [OrderStatus.CANCELLED],
};

const isManualTransitionAllowed = (from: OrderStatus, to: OrderStatus): boolean =>
  MANUAL_TRANSITIONS[from]?.includes(to) ?? false;

const EDITABLE_ADDRESS_STATUSES: readonly OrderStatus[] = [OrderStatus.PENDING_PAYMENT, OrderStatus.PAID, OrderStatus.PROCESSING];

const canEditShippingAddress = (status: OrderStatus): boolean => EDITABLE_ADDRESS_STATUSES.includes(status);

export { ORDER_TABS, isManualTransitionAllowed, canEditShippingAddress };
export type { OrderTabId, OrderTabConfig };
```

- [ ] **Step 4:** correr → PASS. Además reexportar desde este archivo (`export { ORDER_STATUS_LABELS, ORDER_STATUS_GROUPS, ORDER_STATUS_GROUP_LABELS, matchStatusGroup, ORDER_PRIORITY_LABELS } from "@gira/shared"`) para cumplir "reexportar los grupos de estado desde shared"; las exportaciones van al final del archivo.

### Task 4: `lib/orders/logistics.ts` (TDD)

**Files:** Create `apps/web/src/lib/orders/logistics.ts`, test `apps/web/tests/lib/orders/logistics.test.ts`.

Contrato:

```ts
interface LogisticsInput {
  status: OrderStatus;
  disputeStatus?: DisputeStatus | undefined;
  label?: { status: ShippingLabelStatus; trackingNumber?: string | undefined } | undefined;
}
interface LogisticsState {
  /** Mensaje cuando no hay guía que mostrar; null si la tarjeta muestra la guía. */
  emptyCopy: string | null;
  canPrepare: boolean;       // paid → processing
  canShip: boolean;          // processing + label ready + trackingNumber + sin disputa open/lost
  shipBlockedReason: string | null; // por qué "Marcar enviado" está deshabilitado (null si canShip o no aplica)
  canRetryLabel: boolean;    // (paid|processing) + label failed|needs_review
  retryNeedsWarning: boolean; // label needs_review
}
```

- [ ] **Step 1: test** (casos mínimos exigidos):
  - `pending_payment` sin guía → `emptyCopy: "Disponible cuando se confirme el pago."`, todo `false`.
  - `cancelled|expired|refunded` → `emptyCopy: "Este pedido no se enviará."`.
  - `paid` sin `label` → `emptyCopy: "La guía se genera al confirmarse el pago."`, `canPrepare: true`, `canShip: false`.
  - `paid` con guía lista → `canPrepare: true`, `canShip: false`, `shipBlockedReason: "Primero pásalo a en proceso."`.
  - `processing` + label ready + tracking → `canShip: true`, `shipBlockedReason: null`.
  - `processing` + label `pending|requested` → `canShip: false`, `shipBlockedReason: "La guía todavía no está lista."`.
  - `processing` + ready + `disputeStatus: open|lost` → `canShip: false`, `shipBlockedReason: "Hay una disputa de pago abierta o perdida."`.
  - label `failed` en `paid` → `canRetryLabel: true`, `retryNeedsWarning: false`; `needs_review` → ambos `true`; label `ready` → `canRetryLabel: false`; `shipped` con `needs_review` → `canRetryLabel: false`.
- [ ] **Step 2:** FAIL. **Step 3:** implementar `logisticsStateOf(input): LogisticsState` con esas reglas (constantes de copy arriba del archivo, export al final). **Step 4:** PASS.

### Task 5: `lib/orders/filters.ts` y `money.ts` (TDD)

**Files:** Create `apps/web/src/lib/orders/filters.ts`, `money.ts`; tests `tests/lib/orders/{filters,money}.test.ts`.

Contrato:

```ts
const ORDER_SORT_FIELDS = ["createdAt", "total", "status", "priority"] as const;
interface OrderListFilters {
  tab: OrderTabId;            // default "paid"
  status?: OrderStatus;       // solo si tab === "all"
  priority?: OrderPriority;
  orderNumber?: string;       // ya normalizado (mayúsculas) y válido
  search?: string;            // recortado, máx. 80
  sort: string;               // lista blanca, "-createdAt" por defecto
  page: number;               // >= 1
}
parseOrderFilters(params: Record<string, string | string[] | undefined>): OrderListFilters
buildOrderListQuery(filters: OrderListFilters, limit?: number): string   // sin "?"
toSearchParams(filters: OrderListFilters): string                       // para la URL de la página (omite defaults)
```

Reglas (cada una con su test): `tab` inválido → `"paid"`; `status` solo cuenta en `all` y debe ser un `OrderStatus`; `orderNumber` se pasa a mayúsculas, se recorta y se descarta si no cumple `ORDER_NUMBER_PATTERN`; `search` vacío se omite; `sort` fuera de la lista blanca (con o sin `-`) → `-createdAt`; `page` no numérico o `< 1` → `1`; `buildOrderListQuery` manda `status=<tab>` si la pestaña no es `all` (si es `all`, manda `status` solo cuando hay uno), `limit=20` por defecto y nunca envía `group`.

`money.ts`: `formatMoney(cents: number): string` → `"$1,120.00"` con `Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" })`; tests: `112000 → "$1,120.00"`, `0 → "$0.00"`, `5 → "$0.05"`.

- [ ] Ciclo FAIL → implementar → PASS por archivo.

### Task 6: Cliente HTTP (TDD con `stubFetch`)

**Files:** Modify `lib/api/paths.ts`; Create `lib/api/adminOrders.ts` (browser), `lib/api/adminOrdersServer.ts` (server); tests `tests/lib/adminOrders-api.test.ts`.

- [ ] **paths.ts:** `ADMIN_ORDERS_PATH = "/admin/orders"`.
- [ ] **adminOrders.ts (browser, todo vía `browserRequest`):**

```ts
listOrders(query: string): Promise<{ orders: Wire<AdminOrder>[]; meta: ApiMeta }>        // GET /admin/orders?query
getOrderSummary(): Promise<Wire<OrderSummary>>                                            // GET /summary → data.summary
getOrderTracking(id): Promise<Wire<AdminOrderTracking>>                                   // GET /:id/tracking → data.tracking
getOrderActivity(id): Promise<Wire<OrderActivityEntry>[]>                                 // GET /:id/activity → data.activity
updateOrderStatus(id, status, reason?)                                                    // PATCH /:id/status → data.order
updateOrderPriority(id, priority)                                                         // PATCH /:id/priority
updateShippingAddress(id, address)                                                        // PATCH /:id/shipping-address
bulkMarkProcessing(ids)                                                                   // PATCH /bulk-status {ids, status:"processing"} → data.result
markShipped(id)                                                                           // POST /:id/ship
retryLabel(id)                                                                            // POST /:id/label/retry
requestRefund(id)                                                                         // POST /:id/refund (sin cuerpo)
```

Los GET del navegador también usan `browserRequest` (la lista se refresca en el cliente). `adminOrdersServer.ts` expone `getOrder(id)` con `serverRequest` → `data.order`. Los `id` se validan con `/^[a-f\d]{24}$/i` antes de armar la ruta (si no, `ApiError` de tipo `parse`), para que una URL manipulada nunca llegue a la API.

- [ ] **Tests:** con `stubFetch`, comprobar por cada función método, URL (`http://api.test/api/v1/admin/orders/...`), cuerpo JSON y que se desenvuelve la clave correcta; `bulkMarkProcessing` manda `{ids, status:"processing"}`; `requestRefund` no manda cuerpo; id inválido lanza sin llamar a `fetch`.

### Task 7: Toast

**Files:** Create `components/ui/Toast.tsx`, test `tests/components/Toast.test.tsx`; Modify `components/shell/AdminShell.tsx` (envolver con `ToastProvider`).

- Contrato: `ToastProvider` + `useToast(): { toast(input: { variant: "success"|"info"|"warning"|"error"; title: string; description?: string }): void }`. Duración: success 4 s, info 5 s, warning 6 s, error sin autocierre (botón "Cerrar"). Máximo 3 visibles (el más viejo sale). Región `aria-live="polite"` (`assertive` para error), arriba a la derecha, `z-[var(--z-dialog)]`. Estilo: `NB_SURFACE` + fondo `--color-success-soft|info|warning-soft|danger-soft`. `useToast` fuera del provider lanza `Error`.
- Tests (con `vi.useFakeTimers`): aparece y desaparece a los 4 s en success; error persiste; el cuarto toast desplaza al primero; botón Cerrar lo quita; hook fuera del provider lanza.

### Task 8: SlideOver, Toggle, ConfirmDialog

**Files:** Create `components/ui/{SlideOver,Toggle,ConfirmDialog}.tsx` y tests homónimos.

- **Toggle** `{ checked, onChange, label, disabled? }`: `<button role="switch" aria-checked>` con el texto de `label` visible al lado. Tests: alterna con clic y con Espacio/Enter, respeta `disabled`.
- **SlideOver** `{ open, onClose, title, children, footer? }`: panel de 30rem (100 % en móvil) desde la derecha, scrim `--color-scrim`, `role="dialog" aria-modal aria-labelledby`, `useFocusTrap(open)`, Escape y clic en el scrim cierran, `animate` solo con `transform` 250 ms `--ease-drawer` (sin animar layout), `motion-reduce` sin transición. Cuando `open` es false no renderiza. Tests: no renderiza cerrado; Escape llama `onClose`; el foco se mueve adentro y vuelve al disparador.
- **ConfirmDialog** `{ open, title, description?, confirmLabel, tone: "default"|"danger", onConfirm: () => void | Promise<void>, onCancel, reasonField?: { label, minLength, maxLength }, children? }`: `<dialog>` nativo con `showModal()`; con `reasonField` muestra textarea con contador y deshabilita "Confirmar" hasta cumplir `minLength` (recortando espacios); `onConfirm` recibe el motivo vía `onConfirm(reason?: string)`; mientras la promesa corre, botón `loading` y diálogo no se cierra con Escape; error de la promesa queda inline (`Notice danger`). Tests: confirmar deshabilitado con motivo corto (4 caracteres) y habilitado con 5; cuenta caracteres; Escape llama `onCancel`; `onConfirm` recibe el motivo recortado; loading bloquea doble clic.
- jsdom no implementa `HTMLDialogElement.showModal`: en `tests/setup.ts` agregar el polyfill mínimo (`showModal` pone `open`, `close` lo quita y dispara `close`).

### Task 9: Chips de pedido

**Files:** Create `components/orders/{PriorityBadge,LabelStatusChip,TrackingStatusChip,DisputeBadge}.tsx`, test `tests/components/orderChips.test.tsx`.

- `PriorityBadge({ priority })`: `normal` → `null`; `alta` → `Badge warn`; `urgente` → `Badge danger` con icono `WarningIcon`. Texto de `ORDER_PRIORITY_LABELS`.
- `LabelStatusChip({ status })`: `ready` ok, `needs_review` danger, `failed` warn, `pending|requested|cancel_pending` neutral, `cancelled` neutral; texto `SHIPPING_LABEL_STATUS_LABELS`; `data-label-status`.
- `TrackingStatusChip({ status })`: fondo `bg-[var(--ship-<status>)]` con `BADGE_BASE`; texto `SHIPMENT_TRACKING_STATUS_LABELS`; `Record<ShipmentTrackingStatus, string>` para el mapa de fondos (typecheck exhaustivo).
- `DisputeBadge({ status })`: solo `open|lost` visibles (danger); `won|withdrawn|undefined` → `null`.
- Tests: `it.each(Object.values(...))` por enum para confirmar texto y que ningún estado queda sin fondo.

### Task 10: Navegación y breadcrumbs con folio

**Files:** Modify `lib/navigation.ts`, `lib/breadcrumbs.ts`, `components/shell/Breadcrumbs.tsx`, `tests/lib/navigation.test.ts`, `tests/components/CommandPalette.test.tsx`, `tests/lib/breadcrumbs.test.ts` (crear si no existe); Create `components/shell/BreadcrumbLabel.tsx`.

- [ ] `navigation.ts`: `orders.available = true`, borrar la entrada `shipments` y el import de `TruckIcon` si queda sin uso. Actualizar `navigation.test.ts` (disponibles = Resumen y Pedidos) y quitar el caso "envios" de `CommandPalette.test.tsx` (sustituirlo por buscar "pedidos").
- [ ] `breadcrumbs.ts`: `breadcrumbsFor(pathname, lastLabel?)`; si se pasa `lastLabel`, reemplaza el texto del último segmento. Test: `/pedidos/abc123` sin override conserva el comportamiento; con `"GC-7KQ3M2XV"` termina en `Panel / Pedidos / GC-7KQ3M2XV`.
- [ ] `BreadcrumbLabel.tsx` (cliente): contexto `BreadcrumbLabelProvider` (en `AdminShell`, alrededor de `Breadcrumbs`) y componente `<BreadcrumbLabel label="GC-…" />` que registra la etiqueta en un `useEffect` y la limpia al desmontar; `Breadcrumbs` la lee y la pasa a `breadcrumbsFor`. Test: render del detalle con el provider muestra el folio, no el id.

### Task 11: Hooks de datos (TDD)

**Files:** Create `hooks/useOrderList.ts`, `hooks/useOrderSummary.ts`, `hooks/useOrderActions.ts`; tests `tests/hooks/useOrderList.test.tsx`, `useOrderActions.test.tsx`.

- `useOrderList(filters: OrderListFilters)` → `{ orders, meta, status: "loading"|"error"|"ready", error, refresh }`: `useEffect` con bandera `cancelled`, query de `buildOrderListQuery`, vuelve a `loading` al cambiar filtros, `refresh()` re-ejecuta. Sin polling.
- `useOrderSummary()` → `{ counts: Record<OrderStatus, number> | null, refresh }`; falla en silencio (las pestañas solo pierden el número).
- `useOrderActions(onChanged: () => void)` → funciones `prepare(id)`, `ship(id)`, `retryLabel(id)`, `cancel(id, reason)`, `refund(id)`, `setPriority(id, p)`, `bulkPrepare(ids)`, `saveAddress(id, a)`; cada una: `busyId` mientras corre, toast de éxito (`"Pedido GC-… en proceso"` etc., con el folio, nunca el id), toast de error con `error.message` de la API (los 403/409 ya vienen en español) y `onChanged()` al terminar bien. `bulkPrepare` resume `updated/unchanged/rejected` en un toast (`warning` si hubo `rejected`, con los folios rechazados y su `message`).
- Tests: lista pasa a `ready` con datos; cambiar filtros vuelve a cargar y descarta la respuesta vieja; error HTTP → `error`; `prepare` llama `PATCH /:id/status` con `processing`, muestra toast y llama `onChanged`; un 409 muestra el mensaje del API y no llama `onChanged`; `bulkPrepare` con un `rejected` genera toast de advertencia.

### Task 12: Página Pedidos (`/pedidos`)

**Files:** Create `app/(admin)/pedidos/{page,loading}.tsx`, `components/orders/{OrdersPage,OrderTabs,OrderFilters,OrderCard,OrderPreview,BulkBar,OrdersEmpty}.tsx`; test `tests/components/OrdersPage.test.tsx`.

- `page.tsx` (server): lee `searchParams`, `parseOrderFilters`, renderiza `<OrdersPage initialFilters />` dentro de `PageHeader` ("Pedidos") y `ErrorBoundary` con `SectionError`. `loading.tsx` con `Skeleton` de la misma geometría (sin saltos).
- `OrdersPage` (cliente): estado de filtros sincronizado con la URL (`router.replace`, sin scroll), `useOrderList`, `useOrderSummary`, `useOrderActions(refresh + summary.refresh)`, pedido seleccionado para la vista previa (por defecto el primero; se limpia si deja de estar en la lista), selección en lote (`Set<string>`).
- `OrderTabs`: `Tabs` existente con `ORDER_TABS` y conteo de `countsByStatus` (sin conteo en "Todos").
- `OrderFilters`: folio (mayúsculas, valida contra `ORDER_NUMBER_PATTERN`, error inline), búsqueda (debounce 300 ms), prioridad (`SelectField`), orden (lista blanca con etiquetas: "Más recientes", "Más antiguos", "Mayor total", "Menor total"), `Toggle` "Solo urgentes" (→ `priority=urgente`); en "Todos" además `SelectField` de estado.
- `OrderCard`: folio mono + total mono, cliente, `StatusChip` + `PriorityBadge` + `DisputeBadge`, fecha; checkbox solo si `status === paid` (`aria-label="Seleccionar GC-…"`); clic selecciona para la vista previa en `lg+` y navega al detalle en pantallas menores (`matchMedia` o enlace con clase `lg:hidden`/`hidden lg:block`; elegir enlace doble para no depender de JS).
- `OrderPreview` (solo `lg+`, `sticky`): folio, estado, prioridad, logística resumida (`LabelStatusChip`, paquetería, guía), artículos (nombre ×cantidad), total, botón primario según `logisticsStateOf` (`paid` → "Pasar a en proceso", `processing` + `canShip` → "Marcar enviado"; si no, ninguno) y "Abrir pedido" → `/pedidos/<id>`. **Amarillo solo en el botón primario** (regla CTA).
- `BulkBar` (sticky abajo) con "N pedidos seleccionados · Limpiar · Pasar a en proceso" (máx. `MAX_BULK_ORDERS`; al llegar al tope, deshabilita las casillas restantes y lo dice).
- Estados: loading (`SkeletonRows`), vacío por pestaña (`EmptyState` con copy propio: "No hay pedidos pagados por atender." etc.), error (`Notice danger` + botón "Reintentar"), `Pagination` con `meta`.
- Tests: pestaña activa lee de la URL; cambiar de pestaña actualiza `status` en la petición; folio inválido muestra error y no consulta; el checkbox no aparece fuera de `paid`; seleccionar dos y pulsar el lote llama `bulk-status`; vacío y error se dibujan.

### Task 13: Detalle (`/pedidos/[id]`)

**Files:** Create `app/(admin)/pedidos/[id]/{page,loading}.tsx`, `components/orders/detail/{OrderDetail,OrderHeader,OrderLines,OrderTotals,AddressCard,AddressForm,CustomerCard,PaymentCard,LogisticsCard,TrackingTimeline,ActivityCard,CancelOrderAction}.tsx`; tests `tests/components/{LogisticsCard,AddressForm,OrderDetail}.test.tsx`.

- `page.tsx` (server): valida el `id` con la misma regex (inválido → `notFound()`), `getOrder(id)`; 404 de la API → `notFound()`, otros errores → `SectionError`. Renderiza `<OrderDetail order />` y `<BreadcrumbLabel label={order.orderNumber} />`. Nunca renderiza `publicId`.
- `OrderDetail` (cliente): mantiene el pedido en estado (los actions devuelven el pedido actualizado), orden de bloques como el mockup: encabezado → artículos y totales → dirección y cliente → logística → pago y actividad. Contenedor `max-w-[820px]`, una sola `Card` con separadores de 2px de tinta (hoja de empaque), sin tarjetas anidadas.
- `OrderHeader`: folio mono grande, `StatusChip`, `PriorityBadge`, `DisputeBadge`, fecha, cliente; selector de prioridad inline (`SelectField` → `setPriority`, sin diálogo).
- `OrderLines`/`OrderTotals`: snapshot de `lines` (imagen o recuadro "IMG", nombre, SKU, ×qty, unitario, total de línea) y totales (subtotal con IVA incluido, de los cuales IVA `taxRateBps/100 %`, descuento si > 0, envío, total), todo `formatMoney` en mono.
- `AddressCard` + `AddressForm`: el botón "Corregir" solo si `canEditShippingAddress`; abre `SlideOver` con formulario (campos y límites del validador: `recipient` 2–120, `line1` 3–200, `line2` ≤200, `district` 2–120, `city` 2–120, `state` select de `MEXICAN_STATES`, `postalCode` 5 dígitos, `country` fijo MX); si hay guía (`label` presente y no cancelada) el CP queda `readOnly` con ayuda "No se puede cambiar: ya hay guía"; si hay guía lista se avisa "Se cancelará la guía y se comprará otra." Validación en cliente con las mismas reglas (`POSTAL_CODE_PATTERN`) y error de la API inline.
- `LogisticsCard`: usa `logisticsStateOf`. Muestra `emptyCopy` cuando aplica; si hay guía: `LabelStatusChip`, paquetería y servicio (`shippingSelection.serviceName`, `SHIPPING_CARRIER_LABELS`), guía en mono con botón "Copiar" (`navigator.clipboard`, toast "Guía copiada"), enlaces "Rastrear paquete" (`label.trackUrl`) y "Ver etiqueta" (`label.labelUrl`) con `rel="noopener noreferrer" target="_blank"` y solo si la URL es `https:`, `TrackingStatusChip` de `tracking.status`, aviso `Notice warning` si `exception|returned|lost`, `lastError` en `needs_review|failed`, y `TrackingTimeline` (carga `getOrderTracking` al montar cuando `shippedAt` o `label.status === ready`; eventos más recientes primero; estado vacío "Aún no hay eventos de rastreo."). Botones: "Pasar a en proceso" (`canPrepare`), "Marcar enviado" (`canShip`; si no, deshabilitado y `shipBlockedReason` visible bajo el botón), "Reintentar guía" (`canRetryLabel`; con `retryNeedsWarning` abre `ConfirmDialog` danger: "Si la primera guía sí se creó, Envía puede cobrar una segunda. Revisa en el portal de Envía antes de continuar.", confirmar "Sí, reintentar"; sin warning, confirmación simple).
- `CancelOrderAction` (solo `pending_payment`): `ConfirmDialog` danger con `reasonField` 5–300 (`CANCEL_REASON_MIN/MAX` de shared) y texto "Se liberará el stock reservado.".
- `PaymentCard`: proveedor, estado, `card` como `Visa ••••4242` (solo brand + last4), cobrado (`capturedAt`), reembolsado (`refundedAmount`); botón "Solicitar reembolso" (danger) visible si hay `intentId` y el estado es `paid|processing|shipped|delivered`, con `ConfirmDialog` que muestra el monto total y aclara "El estado pasará a reembolsado cuando Stripe lo confirme.".
- `ActivityCard`: carga `getOrderActivity` al montar; acciones con etiqueta en español (mapa `Record` parcial con fallback al `action` crudo en mono), actor `Sistema` o `Equipo` (nunca el id), fecha; vacío y error propios. También muestra `cancelReason` si existe.
- Tests: `LogisticsCard` por estado (lista para enviar habilita el botón y llama `ship`; `paid` con guía lista deshabilita con motivo; `needs_review` abre el diálogo con la advertencia y solo reintenta tras confirmar; `https` únicamente en enlaces; cancelado muestra "Este pedido no se enviará."); `AddressForm` (CP bloqueado con guía, valida 5 dígitos, estado en select, error de API inline); `OrderDetail` no contiene `publicId` en el DOM (fixture con `publicId` centinela) y muestra el folio.

### Task 14: Limpieza de residuos

**Files:** Modify `app/(admin)/kit/KitContent.tsx`, `components/shell/NavItem.tsx` (solo si referencia envíos), `tests`.

- [ ] Quitar de `KitContent` el `StatCard "Envíos activos"` y la pestaña "Enviados" (sustituir por textos neutros de ejemplo) y actualizar su hint "Los 9 de pedido" → "Los 8 de pedido"; revisar `grep -rniE "shipment|envios|envíos" apps/web/src apps/web/tests` y dejar solo lo legítimo (`OutboxHealthPanel` `TEAM_SHIPMENT_INCIDENT`).
- [ ] `pnpm --filter @gira/web test -- kit` y `-- designTokens`.

### Task 15: Verificación final y prueba visual

- [ ] `pnpm --filter @gira/shared build`
- [ ] `pnpm --filter @gira/web typecheck`
- [ ] `pnpm --filter @gira/web lint` (si el script existe) y `pnpm --filter @gira/web test`
- [ ] `NEXT_PUBLIC_API_URL=http://localhost:4000 pnpm --filter @gira/web build`
- [ ] `pnpm --filter @gira/api typecheck` y `pnpm --filter @gira/api test` (flake conocido: re-correr aislado los que fallen antes de investigar), por el cambio de etiquetas.
- [ ] **Prueba visual sin Atlas:** `mongod --replSet rs0` local con `--dbpath` en el scratchpad + `rs.initiate()` (sin `mongosh`, usar un script de Node con el driver); API con `MONGODB_URI=mongodb://127.0.0.1:27017/gira-m9b?replicaSet=rs0` exportado en el shell. **Antes de arrancar**, comprobar que esa variable gana sobre `apps/api/.env.development.local` (loader de env) imprimiendo solo el host de la conexión; si gana Atlas, detenerse. Seed de pedidos de ejemplo (script en el scratchpad, no commiteado; con `seedOrder`-like usando los modelos, sin mongo-memory) que cree uno por estado, uno con guía `needs_review`, uno `shipped` con eventos y uno con disputa. Admin: `seed:admin` contra la base local y 2FA (`totpFor` en el script). Recorrer con la skill `run`/navegador: lista, pestañas, filtros, lote, vista previa, detalle, pasar a en proceso → marcar enviado, reintento con advertencia, corrección de dirección, cancelación, reembolso (stub), teclado y foco, móvil.
- [ ] Pase de impeccable (`audit` y `polish`) sobre `/pedidos` y `/pedidos/[id]`.
- [ ] `requesting-code-review` sobre el diff completo; corregir hallazgos.
- [ ] Mostrar `git status` y `git diff --stat`; entregar los comandos de commit y merge (sin ejecutarlos).
- [ ] Actualizar memorias `project_milestone_status`, `project_standards_debt` y `project_envia_shipping`.

---

## Auto-revisión (spec → tarea)

| Requisito | Tarea |
|---|---|
| Pestañas por estado + Todos, conteos de `countsByStatus` | 3, 5, 11, 12 |
| Etiquetas masculinas ("recibido") | 1 |
| Vista previa + lista (mockup C), lote solo `paid` | 12 |
| Detalle en ruta propia, sin `publicId`, folio en breadcrumbs | 10, 13 |
| Tarjeta de logística (guía, paquetería, enlace, línea de tiempo, 3 botones, aviso de segunda guía) | 4, 13 |
| shipped solo con `/ship`; delivered nunca ofrecido | 3, 4, 13 |
| Cancelar con motivo 5–300; reembolso total con aviso de webhook; dirección con reglas | 8, 13 |
| Toast, SlideOver, Toggle (+ ConfirmDialog) | 7, 8 |
| Grupos reexportados desde shared | 3 |
| Quitar "Envíos", `--ship-*` consumidos, residuos de StatusChip/KitContent | 2, 9, 10, 14 |
| Verificación y prueba visual con stub sin Atlas | 15 |

## Pendientes conocidos (post-review)

**Desviaciones respecto al plan original:**
- `ConfirmDialog` usa portal + `useFocusTrap` (igual que `CommandPalette`), no `<dialog>` nativo: evita el polyfill en jsdom y mantiene un solo patrón de diálogos. Se reinicia solo al cerrarse y no cierra si la acción falla (los manejadores del padre cierran solo con éxito).
- Los filtros usan solo el `Toggle` "Solo urgentes" (no hay select de prioridad); `?prioridad=alta` sigue funcionando por URL.
- El código postal del formulario de dirección es **siempre** de solo lectura: el API rechaza cualquier cambio de CP (409), no solo con guía.
- Los pedidos llegan a los componentes como `PanelOrder` (sin `publicId`, `user` ni `statusHistory`), recortados en `lib/api/adminOrders*.ts`.
- Nuevo: la guía en `pending/requested/cancel_pending` se relee cada 4 s (máx. 1 min) en el detalle; una acción que vacía la página actual regresa a la última existente; los filtros se resincronizan con la URL cuando cambia desde fuera.
- Textos de estado en masculino en `ORDER_STATUS_LABELS` (shared): los mensajes de error de la API que los usan ahora dicen "pagado", "en proceso", "recibido"… El mensaje "Primero marca el pedido «en preparación»." del API (`shipmentTrackingService.ts`) y "Solo se puede marcar en preparación en lote." (`adminOrderValidator.ts`) siguen con el texto viejo.

**Quedan (decisiones o fuera de M9b):**
- **API: quitar `publicId` del DTO admin** (`toAdminOrder` hereda de `toPublicOrder`). La web ya lo recorta, pero sigue viajando en las respuestas de red (visible en DevTools). Conviene un `AdminOrder` que no extienda `PublicOrder`.
- **API: guardia contra un segundo reembolso.** `requestRefund` no impide pedirlo dos veces mientras llega el webhook; la UI lo oculta solo en esa sesión (al recargar el botón vuelve).
- "Marcar enviado" no pide confirmación (manda el correo "enviado" al cliente); decidir si se agrega una confirmación ligera.
- El mensaje del API "Primero marca el pedido «en preparación»." y el del lote deben pasar a "en proceso" para coincidir con la UI.
- Estado 404 de `/pedidos/<id inválido>` sale con HTTP 200 (la pantalla sí es "no encontrada"): efecto de `loading.tsx` con streaming en Next.
- `Toast` no usa una región `aria-live` persistente (los nodos `role=status/alert` se anuncian de forma desigual entre lectores de pantalla).
- Notas internas, "ruta pública por folio" y edición del IVA siguen fuera (no pedidos).
- Prueba visual hecha con `mongod` local (puerto 27018, base `gira-m9b`), API con proveedores en stub y un seed en el scratchpad (no commiteado). Con Envía real faltan por confirmar en sandbox los puntos listados en `project_envia_shipping`.
