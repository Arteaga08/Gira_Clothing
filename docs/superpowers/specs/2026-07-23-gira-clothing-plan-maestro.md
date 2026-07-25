# Gira Clothing — Plan maestro (diseño validado)

## Context

Gira Clothing es una marca mexicana de bolsos, tote bags, fundas para laptop y cosmetiqueras cuyo
diferenciador es el **estampado (print)**: un mismo modelo existe en varias telas, y la clienta elige
tanto la pieza como el print. Hoy el catálogo vive en Instagram, un canal que la marca no controla.

Las plataformas de renta (Shopify, Wix) modelan variantes por talla/color, no por *print como decisión
principal de compra* con swatches de fotografía macro, filtro cruzado por tela y **stock independiente
por combinación modelo+print**. Por eso se construye a medida.

El objetivo de este documento es fijar las decisiones de arquitectura y el fasado antes de escribir
código, de modo que cada milestone se pueda ejecutar en una **sesión/chat independiente** sin recargar
el contexto completo del proyecto.

**Estado: ningún código generado aún.** Este plan es el artefacto previo.

### Alcance de este plan — leer antes de todo lo demás

1. **La tecnología no se elige aquí: ya viene dada por los estándares.** Stack, capas, cadena de
   middleware, validación, auth, patrones de inventario y de pagos salen de
   `~/.claude/standards/`. Este plan no inventa stack; solo aplica el que ya está fijado y resuelve
   las decisiones que la guía deja explícitamente abiertas por proyecto (§7: jobs, moneda, envíos,
   fiscal).
2. **No se asume NADA de diseño.** No hay decisiones de paleta, tipografía, layout, componentes ni
   estética tomadas en este documento. Todo lo visual se define después, en su propio brainstorming,
   con `DASHBOARD_GUIDELINES.md` y `FRONTEND_GUIDELINES.md` en mano.
3. **El foco actual es exclusivamente backend y seguridad** (Bloque 1, M1–M4). Los bloques 2 y 3
   aparecen abajo solo para fijar el **orden de trabajo**, no su diseño ni su alcance detallado.

---

## Estándares que rigen el proyecto

Este proyecto se construye siguiendo, sin excepción:

- `~/.claude/CLAUDE.md` — no-negociables (capas, bilingüismo código-inglés/UI-español, exportaciones al
  final, no agregar features no pedidas, **cero `git add/commit/push` sin permiso explícito de Manuel**).
- `~/.claude/standards/BACKEND_ARCHITECTURE_GUIDELINES.md` — capas, recursos transaccionales,
  concurrencia, integraciones multi-proveedor, listados admin, stats.
- `~/.claude/standards/BACKEND_SECURITY_GUIDELINES.md` — checklist de arranque completo (aplica siempre).
- `~/.claude/standards/ECOMMERCE_ARCHITECTURE_GUIDELINES.md` — monorepo, inventario anti-sobreventa,
  pagos por webhook, Settings singleton, patrones de negocio ampliados.
- `~/.claude/standards/DASHBOARD_GUIDELINES.md` y `FRONTEND_GUIDELINES.md` — **aún no se abren**. Se leerán
  al llegar a los bloques 2 y 3, con su propio brainstorming de diseño.

Todo el "cómo" vive en esas guías. Este plan y los specs por milestone solo describen el "qué"
específico de Gira. Esto es deliberado: mantiene cada spec corto y cada sesión barata en tokens.

---

## Decisiones cerradas (validadas con Manuel)

| Decisión | Elección |
|---|---|
| Stack | *(Dado por el estándar, no elegido aquí.)* Monorepo pnpm: `apps/api` (Express + TS estricto) + `apps/web` + `packages/shared`. API y front se comunican **solo por HTTP REST** (`/api/v1`). En este plan solo se construye `apps/api`. |
| DB | MongoDB + Mongoose (default del estándar; el dominio no exige relacional). |
| Modelo de catálogo | Print como entidad **global reutilizable**; Variant (Product + Print) dueña del stock. |
| Taxonomías | **Ambas**: `PrintFamily` (florales, rayas, lunares, cuadros) y `ProductCategory` (bolsas, cosmetiqueras, fundas). |
| Gestión de prints | **CRUD completo** (crear, editar, pausar/retirar, listar). |
| Precios | Precio base en el `Product` + **override opcional** por `Variant`. |
| Moneda | **MXN + USD**. Se captura solo MXN; USD se deriva de un **tipo de cambio configurable en Settings** (con redondeo configurable). Moneda y precio se **congelan en el snapshot de la orden**. |
| Pagos | **Stripe primero**, detrás de adapter. Mercado Pago queda como segundo adapter posterior. |
| Checkout | **Invitado + cuenta opcional**. Orden ligada por email, accesible por id público CSPRNG (anti-IDOR). |
| Envíos | **Captura manual de guía** por el admin (paquetería + número de guía). Sin integración de transportista. |
| Costo de envío | **Tarifa plana configurable** (nacional e internacional) en Settings. Umbral de envío gratis también en Settings. |
| Jobs background | **Cron ligero + índice TTL de Mongo** (sin Redis). |
| Facturación CFDI | **Fuera de alcance.** Gira factura por fuera si se lo piden. |
| Correo | Transaccional (Resend) detrás de adapter `mailer`. Telegram detrás de adapter de notificación con **stub si no hay credenciales**. |

