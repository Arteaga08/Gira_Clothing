# M1 · Scaffolding seguro + Auth — Plan de implementación

> **Al ejecutar:** los pasos usan checkbox (`- [ ]`). Ningún `git add/commit/push` se ejecuta sin
> aprobación explícita de Manuel: al llegar a un paso de commit, se muestra `git status` + `git diff`
> y se espera el visto bueno.

## Context

Gira Clothing es una marca mexicana de bolsos y accesorios cuyo diferenciador es el **print**: un
mismo modelo existe en varias telas y el stock vive por combinación modelo+print. El catálogo hoy
vive en Instagram, un canal que la marca no controla, y las plataformas de renta no modelan el print
como decisión principal de compra. Por eso se construye a medida.

El diseño ya está cerrado y validado en
[2026-07-23-gira-clothing-design.md](docs/superpowers/specs/2026-07-23-gira-clothing-design.md) y
[2026-07-23-gira-clothing-plan-maestro.md](docs/superpowers/specs/2026-07-23-gira-clothing-plan-maestro.md).
Este plan ejecuta **solo M1**: los cimientos sobre los que M2 (catálogo/inventario), M3
(órdenes/pagos) y M4 (notificaciones/hardening) se construyen después. Hoy el repo está
prácticamente vacío (`README.md`, `docs/`, `.vscode/`) — no hay código.

**Resultado esperado:** un monorepo pnpm con `apps/api` funcionando, capas estrictas, la cadena de
middleware del estándar en el orden exacto, auth con JWT en cookie HttpOnly + 2FA TOTP para admin,
audit trail, y el flujo `registro → login → /auth/me → 2FA → logout` verificado end-to-end.

**Fuera de alcance (no tocar):** `apps/web`, dashboard, cualquier decisión visual, catálogo,
carrito, pagos, uploads, mailer, Telegram. Tampoco `parseListQuery`: el spec §7 lo listaba en los
`utils/` de M1, pero **Manuel aprobó diferirlo a M2**, junto a su primer consumidor real — escribirlo
sin un listado que lo use sería adivinar la firma.

### Decisiones tomadas al inicio de esta sesión

| Pregunta abierta | Decisión |
|---|---|
| Refresh token rotativo | **No en M1.** Un solo JWT de sesión en cookie HttpOnly (7d). El refresh rotativo revocable se agenda para M4 (Hardening). |
| Primer admin | **Script de seed CLI** idempotente (`pnpm --filter api seed:admin`). Sin endpoint de bootstrap. |
| Runner de tests | **Vitest + supertest + mongodb-memory-server** (queda fijado para M2–M4). |
| `.vscode/` | **Ignorado** en `.gitignore` (preferencia de máquina + extensión Snyk, no config del proyecto). |

### Estándares que mandan (precedencia sobre cualquier skill genérica)

- `~/.claude/CLAUDE.md` — no-negociables.
- `~/.claude/standards/BACKEND_SECURITY_GUIDELINES.md` — §1-13 + checklist de arranque.
- `~/.claude/standards/BACKEND_ARCHITECTURE_GUIDELINES.md` — capas §2, convenciones §3.
- `~/.claude/standards/ECOMMERCE_ARCHITECTURE_GUIDELINES.md` — monorepo, cadena de middleware.

Regla de bilingüismo: **todo el código, nombres y comentarios en inglés**; los `message` de las
respuestas HTTP y los mensajes de Joi, **en español**.

---

## Tech Stack

Node 24 · pnpm 9.12 · TypeScript estricto (`strict: true` + `noUncheckedIndexedAccess`) ·
Express 5 · Mongoose 8 (MongoDB 7 local ya disponible) · Joi · bcrypt · jsonwebtoken · otplib ·
helmet · cors · cookie-parser · express-rate-limit · xss · pino + pino-http ·
Vitest + supertest + mongodb-memory-server · ESLint 9 (flat config) + Prettier.

---

## Estructura de archivos

