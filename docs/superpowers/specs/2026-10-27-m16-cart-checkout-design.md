# M16 — Carrito y checkout (spec)

## Contexto

Hoy nadie puede comprar desde la tienda: no hay `/carrito`, ni checkout, ni cliente de órdenes, ni Stripe en la web. El API ya crea la orden + PaymentIntent, reserva stock (30 min), cotiza con Envía y procesa el webhook de Stripe, pero acepta invitados, no maneja totales bajo el mínimo de Stripe, no deja reanudar ni cancelar un pedido pendiente, no expone el cupón y no avisa al cliente de pago fallido ni de reembolso. Además, el merge del carrito invitado nunca descarta productos retirados (el API responde 400/409, el merge solo descarta 404/410), así que el aviso de M15c casi nunca sale.

Rama `feat/m16-cart-checkout` desde main (7c6d719, «Merge: M15c» confirmado). Referencias: Esencia Glow (checkout por pasos, Element diferido, polling) y BW Bikes (mismo patrón; mínimo de $10 contra cupones; la clave de idempotencia se reutiliza hasta que cambia el carrito).

## Decisiones tomadas (tus respuestas)

| Tema | Decisión |
|---|---|
| Pago | **Stripe Payment Element diferido** (`mode:"payment"` + monto del servidor, solo `card`, `locale:"es"`, sin wallets, apariencia con tokens y sin sombras). La orden y la reserva se crean **al presionar Pagar**. Después: `elements.submit()` → `POST /orders` → `confirmPayment({redirect:"if_required", return_url:/orden/[publicId]})`. |
| Correo verificado | Guarda en `createOrder`: `emailVerified !== true` → 403, con test. |
| Reserva | Se queda la de 30 min al crear la orden. **Un solo pedido pendiente por cliente** (índice único parcial). Reanudar el pago y cancelar desde «Mis pedidos». Un rechazo de tarjeta deja reintentar en la misma orden hasta que venza. |
| Total 0 / < $10 | El checkout bloquea con 409 cualquier total < $10 MXN, **antes de reservar stock**. El formulario de Cupones del panel avisa a las dueñas. No hay camino de pedido gratis. |
| Facturación | Fuera del checkout. |
| Contrato del carrito | 410 = retirado o inexistente (definitivo). El stock no se revisa al escribir. `GET /cart` marca cada línea `available | out_of_stock | retired`. |

## Partición

Igual que M15: **M16a = API + merge** y **M16b = páginas de la tienda**. Cada mitad se verifica y la mergeas tú antes de seguir. Las dos van en la misma rama, salvo que prefieras ramas separadas.

---

## M16a — API (TDD) + merge del carrito

### 1. Contrato del carrito
- `cartService.setCartLine`: variante inexistente, o variante/producto/estampa inactivos → **410** «Este producto ya no está disponible.». Solo en la ruta del carrito; `createOrder` mantiene su 409.
- `GET /cart`: cada línea lleva `status` (`retired` si algo de la cadena está inactivo; `out_of_stock` si `onHand−reserved < qty`; si no, `available`), en lugar de `isAvailable`. Una variante borrada en duro sale como `retired` con lo mínimo, para poder quitarla. El DTO `CartView` pasa a `packages/shared`.
- **Nuevo** `POST /cart/preview` (público, limiter por IP): body `lines[{variantId, qty}]` (máx. 30). Devuelve la misma vista de líneas con `status` y nunca falla por una línea. Por ser público, una línea retirada va desnuda (`{variantId, qty, status}`) y la disponibilidad es la señal del catálogo (hay o no hay), no la comparación contra la cantidad; la cantidad exacta se revisa con sesión (`GET /cart`) y al reservar. Es lo que pinta `/carrito` para el visitante (su carrito solo guarda `{variantId, qty}`).
- `mergeGuestCart`: descarta con **410** (se quitan 404/410 sueltos). Lo demás (red, 5xx, 429, 401) se queda en el navegador y se reintenta en el siguiente login. Las líneas sin stock pasan a la cuenta y el carrito las marca. El aviso `CartMergeNotice` ya existente sale con el conteo real. Pruebas: unitarias del merge con 410 y una de integración del 410 en el API.

