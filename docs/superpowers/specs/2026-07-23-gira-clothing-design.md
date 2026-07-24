# Gira Clothing — Diseño validado (spec maestro)

> Fecha: 2026-07-23 · Estado: aprobado por Manuel · Alcance actual: **backend + seguridad únicamente**

## 1. Contexto

Gira Clothing es una marca mexicana de bolsos, tote bags, fundas para laptop y cosmetiqueras cuyo
diferenciador es el **estampado (print)**: un mismo modelo existe en varias telas, y la clienta elige
tanto la pieza como el print. Hoy el catálogo vive en Instagram, un canal que la marca no controla.


principal de compra* con swatches de fotografía macro, filtro cruzado por tela y **stock independiente
por combinación modelo + print**. Por eso se construye a medida.

Este spec fija las decisiones de arquitectura y el fasado antes de escribir código, de modo que cada
milestone se ejecute en una **sesión/chat independiente** sin recargar el contexto completo.

### Alcance de este documento

1. **La tecnología no se elige aquí: viene dada por los estándares.** Stack, capas, cadena de
   middleware, validación, auth y patrones de inventario/pagos salen de `~/.claude/standards/`. Este
   spec solo resuelve las decisiones que la guía deja explícitamente abiertas por proyecto (§7).
2. **No se asume nada de diseño.** Cero decisiones de paleta, tipografía, layout o componentes. Todo lo
   visual se define después, en su propio brainstorming.
3. **Foco exclusivo: backend y seguridad** (Bloque 1, M1–M4).

## 2. Estándares que rigen el proyecto

- `~/.claude/CLAUDE.md` — no-negociables (capas, bilingüismo código-inglés/UI-español, exportaciones al
  final, no agregar features no pedidas, **cero `git add/commit/push` sin permiso explícito**).
- `BACKEND_ARCHITECTURE_GUIDELINES.md` — capas, recursos transaccionales, concurrencia, integraciones
  multi-proveedor, listados admin, stats.
- `BACKEND_SECURITY_GUIDELINES.md` — checklist de arranque completo (aplica siempre).
- `ECOMMERCE_ARCHITECTURE_GUIDELINES.md` — monorepo, inventario anti-sobreventa, pagos por webhook,
  Settings singleton, patrones de negocio ampliados.
- `DASHBOARD_GUIDELINES.md` / `FRONTEND_GUIDELINES.md` — **aún no se abren**; se leerán en bloques 2 y 3.

Todo el "cómo" vive en esas guías. Este spec y los de cada milestone describen solo el "qué" de Gira.

## 3. Decisiones cerradas

| Decisión | Elección |
|---|---|
| Stack | *(Dado por el estándar.)* Monorepo pnpm: `apps/api` (Express + TS estricto) + `apps/web` + `packages/shared`. Comunicación **solo por HTTP REST** (`/api/v1`). Aquí solo se construye `apps/api`. |
| DB | MongoDB + Mongoose. |
| Modelo de catálogo | Print como entidad **global reutilizable**; `Variant` (Product + Print) dueña del stock. |
| Taxonomías | **Ambas**: `PrintFamily` (florales, rayas, lunares, cuadros) y `ProductCategory` (bolsas, cosmetiqueras, fundas). |
| Gestión de prints | **CRUD completo** (crear, editar, pausar/retirar, listar). |
| Precios | Precio base en `Product` + **override opcional** por `Variant`. |
| Moneda | **MXN + USD**. Se captura solo MXN; USD se deriva de un **tipo de cambio configurable** en Settings (con redondeo configurable). Moneda, precio y tipo de cambio se **congelan en el snapshot de la orden**. |
| Pagos | **Stripe primero**, detrás de adapter. Mercado Pago como segundo adapter posterior. |
| Checkout | **Invitado + cuenta opcional.** Orden ligada por email, accesible por id público CSPRNG (anti-IDOR). |
| Envíos | **Captura manual de guía** por el admin. Sin integración de transportista. |
| Costo de envío | **Tarifa plana configurable** (nacional / internacional) en Settings. Umbral de envío gratis también en Settings. |
| Jobs background | **Cron ligero + índice TTL de Mongo** (sin Redis). |
| Facturación CFDI | **Fuera de alcance.** |
| Correo / notificaciones | Resend tras adapter `Mailer`; Telegram tras adapter `NotificationChannel` con **stub si no hay credenciales**. |

### Diferidos (fuera del núcleo)

Mapeados pero no diseñados en detalle: **mayoreo B2B**, **suscripciones**, **bundles / completa tu set**,
**waitlist + analítica avanzada**. Cada uno tiene su patrón asignado en
`ECOMMERCE_ARCHITECTURE_GUIDELINES.md`, así que sumarlos después es aditivo, no un rediseño.

## 4. Diseño de sistema

### Vista de componentes — `apps/api`

