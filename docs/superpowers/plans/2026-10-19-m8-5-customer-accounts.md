# M8.5 — Cuentas de cliente (backend)

## Contexto
Hoy el cliente se registra con `name` + contraseña de 8 caracteres y entra directo, sin verificar el correo. No hay forma de recuperar la contraseña y logout cierra **todas** las sesiones (sube `tokenVersion`). M8.5 cierra el flujo de cuentas de cliente del estándar (ECOMMERCE "Cuentas de cliente") del lado del API: verificación obligatoria, recuperación, límites por correo y sesión por dispositivo. Las pantallas de tienda son del Bloque 3.

Rama: `fix/m8-5-customer-accounts` desde `main` (verificado: `fix/m8-4-admin-2fa` ya es ancestro de `main`). Al arrancar, este plan se guarda en `docs/superpowers/plans/2026-10-19-m8-5-customer-accounts.md`.

### Reverificación contra el código (qué ya existe)
- `registerCustomer` responde 201 genérico sin `user` y quema bcrypt si el correo existe (M8.3). **Se conserva la idea**, pero se reescribe: falta la rama "existe sin verificar" y el envío del enlace.
- `loginUser` usa el hash señuelo (`getDecoyHash`) y el mensaje genérico. **Se conserva** y solo se agrega el 403 de cuenta sin verificar, después de validar la contraseña.
- Login con 5 fallos por correo+IP y 30 por IP. **Ya está; no se toca.**
- `LoginResult` session|challenge e `issueSession` como único firmante. **Se conservan**; `issueSession` además crea el registro de sesión.
- **No existe todavía:** firstName/lastName, `emailVerified`, tokens de un solo uso, endpoints de verify/resend/forgot/reset, correos de cuenta, límites por correo, sesión por dispositivo y `logout-all`.
- Política actual: mínimo 8 caracteres, sin tope de bytes y sin tope de 254 en el correo. **Se cambia.**

### Decisiones (Manuel, 2026-10-19)
- **Sesión por dispositivo** en lugar de refresh rotativo. El JWT lleva un `sid` y la colección `Session` guarda cada sesión, con índice TTL.
  - `protect` exige que la sesión exista y que `tv` coincida.
  - Logout cierra solo este dispositivo. `logout-all`, reset de contraseña y los cambios de 2FA cierran todas.
  - Se aparta de la letra del estándar (no hay refresh token). La revocación es inmediata porque `protect` ya consulta la DB en cada request.
- **Sin migración de usuarios:** todavía no hay cuentas de cliente. Todos deben quedar verificados. El admin que ya está en Atlas se completa con `seed:admin`, que pasa a actualizar si el admin existe: firstName/lastName, `emailVerified=true` y quita `name`, sin tocar la contraseña ni el 2FA.
- **Correos directo por Resend** (`getMailer()`), sin outbox, para que el token en claro nunca toque la DB. El envío es *fire-and-forget*, con su propio catch y log sin PII ni token: la respuesta no espera la red, así el tiempo no delata si hubo correo.
- **Enlaces como en esencia y bw_bikes:** `${CLIENT_URL}/verificar-correo?token=<64hex>` y `${CLIENT_URL}/restablecer-contrasena?token=<64hex>`.
- **Límites del estándar:**
  - Por correo: 3 cada 15 min en registro, reenvío y olvidé (correo normalizado).
  - `authActionLimiter` por IP: 20 cada 15 min, compartido por registro, verify, reenvío, olvidé y reset.
  - Enfriamiento de 60 s por tipo de enlace.
  - Login sin cambios.
- **Política de contraseña** sin HIBP: mínimo 10 caracteres, con mayúscula, minúscula y número, y máximo 72 bytes (`Buffer.byteLength`). Aplica en registro y reset. Login solo exige que venga; verify-email exige que venga y un tope de 72 bytes.
- **verify-email y reset no inician sesión.** Responden 200 y la pantalla mostrará "Ingresar".

## Diseño backend (`apps/api`)

**Modelo `User`** (`models/User.ts`):
- `name` se reemplaza por `firstName` y `lastName` (requeridos, trim, maxlength 60).
- `emailVerified: Boolean` (default false).
- Subdocumentos `emailVerification` y `passwordReset`, ambos con `{ tokenHash, expiresAt, issuedAt }` y `select:false`. Hay **uno por tipo**: emitir uno nuevo pisa al anterior, y eso es el "un enlace vivo por tipo".
- Índices parciales en `emailVerification.tokenHash` y `passwordReset.tokenHash`.

