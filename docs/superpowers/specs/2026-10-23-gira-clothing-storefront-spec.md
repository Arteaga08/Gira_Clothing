# Gira Clothing — Tienda pública (spec Bloque 3)

> Fecha: 2026-10-23 · Estado: **borrador para aprobación de Manuel** · Alcance: **tienda pública, M13–M17**

## 1. Contexto

Los Bloques 1 (API + seguridad, M1–M4) y 2 (panel admin, M5–M12c) están mergeados. El API expone
catálogo, carrito, órdenes, pagos con Stripe, cotización de envío con Envía y cuentas de cliente. El
spec maestro (`2026-07-23-gira-clothing-plan-maestro.md`) dejó el Bloque 3 sin decisiones de diseño:
ni paleta, ni tipografía, ni layout, ni el selector de estampas. Hoy nadie puede comprar desde el
navegador.

Este spec fija las decisiones de arquitectura y el roadmap de la tienda. Igual que el spec del
panel, cada milestone corre en su propia sesión y solo carga este documento más el estado del repo.

Antes de este spec hubo una exploración visual: mockups estáticos (navbar, home completo, catálogo y
ficha de producto) en tres direcciones groovy/retro con la paleta de Gira. Viven **fuera del repo**
(scratchpad de la sesión del 2026-10-22); este documento recoge lo que de ahí se decidió.

## 2. Estándares que rigen

- `~/.claude/CLAUDE.md` — no-negociables (capas, bilingüismo, exports al final, sin features no
  pedidas, cero `git add/commit/push` sin permiso).
- `ECOMMERCE_ARCHITECTURE_GUIDELINES.md` (tienda, carrito, checkout, pagos, órdenes),
  `FRONTEND_GUIDELINES.md` (RSC por defecto, Core Web Vitals, a11y, SEO) y
  `BACKEND_SECURITY_GUIDELINES.md` (CSP, cookies, CSRF).
- Se hereda de `apps/web`: `SelectField` para todo select, un solo botón primario por pantalla,
  cliente HTTP en `lib/api/*`, cero secretos en `NEXT_PUBLIC_*`.

## 3. Decisiones cerradas

| Decisión | Elección | Por qué |
|---|---|---|
| Topología | **Misma app Next en `apps/web`**, nuevo route group `(store)` junto a `(admin)` y `(auth)`. | Ya cerrado en el spec del panel: la cookie es `sameSite: strict` y `cors.ts` permite un único origen. Una app aparte rompe la sesión o obliga a debilitarla. |
| Compra | **Solo con cuenta.** Navegar y **agregar al carrito es público**; al pasar al checkout se pide iniciar sesión o crear cuenta, y se vuelve al checkout. | Pedido de Manuel. Elimina checkout de invitado y seguimiento por folio. |
| Carrito de visitante | Vive en el navegador (`localStorage`) y se vuelca a `/cart` al iniciar sesión. | Confirmado por Manuel. |
| Merchandising | **Más vendidos** = marca por producto en su CRUD. **Rebaja** = campo en el precio del producto. **Banner de ofertas** = imagen con texto y URL, administrable. Sin ranking automático ni motor de promociones. | Confirmado por Manuel. Requiere M12d (backend + panel) antes de las secciones 3 y 7 del home. |
| Pago | **Stripe Elements** con `PaymentIntent`. | El adapter (`adapters/payment/types.ts`) ya devuelve `clientSecret` "para montar el Element". Checkout alojado pediría un método nuevo en el adapter y otro flujo de confirmación. |
| Fuente de verdad del pago | **Solo el webhook.** La pantalla de confirmación consulta la orden hasta ver `paid`; el retorno del navegador nunca la marca. | Invariante del spec maestro. |
| Dirección visual | **Opción C (puente neo-groovy) como base de trabajo; la clienta decide entre A, B y C.** | C conserva borde tinta, sombra dura y Anton, así que reutiliza `components/ui` casi intacto. Cambiar de dirección debe costar un `skin`, no una reescritura (§4). |
| Paleta y tipografía | Los 7 colores finales de `tokens.css`; Anton + Space Grotesk (C). Sin tokens nuevos de color. | Identidad de Gira ya fijada. El amarillo sigue exclusivo del CTA primario. |
| Registro de diseño | La tienda es **brand** (la voz visual importa); el panel sigue siendo **product**. `PRODUCT.md` describe solo el panel: se amplía en M13 con la sección de la tienda. | Evita que una sesión de tienda herede las reglas de consola de trabajo. |
| Bug de UI del panel | Se arregla **antes de M13**, en `fix/ui-brand-fill`, no en la tienda. | §6. |