```
Gira_Clothing/
├── .gitignore                      # node_modules, dist, .env.*.local, .vscode/, coverage
├── package.json                    # scripts raíz: tsc/build/lint/test/audit (delegan a -r)
├── pnpm-workspace.yaml             # apps/*, packages/*
├── tsconfig.base.json              # strict + noUncheckedIndexedAccess, compartido
├── eslint.config.mjs               # flat config raíz
├── .prettierrc
├── packages/shared/
│   ├── package.json                # composite: true, emite .d.ts
│   ├── tsconfig.json
│   └── src/
│       ├── types/apiResponse.ts    # ApiResponse<T>, ApiMeta
│       ├── enums/userRole.ts       # UserRole
│       ├── enums/auditAction.ts    # AuditAction, AuditModule
│       └── index.ts                # re-exports (exportaciones al final)
└── apps/api/
    ├── package.json                # declaration: false (app, no librería)
    ├── tsconfig.json
    ├── vitest.config.ts
    ├── .env.development.example    # versionado, placeholders
    ├── .env.production.example     # versionado, placeholders
    └── src/
        ├── config/
        │   ├── env.ts              # loadEnv() fail-fast + env congelado
        │   ├── db.ts               # connectDB / disconnectDB
        │   ├── cors.ts             # allowedOrigins — ÚNICA fuente (CORS + verifyOrigin)
        │   └── logger.ts           # pino con redact de PII
        ├── utils/
        │   ├── AppError.ts
        │   ├── asyncHandler.ts
        │   ├── sendResponse.ts
        │   ├── crypto.ts           # encryptSecret / decryptSecret (AES-256-GCM)
        │   └── token.ts            # signAuthToken / verifyAuthToken / cookie options
        ├── middlewares/
        │   ├── mongoSanitize.ts
        │   ├── sanitizeInput.ts
        │   ├── verifyOrigin.ts
        │   ├── rateLimit.ts        # factory + limiters nombrados
        │   ├── validate.ts
        │   ├── protect.ts          # protect + restrictTo
        │   ├── notFound.ts
        │   └── errorHandler.ts
        ├── models/
        │   ├── User.ts
        │   └── AuditLog.ts
        ├── validators/authValidator.ts
        ├── services/
        │   ├── authService.ts
        │   └── auditService.ts
        ├── controllers/authController.ts
        ├── routes/v1/
        │   ├── index.ts            # monta /auth + /health
        │   └── authRoutes.ts
        ├── scripts/seedAdmin.ts
        ├── app.ts                  # buildApp() — sin puerto ni DB
        └── server.ts               # loadEnv → DB → listen → graceful shutdown
    └── tests/
        ├── setup.ts                # mongodb-memory-server global
        ├── unit/crypto.test.ts
        ├── unit/mongoSanitize.test.ts
        ├── unit/sanitizeInput.test.ts
        ├── unit/env.test.ts
        └── integration/auth.test.ts
```

---

## Contratos clave (definidos una vez, usados en todo el plan)

```ts
// packages/shared/src/types/apiResponse.ts
interface ApiMeta { total: number; page: number; pages: number; limit: number }
interface ApiResponse<T = unknown> {
  status: "success" | "fail" | "error";
  message: string;              // español, de cara al usuario
  data?: T;
  meta?: ApiMeta;
}

// packages/shared/src/enums/userRole.ts
enum UserRole { CUSTOMER = "customer", ADMIN = "admin" }

// packages/shared/src/enums/auditAction.ts
enum AuditModule { AUTH = "auth" }
enum AuditAction {
  LOGIN_SUCCESS = "login_success",
  LOGIN_FAILED = "login_failed",
  LOGOUT = "logout",
  TWO_FACTOR_SETUP = "two_factor_setup",
  TWO_FACTOR_ENABLED = "two_factor_enabled",
  TWO_FACTOR_DISABLED = "two_factor_disabled",
}

// utils/sendResponse.ts
const sendResponse = <T>(res: Response, statusCode: number, message: string, data?: T, meta?: ApiMeta): void

// utils/AppError.ts — class AppError extends Error { statusCode: number; isOperational = true }

// utils/crypto.ts — formato de salida "ivHex:authTagHex:cipherHex", IV aleatorio de 12 bytes
const encryptSecret = (plain: string): string
const decryptSecret = (payload: string): string

// services/authService.ts
registerCustomer(input: RegisterInput, ctx: RequestContext): Promise<PublicUser>
loginUser(input: LoginInput, ctx: RequestContext): Promise<{ user: PublicUser; token: string }>
getCurrentUser(userId: string): Promise<PublicUser>
setupTwoFactor(userId: string): Promise<{ otpauthUrl: string; secret: string }>
enableTwoFactor(userId: string, code: string, ctx: RequestContext): Promise<void>
disableTwoFactor(userId: string, code: string, ctx: RequestContext): Promise<void>

// services/auditService.ts — best-effort, NUNCA lanza hacia arriba
recordAudit(entry: AuditEntry): Promise<void>
```

