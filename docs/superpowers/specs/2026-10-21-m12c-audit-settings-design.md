# M12c — Auditoría + Ajustes + cierre del Bloque 2

Fecha: 2026-10-21 · Rama: `feat/m12c-audit-settings` · Último milestone del Bloque 2.

Patrones reutilizados de M12a/M12b (no se repiten aquí): filtros en la URL en español, `Modal`,
estados vacío/carga/error con «Reintentar», guarda de hidratación, página del servidor con datos
planos, `SelectField`, un solo botón amarillo por pantalla.

## Decisiones

| Tema | Decisión |
|---|---|
| Ajustes | IVA + Envío (origen, paquete, envío gratis, vigencia de cotización) + reiniciar 2FA. Moneda, reserva y umbral de stock quedan sin pantalla. |
| IVA | Solo el valor vigente, sin historial. Aplica a pedidos creados después de guardar; cada pedido ya congela `taxRateBps`. Los precios incluyen IVA: cambiar la tasa solo cambia el desglose, nunca el total cobrado. |
| Auditoría | Tabla + detalle con cambios de una lista blanca. Nunca IP, nunca nombre/correo del actor, nunca datos del origen de envío. |
| Mockups | No: Auditoría sigue el patrón de Cupones; Ajustes en tarjetas con modal. |

## API

**IVA**
- `PublicSettings`/`Settings` (shared) suman `tax: { rateBps }`.
- `PATCH /admin/settings/tax { rateBps }` — entero 0–10000 (Joi `stripUnknown`), escritor propio de
  sección (`updateTaxSettings`), audit `SETTINGS_TAX_UPDATED` (nuevo en `AuditAction`) con
  `before/after { rateBps }`.
- TDD: guarda y audita; una cotización nueva usa la tasa nueva; un pedido existente conserva la suya.

**Auditoría** (`auditService` lado lectura)
- El DTO `AuditLogEntry` deja de exponer `ip`, `actorId`, `before`, `after`. Pasa a:
  `{ id, actor: "admin"|"system"|"customer"|"unknown", action, module, targetId?, changes, createdAt }`.
- `actor`: `system` por `actorType`; para `user`, el rol se resuelve con UNA consulta `User.find`
  sobre los `actorId` de la página; sin `actorId` → `unknown` (login fallido sin cuenta).
- `changes: { field, before?, after?, redacted? }[]` armado en el servidor con lista blanca de claves:
  `status, priority, onHand, reason (solo stock), rateBps, tracking, disputeStatus,
  freeShippingThreshold, quoteTtlMinutes, parcel.*, mxnPerUsdCents, rounding, supported,
  ttlMinutes, cartInactivityDays, lowStockThreshold`. `origin` → `{ field: "origin", redacted: true }`
  solo si cambió. Cualquier otra clave se descarta.
- Filtro nuevo `actor`: `team` (admin + sistema; default de la web), `admin`, `system`, `customer`,
  `all`. Se resuelve con los ids de admins (pocos) en `$in`/`$nin`. `actorId` se mantiene.
- `GET /admin/audit-logs/:id` (id inválido → 400, inexistente → 404) para abrir el detalle desde la URL.

**2FA**: sin cambios. Se reutiliza `POST /auth/2fa/setup` (código vigente, revoca todas las sesiones,
audit `TWO_FACTOR_RESET`). Se revisan/completan sus pruebas: código incorrecto, bloqueo, revocación,
auditoría.

## Web

**`/ajustes`** — tres tarjetas de solo lectura con «Editar» secundario; cada una abre un `Modal`
(`?seccion=iva|envio|2fa`) cuyo «Guardar» es el único botón amarillo.
- IVA: entrada en porcentaje (hasta 2 decimales → bps). Aviso: «Solo cambia el desglose de IVA de
  los pedidos nuevos; los pedidos existentes conservan su tasa». Error de validación sobre el campo.
- Envío: origen (estado con `SelectField`), envío gratis con interruptor «Sin envío gratis» + monto
  en pesos, paquete (6 enteros), vigencia de cotización. Si falta origen, la tarjeta avisa que las
  guías están deshabilitadas.
- Seguridad: «Reiniciar verificación en dos pasos». El modal explica que cierra todas las sesiones y
  que el siguiente inicio de sesión pide configurar la app de nuevo; pide el código vigente; al éxito
  redirige a `/login`. Errores: código incorrecto (400) y bloqueo (429) sobre el campo. TDD.