```
                    ┌──────────────────────────────────────┐
 Cliente HTTP ─────▶│ Cadena de middleware (orden exacto)  │
 (web / dashboard)  │ helmet→cors→json 10kb→cookieParser→  │
                    │ mongoSanitize→sanitizeInput→         │
                    │ verifyOrigin→rateLimit               │
                    └────────────────┬─────────────────────┘
                                     ▼
        routes/  ──validate(Joi)──protect/restrictTo──▶ controllers/
                                     │  (nunca tocan DB)
                                     ▼
                                 services/   ◀── única capa que toca models/
                                     │
                    ┌────────────────┼────────────────┐
                    ▼                ▼                ▼
                models/         adapters/         utils/
              (Mongoose)   payment│mailer│      AppError
                           notify │upload       asyncHandler
                                  │             sendResponse
                                  ▼             parseListQuery
                    Stripe · Resend · Telegram · Cloudinary

  Webhook Stripe ──▶ ruta con body CRUDO montada ANTES de express.json
                     (firma + tolerancia timestamp + dedupe por event.id)

  Cron ligero ──▶ expirar reservas (TTL) · reintentos de correo · conciliar pagos huérfanos
```

### Fronteras de integración

Todo proveedor externo vive detrás de una **interfaz angosta del dominio**, seleccionada por
configuración de entorno — nunca acoplado al SDK en services de negocio:

| Interfaz | Adapter inicial | Segundo adapter previsto |
|---|---|---|
| `PaymentProvider` | Stripe | Mercado Pago (sin reescribir consumidores) |
| `Mailer` | Resend | — |
| `NotificationChannel` | Telegram | **stub** si no hay credenciales |
| `UploadService` | Cloudinary | adapter local en dev |

### Trade-offs asumidos

| Decisión | Ganamos | Aceptamos | Señal para reconsiderar |
|---|---|---|---|
| Cron + TTL sin Redis | Cero infra extra ni costo mensual | Sin reintentos con backoff ni visibilidad de jobs fallidos | Volumen que sature el cron → migrar a BullMQ |
| `MemoryStore` en rate limit | Simple, reseteable en tests | No escala entre instancias | Al pasar a réplicas → Redis |
| MXN + USD | Mercado internacional desde el día uno | Moneda y tipo de cambio deben congelarse en el snapshot | — |
| Stripe primero | Suscripciones futuras vía Billing sin cambiar proveedor | Menos opciones locales MX (MSI, OXXO, SPEI) | Conversión baja en MX → activar Mercado Pago |
| Captura manual de guía | Sin integrar transportista, dentro de presupuesto | Trabajo operativo del admin por envío | Volumen que lo vuelva inviable |
| Stock solo en `Variant` | Una sola fuente de verdad | El producto no tiene stock propio consultable | — |

### Riesgo arquitectónico #1

El mayor riesgo es **la ventana entre reservar stock y confirmar el pago**. Se mitiga con cuatro capas,
y ninguna sustituye a la otra: `findOneAndUpdate` atómico (evita sobreventa) + reserva con TTL (evita
stock congelado) + webhook como única fuente del estado "pagado" (evita órdenes fantasma) + job de
conciliación (cubre webhooks perdidos). **M3 lleva TDD obligatorio** por esto.

## 5. Modelo de dominio

```
PrintFamily        florales, rayas, lunares, cuadros…
   └── Print       nombre, SKU, foto macro, familia, activo/pausado   ← entidad global reutilizable
                          ↕ N:M
ProductCategory    bolsas, cosmetiqueras, fundas de laptop…
   └── Product     modelo (Tote, Curvy, Bárbara, Ruffles, Mini)
                   medidas, materiales, precio base MXN, categoría
                          ↓
        Variant    (Product + Print) — SKU propio, fotos, precio override opcional
                   onHand / reserved   ← ÚNICA dueña del stock
```

### Invariantes no negociables

- Disponible = `onHand − reserved`. Nunca un solo contador para ambas cosas.
- Nunca *read-then-write* sobre stock: condición y `$inc` en un solo `findOneAndUpdate` atómico.
  Colisión → `AppError(409)`.
- Reserva con expiración (índice TTL) al crear la orden; **commit solo cuando el webhook confirma el
  pago**; release si falla/expira/se abandona. Un cron limpia reservas huérfanas.
- El estado "pagado" lo determina **únicamente el webhook**, jamás el redirect del navegador.
- La orden guarda **snapshot inmutable** de precio, moneda y tipo de cambio. Nunca relee el catálogo
  vigente para mostrarse.

## 6. Milestones

Orden en serie: **backend + seguridad → dashboard → frontend público.** No se avanza sin verificar el
anterior. Una sesión/chat por milestone.

### Bloque 1 — Backend