**Modelo `Session`** (`models/Session.ts`, nuevo):
- Campos: `{ user: ObjectId (index), expiresAt: Date }`, más timestamps.
- Índice TTL `expireAfterSeconds: 0`. Como el TTL borra con retraso, las consultas también filtran `expiresAt > now`.

**Utils**:
- `utils/oneTimeToken.ts`: `generateOneTimeToken()` (32 bytes CSPRNG en hex = 64 caracteres) y `hashOneTimeToken()` (sha256 hex).
- `utils/token.ts`:
  - `AuthTokenPayload` agrega `sid`. `verifyAuthToken` rechaza un token sin `sid`, así que las sesiones vivas de antes del deploy mueren (no hay cuentas reales).
  - Se exporta `parseDurationMs` para que la sesión venza igual que el JWT.

**Servicios** (authService ya mide 195 líneas, así que se reparte):
- `sessionService.ts`:
  - `createSession(userId)` → sid.
  - `isSessionActive(sid, userId)`.
  - `revokeSession(sid)`.
  - `revokeAllSessions(userId)`: `$inc tokenVersion` + `Session.deleteMany`.
- `accountTokenService.ts`:
  - `issueAccountToken(userId, kind)`: un `updateOne` **atómico**. El filtro exige `issuedAt` ausente o de hace ≥60 s, y el `$set` reescribe el subdocumento. Devuelve el token en claro, o `null` si está en enfriamiento. Eso también cubre dos peticiones concurrentes.
  - TTL: 24 h para verificación y 1 h para reset.
- `authMailService.ts`:
  - `sendVerificationEmail({ to, firstName, token })` y `sendPasswordResetEmail(...)`.
  - Renderizan, llaman a `getMailer().send` y capturan todo el error: log `{ kind, err.message }`, nunca el destinatario ni el token.
- `authService.ts`:
  - `registerCustomer({ firstName, lastName, email, password })`:
    1. **No existe:** crea al usuario con `emailVerified:false`, emite el token y manda el correo.
    2. **Existe sin verificar y es customer:** reemplaza contraseña y nombres (`save`, que paga el mismo bcrypt), reemite el token (eso invalida el anterior) y manda el correo. En enfriamiento: cambia la contraseña, pero no hay enlace nuevo.
    3. **Existe y está verificado, o es admin:** solo `bcrypt.hash` (tiempo equivalente) y no envía nada.
    4. Un `11000` por carrera da el mismo resultado.
  - `loginUser`: después de `passwordOk`, si `!emailVerified` → **403** "Activa tu cuenta con el enlace que te enviamos por correo.". Aplica a todo rol; el admin sembrado ya viene verificado.
  - `issueSession`: crea la sesión y firma con `sid`.
  - `logoutUser(sid)` revoca solo esa sesión. `logoutAllSessions(userId)` usa `revokeAllSessions`.
- `emailVerificationService.ts`:
  - `verifyEmail(token, password)`:
    1. Busca por hash y `expiresAt > now`, con `+password`. Si no hay → **400** "El enlace no es válido o ya venció. Pide uno nuevo.".
    2. Contraseña incorrecta → **401** "La contraseña no coincide con la de tu registro.", sin gastar el token.
    3. Si es correcta: `updateOne` atómico con el filtro `{_id, tokenHash}` que pone `emailVerified=true` y quita el subdocumento. Si no encuentra nada (otro request ganó) → 400.
    4. Audita `EMAIL_VERIFIED`.
  - `resendVerification(email)`: solo actúa si el usuario existe, es customer, está activo y sin verificar, y no está en enfriamiento. Si no, no hace nada.
- `passwordResetService.ts`:
  - `requestPasswordReset(email)`: si el usuario existe, está activo y no está en enfriamiento, emite el token y manda el correo. Audita `PASSWORD_RESET_REQUESTED`.
  - `resetPassword(token, password)`:
    1. **Reclama** el token con `findOneAndUpdate` (filtro hash + `expiresAt > now`, `$unset passwordReset`). Eso lo hace de un solo uso, incluso con requests concurrentes.
    2. Si no lo reclama, o el usuario está inactivo → 400.
    3. Pone la contraseña nueva (`save`, que hashea), `emailVerified=true` (probó que controla el buzón) y quita `emailVerification`.
    4. `revokeAllSessions` y audit `PASSWORD_RESET_COMPLETED`.