**`/auditoria`** — tabla: fecha, quién (Administrador/Sistema/Cliente/Desconocido), módulo, acción
(etiqueta en español), objetivo (enlace a pedido, cupón, producto o cliente cuando el módulo/acción lo
permite; si no, id corto). Filtros en la URL: `quien` (equipo|admin|sistema|clientes|todos, default
`equipo`), `modulo`, `accion` (opciones del módulo elegido), `periodo` (7|30|90|365, default 30),
`page`. Clic en fila → `Modal` `?registro=<id>` con fecha, quién, módulo, acción, objetivo y tabla de
cambios (campo en español, antes → después; «modificado» para los redactados).

Etiquetas de módulo/acción/campo en `lib/audit/labels.ts`. Navegación: Ajustes y Auditoría
`available: true`.

## Cierre
Borrar `mockups/`; memoria (`project_milestone_status`: M12c hecho, Bloque 2 completo;
`project_standards_debt`); «Pendientes conocidos» al final de esta spec; comandos de commit/merge/push
sin ejecutar, fuera `.agents/`, `.claude/skills/design-taste-frontend`, `skills-lock.json`.

## Fuera de alcance
Pantallas de moneda/reserva/stock, historial de tasas, reiniciar 2FA de otro admin, Button
primary/`Segmented` (System Design), cursor global, CSP Cloudinary.

## Pendientes conocidos

Cerrado el 2026-10-21. Lo que quedó fuera a propósito o sin verificar:

- **Moneda, reserva y umbral de stock sin pantalla** (decisión de alcance): el API ya tiene sus PATCH.
- **Sin historial de tasas de IVA** (decisión): cada pedido congela `taxRateBps`; el cambio queda en
  auditoría con antes/después.
- **Reiniciar 2FA de otro admin** no existe; un teléfono perdido sigue siendo el script
  `2fa:reset-admin` (solo con acceso al servidor).
- **Índice nuevo `AuditLog { createdAt: -1 }`**: Mongoose lo crea al arrancar (`autoIndex`); en Atlas
  con muchos registros la primera construcción puede tardar.
- **Filtro `actor=customer` incluye «Desconocido»** (inicio de sesión fallido sin cuenta) y a cuentas
  que dejaron de ser admin; `team` resuelve admins por rol actual.
- **`accion` va en la URL con el id técnico de la acción** (`order_status_changed`), no en español:
  son ~80 y solo aparecen tras elegir módulo. `modulo=carrito` se ignora (nadie escribe en ese módulo).
- **Registros de Ajustes muestran como objetivo el id del documento de ajustes** (no hay pantalla a la
  que enlazar). Variantes, inventario y acceso tampoco enlazan.
- **El `search` por `targetId` del API no tiene campo en la pantalla.**
- **Tabla de Auditoría a 390 px** se desplaza en horizontal dentro de su contenedor (como Cupones);
  «Quién» queda fuera de vista hasta desplazar.
- **«Reiniciar 2FA» (`Button` `danger`) sale sin relleno**, igual que primary/`Segmented`: misma raíz
  de System Design, sin parche local.
- **`/kit` no se borró**: su comentario dice «se borra al cerrar M12 junto con mockups/», pero no
  estaba en el alcance pedido; queda a decisión de Manuel (sirve para System Design).
- **Recorrido en navegador** en una copia con `mongod` local (27018), API en **4110** y web en **3110**
  (el 4100 lo ocupaba un API de otra sesión, no se tocó). Sin `.env*` copiados, sin Resend/Stripe/
  Telegram. Se recorrió a 1440 y 390: IVA (error y guardado), Envío (error y guardado), 2FA (código
  incorrecto y reinicio real → `/login`, sesión vieja 401, siguiente login pide enrolar), Auditoría
  (lista, «Todos», detalle con origen protegido, vacío, error forzado con «Reintentar»), sin PII ni
  scroll horizontal de página. Capturas en el scratchpad de la sesión.
- **Flake conocido del API**: en corridas completas cayeron `inventory`, `orderRoutes` y
  `adminVariants` (uno distinto cada vez); aislados pasan.
- Heredados sin cambio: Button primary/`Segmented` sin relleno, CSP Cloudinary, cursor global,
  `writtenUrls` unificar, cupón en `PublicOrder`/`AdminOrder`, cupón 100 % con total 0, correos de
  reembolso/pago fallido, `adminAlertedAt`, `internalNotes`, ruta pública por folio, campana del
  TopBar, lint de `enviaShippingProvider.ts`.