**Endpoints de M1** (todos bajo `/api/v1`):

| Método | Ruta | Middlewares | Nota |
|---|---|---|---|
| GET | `/health` | — | `{ status, uptime, db }`, sin datos sensibles |
| POST | `/auth/register` | `registerLimiter`, `validate` | Siempre rol `customer` |
| POST | `/auth/login` | `loginLimiter`, `validate` | Mensaje genérico anti-enumeración |
| POST | `/auth/logout` | `protect` | Sobrescribe cookie |
| GET | `/auth/me` | `protect` | |
| POST | `/auth/2fa/setup` | `protect`, `restrictTo(ADMIN)` | Genera secreto, `enabled: false` |
| POST | `/auth/2fa/enable` | `protect`, `restrictTo(ADMIN)`, `validate` | Exige TOTP válido |
| POST | `/auth/2fa/disable` | `protect`, `restrictTo(ADMIN)`, `validate` | Exige TOTP válido |

---

## Tarea 0 · Pendientes de la sesión anterior (antes de tocar código)

**Archivos:** `docs/superpowers/specs/2026-07-23-gira-clothing-design.md`, `.gitignore` (crear).

- [ ] **Paso 1: Reparar la frase cortada de §1 del spec.** La línea 11 está vacía y el párrafo
      arranca huérfano en `principal de compra*`. Restaurar la primera línea desde el plan maestro
      (líneas 9-11 de ese archivo), quedando:

```
Las plataformas de renta (Shopify, Wix) modelan variantes por talla/color, no por *print como decisión
principal de compra* con swatches de fotografía macro, filtro cruzado por tela y **stock independiente
por combinación modelo + print**. Por eso se construye a medida.
```

- [ ] **Paso 2: Crear `.gitignore`** en la raíz:

```gitignore
node_modules/
dist/
build/
coverage/
.vscode/
.DS_Store
*.log
.env
.env.*.local
```

- [ ] **Paso 3: Verificar que no hay secretos rastreados** — `git status --short` debe mostrar solo
      `docs/`, `.gitignore` y el spec modificado; `.vscode/` ya no debe aparecer.
- [ ] **Paso 4: Commit** (mostrar diff y esperar aprobación) — `chore: gitignore + fix spec §1`.

---

## Tarea 1 · Monorepo pnpm + tooling base

