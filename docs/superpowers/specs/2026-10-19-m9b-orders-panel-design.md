# M9b: Panel de pedidos (diseño)

Fecha: 2026-10-19. Rama: `feat/m9b-orders-panel`. Backend: M9a + Envía Ea/Eb (ya en `main`). No cambia la API.

## Decisiones aprobadas

- **Dirección visual: "C · Bandeja con vista previa"** (mockup en el scratchpad de la sesión, tokens y neobrutalismo de `DESIGN.md` sin cambios). Registro *product* (impeccable); taste-skill solo como filtro anti-plantilla.
- **Pestañas por estado** (no por grupo): Pago pendiente · Pagado · En proceso · Enviado · Recibido · Todos. Los conteos salen de `GET /admin/orders/summary` (`countsByStatus`); el filtro usa `?status=`. "Todos" incluye cancelados, expirados y reembolsados, con selector de estado.
- **Textos de estado en masculino** (el sujeto es el pedido): pago pendiente, pagado, en proceso, enviado, recibido, cancelado, expirado, reembolsado. Se cambian en `ORDER_STATUS_LABELS` de shared (única fuente; los mensajes de error de la API también los usan).
- **Detalle en ruta propia** `/pedidos/[id]` (id interno de `AdminOrder.id`, nunca `publicId`). Una columna tipo hoja de empaque: artículos y totales primero, lo administrativo al final.
- **Se quita "Envíos"** de la navegación; la logística vive en Pedidos.
- **Lista**: izquierda tarjetas compactas con checkbox (solo pedidos pagados son seleccionables), derecha vista previa fija con la siguiente acción y "Abrir pedido". En móvil la vista previa no existe: la tarjeta lleva directo al detalle.

## Reglas de negocio que la UI respeta (ya decididas)

- Estado manual solo `paid → processing` y `pending_payment → cancelled` (motivo 5 a 300 caracteres). `shipped` solo con `POST /:id/ship` (requiere `processing` + guía lista + sin disputa abierta o perdida). `delivered` lo mueve la paquetería: la UI nunca lo ofrece.
- Reintentar guía solo en `paid` o `processing` con guía `failed` o `needs_review`. En `needs_review` el diálogo advierte que puede comprarse una segunda guía.
- Corregir dirección solo en `pending_payment`, `paid` o `processing`; con guía ya comprada el código postal no puede cambiar.
- Reembolso siempre total, sin cuerpo; el estado "reembolsado" llega por webhook y el diálogo lo dice.
- Folio `GC-XXXXXXXX` siempre visible; `publicId` nunca en UI, URLs ni breadcrumbs. Dinero en centavos y mono.

## Componentes nuevos

Base: `Toast`, `SlideOver`, `Toggle`, `ConfirmDialog` (este último no estaba en el encargo; lo exigen el motivo de cancelación, la advertencia de segunda guía y la confirmación de reembolso). Chips: `PriorityBadge`, `LabelStatusChip`, `TrackingStatusChip`, `DisputeBadge`. El `SlideOver` aloja el formulario de corrección de dirección.

## Fuera de alcance

Notas internas, rutas públicas por folio, edición del IVA, vista global de envíos, cambios en la API.
