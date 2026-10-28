# M15 — Acceso y «Mi cuenta» de la tienda

Referencia de diseño y lógica: `esencia_glow` (`apps/web/src/components/storefront/account`). API de cuentas ya existe (M8.5).
Partición: **M15a** acceso (sin backend) · **M15b** Mi cuenta: Resumen, Pedidos, Perfil + contraseña · **M15c** Direcciones, Facturación, Guardados.

## Dirección visual (elegida por Manuel entre 3 mockups)
«Pase de gira»: las páginas de acceso son un boleto (forma a la izquierda, talonera a la derecha con perforación y muescas).
La talonera lleva la primera foto de la portada (`getHero`) con sello («Admite una», «Pase de miembro», «Ya casi») y código de
barras sin número; sin foto, campo de color con arco. En «Revisa tu correo» la talonera lleva la cuenta regresiva de reenvío
y «vence en 24 h». En móvil la talonera pasa abajo como franja. Mi cuenta (M15b): una sola tarjeta hueso con sidebar y contenido.

## M15a — rutas y comportamiento
| Ruta | Qué hace |
|---|---|
| `/ingresar` | Login (`POST /auth/login`). Cliente → mezcla el carrito del navegador con el de la cuenta y va a `?redirect=` (por defecto `/cuenta`). 403 → aviso «Todavía no verificas tu correo» con reenvío (60 s). Admin (`two_factor_required`/`enrollment_required`) → «Esta cuenta es del equipo» con enlace a `/login`. Ya con sesión de cliente → redirige. |
| `/crear-cuenta` | Registro (`POST /auth/register`, 201 genérico, sin sesión) → «Revisa tu correo» con reenvío. Contraseña con medidor y checklist (10–72 bytes, mayúscula, minúscula, número); términos obligatorios. |
| `/verificar-correo?token=` | Pide la contraseña (anti pre-secuestro, exigido por el API) → `verify-email`. Enlace inválido → panel con formulario de reenvío. No inicia sesión. |
| `/recuperar-contrasena` | `forgot-password`; respuesta siempre «Si {correo} tiene cuenta…»; el enlace vence en 1 h. |
| `/restablecer-contrasena?token=` | `reset-password` con medidor; cierra todas las sesiones. Éxito → «Ingresar». |

- `?redirect=` solo acepta rutas de la tienda en lista blanca (`/`, `/tienda`, `/cuenta`, `/carrito`, `/checkout` y subrutas); nunca páginas de acceso ni `//` ni `\`.
- Carrito: líneas del navegador se vierten con `max(cantidad del navegador, cantidad de la cuenta)` ≤ 20; línea rechazada por el API (4xx) se descarta, error de red la conserva; al terminar se anuncia el cambio. Nunca bloquea el login.
- Errores: 400/401 de login → mensaje genérico del API; 429 y 5xx con texto propio; red/timeout con el mensaje del cliente HTTP.
- Seguridad: `Referrer-Policy: no-referrer` + `Cache-Control: no-store` en `/verificar-correo` y `/restablecer-contrasena` (pendiente de M8.5).
- Sin 2FA para clientes. Páginas heredan `noindex` hasta M17.

## M15b — «Mi cuenta» (Resumen, Mis pedidos, Perfil)
Una sola tarjeta hueso (sidebar 248 px + contenido, divisores punteados, sin tarjetas anidadas). En móvil el sidebar desaparece: el Resumen
muestra una rejilla de tarjetas con resumen y cada sección lleva «< Mi cuenta». Direcciones y Facturación (M15c) aparecen desactivadas con
«Próximamente»; Guardados enlaza a su pantalla actual.

| Ruta | Qué hace |
|---|---|
| `/cuenta` | «Hola, {nombre}», último pedido (o «Todavía no has comprado») y «Tu cuenta». Nombre y correo salen de la sesión; solo el último pedido cuesta otra lectura y su fallo queda dentro de su panel. |
| `/cuenta/pedidos?pagina=` | Lista de 10 por página, más nuevo primero (`GET /orders/mine`). |
| `/cuenta/pedidos/[id]` | Detalle de solo lectura: productos, totales, dirección, paquetería y guía con enlace de rastreo (solo `http(s)`). Id mal formado o ajeno → 404. Pagar y cancelar quedan para M16. |
| `/cuenta/perfil` | Datos personales (nombre, apellido, celular, nacimiento, ciudad; correo solo lectura), cambio de contraseña y «Cerrar sesión en todos los dispositivos» (con confirmación). Un bloque en edición a la vez. |

- **Guard** (`requireCustomer(returnPath)`, en cada página porque solo ella conoce su ruta): anónimo → `/ingresar?redirect=…`; admin → `/resumen`; API caída → panel con «Reintentar».
- **API:** `GET /account` y `PATCH /account/profile` (protect + solo customer; Joi `stripUnknown`, así que `email`/`role` nunca llegan al servicio; `null` borra un opcional, ausente no se toca). `PATCH /auth/password {currentPassword,newPassword}` valida la actual, borra las OTRAS sesiones (sin subir `tokenVersion`, la actual sigue viva) y audita `PASSWORD_CHANGED`. Limiters por usuario: perfil 60/15 min, contraseña 5/15 min (cuentan también los éxitos).
- **Contraseña actual incorrecta → 400, no 401:** en la tienda un 401 significa sesión vencida y manda al login.
- `birthDate` es un día de calendario: se guarda como medianoche UTC y se lee/escribe como `YYYY-MM-DD`; «hoy» se calcula en hora de Ciudad de México (API) y en hora local del navegador (formulario).
- Sin sesión por refresh token (Gira usa sesión por dispositivo). Sin correo de aviso al cambiar la contraseña (no pedido; se propone aparte).

## Fuera de M15a (a propósito)
`/cuenta/*` (M15b/c), `/carrito` y checkout (M16), `/orden/[publicId]` (M16), refresh token (Gira usa sesión por dispositivo).

## Pendientes conocidos
- Sin límite visible por cuenta en `verify-email` (API); el copy del enlace de reset dice 1 h (Esencia dice 15 min).
- «Guardados»: botón «Guardar» en la ficha de producto por confirmar con Manuel (M15c).