**Archivos:** `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `eslint.config.mjs`,
`.prettierrc`.

- [ ] **Paso 1:** `pnpm-workspace.yaml` con `packages: ["apps/*", "packages/*"]`.
- [ ] **Paso 2:** `package.json` raíz (`private: true`, `packageManager: pnpm@9.12.0`) con scripts
      que delegan al workspace: `typecheck` (`pnpm -r exec tsc --noEmit`), `build` (`pnpm -r build`),
      `lint`, `test`, `audit` (`pnpm audit --prod --audit-level=high`).
- [ ] **Paso 3:** `tsconfig.base.json`: `target: ES2023`, `module: NodeNext`,
      `moduleResolution: NodeNext`, `strict: true`, `noUncheckedIndexedAccess: true`,
      `exactOptionalPropertyTypes: true`, `noImplicitOverride: true`, `esModuleInterop: true`,
      `skipLibCheck: true`.
- [ ] **Paso 4:** ESLint 9 flat config con `typescript-eslint` (recommended-type-checked) +
      `eslint-config-prettier`. Regla explícita que refuerza el no-negociable de capas:
      `no-restricted-imports` prohibiendo `../models/*` desde `controllers/` y `routes/`.
- [ ] **Paso 5:** `pnpm install` y verificar que el workspace resuelve (`pnpm -r list --depth -1`).
- [ ] **Paso 6: Commit** (diff + aprobación) — `chore: monorepo pnpm + tooling base`.

---

## Tarea 2 · `packages/shared` (contrato tipado)

**Archivos:** `packages/shared/{package.json,tsconfig.json}`, `src/types/apiResponse.ts`,
`src/enums/userRole.ts`, `src/enums/auditAction.ts`, `src/index.ts`.

- [ ] **Paso 1:** `package.json` con `name: "@gira/shared"`, `main: dist/index.js`,
      `types: dist/index.d.ts`, script `build: tsc -b`.
- [ ] **Paso 2:** `tsconfig.json` extendiendo la base con `composite: true`, `declaration: true`,
      `outDir: dist`, `rootDir: src`.
- [ ] **Paso 3:** Escribir los tipos y enums exactamente como en "Contratos clave" arriba.
      **Exportaciones al final del archivo** (`export { UserRole };`), nunca inline — no-negociable #4.
- [ ] **Paso 4:** `pnpm --filter @gira/shared build` → `dist/index.d.ts` existe.
- [ ] **Paso 5: Commit** (diff + aprobación) — `feat(shared): contrato tipado ApiResponse + enums`.

---

## Tarea 3 · `apps/api` esqueleto + `loadEnv()` fail-fast (TDD)

**Archivos:** `apps/api/{package.json,tsconfig.json,vitest.config.ts}`,
`src/config/env.ts`, `.env.development.example`, `.env.production.example`,
`tests/setup.ts`, `tests/unit/env.test.ts`.

Variables requeridas: `NODE_ENV`, `PORT`, `MONGODB_URI`, `JWT_SECRET` (≥48), `JWT_EXPIRES_IN`,
`ENCRYPTION_KEY` (≥48), `CLIENT_URL`, `COOKIE_NAME`, `LOG_LEVEL`.

- [ ] **Paso 1:** `package.json` de la API con deps de runtime y dev; `tsconfig.json` con
      **`declaration: false`** (evita TS2742 con tipos de Express bajo pnpm) y `"references": [{ "path": "../../packages/shared" }]`.
- [ ] **Paso 2: Escribir el test que falla** — `tests/unit/env.test.ts`:

```ts
describe("loadEnv", () => {
  it("aborta si falta MONGODB_URI", () => { /* espera throw con mensaje que nombra la variable */ });
  it("aborta si JWT_SECRET tiene menos de 48 caracteres", () => { /* … */ });
  it("aborta si ENCRYPTION_KEY tiene menos de 48 caracteres", () => { /* … */ });
  it("aborta si NODE_ENV no es production|development|test", () => { /* … */ });
  it("devuelve un objeto congelado", () => { expect(Object.isFrozen(loadEnv())).toBe(true); });
});
```

- [ ] **Paso 3: Correr y verificar que falla** — `pnpm --filter api test env` → FAIL (módulo no existe).
- [ ] **Paso 4: Implementar `env.ts`** — carga eager de `.env.${NODE_ENV}.local` con `dotenv`,
      valida presencia + longitudes mínimas + enum de `NODE_ENV`, agrupa **todos** los errores en un
      solo mensaje (no aborta en el primero), y devuelve `Object.freeze(env)`.
      En producción exige además `CLIENT_URL` con `https://`.