### 2. Órdenes
- `POST /orders`: `protect` + `restrictTo(customer)` y después `checkoutLimiter` con `userKey`. El correo y el nombre salen de la cuenta (se quitan del body). El teléfono sale de la dirección elegida. 403 si el correo no está verificado. La cotización tiene que ser del mismo usuario (hoy una cotización de invitado se acepta).
- **Mínimo de cobro:** constante `MIN_CHARGEABLE_CENTS = 1000` en shared. Si `quoteTotals` da `total < 1000` → 409 «Con este cupón tu pedido queda en menos de $10 y no se puede pagar con tarjeta.», antes de reservar stock y de canjear el cupón.
- **Un pendiente por cliente:** índice único parcial `{usuario}` con `status: pending_payment`. Si choca → 409 «Ya tienes un pedido por pagar» (sin id: `AppError` solo lleva mensaje; la tienda lo busca con `GET /orders/mine?status=pending_payment`). Antes de crear el índice en gira-m15/Atlas: script de verificación (dry-run) que lista clientes con más de un pendiente. Tú corres el de Atlas.
- **Nuevo** `POST /orders/preview` (sesión, limiter por usuario): `{couponCode?, shippingQuote?}` → totales calculados con la misma cadena que `createOrder` (`resolveOrderLines` del carrito, `resolveQuotedRate`, `resolveCouponForCheckout`, `quoteTotals`), sin efectos. De ahí salen el monto del Element, el descuento del cupón y el aviso del mínimo. Al pagar se comparan totales: si `order.total` ≠ total mostrado, no se confirma y se avisa (patrón de Esencia/BW).
- **Nuevo** `POST /orders/mine/:id/payment`: el dueño en el filtro (si no, 404). Solo `pending_payment`, si no 409. Devuelve el `clientSecret` del mismo intent (`getPayment`; se arregla el stub, que hoy no lo devuelve).
- **Nuevo** `POST /orders/mine/:id/cancel`: primero cancela el intent en Stripe y luego hace la transición a `cancelled` y libera la reserva (y el cupón) por el camino que ya usa `payment_intent.canceled`. Si el pago ya se cobró → 409 «Tu pago ya se procesó».
- `GET /orders/mine?status=pending_payment` (filtro opcional) para que el checkout detecte el pendiente.
- Adapter Stripe: `payment_method_types:["card"]` en lugar de `automatic_payment_methods`, para que coincida con el Element.

### 3. Huecos de §7
- **Cupón en `PublicOrder`/`CustomerOrder`:** `coupon: {code, discountType, value} | null`. El correo de confirmación agrega la línea de descuento.
- **Correo de pago fallido:** al `payment_failed`, un solo correo por orden (lo garantiza el índice único `(order, type)` de la bandeja de salida), encolado con 10 min de retraso y omitido al despachar si la orden ya no está por pagar. El texto invita a reintentar desde «Mis pedidos» y nunca menciona reembolso.
- **Correo de reembolso:** cuando un reembolso total pasa la orden a `refunded`, se manda la confirmación con el monto. Es idempotente por orden.
- Tipos nuevos en `enums/notification.ts` y plantillas en `templates/orderEmails.ts`. Se envían sin esperar, como los demás.

### 4. Panel
- En el formulario de Cupones, un `Notice` cuando es 100 % o un monto fijo: «Si con este cupón el pedido queda en menos de $10 (por ejemplo, 100 % con envío gratis), no se podrá pagar.».

### Pruebas que se rompen y cómo
Unas 21 pruebas HTTP de invitado (`orderRoutes`, `orderCreate`, `orderShipping`, `couponCheckout`) pasan a iniciar sesión con `loginAsCustomer`. Los helpers `createPendingOrder`/`createOrderWithQuote` crean un cliente nuevo por llamada, para no chocar con el índice de un pendiente. Así las ~19 suites de servicio no se tocan una por una.

---

## M16b — Tienda