## 4. Dirección visual y método

El home y las demás páginas se construyen **sección por sección**, con las fotografías de referencia
que aporta Manuel para cada una. Cada sección pasa por: referencia → ajuste del mockup si hace
falta → componente real → aprobación → la siguiente. No se avanza con una sección sin aprobar.

Reglas de la tienda (extienden `DESIGN.md`, no lo reemplazan):

- **Formas y estampas como lenguaje:** bordes ondulados, flor y estrella como ornamento, bandas de
  color a todo lo ancho, cuadros solo como remate. Se dibujan con SVG compartido, nunca con imágenes
  rasterizadas por decoración.
- **Fotos reales de producto** las pone Manuel en `public/`; cada hueco de imagen tiene nombre
  fijo. Hasta entonces, ilustraciones SVG de ejemplo claramente marcadas.
- **Neutralidad de skin:** colores y formas viven en tokens (`--r`, `--bw`, `--sh`, `--sec-r`,
  tonos de sección). Ningún componente de la tienda nombra un hex ni una tipografía.
- **Texto sobre rosa:** tinta, no blanco (el blanco sobre `rosa-chicle` no llega a AA).
- Una sola acción primaria por pantalla, en amarillo.

### Secciones del home (orden de construcción)

| # | Sección | Datos | Nota |
|---|---|---|---|
| 1 | Navbar | Estático + sesión + contador del carrito | Menú móvil accesible (aria-expanded, Esc, foco). |
| 2 | Hero | Estático | Titular y CTA reales por definir con Manuel. |
| 3 | Más vendidos | `GET /catalog/products?bestSeller=true` | Los marca el equipo en el CRUD de producto (M12d). Sin ranking automático. |
| 4 | Categorías | `GET /catalog/categories` | |
| 5 | Prints | `GET /catalog/families`, `/catalog/prints` | Entrada al selector de estampas. |
| 6 | Novedades | `GET /catalog/products?sort=-createdAt` | `createdAt` ya es ordenable. |
| 7 | Banner de ofertas | Banner administrable (M12d) | Imagen con el texto incluido y un enlace de destino. Las rebajas viven en el precio del producto. |
| 8 | Local | Estático | Dirección y horario los da Manuel; los del mockup son de ejemplo. |
| 9 | Footer | Estático | |

## 5. Superficie del API (verificada en el código, 2026-10-23)

| Ruta | Acceso | Uso en la tienda |
|---|---|---|
| `GET /catalog/families`, `/families/:slug`, `/prints`, `/prints/:slug`, `/categories`, `/products`, `/products/:slug` | Público | Home, catálogo, ficha. Productos filtran por `category`, `print`, `family`; orden por `name`, `basePrice`, `createdAt`. |
| `GET /cart`, `PUT /cart/lines/:variantId`, `DELETE /cart/lines/:variantId`, `DELETE /cart` | Sesión | Carrito de cuenta. |
| `POST /shipping/quotes` | Opcional | Cotización Envía en checkout. |
| `POST /orders` | `optionalAuth` + `checkoutLimiter`, idempotente | Crea la orden y el `PaymentIntent`. Acepta `lines` **o** `useCart`, `couponCode`, `shippingQuote{quoteId,rateId}`, `termsAccepted`. |
| `GET /orders/mine`, `/orders/mine/:id` | Sesión | Mi Cuenta. |
| `GET /orders/:publicId`, `/orders/:publicId/tracking` | Por `publicId` (CSPRNG) | Página `/orden/[publicId]`: es el enlace de los correos. |
| `POST /auth/register`, `/verify-email`, `/resend-verification`, `/forgot-password`, `/reset-password`, `/login`, `/logout`, `/logout-all`; `GET /auth/me` | Mixto | Cuentas. |
| `POST /webhooks/stripe`, `/webhooks/envia` | Firma | Sin cambios; la tienda no los llama. |