### Diferidos explícitamente (fuera del núcleo)

Mapeados pero **no** diseñados en detalle hasta su propio milestone: **mayoreo B2B**, **suscripciones**,
**bundles / completa tu set**, **waitlist + analítica avanzada**. Cada uno tiene ya su patrón asignado en
`ECOMMERCE_ARCHITECTURE_GUIDELINES.md`, así que sumarlos después es aditivo, no un rediseño.

### Nota sobre `senior-architect` (paso 4 del flujo)

Skill invocada según el flujo actualizado de `CLAUDE.md`. **Hallazgo: sus tres archivos de referencia
son plantillas vacías** (byte-idénticas entre sí salvo el título, con contenido placeholder tipo
"Pattern 1 / Scenario 1 / Tool 1"), y sus scripts son stubs genéricos — **no ejecutados**, por el
no-negociable #10. Su stack declarado (PostgreSQL/Prisma/K8s/AWS) además contradice el estándar.

Se aplica la **regla de precedencia**: manda `~/.claude/standards/`. El diseño de sistema de abajo lo
produzco yo siguiendo esas guías. Conviene revisar esa skill: parece instalada sin poblar.

---

## Diseño de sistema (vista de arquitecto)

### Vista de componentes — solo `apps/api`

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

### Trade-offs asumidos conscientemente

| Decisión | Ganamos | Aceptamos | Señal para reconsiderar |
|---|---|---|---|
| Cron + TTL sin Redis | Cero infra extra ni costo mensual | Sin reintentos con backoff ni visibilidad de jobs fallidos | Volumen de correos/órdenes que sature el cron → migrar a BullMQ |
| `MemoryStore` en rate limit | Simple, reseteable en tests | No escala entre instancias | Al pasar a réplicas → Redis |
| MXN + USD | Mercado internacional desde el día uno | Moneda y tipo de cambio deben congelarse en el snapshot de la orden | — |
| Stripe primero | Suscripciones futuras vía Billing sin cambiar de proveedor | Menos opciones locales MX (MSI, OXXO, SPEI) | Conversión baja en MX → activar adapter de Mercado Pago |
| Captura manual de guía | Sin integrar transportista, dentro de presupuesto | Trabajo operativo del admin por cada envío | Volumen de envíos que lo vuelva inviable |
| Stock solo en `Variant` | Una sola fuente de verdad, sin desincronización | El producto no tiene stock propio consultable | — |

### Riesgo arquitectónico #1

El punto de mayor riesgo del sistema es **la ventana entre reservar stock y confirmar el pago**. Se
mitiga con las cuatro capas del estándar, y ninguna sustituye a la otra: `findOneAndUpdate` atómico
(evita sobreventa) + reserva con TTL (evita stock congelado) + webhook como única fuente del estado
"pagado" (evita órdenes fantasma) + job de conciliación (cubre webhooks perdidos). **M3 lleva TDD
obligatorio** por esto.

---

## Modelo de dominio (núcleo)

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

**Invariantes que no se negocian:**

- Disponible = `onHand − reserved`. Nunca un solo contador para ambas cosas.
- Nunca *read-then-write* sobre stock: la condición y el `$inc` viven en un solo `findOneAndUpdate`
  atómico. Colisión → `AppError(409)`.
- Reserva con expiración (índice TTL) al crear la orden; **commit solo cuando el webhook confirma el
  pago**; release si falla/expira/se abandona. Un cron limpia reservas huérfanas.
- El estado "pagado" lo determina **únicamente el webhook**, jamás el redirect del navegador.
- La orden guarda **snapshot inmutable** de precio, moneda y tipo de cambio aplicado. Nunca relee el
  catálogo vigente para mostrarse.

---

## Milestones (una sesión/chat por milestone)

Orden en serie confirmado por Manuel: **backend + seguridad → dashboard → frontend público.**
No se avanza de milestone sin verificar el anterior.

### Bloque 1 — Backend

**M1 · Scaffolding seguro + Auth**
Monorepo pnpm, `packages/shared` (contrato tipado + `ApiResponse` + enums), `apps/api` con capas
completas. Cadena de middleware en el orden exacto del estándar (helmet → cors whitelist → json 10kb →
cookieParser → mongoSanitize → sanitizeInput → verifyOrigin → rateLimit → routers → notFound →
errorHandler). `loadEnv()` fail-fast con `env` congelado. `AppError` / `asyncHandler` / `sendResponse`.
`app.ts` separado de `server.ts`. Auth: JWT en cookie HttpOnly, bcrypt 12, `password` con `select:false`,
mensaje genérico anti-enumeración, `protect` / `restrictTo`. 2FA TOTP para admin con secreto cifrado
AES-256-GCM. Audit trail append-only. Logger pino con redacción de PII. Health check + graceful shutdown.