- Las ramas "no hay nada que hacer" responden igual y no esperan red. Las únicas diferencias de tiempo que quedan son escrituras de DB de pocos ms. bcrypt solo corre en registro, que ya está igualado.

**Templates**:
- `templates/emailLayout.ts`: se extraen `escapeHtml` y `layout` de `orderEmails.ts`, que pasa a importarlos. Es el shell existente.
- `templates/authEmails.ts`: `renderVerificationEmail({ firstName, url })` y `renderPasswordResetEmail(...)`. Llevan HTML y texto, copy en español, la vigencia del enlace y "si no fuiste tú, ignora este correo".

**Validadores** (`authValidator.ts`):
- `firstName` y `lastName`: 2–60 caracteres con trim.
- `email`: `max(254)`.
- `newPassword`: mínimo 10, los tres patrones y un `custom` de máximo 72 bytes. El mensaje dice qué falta.
- `verifyEmailSchema`: `{ token: /^[a-f0-9]{64}$/, password: requerida, ≤72 bytes }`.
- `emailOnlySchema` y `resetPasswordSchema`: `{ token, password: newPassword }`.
- `loginSchema` no cambia.
- `role` y `emailVerified` se descartan por `stripUnknown`.

**Rate limit** (`rateLimit.ts`):
- `authActionLimiter` por IP: 20 cada 15 min. Es una sola instancia montada en las cinco rutas, así que el contador se comparte. Reemplaza a `registerLimiter`.
- `registerEmailLimiter`, `resendEmailLimiter` y `forgotEmailLimiter`: 3 cada 15 min por correo normalizado, contando todas las peticiones (las respuestas son 2xx).
- Se extrae `normalizedEmail(req)`, que hoy vive dentro de `loginLimiter`.

**Controllers y rutas** (`authController.ts`, `authRoutes.ts`):
| Ruta | Middlewares | Respuesta |
|---|---|---|
| `POST /auth/register` | authAction, registerEmail, validate | 201 "Revisa tu correo para activar tu cuenta. El enlace vence en 24 horas." |
| `POST /auth/verify-email` | authAction, validate | 200 "Tu cuenta está activa. Ya puedes iniciar sesión." |
| `POST /auth/resend-verification` | authAction, resendEmail, validate | 200 "Si tu cuenta está pendiente de activar, te enviamos un enlace nuevo." |
| `POST /auth/forgot-password` | authAction, forgotEmail, validate | 200 "Si el correo tiene una cuenta, te enviamos un enlace para restablecer tu contraseña. Vence en 1 hora." |
| `POST /auth/reset-password` | authAction, validate | 200 "Tu contraseña cambió. Inicia sesión con la nueva." |
| `POST /auth/logout` | protect | Cierra solo esta sesión |
| `POST /auth/logout-all` | protect | 200 "Cerramos tu sesión en todos tus dispositivos.", limpia la cookie y audita `LOGOUT_ALL` |

**`protect` / `optionalAuth`**:
- `Promise.all` de `User.findById` y `isSessionActive(sid, sub)`. Si la sesión no existe o venció: el 401 de siempre, o invitado en `optionalAuth`.
- Pone `req.sessionId` (se amplía `types/express.d.ts`).
- Los `$inc tokenVersion` de `twoFactorService` (enroll y reset) se quedan. Siguen revocando porque `protect` compara `tv`; además llaman a `Session.deleteMany` por higiene.

**Script `seed:admin`**:
- La lógica se mueve a `services/adminBootstrapService.ts` → `ensureAdmin({ email, password, firstName, lastName })`.
  - Si no existe: crea con `emailVerified:true`.
  - Si existe como admin: `$set` de firstName/lastName/`emailVerified` y `$unset name` (con `strict:false`, porque `name` sale del schema). No toca la contraseña ni el 2FA.
  - Si existe con otro rol: error.
- El script queda como envoltura delgada, igual que `resetAdminTwoFactor.ts`.
- Flags `--first-name/--last-name` (o `ADMIN_FIRST_NAME`/`ADMIN_LAST_NAME`).
- Antes de actuar imprime el host de Mongo, sin credenciales.
- **Lo corres tú**; yo no corro scripts contra Atlas.