- [ ] **Paso 5: Correr los tests** → PASS.
- [ ] **Paso 6:** Escribir los dos `.env.*.example` con **placeholders** (`JWT_SECRET=<48+ chars>`),
      cero valores reales. Crear localmente `.env.development.local` (git-ignored) con secretos
      generados vía `openssl rand -hex 32`.
- [ ] **Paso 7: Commit** (diff + aprobación) — `feat(api): esqueleto + loadEnv fail-fast`.

---

## Tarea 4 · Utils transversales + crypto AES-256-GCM (TDD)

**Archivos:** `src/utils/{AppError,asyncHandler,sendResponse,crypto,token}.ts`,
`src/config/logger.ts`, `tests/unit/crypto.test.ts`.

- [ ] **Paso 1: Test que falla** — `tests/unit/crypto.test.ts`:

```ts
it("round-trip: descifra lo que cifró", () => {
  expect(decryptSecret(encryptSecret("JBSWY3DPEHPK3PXP"))).toBe("JBSWY3DPEHPK3PXP");
});
it("produce un ciphertext distinto cada vez (IV aleatorio)", () => {
  expect(encryptSecret("same")).not.toBe(encryptSecret("same"));
});
it("tiene formato ivHex:authTagHex:cipherHex con IV de 12 bytes", () => {
  const [iv, tag] = encryptSecret("x").split(":");
  expect(iv).toHaveLength(24); expect(tag).toHaveLength(32);
});
it("lanza si el authTag fue manipulado", () => { /* muta el tag → expect(() => decryptSecret(...)).toThrow() */ });
```

- [ ] **Paso 2:** Correr → FAIL.
- [ ] **Paso 3: Implementar `crypto.ts`** con `crypto.createCipheriv("aes-256-gcm", key, iv)`,
      clave derivada por `sha256(env.ENCRYPTION_KEY)`, IV aleatorio de 12 bytes por cifrado.
- [ ] **Paso 4:** Correr → PASS.
- [ ] **Paso 5: Implementar el resto de utils.** `AppError` (statusCode + `isOperational`);
      `asyncHandler` tipado para Express 5; `sendResponse` como **única** forma de armar JSON;
      `token.ts` con `signAuthToken` / `verifyAuthToken` y `buildCookieOptions()`
      → `{ httpOnly: true, secure: env.nodeEnv === "production", sameSite: "strict", maxAge }`.
- [ ] **Paso 6: Implementar `config/logger.ts`** — pino con `redact` de PII/secretos:
      `["req.headers.cookie", "req.headers.authorization", "*.password", "*.token", "*.secret", "*.email", "*.twoFactor"]`,
      `level` desde env, `debug` silenciado fuera de development.
- [ ] **Paso 7: Commit** (diff + aprobación) — `feat(api): utils transversales + crypto AES-256-GCM`.

---

## Tarea 5 · Middlewares de seguridad (TDD en los dos sanitizadores)

**Archivos:** `src/middlewares/*.ts`, `src/config/cors.ts`,
`tests/unit/{mongoSanitize,sanitizeInput}.test.ts`.

- [ ] **Paso 1: Tests que fallan** — `mongoSanitize`: elimina claves `$gt` anidadas en body/params/query,
      elimina claves con `.`, bloquea `__proto__`/`constructor`/`prototype`, y **muta `req.query` en
      sitio sin reasignarlo** (en Express 5 `req.query` es de solo lectura — este es el test que
      importa). `sanitizeInput`: escapa `<script>` recursivamente en objetos y arrays anidados, y
      **deja intactos** `password`, `token`, `code`, `secret` (no alterar credenciales).
- [ ] **Paso 2:** Correr → FAIL.
- [ ] **Paso 3:** Implementar `mongoSanitize.ts` y `sanitizeInput.ts` (librería `xss`) recorriendo
      recursivamente `body`, `params` y `query`.
- [ ] **Paso 4:** Correr → PASS.
- [ ] **Paso 5: `config/cors.ts`** — `allowedOrigins` derivado de `env.CLIENT_URL`, con `localhost`
      **solo fuera de producción**. Es la **única** fuente de verdad, consumida por `cors()` y por
      `verifyOrigin` (no se duplica la lista).