Rutas web que **el API ya promete en los correos** y la tienda debe servir tal cual:
`/verificar-correo?token=`, `/restablecer-contrasena?token=`, `/orden/{publicId}`.

El catálogo público ya expone `isAvailable` booleano (`PublicVariant`), nunca existencias numéricas.
La nota de deuda que decía lo contrario está desactualizada.

## 6. Seguridad y UI compartida

**CSP (`apps/web/src/lib/security/headers.ts`).** Hoy `script-src`, `frame-src` y `connect-src` no
incluyen Stripe. En M16, y solo ahí, se agrega: `script-src https://js.stripe.com`,
`frame-src https://js.stripe.com https://hooks.stripe.com`, `connect-src https://api.stripe.com`.
`img-src` ya admite Cloudinary. Las fuentes siguen en `next/font` (`font-src 'self'`). Cada cambio
de CSP lleva su prueba unitaria sobre `buildCsp`.

**Páginas con token** (`/verificar-correo`, `/restablecer-contrasena`): `Referrer-Policy:
no-referrer` por ruta, para que el token no viaje en `Referer`. Entra con M15.

**Cookies y CSRF:** sin cambios. Las mutaciones salen del cliente (`verifyOrigin` deja pasar a los
Server Components, por eso nunca mutan). El guard de sesión valida contra `GET /auth/me` con
`cache: "no-store"`, como en el panel.

**Bug del panel.** `Button` primary/danger y `Segmented` seleccionado salen sin relleno porque el
`bg-surface` de `NB_CONTROL`/`NB_SURFACE` gana en la cascada. La tienda reutiliza `components/ui`,
así que se corrige la raíz en `fix/ui-brand-fill`, **antes de M13**, con prueba en el panel. No se
parcha localmente en la tienda.

## 7. Huecos del backend que el cliente vería

| Hueco | Dónde entra | Estado |
|---|---|---|
| **Más vendidos**: el producto no tiene marca | M12d | Campo booleano `bestSeller` en `Product`, editable en su CRUD, y filtro `bestSeller=true` en `GET /catalog/products`. |
| **Rebaja**: no existe precio rebajado | M12d | Campo de rebaja en el precio del producto (CRUD). **Money-critical, TDD:** `pricingService` (`variant.priceOverride ?? product.basePrice`) debe resolver el precio vigente y congelarlo en el snapshot de la orden. Si una variante tiene `priceOverride`, se propone que gane el override (precio explícito); se confirma en el brainstorming de M12d. El DTO público expone precio y rebaja para tachar el anterior. |
| **Banner de ofertas** | M12d | Entidad `Banner`: imagen (Cloudinary, con el texto dentro), texto alternativo obligatorio, URL de destino y activo. La URL admite solo ruta interna o `https://` (nunca `javascript:`). Pantalla en el panel y `GET /catalog/banner` público. Una sola imagen; si el recorte móvil no se lee, se decide una variante móvil en M12d. |
| Cupón de 100 % con envío gratis deja total 0 (el pago falla y cancela) | M16 | Backend + prueba antes del checkout. |
| Cupón ausente de `PublicOrder` / confirmación | M16 | Agregar al DTO compartido. |
| Correos de reembolso y de pago fallido al cliente | M16 | Plantillas en `templates/orderEmails.ts`. |
| `no-referrer` en páginas con token | M15 | §6. |
| `POST /orders` acepta invitado (`optionalAuth`) | M16 | **Decidido:** pasa a `protect`. Rompe los tests que crean órdenes sin sesión y vuelve obligatorio el vínculo orden-cuenta; el campo `customer` sigue congelado en la orden. |
| Correo verificado para pagar | M16 | **Por decidir:** hoy el API no lo exige. Recomendado exigirlo, porque los correos de pedido y de seguimiento viajan a esa dirección. |
| Ruta pública por folio (`GC-XXXXXXXX`) | — | **Descartada**: sin invitados, Mi Cuenta cubre el seguimiento. |

## 8. Roadmap

Una sesión por milestone; no se avanza sin verificar el anterior.

