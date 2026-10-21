# M12a — Cupones de campaña: diseño

Rama `feat/m12a-coupons-panel`. Tarea grande (dinero de usuarios). El API no tenía cupones: solo el placeholder `discount = 0` en `pricingService.ts` y `Order.discount` ya congelado.

## Decisiones aprobadas
- Tipos: porcentaje (1–100, entero) y monto fijo en MXN (centavos; se convierte a USD con el tipo de cambio al cobrar).
- Reglas: vigencia opcional (inicio/fin), tope total de canjes opcional, **un uso por cliente** (fijo, índice único en BD), compra mínima opcional (sobre el subtotal en MXN).
- Solo clientes con cuenta. Un invitado que manda código recibe 401 «Inicia sesión para usar un cupón.».
- Lista = tabla, **opción A** del mockup (columnas Cupón, Descuento, Compra mín., Vigencia, Canjes con barra, Estado). Alta/edición en `Modal` centrado abierto por `?cupon=<id|nuevo>`.
- Sidebar: grupo Operación, debajo de Pedidos, `/cupones`.
- Retirar = `isActive:false` (`DELETE`); reactivar = `PATCH {isActive:true}` (igual que Familias).
- Un solo botón amarillo por pantalla: con el modal abierto, el amarillo es el de guardar; «Nuevo cupón» queda tapado por el fondo.

## API (cambios)
- **Shared**: `CouponDiscountType`, `CouponStatus`, `AdminCoupon`, `OrderCoupon`, límites (`COUPON_CODE_PATTERN`, `COUPON_CODE_MIN/MAX`, `COUPON_NAME_MIN/MAX`, `COUPON_AMOUNT_MAX`, `COUPON_MIN_SUBTOTAL_MAX`), `COUPON_CODE_TAKEN_MESSAGE`, `AuditModule.COUPONS` y `AuditAction.COUPON_{CREATED,UPDATED,DEACTIVATED,REACTIVATED}`.
- **Modelos**: `Coupon` (código único, índices `{isActive,endsAt}`), `CouponRedemption` (únicos `{coupon,user}` y `{order}`); `Order.coupon` (snapshot `{code,discountType,value}`) y `Order.couponId`.
- **Checkout**: `couponCode` opcional en `createOrderSchema`. `quoteTotals` recibe el cupón resuelto; descuento en la moneda de cobro, tope = subtotal, envío no se descuenta, IVA se deriva del total ya descontado. Reglas en `couponRulesService`. Mensaje único para código inexistente/inactivo/no iniciado (anti-enumeración). Canje atómico en transacción después de `reserveStock` y antes de `Order.create`. Se libera junto con la reserva (`releaseReservation` con reserva activa liberada), idempotente.
- **Admin** (`/admin/coupons`): `GET /` (búsqueda por código/nombre, `estado`, orden, paginación), `POST /`, `GET /:id`, `PATCH /:id`, `DELETE /:id`. DTO por agregación con `status` calculado en el servidor. Código, tipo y valor se bloquean con `redeemedCount > 0`; el tope no baja de lo ya canjeado; código duplicado → 409 con `COUPON_CODE_TAKEN_MESSAGE`.
- Estado (precedencia): retirado → vencido → programado → agotado → activo.

## UI (cambios)
- `app/(admin)/cupones/{page,loading}.tsx`; `components/coupons/*`; `lib/coupons/*`; `hooks/useCoupon{List,Save}.ts`; `lib/api/adminCoupons.ts`.
- Filtros en la URL en español: `q`, `estado` (`todos|activos|programados|vencidos|agotados|retirados`), `orden`, `page`.
- Dinero: `pesosToCents` rechaza más de 2 decimales (no redondea). Fechas: dd/mm/aaaa, inicio 00:00 y fin 23:59:59 hora de México (`-06:00`).
- Error de código duplicado se muestra sobre el campo Código; los demás errores del servidor, en un `Notice` del modal.
- Estados vacío / carga / error con «Reintentar»; guarda de hidratación; «¿Descartar los cambios?».

## Fuera de alcance
Vista previa del cupón en una tienda pública, cupones personales por correo (M12b), Clientes/Auditoría/Ajustes, bug Button/Segmented, cursor global, CSP Cloudinary.