- [ ] **Paso 6: `verifyOrigin.ts`** — solo en métodos mutantes; `Origin`, con `Referer` de fallback;
      requests **sin** ninguno de los dos se permiten (server-to-server / health checks); origen
      presente y fuera de la whitelist → `AppError(403)`.
- [ ] **Paso 7: `rateLimit.ts`** — factory `createLimiter({ windowMs, max, message })` con
      `MemoryStore` propio por limiter (reseteable en tests) y **no-op fuera de producción**.
      Exporta `globalLimiter` (backstop), `loginLimiter` (5/15min), `registerLimiter` (10/15min).
      Las rutas admin **no** se limitan.
- [ ] **Paso 8: `validate.ts`** — `validate(schema, source = "body")` con
      `{ abortEarly: false, stripUnknown: true }`; reasigna el valor limpio sobre `req[source]`
      (salvo `query`: mutar en sitio) y agrupa los mensajes de Joi (español) en un `AppError(400)`.
- [ ] **Paso 9: `notFound.ts` + `errorHandler.ts`** — el handler global (4 args) normaliza
      `CastError`, `ValidationError`, duplicate key `11000`, `JsonWebTokenError`, `TokenExpiredError`
      → `AppError`; en producción devuelve solo `{ status, message }` y `"Algo salió mal"` para lo no
      operacional, **sin stack**; en desarrollo incluye stack.
- [ ] **Paso 10: Commit** (diff + aprobación) — `feat(api): cadena de middlewares de seguridad`.

---

## Tarea 6 · Modelos `User` y `AuditLog`

**Archivos:** `src/models/User.ts`, `src/models/AuditLog.ts`.

- [ ] **Paso 1: `User.ts`** — campos: `name`, `email` (único, lowercase, trim),
      `password` (**`select: false`**), `role` (`UserRole`, default `CUSTOMER`, **nunca desde el payload**),
      `twoFactor: { enabled: Boolean (default false), secret: String (select: false) }`,
      `isActive`, timestamps.
- [ ] **Paso 2:** Hook `pre("save")` que hashea con **bcrypt 12** solo si `isModified("password")`,
      y método de instancia `comparePassword`.
- [ ] **Paso 3: `AuditLog.ts`** — `actorId`, `actorType`, `action` (`AuditAction`),
      `module` (`AuditModule`), `targetId?`, `before?`, `after?`, `ip`, `createdAt` automático.
      Índices en `actorId` y `module`. **Append-only:** el modelo no expone `update`/`delete`.
      Comentario explícito en el archivo: nunca guardar PII ni secretos en `before`/`after`.
- [ ] **Paso 4: `config/db.ts`** — `connectDB()` / `disconnectDB()`, sin `console.log` de la URI.
- [ ] **Paso 5:** `pnpm --filter api exec tsc --noEmit` → limpio.
- [ ] **Paso 6: Commit** (diff + aprobación) — `feat(api): modelos User y AuditLog`.

---

## Tarea 7 · `app.ts` + `/health` + primer test de integración

**Archivos:** `src/app.ts`, `src/routes/v1/index.ts`, `tests/setup.ts`,
`tests/integration/auth.test.ts` (primer caso).

- [ ] **Paso 1: Test que falla** — `GET /api/v1/health` responde 200 con `{ status: "success" }`,
      levantando la app con `supertest(buildApp())` **sin abrir puerto ni conectar a Mongo real**.
- [ ] **Paso 2:** Correr → FAIL.
- [ ] **Paso 3: Implementar `buildApp()`** con la cadena en el **orden exacto** del estándar:

```
helmet() → cors({ origin: allowedOrigins, credentials: true }) →
express.json({ limit: "10kb" }) → cookieParser() → mongoSanitize → sanitizeInput →
verifyOrigin → globalLimiter → pinoHttp → /api/v1 router → notFound → errorHandler
```

  `buildApp()` no abre puerto ni conecta la DB (testeable con supertest).
  Dejar un comentario donde irá el webhook de Stripe con body crudo **antes** de `express.json` (M3).