| M | Alcance |
|---|---|
| Pre | `fix/ui-brand-fill`: relleno de `Button` y `Segmented`, verificado en el panel. |
| **M12d** | **Merchandising (backend + panel).** `bestSeller` y rebaja en el CRUD de producto, `pricingService` con precio vigente (TDD), entidad `Banner` con su pantalla y `GET /catalog/banner`. Cierra el Bloque 2 de verdad: el Home no puede mostrar lo que el panel no puede editar. |
| **M13** | **Home, sección por sección** (§4): scaffold del route group `(store)`, layout y skin, y las 9 secciones en orden, cada una aprobada antes de la siguiente. Las secciones 1, 2, 4, 5, 6, 8 y 9 no dependen de M12d. Ampliar `PRODUCT.md` con el registro brand. |
| **M14** | **Catálogo y ficha de producto.** Listado con filtros (categoría, familia, print) y orden, paginación, ficha con **selector de estampas** (radiogroup con flechas), precio rebajado, estado agotado, carrito del navegador (agregar sin sesión). |
| **M15** | **Cuentas.** Registro, verificar correo, reenviar, olvidé y restablecer contraseña, cerrar todas las sesiones, Mi Cuenta con lista y detalle de pedidos, página `/orden/[publicId]`. `no-referrer` en páginas con token. |
| **M16** | **Carrito y checkout** *(alto riesgo, TDD)*. Volcado del carrito del navegador a `/cart` al iniciar sesión, puerta de checkout (iniciar sesión o crear cuenta y volver), cotización Envía, cupón, Stripe Elements, confirmación por polling a la orden, `POST /orders` solo con sesión. CSP de Stripe. Cierra los huecos de §7 que lo tocan. |
| **M17** | **SEO, rendimiento y cierre.** Metadata y Open Graph por página, `sitemap` y `robots`, Core Web Vitals (LCP/CLS/INP), `error.tsx`/`not-found`/`global-error`, pasada de a11y, auditoría de dependencias. |

Dependencias reales: las secciones 3 y 7 de M13 necesitan M12d. M14 necesita M13 (shell y skin) y
M12d (precio rebajado). M16 necesita M15 (sesión) y M14 (carrito). M17 va al final porque mide lo ya construido.

## 9. Verificación de cierre por milestone

Evidencia pegada, no afirmaciones: `pnpm --filter @gira/shared build` · typecheck de API y web ·
`pnpm exec eslint apps/web` · tests de web y API (el flake conocido de la suite completa se re-corre
aislado; los 5 errores de lint de `enviaShippingProvider.ts` son preexistentes) · `next build` en una
copia del repo (nunca sobre el `next dev` de :3000) · recorrido en navegador a 1440 y 390 con
capturas, con los tres estados forzados (carga, vacío, error) y una pasada solo con teclado.

Entorno del recorrido: copia con `rsync` sin `node_modules`, `.next`, `.git` ni `.env*`; mongod local
como réplica; sin Resend/Stripe/Telegram/Cloudinary/Envía; `seed:admin` + `seed:demo` (clientes demo
con `GiraDemo2026`); puertos libres comprobados con `lsof`.

## 10. Pendientes conocidos

- **Decisión de la clienta:** dirección visual A, B o C. Hasta entonces M13 usa C.
- **Por decidir** (§7): si el correo debe estar verificado para pagar; precedencia entre rebaja y
  `priceOverride`; si el banner necesita imagen móvil aparte.
- **Conflicto del carrito al iniciar sesión:** si la cuenta ya tenía líneas y el navegador otras,
  se define en M16 (propuesta: cantidad mayor por variante, tope por stock disponible).
- **Contenido real:** titular y CTA del hero, imagen del banner, dirección y horario del local, textos legales y de
  envíos, y las fotografías de producto (hoy ilustraciones de ejemplo).
- **Heredados del panel:** `/kit` por borrar, CSP/`writtenUrls`/orden binario en Estampas y
  Productos, `adminAlertedAt`, `internalNotes`, campana del TopBar, 5 errores de lint de Ea.
- **Fuera de alcance de este bloque:** mayoreo B2B, bundles, suscripciones, waitlist.