**Admin users** (`userService.ts`): `sortable` y `searchable` cambian `name` por `firstName` y `lastName`.

**Shared** (`packages/shared`):
- `PublicUser` y `AdminUser`: `firstName`, `lastName` y `emailVerified` en lugar de `name`.
- `AuditAction`: `EMAIL_VERIFIED`, `PASSWORD_RESET_REQUESTED`, `PASSWORD_RESET_COMPLETED` y `LOGOUT_ALL`.
- Tipos `RegisterRequest`, `VerifyEmailRequest`, `EmailOnlyRequest` y `ResetPasswordRequest`.
- Constantes `PASSWORD_MIN_LENGTH = 10` y `PASSWORD_MAX_BYTES = 72`: el validador del API las usa y el formulario del Bloque 3 las va a reflejar.

**Web (mínimo, porque cambia el DTO)**: `SidebarFooter.tsx` y `resumen/page.tsx` dejan `user.name` y componen `firstName lastName`. También se ajustan los fixtures de sus tests.

## TDD (tests rojos primero) y orden
1. Rama, guardar el plan y mover el shell de correo (refactor puro, con `orderEmails.test.ts` en verde).
2. **Rojo:**
   - `tests/unit/oneTimeToken.test.ts`: 64 hex, hash determinista y distinto del token.
   - `tests/unit/authValidator.test.ts`:
     - 9 caracteres falla y 10 pasa; 72 bytes pasa y 73 bytes con emoji falla; faltan mayúscula, minúscula o número.
     - Nombres de 2–60 caracteres; correo de más de 254 falla.
     - `role` y `emailVerified` se descartan.
     - El login acepta una contraseña corta.
   - `tests/unit/authEmails.test.ts`: el enlace lleva `?token=`, el HTML escapa el nombre y el texto plano existe.
   - `tests/integration/auth.test.ts` (registro y login, se reescribe):
     - 201 genérico sin cookie, con el usuario en `emailVerified:false`.
     - El correo capturado con `vi.spyOn(getMailer(), "send")` y `vi.waitFor` trae un token de 64 hex, y la DB solo guarda su hash.
     - Correo verificado: mismo 201, sin correo, contraseña intacta y `bcrypt.hash` llamado.
     - Correo sin verificar: contraseña reemplazada y enlace nuevo; el viejo deja de servir al mover `issuedAt` al pasado. Dentro del enfriamiento no hay correo nuevo.
     - Un fallo del mailer igual da 201.
     - Login: sin verificar con contraseña correcta → 403; sin verificar con contraseña incorrecta → 401 genérico; verificado → 200.
   - `tests/integration/emailVerification.test.ts`:
     - Verify correcto → verificado, sin cookie de sesión y con audit.
     - Token reusado → 400. Contraseña incorrecta → 401 y el token sigue sirviendo. Vencido → 400. Malformado → 400.
     - Dos verify concurrentes → exactamente uno da 200.
     - Resend: genérico para un correo inexistente, verificado o pendiente; enfriamiento de 60 s; el enlace nuevo invalida al anterior.
   - `tests/integration/passwordReset.test.ts`:
     - Forgot genérico exista o no el correo; solo hay correo si existe; enfriamiento; un usuario inactivo no recibe nada.
     - Reset → la contraseña nueva entra y la vieja no; dos sesiones previas dan 401; `tv` sube.
     - Un solo uso, también en concurrencia. Vence en 1 h. Se aplica la política. Una cuenta sin verificar queda verificada.
   - `tests/integration/sessions.test.ts`:
     - Dos logins; logout en uno no afecta al otro; `logout-all` mata a los dos.
     - Token sin `sid` → 401. Sesión borrada o vencida → 401. `optionalAuth` con sesión revocada → invitado.
     - Reemplaza al test de "logout sube tokenVersion".
   - `tests/integration/rateLimits.test.ts`, con `RATE_LIMIT_ENABLED=true` y `resetRateLimitStores()`:
     - El cuarto intento por correo da 429 en registro, reenvío y olvidé; otro correo pasa; mayúsculas no saltan el límite.
     - `authActionLimiter` es compartido entre rutas: el intento 21 desde la IP da 429.
   - `tests/integration/logRedaction.test.ts`: register, verify y reset no dejan token ni contraseña en los logs.
   - `adminUsers.test.ts`: orden y búsqueda por firstName/lastName.
   - `tests/integration/adminBootstrap.test.ts`: crea verificado; completa a un admin legado (`name` → firstName/lastName, sin tocar el hash ni el 2FA); rechaza a un customer.