- [ ] **Paso 4:** Correr → PASS.
- [ ] **Paso 5: `tests/setup.ts`** con `mongodb-memory-server`: arranca antes de la suite, limpia
      colecciones entre tests, cierra al final. Registrarlo en `vitest.config.ts` (`setupFiles`).
- [ ] **Paso 6: Commit** (diff + aprobación) — `feat(api): buildApp con cadena de middleware + health`.

---

## Tarea 8 · Auth: registro, login, me, logout (TDD)

**Archivos:** `src/validators/authValidator.ts`, `src/services/{authService,auditService}.ts`,
`src/controllers/authController.ts`, `src/routes/v1/authRoutes.ts`,
`src/middlewares/protect.ts`, `tests/integration/auth.test.ts`.

- [ ] **Paso 1: Tests que fallan** (integración, con supertest):

```
register: crea usuario y responde 201 sin devolver password
register: email duplicado → 409
register: intento de mass assignment { role: "admin" } → el usuario creado queda como "customer"
login: credenciales correctas → 200 + cookie HttpOnly con SameSite=Strict
login: email inexistente y password incorrecto → MISMO mensaje y mismo status (anti-enumeración)
login: 6º intento dentro de la ventana → 429   (con NODE_ENV=production simulado)
me: sin cookie → 401 ;  con cookie válida → 200 con el usuario, sin password
logout: sobrescribe la cookie y /auth/me pasa a responder 401
body > 10kb → 413
```

- [ ] **Paso 2:** Correr → FAIL.
- [ ] **Paso 3: `authValidator.ts`** — Joi con `stripUnknown: true` y **mensajes en español**
      (`"El correo no tiene un formato válido"`). Password: mínimo 8, con mayúscula, minúscula y
      número. `role` **no existe** en el schema (mass assignment muerto en la puerta).
- [ ] **Paso 4: `auditService.ts`** — `recordAudit()` envuelto en try/catch que loguea el fallo y
      **nunca** propaga: el audit es best-effort y jamás revierte la operación auditada.
- [ ] **Paso 5: `authService.ts`** — única capa que toca los modelos. `loginUser` recupera con
      `.select("+password")`, y ante email inexistente **o** password incorrecto lanza el mismo
      `AppError("Correo o contraseña incorrectos", 401)`. Registra `LOGIN_SUCCESS`/`LOGIN_FAILED`
      en el audit trail con IP, sin PII.
- [ ] **Paso 6: `protect.ts`** — lee el JWT de la cookie, lo verifica, carga `req.user` desde DB
      (verificando `isActive`); `restrictTo(...roles)` corre **siempre después** de `protect`.
- [ ] **Paso 7: `authController.ts`** — solo orquesta: extrae input validado, llama al service,
      responde con `sendResponse`. **No toca modelos ni arma JSON a mano.** Todo envuelto en
      `asyncHandler`.
- [ ] **Paso 8: `authRoutes.ts`** — montar con los middlewares de la tabla de endpoints de arriba.
- [ ] **Paso 9:** Correr los tests → PASS (todos).
- [ ] **Paso 10: Commit** (diff + aprobación) — `feat(api): auth con JWT en cookie HttpOnly`.

---

## Tarea 9 · 2FA TOTP para admin (TDD)

**Archivos:** `src/services/authService.ts` (extender), `authController.ts`, `authRoutes.ts`,
`authValidator.ts`, `tests/integration/auth.test.ts` (extender).

- [ ] **Paso 1: Tests que fallan:**

```
2fa/setup como customer → 403 (restrictTo)
2fa/setup como admin → 200 con otpauthUrl; en DB el secreto queda CIFRADO y enabled: false
2fa/enable con código inválido → 400 y enabled sigue false
2fa/enable con código válido (otplib.authenticator.generate) → 200 y enabled: true
login de admin con 2FA activo y sin código → 401 con error ESPECÍFICO de 2FA requerido
login de admin con 2FA activo y código válido → 200 + cookie
2fa/disable sin código válido → 400 (no basta con estar autenticado)
2fa/disable con código válido → 200, enabled false y secreto eliminado
```