**M1 · Scaffolding seguro + Auth**
Monorepo pnpm, `packages/shared` (contrato tipado + `ApiResponse` + enums), `apps/api` con capas
completas. Cadena de middleware en el orden exacto del estándar. `loadEnv()` fail-fast con `env`
congelado. `AppError` / `asyncHandler` / `sendResponse`. `app.ts` separado de `server.ts`. Auth: JWT en
cookie HttpOnly, bcrypt 12, `password` con `select:false`, mensaje genérico anti-enumeración,
`protect` / `restrictTo`. 2FA TOTP para admin con secreto cifrado AES-256-GCM. Audit trail append-only.
Logger pino con redacción de PII. Health check + graceful shutdown.

**M2 · Catálogo + Inventario** *(el corazón)*
CRUDs por capa de `PrintFamily`, `Print`, `ProductCategory`, `Product` y `Variant`. Uploads a Cloudinary
tras adapter, validados por whitelist de MIME + límite de tamaño. Utilitario transversal
`parseListQuery` + `buildMeta` para todos los listados admin. Endpoints públicos de catálogo con filtro
cruzado por print y por familia. Stock atómico. Índices para filtro por print y por categoría.

**M3 · Carrito + Órdenes + Pagos** *(alto riesgo — TDD obligatorio)*
Settings singleton (tarifas de envío, umbral de envío gratis, tipo de cambio USD, redondeo). Cálculo de
totales **en el servidor**. Reserva de stock con TTL. Enum de estado de orden con transiciones válidas
verificadas en servidor. Idempotency key en creación de orden y en la llamada a Stripe. Webhook con body
crudo antes de `express.json`, verificación de firma, tolerancia de timestamp, dedupe por `event.id`.
Set completo de eventos: éxito, fallo, expiración, reembolso, disputa. Job de reconciliación. Acceso a
"mi orden" por id CSPRNG.

**M4 · Notificaciones + Envíos + Hardening**
Adapter `Mailer` (Resend): confirmación, preparación y guía. Adapter Telegram para el equipo (stub sin
credenciales). Sub-recurso de tracking con enum propio, log de eventos con timestamp y rate limit
dedicado si se expone público. Captura manual de paquetería + guía. Rate limiters finos por acción.
Endpoints de stats por módulo. `npm audit` limpio.

### Bloques 2 y 3 — fuera del alcance actual

Solo fijan el orden de trabajo, no su contenido:

- **Bloque 2 — Dashboard admin.** Consume la API del Bloque 1.
- **Bloque 3 — Frontend público.** Consume la misma API.

**Ninguna decisión de diseño está tomada** para estos bloques: ni paleta, ni tipografía, ni layout, ni
componentes, ni cómo se ve el Print Selector. Cada uno abre su propio brainstorming cuando llegue su
turno, después de que el backend esté verificado.

### Milestones posteriores (diferidos)

Mayoreo B2B · Bundles · Suscripciones · Waitlist + analítica de preferencias.

## 7. Estructura de M1

```
Gira_Clothing/
├── apps/api/src/
│   ├── config/       env.ts (loadEnv), db.ts, cors.ts, logger.ts
│   ├── middlewares/  protect, restrictTo, mongoSanitize, sanitizeInput, verifyOrigin,
│   │                 rateLimit (factory), validate, errorHandler, notFound
│   ├── utils/        AppError, asyncHandler, sendResponse, crypto (AES-256-GCM), parseListQuery
│   ├── models/       User, AuditLog
│   ├── validators/   auth (Joi stripUnknown, mensajes en español)
│   ├── services/     authService, auditService
│   ├── controllers/  authController
│   ├── routes/       v1/index.ts, v1/authRoutes.ts
│   ├── app.ts        buildApp() — sin abrir puerto ni DB
│   └── server.ts     loadEnv → conecta DB → listen → graceful shutdown
├── packages/shared/  tipos + enums de dominio + ApiResponse
└── .env.development.example / .env.production.example   (versionados, placeholders)
```

`.env.*.local` en `.gitignore`. Cero secretos en código ni en `NEXT_PUBLIC_*`.

## 8. Verificación (antes de declarar cualquier milestone como hecho)

Con **evidencia real** pegada en la respuesta — nunca afirmar sin correr:

1. `pnpm tsc --noEmit` — sin errores de tipos.
2. `pnpm build` — build limpio.
3. `pnpm lint`.
4. `pnpm test` — TDD obligatorio en M3 (reserva de stock, totales, transiciones de estado, idempotencia
   de webhooks). Recomendado en el resto.
5. `pnpm audit` — sin high/critical en dependencias de producción.
6. Recorrido manual del flujo del milestone (M1: registro → login → `/auth/me` → 2FA → logout;
   M3: carrito → checkout Stripe test → webhook → stock descontado → orden en `paid`).
7. Checklist de arranque de `BACKEND_SECURITY_GUIDELINES.md` repasado punto por punto en M1 y M4.

---

**Recordatorio operativo:** ningún `git add` / `commit` / `push` se ejecuta sin aprobación explícita de
Manuel, en ningún milestone. Solo se prepara y se muestra el diff.
