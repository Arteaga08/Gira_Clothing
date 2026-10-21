# M12b — Clientes y cupón personal por correo: diseño

Rama `feat/m12b-customers-panel`. Tarea grande (dinero de usuarios y correo a clientes). Referencia de flujo y copy: Esencia Glow (Clientes, «Dar cupón», correo del cupón), adaptada a los patrones de M12a y a los tokens de `apps/web/src/styles/tokens.css`.

## Decisiones aprobadas
- **Mejores clientes:** top 10 clientes con cuenta. Periodos Hoy / Semana / Mes, por calendario en hora de México (hoy 00:00, lunes 00:00, día 1) hasta ahora; reutiliza `resolveCurrentPeriod`. Selector «Ordenar por» (`SelectField`): Gasto neto (por defecto) / Número de compras; empate → la otra métrica → `_id`. Columnas: `#`, Cliente (nombre + correo, enlace a la ficha), Compras, Gasto neto.
- **Qué cuenta:** pedidos con `user`, estado `paid|processing|shipped|delivered` (`REVENUE_STATUSES`), sin `disputeStatus: lost`, por `createdAt`. Gasto neto = (`total` − `payment.refundedAmount`) convertido a MXN con el `exchangeRate` del propio pedido. Solo usuarios `role: customer`; el `$lookup` va antes del `$limit`.
- **Todos los clientes:** búsqueda por nombre/correo, tabla paginada: Cliente, Alta, Compras, Gasto neto, Último pedido («—» si no hay). Métricas históricas (sin rango) solo de la página.
- **Ficha** `/clientes/[id]`: encabezado (nombre, correo, «Dar cupón»), tarjeta Cliente (correo verificado, cliente desde, compras, gasto neto) y tarjeta Pedidos (folio → `/pedidos/<id>`, fecha, estado, total) vía `GET /admin/orders?customer=<id>`.
- **Cupón personal:** se crea solo desde la ficha (`?cupon=nuevo` abre el `Modal`). Campos: Código (escrito por el admin), Mensaje para el cliente (opcional, ≤500, texto plano), Tipo, Valor, Compra mínima, Empieza, Vence. Fijo: un solo canje, solo el cliente asignado; nombre interno `Personal · <Nombre Apellido>` lo pone el servidor.
- **En Cupones:** los personales salen con badge «Personal» + nombre del cliente (enlace a la ficha) y filtro Clase: Todos / Campañas / Personales; ayuda «Para dar uno personal, entra a la cuenta del cliente.». «Nuevo cupón» crea solo campañas; el modal de un personal muestra el destinatario en solo lectura.
- **Checkout:** cupón personal de otro cliente → mismo «El cupón no es válido.» (anti-enumeración), antes de vencido/agotado/usado.
- **Correo:** envío directo con el mailer, esperado (no outbox): la respuesta trae `emailSent`; si falla, el cupón queda creado y la UI avisa. Todo campo dinámico se escapa con `escapeHtml` en la plantilla; el mensaje del admin se escapa explícitamente y luego `\n → <br>`. El mensaje no se guarda en BD ni en auditoría.

## API
- **Shared:** `CouponKind {CAMPAIGN, PERSONAL}`; `AdminCoupon.kind` + `assignedCustomer?`; tipos `AdminCustomer`, `TopCustomer`, `TopCustomers`, `GiveCouponResult`; `CUSTOMER_RANK_PERIODS`, `CUSTOMER_RANK_SORTS`, `COUPON_MESSAGE_MAX`, `COUPON_KIND_FILTERS`; `AuditAction.COUPON_GRANTED`.
- **Modelo:** `Coupon.kind` (default campaign) + `assignedUser` (requerido sii personal), índice parcial `{assignedUser}`. Sin migración.
- **Rutas** `/admin/customers`: `GET /`, `GET /top?period&sortBy`, `GET /:id`, `POST /:id/coupons` → 201 `{coupon, emailSent}`. `GET /admin/coupons?clase=`; `GET /admin/orders?customer=`.
- Auditoría `COUPON_GRANTED` con `targetId` = cupón y `after: {customerId}`; sin correo ni mensaje.

## UI
- `/clientes`: sección «Mejores clientes» (periodo + orden) y «Todos los clientes» (búsqueda + tabla + paginación). URL en español: `periodo=hoy|semana|mes`, `orden=gasto|compras`, `q`, `page`.
- `/clientes/[id]`: ficha + `Modal` «Dar cupón a {nombre}» con «Crear y enviar».
- Toasts: «Cupón enviado» / «{CÓDIGO} le llegó a {correo}.»; aviso «Cupón creado, pero el correo no salió» / «Avísale a {nombre} que su código es {CÓDIGO}.». Código duplicado sobre el campo; otros errores en `Notice`.
- Estados vacío / carga / error con «Reintentar»; guarda de hidratación; páginas del servidor pasan solo datos planos; un solo amarillo por pantalla; todo select con `SelectField`; periodo sin `Segmented` (bug conocido).

## Fuera de alcance
Cupón en `PublicOrder`/`AdminOrder`/detalle de pedido, reenvío del correo, historial de cupones en la ficha, bug Button/Segmented, cursor global, CSP Cloudinary, M12c.