- [ ] **Paso 2:** Correr → FAIL.
- [ ] **Paso 3: Implementar** con `otplib`. El secreto se guarda **cifrado** con `encryptSecret()`
      de la Tarea 4 y se recupera solo donde se verifica, con `.select("+twoFactor.secret")`.
      Activación en dos pasos: `setup` deja `enabled: false`; `enable` exige TOTP válido.
      El error de TOTP es **específico** — el mensaje genérico anti-enumeración aplica solo a la
      combinación email/contraseña, no al segundo factor.
- [ ] **Paso 4:** Correr → PASS.
- [ ] **Paso 5:** Auditar `TWO_FACTOR_SETUP` / `ENABLED` / `DISABLED` (nunca el secreto en el log).
- [ ] **Paso 6: Commit** (diff + aprobación) — `feat(api): 2FA TOTP para admin con secreto cifrado`.

---

## Tarea 10 · `server.ts`, graceful shutdown y seed de admin

**Archivos:** `src/server.ts`, `src/scripts/seedAdmin.ts`.

- [ ] **Paso 1: `server.ts`** — `loadEnv()` → `connectDB()` → `buildApp()` → `listen`.
- [ ] **Paso 2: Graceful shutdown** — en `SIGINT`/`SIGTERM`: dejar de aceptar conexiones,
      cerrar Mongoose, salir; con **timeout de red de seguridad** (10s) que fuerza la salida.
      `unhandledRejection` y `uncaughtException` loguean y cierran ordenadamente.
- [ ] **Paso 3: `scripts/seedAdmin.ts`** — idempotente: si ya existe un usuario con ese email no
      hace nada; si no, lo crea con `role: ADMIN`. Lee email/password de `argv` o de env, **nunca
      hardcodeados**. Script `seed:admin` en el `package.json` de la API.
- [ ] **Paso 4:** Correr `pnpm --filter api dev` contra el Mongo local, verificar `/api/v1/health`,
      y comprobar que `Ctrl+C` cierra sin dejar el proceso colgado.
- [ ] **Paso 5: Commit** (diff + aprobación) — `feat(api): server, graceful shutdown y seed de admin`.

---

## Verificación final (evidencia real, nada de afirmaciones)

Ningún paso se da por bueno sin pegar la salida real del comando.

- [ ] `pnpm typecheck` → sin errores.
- [ ] `pnpm build` → limpio (shared emite `.d.ts`, api compila con `declaration: false`).
- [ ] `pnpm lint` → sin errores.
- [ ] `pnpm test` → toda la suite en verde (unit + integración).
- [ ] `pnpm audit --prod --audit-level=high` → sin high/critical.
- [ ] **Recorrido manual end-to-end** con el servidor levantado y `curl -c/-b cookies.txt`:
      `register → login → GET /auth/me → seed:admin → login admin → 2fa/setup → 2fa/enable →
      login admin con TOTP → 2fa/disable → logout → /auth/me devuelve 401`.
- [ ] **Verificación de seguridad puntual:** `git ls-files | grep -i env` no muestra ningún
      `.local`; inspeccionar el documento del admin en Mongo y confirmar que `twoFactor.secret`
      está cifrado (formato `iv:tag:cipher`) y `password` es un hash bcrypt.
- [ ] **Repasar punto por punto** el "Checklist de arranque" de `BACKEND_SECURITY_GUIDELINES.md`,
      marcando cada ítem contra el código real. Los que no aplican a M1 (uploads, rate limit de
      checkout, route guards del frontend) se anotan explícitamente como diferidos a su milestone.

Al terminar, copiar este plan a `docs/superpowers/plans/2026-07-23-m1-scaffolding-auth.md` para que
quede versionado con el proyecto, y presentar el diff completo de M1 para aprobación de commit.