3. **Verde:** shared → modelos → utils → sessionService/protect → accountToken/authMail/templates → servicios de cuenta → validadores/limiters/rutas → bootstrap/script → userService → web.
4. **Helpers** (`tests/helpers/auth.ts`):
   - `createCustomer({ emailVerified = true })` crea directo en la DB.
   - `loginAsCustomer` lo usa y luego hace login. **Los 24 archivos que lo usan no cambian.**
   - `createAdmin` agrega firstName/lastName y `emailVerified:true`.
   - Se ajustan los `User.create({ name })` que quedan en `adminUsers.test.ts`.
5. Docs:
   - `docs/SETUP-REQUERIDO.md`: `seed:admin` con los flags nuevos y correrlo una vez para completar al admin existente; las sesiones de antes del deploy se cierran; Resend es necesario para que lleguen los correos de cuenta.
   - Pendiente para el Bloque 3: `Referrer-Policy: no-referrer` + `no-store` en `/verificar-correo` y `/restablecer-contrasena`, como en esencia.

## Verificación
1. `pnpm -r exec tsc --noEmit` y `pnpm exec eslint apps packages`.
2. `pnpm --filter @gira/api test` y `pnpm --filter @gira/web test`. Si algo falla con `socket hang up`, se re-corre aislado: es el flake conocido.
3. `pnpm audit --prod --audit-level high` debe dar 0 (no hay dependencias nuevas) y `pnpm --filter @gira/web build`.
4. Manual (opcional; tu `.env.development.local` apunta a Atlas, así que **tú** decides si correrlo): `seed:admin` completa al admin; login admin → 2FA sigue igual; el panel muestra nombre y apellido.
5. `requesting-code-review` → correcciones → `verification-before-completion`.
6. Te entrego `git status`/`git diff` y los comandos de commit en la rama y merge a `main`. **No los ejecuto.**
7. Actualizar la memoria `project_milestone_status`: M8.5 implementada (commit y merge en tus manos), decisión de sesión por `sid` y pendientes.

**Fuera de alcance:** pantallas de tienda (Bloque 3), HIBP, cambio de contraseña desde Mi Cuenta, correo de "tu contraseña cambió", lista de sesiones activas en la UI y 2FA para clientes.

## Pendientes conocidos (post-review)
Se corrigieron en esta rama: reset de contraseña en una sola escritura atómica (antes un `save()` fallido dejaba el token gastado y la contraseña igual), los correos de cuenta ya no llevan el nombre (lo puede escribir cualquiera que conozca el correo) y el nombre solo admite letras, espacios, apóstrofo, punto y guion; las cuentas desactivadas no se re-registran, no se activan ni usan un enlace viejo; enrolar 2FA borra las sesiones huérfanas; el render del correo corre dentro del catch.

Quedan:
- **Tiempos con Atlas:** forgot/resend con cuenta existente hacen 1-2 escrituras más (update + auditoría) que sin cuenta; con latencia de Atlas son ~10-30 ms medibles con muestreo. Cerrarlo = meter emisión + auditoría dentro del bloque fire-and-forget. Medir en staging antes de decidir.
- **verify-email sin límite por cuenta:** solo el de 20/15 min por IP. Con un enlace filtrado, alguien que rote IPs podría probar contraseñas mientras viva el token (24 h). Cierre posible: contador de fallos en el subdocumento que invalide el token tras ~5.
- **Sin forma de ver el enlace en local sin Resend:** el stub no registra el token (correcto). Si hace falta probar a mano, decidir si se loguea el enlace solo con `NODE_ENV=development` + `LOG_LEVEL=debug`.
- **Bloque 3:** `Referrer-Policy: no-referrer` y `no-store` en `/verificar-correo` y `/restablecer-contrasena` (anotado en `SETUP-REQUERIDO.md` C.3).
- **Despliegue:** correr `seed:admin` justo después del deploy; las sesiones previas a M8.5 mueren (sin `sid`).
- `next build` local necesita `NEXT_PUBLIC_API_URL` exportada (no la lee de `.env.development.local`); preexistente, no es de M8.5.