**M2 · Catálogo + Inventario** *(el corazón)*
CRUDs por capa de `PrintFamily`, `Print`, `ProductCategory`, `Product` y `Variant`. Uploads a Cloudinary
detrás de adapter, validados por whitelist de MIME + límite de tamaño. Utilitario transversal
`parseListQuery` + `buildMeta` para paginación/filtros/orden/búsqueda en todos los listados admin.
Endpoints públicos de catálogo con filtro cruzado por print y por familia. Stock atómico con
`findOneAndUpdate`. Índices para el filtro por print y por categoría.

**M3 · Carrito + Órdenes + Pagos** *(alto riesgo — TDD obligatorio)*
Settings singleton (tarifas de envío, umbral de envío gratis, tipo de cambio USD, redondeo). Cálculo de
totales **en el servidor**, nunca desde el payload. Reserva de stock con TTL. Enum de estado de orden con
transiciones válidas verificadas en servidor. Idempotency key en creación de orden y en la llamada a
Stripe. Webhook con body crudo montado **antes** de `express.json`, verificación de firma, tolerancia de
timestamp, dedupe persistido por `event.id`. Manejo del set completo de eventos: éxito, fallo, expiración,
reembolso, disputa. Job de reconciliación para pagos huérfanos. Acceso a "mi orden" por id CSPRNG.

**M4 · Notificaciones + Envíos + Hardening**
Adapter `mailer` (Resend) con correos de confirmación, preparación y guía. Adapter de notificación a
Telegram para el equipo (con stub si no hay credenciales). Sub-recurso de tracking de envío con enum de
estado propio, log de eventos con timestamp y rate limit dedicado si se expone público. Captura manual de
paquetería + número de guía desde el panel. Rate limiters finos por acción. Endpoints de stats por módulo.
`npm audit` limpio.

### Bloques 2 y 3 — fuera del alcance actual

Se listan **solo para fijar el orden de trabajo**, no su contenido:

- **Bloque 2 — Dashboard admin.** Consume la API del Bloque 1.
- **Bloque 3 — Frontend público.** Consume la misma API.

**Ninguna decisión de diseño está tomada** para estos bloques: ni paleta, ni tipografía, ni layout, ni
componentes, ni cómo se ve el Print Selector. Cada uno abrirá su propio brainstorming de diseño cuando
llegue su turno, después de que el backend esté verificado.

### Milestones posteriores (diferidos)
Mayoreo B2B · Bundles · Suscripciones · Waitlist + analítica de preferencias.

---

## Archivos críticos de M1 (primer milestone a ejecutar)

Estructura según `ECOMMERCE_ARCHITECTURE_GUIDELINES.md`:

```
gira-clothing/
├── apps/api/src/
│   ├── config/       env.ts (loadEnv), db.ts, cors.ts, logger.ts, cloudinary.ts, stripe.ts
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

---

## Verificación (antes de declarar cualquier milestone como hecho)

Por cada milestone, con **evidencia real** pegada en la respuesta — nunca afirmar sin correr:

1. `pnpm tsc --noEmit` — sin errores de tipos.
2. `pnpm build` — build limpio.
3. `pnpm lint`.
4. `pnpm test` — TDD obligatorio en M3 (reserva de stock, cálculo de totales, transiciones de estado,
   idempotencia de webhooks). Recomendado en el resto.
5. `pnpm audit` — sin high/critical en dependencias de producción.
6. Recorrido manual del flujo del milestone (M1: registro → login → `/auth/me` → 2FA → logout;
   M3: carrito → checkout Stripe test → webhook → stock descontado → orden en estado `paid`).
7. Checklist de arranque de `BACKEND_SECURITY_GUIDELINES.md` repasado punto por punto en M1 y M4.

---

## Próximo paso tras la aprobación

Siguiendo el flujo actualizado de `CLAUDE.md`:

1. Escribir el spec formal en `docs/superpowers/specs/2026-07-23-gira-clothing-design.md` (contenido de
   este documento, ya validado).
2. Invocar `writing-plans` para el plan de implementación detallado de **M1**.
3. Ejecutar M1 en su propia sesión, apoyándome en **`senior-backend`** como método/checklist — con la
   regla de precedencia vigente: si choca con `~/.claude/standards/`, mandan los estándares.
4. Los milestones siguientes abren chat nuevo cargando: la guía + el spec + el estado del repo.

`senior-frontend` no entra todavía: los bloques 2 y 3 están fuera del alcance actual.

**Recordatorio operativo:** ningún `git add` / `commit` / `push` se ejecuta sin que Manuel lo apruebe
explícitamente, en ningún milestone. Solo se prepara y se muestra el diff.