- **CSP** (`lib/security/headers.ts`): `script-src https://js.stripe.com`, `frame-src https://js.stripe.com https://hooks.stripe.com` y `connect-src https://api.stripe.com`, con tests sobre `buildCsp`. Va **global**: la CSP se fija con el primer documento, así que pasar de `/carrito` a `/checkout` con navegación del cliente heredaría la de `/carrito` y Stripe quedaría bloqueado. `@stripe/stripe-js` + `@stripe/react-stripe-js` (versión fija). `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`; sin ella, el paso de pago dice «Pagos no disponibles».
- **`/carrito`**: dos columnas con resumen fijo. Visitante: `POST /cart/preview`; con sesión: `GET /cart`. Cantidad con stepper (1–20), «Quitar», líneas `retired`/`out_of_stock` marcadas fuera del total y checkout bloqueado hasta quitarlas, `EmptyState`. CTA primario «Continuar al pago»: con sesión → `/checkout`; visitante → puerta con «Iniciar sesión» (primary) y «Crear cuenta», los dos con `?redirect=/checkout` (ya permitido por `safeRedirect`). En la implementación compruebo que el redirect sobreviva a crear cuenta → verificar → ingresar; si se pierde, lo digo antes de tocarlo.
- **`/checkout`** (`requireCustomer("/checkout")`): una página con resumen fijo; en móvil, apilada.
  1. **Envío:** las direcciones guardadas (`GET /account`), con la predeterminada elegida, o «Usar otra dirección». El formulario extrae los campos de `AddressForm` a un `AddressFields` presentacional y reutiliza `addressValidation`; la dirección nueva no se guarda en la cuenta. Luego «Ver opciones de envío» (`POST /shipping/quotes` con `useCart`): paqueterías como radiogroup con la más barata preseleccionada, más los estados de carga, error con reintento, sin cobertura y vencida. Cambiar la dirección descarta la cotización.
  2. **Pago:** campo de cupón (aplica con `POST /orders/preview`), totales del servidor, casilla de términos y Payment Element diferido. Stripe se carga una sola vez a nivel de módulo, con `next/dynamic` y sin SSR. «Pagar $X» (primary). `Idempotency-Key`: un UUID en `sessionStorage`, ligado a la huella del carrito, la dirección, la paquetería y el cupón. Los errores van junto al botón: rechazo de tarjeta (mismo pedido, puede reintentar), cotización vencida (volver a cotizar), artículo no disponible (volver al carrito), mínimo de $10 (quitar el cupón), pedido pendiente (enlace a pagarlo).
  - Si ya hay un pedido pendiente, el checkout muestra «Tienes un pedido por pagar» con «Pagar» y «Cancelar» en lugar del formulario.
- **`/orden/[publicId]`** (ruta que ya prometen los correos): Server Component con `GET /orders/:publicId`. Mientras el pedido siga `pending_payment`, consulta cada 3 s hasta 10 veces y luego hace `router.refresh()`. Estados: confirmando, pagado («Gracias por tu compra»: líneas, cupón, dirección, paquetería, totales), cancelado/vencido y tiempo agotado («Tu banco aún no confirma…»). La página no marca nada como pagado.
- **Mis pedidos** (`/cuenta/pedidos/[id]`): si está pendiente, «Pagar pedido» (primary) monta el Element con el `clientSecret` de `POST /orders/mine/:id/payment` y «Cancelar pedido» (danger, `ConfirmDialog`). Los formularios en sitio usan `useFocusFirstField` y devuelven el foco al encabezado. La lista ya muestra el estado.
- Cliente HTTP: `lib/api/orders.ts` (crear, preview, pagar, cancelar) y `cart.ts` (preview, quitar línea, lectura completa), siempre por `browserRequest`.

Se reutiliza: `AccountShell`, `requireCustomer`, `useSubmit`, `Field`, `SelectField`, `ConfirmDialog`, `EmptyState`, `Notice`, `LoadFailure`, `Button` con su `variant`, `formatPesos`, `PriceTag`, `useCartCount`/`CART_CHANGED_EVENT`, `addressValidation`, `OrderLines`/`OrderShippingInfo`.

## Flujo de skills
senior-architect (contrato del API arriba) → TDD en M16a (precio mínimo, índice de pendiente, pagar/cancelar, 410 del carrito, correos, merge) → senior-backend/senior-frontend → requesting-code-review (subagente) → verification-before-completion. La spec corta se copia a `docs/superpowers/specs/2026-10-27-m16-cart-checkout-design.md`; no hay plan aparte con código.

## Verificación
- `pnpm --filter @gira/shared build`, typecheck de API y web, `pnpm exec eslint apps/web` y del API (se mantienen los 6 errores previos conocidos), tests de API (los flakes conocidos se corren aislados) y de web.
- `next build --no-lint` en la copia `apps/web-e2e`, `next start -p 3120` contra el API 4120 + mongod 27018 (`gira-m15`). La copia se borra al terminar.
- Recorrido en Chromium a 1440 y 390: visitante agrega → `/carrito` → puerta → ingresar (emilio.diaz) → vuelve a `/checkout` → dirección guardada → cotizar (stub de Envía) → cupón → pagar → `/orden/...` hasta «pagado». Producto retirado en el carrito del navegador → login → aviso de descartados. Pedido pendiente → pagar y cancelar desde Mis pedidos. Pasada con teclado.
- **Pagos:** sin llaves de prueba de Stripe, el Element no monta (el stub devuelve un secret falso). Con tus `pk_test`/`sk_test` + `stripe listen` el recorrido es real (tarjetas 4242 y de rechazo). Sin ellas, se verifica hasta antes de pagar y el webhook con el firmado del stub. Te las pido al llegar a M16b.
- Te muestro `git status`/`git diff`; los commits los haces tú.
