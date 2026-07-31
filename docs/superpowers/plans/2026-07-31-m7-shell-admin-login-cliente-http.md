# M7 · Shell `(admin)` + Login con 2FA + cliente HTTP — Implementation Plan

> **Al aprobar:** copiar este archivo a `docs/superpowers/plans/2026-07-31-m7-shell-admin-login-cliente-http.md` (convención del repo) antes de empezar. Ejecutar con `executing-plans` o `subagent-driven-development`, tarea por tarea.

**Goal:** dejar el panel autenticado y navegable. Al cerrar M7: `/login` autentica contra el API real (con y sin segundo factor), el route group `(admin)` está protegido server-side contra `GET /auth/me`, y el shell (Sidebar + TopBar + Breadcrumbs + CommandPalette) envuelve el contenido, de modo que M8 escriba la pantalla de Resumen sin tocar layout, guard ni cliente HTTP.

**Rama:** `feat/m7-shell-admin-login-cliente-http`

---

## Context

M6 está mergeado en `main` (`3198e1c`). `apps/web` tiene UI kit, tokens, tests y una sola ruta (`/kit`); **cero `fetch()` en todo `src/`**, sin route groups, sin `middleware.ts`, y `/` da 404. Nadie puede entrar al panel porque no hay panel: hoy la tienda solo se opera con `curl`.

M7 es el primer código del repo que habla con el API desde el navegador, y por eso arrastra el contrato de seguridad que el Bloque 1 ya endureció:

- La cookie `gira_session` es `httpOnly` + `sameSite: "strict"` ([token.ts](apps/api/src/utils/token.ts#L48-L63)). El navegador nunca la lee — por eso el guard es un fetch a `/auth/me`, no un `document.cookie`.
- `verifyOrigin` solo protege métodos mutantes y **deja pasar** peticiones sin `Origin` ni `Referer`, que son justamente las del servidor ([verifyOrigin.ts](apps/api/src/middlewares/verifyOrigin.ts)). De ahí la regla vinculante del spec §6: **toda mutación sale del navegador**. En este plan eso se blinda con tipos, no con disciplina.
- El `errorHandler` responde `{status, message}` **sin código de error tipado**. La única forma de distinguir "falta el segundo factor" de "contraseña incorrecta" es comparar un string literal.

**Por qué funciona en dev pese a `sameSite: "strict"`** (parece un bug y no lo es, conviene dejarlo escrito): `localhost:3000` y `localhost:4000` son *same-site* — SameSite mira el sitio registrable, no el puerto — así que el `Set-Cookie` del login se guarda y se reenvía. CORS ya trae `credentials: true` y `http://localhost:3000` en `allowedOrigins`. En producción la única condición es que API y panel compartan dominio registrable.

**Resultado esperado:** `pnpm dev` + API arriba → login con y sin 2FA, shell navegable en los tres breakpoints, ⌘K funcionando, logout de vuelta a `/login`, y `pnpm -r build/typecheck/lint/test` en verde.

---

## Decisiones cerradas en esta sesión (vinculantes)

| Decisión | Elección | Por qué |
|---|---|---|
| **Constante del 2FA y DTOs de auth** | Van a `packages/shared` (`labels/authMessages.ts` + `types/auth.ts`), y **`apps/api/src/services/authService.ts` pasa a importar la constante** en vez de repetir el string. | *(Decidido por Manuel.)* La UI depende de un literal exacto para saber que debe pedir el código. Duplicado en dos apps, el día que alguien corrija una tilde en el API el login del panel deja de detectar el 2FA **sin que falle ni un test**. Una sola fuente y el acoplamiento se vuelve explícito. El string no cambia, así que los tests del API siguen pasando. |
| **Login: un formulario, campo revelado** | Correo + contraseña; al recibir el 401 de 2FA aparece el campo de código con foco automático y el siguiente envío manda los tres datos. | *(Decidido por Manuel.)* El API es de **un solo paso** (`POST /auth/login {email,password,code?}`): dos pantallas obligarían a retener la contraseña en memoria del cliente entre pasos sin ganar nada. El admin sin 2FA nunca ve el campo. |
| **URLs en español** | `/resumen`, `/pedidos`, `/envios`, `/inventario`, `/productos`, `/estampas`, `/familias`, `/categorias`, `/clientes`, `/auditoria`, `/ajustes`. Identificadores, claves y nombres de archivo, en inglés. | *(Decidido por Manuel.)* La URL la lee el usuario → regla de bilingüismo. SEO no interviene: el panel es `noindex` y va detrás del login. Las rutas del API (`/admin/orders`) son otra cosa y no cambian. |
| **Secciones aún no construidas** | Se listan en el registro de navegación con `available: false`: en el Sidebar salen como `<span aria-disabled="true">` con la etiqueta «Pronto»; en el palette, deshabilitadas y las flechas las saltan. **No se enlazan.** | *(Decidido por Manuel.)* Ocultarlas deja un sidebar de un ítem que no comunica nada del producto; enlazarlas produce 404s. En M8–M12 se cambia un booleano. |
| **Cero dependencias nuevas** | Ni MSW, ni SWR, ni `server-only`, ni librería de formularios. Se añade **un** hook (`useFocusTrap`) y **cero** componentes al UI kit. | *(Decidido por Manuel.)* Consistente con M6 (UI kit a mano, `cn.ts` sin `clsx`). Todo el tráfico pasa por **un** módulo, así que no hay superficie que justifique un router de peticiones; y lo que hay que verificar es precisamente lo que MSW abstrae: que la llamada lleve `credentials: "include"` y `cache: "no-store"`. |
| **Sin página placeholder dentro de `(admin)`** | M7 no crea `resumen/page.tsx`. En su lugar **`/kit` se muda a `(admin)/kit/`**: el shell envuelve una superficie que ya existe, ya es dev-only y ya está agendada para borrarse en M12. | *(Decidido por Manuel: nada de stubs.)* Pero un shell que nunca renderiza no se puede verificar, y M6 ya cerró con el recorrido visual pendiente. Mudar `/kit` da el recorrido completo (drawer, breadcrumbs, ⌘K, tres breakpoints) **sin crear un solo archivo desechable**, y de paso deja la ruta de desarrollo detrás del login en vez de abierta. Ver «Hueco conocido» abajo. |
| **Dónde vive el guard** | `src/app/(admin)/layout.tsx`, Server Component `async`. **No se crea `middleware.ts`.** | Tres razones en orden de peso: (1) el guard necesita el **rol** para separar 401 de 403, y el layout necesita el usuario igual para el pie del sidebar — con middleware serían dos round-trips para una decisión; (2) middleware corre en runtime edge, alcanzar `localhost:4000` desde ahí es frágil y el fetch se pagaría en **cada** request, incluidos payloads RSC; (3) middleware solo redirige o reescribe, **no puede renderizar** la pantalla de «sin permiso», que es exactamente lo que pide el caso 403. El spec §6 ya dice "server-side contra `/auth/me`". |
| **401 vs 403 vs API caído** | `loadSession()` devuelve una unión de tres casos: `anonymous` → `redirect("/login")`; `authenticated` con rol ≠ ADMIN → renderiza `<ForbiddenScreen/>` **sin redirigir**; `unavailable` (red caída, timeout, 5xx) → `<SessionUnavailableScreen/>`. | Mandar a `/login` a un `customer` autenticado produce un bucle percibido: entra y vuelve a salir. Mandar a `/login` con el API caído muestra un formulario que tampoco puede funcionar: es mentir sobre la causa. |
| **Sin `?next=`** | El guard redirige siempre a `/login` pelado. | Un layout de Next 15 no tiene acceso al pathname sin un middleware que inyecte un header. Recuperar el deep-link costaría exactamente el `middleware.ts` que la decisión anterior descarta. |
| **Separación navegador/servidor por tipos** | `browserRequest` fuerza `credentials: "include"` y lanza si `typeof window === "undefined"`. `serverRequest` tipa `Omit<RequestOptions, "method" \| "body">`, fuerza `cache: "no-store"` y reenvía la cookie con `cookies()`. | La regla "las mutaciones nunca salen del servidor" pasa de comentario a error de compilación: `serverRequest("/auth/logout", { method: "POST" })` **no compila**. |
| **Sin el paquete `server-only`** | El aislamiento lo dan `next/headers` (Next falla en build si un Client Component lo importa) y el tipo GET-only. | `server-only` resuelve a un módulo que **lanza** salvo bajo la condición `react-server`, que no existe en Vitest: rompería todo test de `server.ts` a cambio de una garantía que ya está cubierta. |
| **Tipo de error del cliente** | `class ApiError extends Error` con `status: number` y `kind: "http" \| "network" \| "timeout" \| "parse"`. | El API no tipa errores, así que el tipado lo pone el cliente. `kind` es lo que permite decir «revisa tu conexión» en vez de «error 0», y que el guard distinga «no autenticado» de «no se pudo verificar». |
| **`Wire<T>` lo aplica el núcleo** | `request<T>()` devuelve `Wire<T>`; el call site escribe el DTO de dominio. | Si se aplicara en cada call site, el primero que lo olvide se lleva un `createdAt.toLocaleDateString()` que revienta en runtime. En M7 es no-op (`PublicUser` no tiene `Date`) — y ese es el momento correcto de montarlo: cuando no puede romper nada. |
| **Desempaquetado de `data`** | El núcleo devuelve `{message, data, meta}` crudos; cada módulo de endpoint declara la forma (`request<{user: PublicUser}>` → `.user`) y pasa por `expectData()`. **El helper de listados no se escribe en M7.** | Las tres formas del API (plural con `meta`, singular, plano) no comparten mecanismo, solo convención; un genérico que cubra las tres es un `keyof` acrobático que oscurece el tipo. `unwrapList` llega en M8, con su primer consumidor real. |
| **Timeout** | `AbortController` + `setTimeout` manuales (10 s), con la señal del caller encadenada y un flag para distinguir timeout de abort. **No** `AbortSignal.timeout` ni `AbortSignal.any`. | Ambas estáticas dependen de qué implementación de `AbortSignal` gana en jsdom, y son justo lo que hay que testear con timers falsos. Un controller a mano es determinista en browser, Node y jsdom. |
| **Máquina del login** | Reducer **puro** en `src/lib/auth/loginMachine.ts` (`{phase, pending, error}`), consumido por `LoginForm.tsx` con `useReducer`. | Las 8 transiciones se testean como tabla, sin DOM y sin `fetch`. El componente solo traduce eventos a JSX: capas separadas y test de comportamiento corto. |
| **Breadcrumbs derivados, no declarados** | `breadcrumbsFor(pathname)` puro, contra el registro de navegación. | Declararlos por página exige un contexto o una prop repetida en 11 pantallas para producir, en el 90% de los casos, lo que el pathname ya dice. Para segmentos desconocidos (ids de detalle) el fallback es el segmento crudo; el override del último crumb se difiere a **M9**, que es cuando existe la primera pantalla de detalle que lo necesita. |
| **Sidebar es Client Component completo** | Todo el `<aside>` lleva `"use client"`; el usuario entra como prop serializable desde el layout. | En móvil el `<aside>` es un drawer: su `transform` depende de estado, y cada ítem necesita `usePathname` para `aria-current`. Partirlo en un RSC que pasa `children` a un wrapper cliente añade indirección para ahorrar ~1 KB de un array estático. |
| **Sin saludo ni fecha en el TopBar** | TopBar = hamburguesa + disparador del palette + usuario. El «Buenas tardes, Manuel · miércoles 29…» del mockup se va al `PageHeader` de Resumen (M8). | Una fecha renderizada en el shell es un hydration mismatch garantizado (zona horaria servidor ≠ cliente) en **todas** las pantallas. En M8 la renderiza el servidor una vez, dentro de la página que sí trata de «hoy». |
| **CommandPalette: alcance mínimo real** | ⌘K/Ctrl+K, filtro sobre label + keywords (insensible a acentos), ↑/↓/Enter/Escape, foco atrapado y devuelto al disparador, `createPortal` a `body`, cargado con `next/dynamic({ssr:false})`. Solo navega entre secciones. | Buscar pedidos o productos requiere endpoints y debounce, y no hay pantallas de datos en M7. El portal **no es opcional**: sidebar y topbar `sticky` crean contextos de apilamiento que atraparían el diálogo por debajo del scrim aunque el `z-index` sea mayor. |
| **`Toast` sigue diferido a M9** | Pese a la nota de M6 («cuando exista la primera mutación, M7+»). | Revisado consumidor por consumidor: el login exitoso **navega** (un toast se pierde en la navegación), el error de login debe ser **inline** junto al formulario (a11y: asociado al campo, no flotando en una esquina), y el logout también navega. M7 no tiene una sola mutación que permanezca en la pantalla donde ocurrió. La primera es el cambio de estado de un pedido: M9. |
| **Cero componentes nuevos en `components/ui/`** | M7 aporta `src/hooks/useFocusTrap.ts` y nada más al kit. El palette es dueño de su propio `role="dialog"`. | Un `Modal` genérico con un solo consumidor es especulación. Lo reutilizable de verdad es el focus trap, que compartirán el palette (M7) y el `SlideOver` (M9). |
| **Nuevo en `tokens.css`** | Escala `--z-*` (6 niveles) + `--color-scrim`. | El scrim del mockup es `oklch(24% 0.02 var(--brand-hue) / 0.4)`: un literal de color que **haría fallar `designTokens.test.ts`** si se escribiera en el componente. Tiene que ser token. |
| **Env var en los tests** | `test.env` en `vitest.config.ts`: `NEXT_PUBLIC_API_URL=http://api.test/api/v1`. | [config.ts](apps/web/src/lib/config.ts) **lanza en tiempo de import**; `test.env` se aplica antes de que se evalúe cualquier módulo, cosa que un `vi.stubEnv` dentro de un test (con los imports ya hoisteados) no garantiza. |
| **`next/navigation` mockeado por archivo** | Factory compartida en `tests/helpers/nextNavigation.ts`, invocada desde el `vi.mock` de cada archivo. **Nunca en `setup.ts`.** El `redirect` mockeado **lanza un centinela**, igual que el real. | Un mock global volvería `redirect()` inofensivo en **todos** los tests, incluido el del guard, que es el único que debe verlo actuar. Y si el mock no lanza, el código posterior al redirect sigue corriendo y el test aprueba un guard que no protege nada. Es el fallo más caro de este milestone. |

---

## Hueco conocido: el destino post-login

Manuel decidió que M7 **no** crea una página placeholder. Consecuencia, explícita para que nadie la descubra ejecutando:

- La navegación declara Resumen en `/resumen` con `available: true`, y ese es el destino tras el login y el objetivo del `redirect` de `/`.
- **`/resumen` no existe hasta M8.** Entre el cierre de M7 y el arranque de M8, iniciar sesión aterriza en un 404 dentro del shell.
- El recorrido manual del milestone se hace sobre **`/kit`**, que sí vive dentro de `(admin)` y ejercita el shell completo con contenido real.
- **Primera tarea de M8:** crear `src/app/(admin)/resumen/page.tsx`. Anotarlo al abrir ese plan.

Si al revisar prefieres cerrar el hueco, es un archivo de diez líneas y esta sección desaparece.

---

## Estructura de archivos

### Nuevos en `packages/shared`

| Archivo | Responsabilidad |
|---|---|
| `src/labels/authMessages.ts` | `TWO_FACTOR_REQUIRED_MESSAGE` y los demás mensajes de auth que la UI necesita comparar. |
| `src/types/auth.ts` | `LoginRequest`, `LoginResponse`, `MeResponse`, `ApiErrorBody`. |

### Nuevos en `apps/web`

| Archivo | Responsabilidad |
|---|---|
| `src/lib/api/ApiError.ts` | `ApiError` (`status`, `kind`) + `isApiError`. |
| `src/lib/api/messages.ts` | Mensajes en español de red / timeout / parse. |
| `src/lib/api/request.ts` | Núcleo: URL, JSON, envelope, `Wire<T>`, timeout, mapeo a `ApiError`, `expectData`. |
| `src/lib/api/browser.ts` | `browserRequest` — `credentials: "include"`, prohibido en servidor. |
| `src/lib/api/server.ts` | `serverRequest` — GET-only, `cache: "no-store"`, reenvío de `gira_session`. |
| `src/lib/api/auth.ts` | `login()`, `logout()` (tolera 401). Navegador. |
| `src/lib/api/session.ts` | `loadSession()` → `authenticated \| anonymous \| unavailable`. Servidor. |
| `src/lib/auth/loginMachine.ts` | Reducer puro del formulario. |
| `src/lib/navigation.ts` | `NAV_GROUPS` (registro único) + `NAV_ITEMS` plano. |
| `src/lib/breadcrumbs.ts` | `breadcrumbsFor(pathname)` puro. |
| `src/hooks/useFocusTrap.ts` | Trap + restauración de foco. Lo reusa `SlideOver` en M9. |
| `src/app/(auth)/layout.tsx` | Contenedor centrado, `<main id="main-content">`. |
| `src/app/(auth)/login/page.tsx` | RSC: metadata, redirige si ya hay sesión admin, monta `LoginForm`. |
| `src/components/auth/LoginForm.tsx` | Cliente: reducer + campos + estados + a11y. |
| `src/app/(admin)/layout.tsx` | Guard + composición del shell. |
| `src/components/shell/AdminShell.tsx` | RSC: grid sidebar/main, `<main id="main-content">`. |
| `src/components/shell/MobileNavProvider.tsx` | Contexto `{open, openNav, closeNav}` + cierre al cambiar de ruta. |
| `src/components/shell/Sidebar.tsx` | Cliente: `<aside>` + drawer + scrim + grupos. |
| `src/components/shell/NavItem.tsx` | Cliente: un ítem, activo o deshabilitado. |
| `src/components/shell/SidebarFooter.tsx` | Chip de usuario + `LogoutButton`. |
| `src/components/shell/TopBar.tsx` | Cliente: hamburguesa + disparador ⌘K. |
| `src/components/shell/Breadcrumbs.tsx` | Cliente: `usePathname` → `breadcrumbsFor`. |
| `src/components/shell/LogoutButton.tsx` | Cliente: mutación de logout. |
| `src/components/shell/CommandPaletteMount.tsx` | Cliente: atajo global + `next/dynamic`. |
| `src/components/shell/CommandPalette.tsx` | Cliente: diálogo, filtro, teclado, portal. |
| `src/components/shell/ForbiddenScreen.tsx` | RSC: 403 (no es login). |
| `src/components/shell/SessionUnavailableScreen.tsx` | RSC: API inalcanzable. |
| `tests/helpers/fetchMock.ts` | `stubFetch`, `jsonResponse`, `networkFailure`. |
| `tests/helpers/nextNavigation.ts` | Factory del mock + `RedirectSentinel`. |

### Existentes a modificar

| Archivo | Cambio |
|---|---|
| `packages/shared/src/index.ts` | Exportar lo nuevo de auth. |
| `apps/api/src/services/authService.ts` | Importar `TWO_FACTOR_REQUIRED_MESSAGE` de `@gira/shared` en vez del literal. **Único cambio en `apps/api`.** |
| `apps/web/src/styles/tokens.css` | + bloque `--z-*` y `--color-scrim`. |
| `apps/web/src/app/layout.tsx` | Quitar el `<div id="main-content">`; `focus:z-50` → `focus:z-[var(--z-skip-link)]`. |
| `apps/web/src/app/kit/` | **Mover** a `src/app/(admin)/kit/` y envolver su contenido en `<main id="main-content">`. |
| `apps/web/vitest.config.ts` | + `test.env`. |

---

## Fuera de alcance (no-negociable #5)

- **Cualquier pantalla de datos.** Resumen es M8: sin KPIs, sin gráfica, sin tablas, sin polling.
- **Campana de notificaciones.** Depende de `/admin/notifications/health` y del patrón de polling → M8.
- **`Toast`, `Toggle`, `SlideOver`, `Modal` genérico, `unwrapList`.** Cada uno entra con su primer consumidor real.
- **Gestión del 2FA** (`/auth/2fa/setup|enable|disable`, QR de emparejamiento). M7 solo **consume** el segundo factor al iniciar sesión; activarlo y desactivarlo es pantalla de Ajustes → **M12**.
- **`middleware.ts`**, deep-link `?next=`, recuperación de contraseña, registro de admins.
- **Búsqueda de entidades en el CommandPalette.** Solo navegación entre secciones.
- **Sin modo oscuro, sin i18n.** No se borra `mockups/`.

---

## Tarea 0: Rama de trabajo

- [ ] **Paso 1:** verificar estado limpio y que M6 quedó mergeado

```bash
git status --short && git branch --show-current
git log --oneline -1 3198e1c   # merge de M6 en main
```

Expected: status vacío, rama `main`. La rama `feat/m6-…` ya fue borrada tras su merge, por eso aquí se verifica el commit y no la rama.

- [ ] **Paso 2:** pedir aprobación a Manuel y crear la rama

```bash
git checkout -b feat/m7-shell-admin-login-cliente-http
```

> **Regla de ramas:** ninguna rama de milestone se borra sin que `git merge-base --is-ancestor <rama> main` haya salido en verde antes. Ninguna tarea ejecuta `git add`/`commit`/`push` sin mostrar `git status` + `git diff` y recibir aprobación explícita.

---

## Tarea 1: Contrato de auth en `packages/shared`

**Depends on:** 0. **Files:** create `packages/shared/src/labels/authMessages.ts`, `packages/shared/src/types/auth.ts`; modify `packages/shared/src/index.ts`, `apps/api/src/services/authService.ts`

Va primero porque el cliente HTTP y el reducer del login dependen de la constante.

- [ ] **Paso 1:** `labels/authMessages.ts` — el literal, con el porqué escrito

```ts
/**
 * The API has no typed error codes: `errorHandler` answers `{status, message}`
 * and nothing else. The admin panel therefore has to recognise "the second
 * factor is missing" by comparing this exact string — so it lives here, imported
 * by both apps, instead of being typed twice. Changing the wording is a
 * cross-app change by construction.
 */
const TWO_FACTOR_REQUIRED_MESSAGE = "Se requiere el código de verificación de dos factores.";
const TWO_FACTOR_INVALID_MESSAGE = "El código de verificación es incorrecto.";
const INVALID_CREDENTIALS_MESSAGE = "Correo o contraseña incorrectos.";

export { TWO_FACTOR_REQUIRED_MESSAGE, TWO_FACTOR_INVALID_MESSAGE, INVALID_CREDENTIALS_MESSAGE };
```

- [ ] **Paso 2:** `types/auth.ts` — `LoginRequest {email, password, code?}`, `LoginResponse {user: PublicUser}`, `MeResponse {user: PublicUser}`, y `ApiErrorBody {status: ApiStatus; message: string}` (lo que `errorHandler` realmente escribe: **sin `data`, sin `meta`**).
- [ ] **Paso 3:** exportar todo desde `src/index.ts`, siguiendo el patrón de import/export separados que ya usa el barrel.
- [ ] **Paso 4:** en `apps/api/src/services/authService.ts`, sustituir los tres literales por los imports. `GENERIC_LOGIN_ERROR` pasa a ser `INVALID_CREDENTIALS_MESSAGE`.
- [ ] **Paso 5:** rebuild y suite del API

```bash
pnpm --filter @gira/shared build
pnpm --filter @gira/api test
```

Expected: los tests del API siguen verdes **sin tocarlos** — los strings son idénticos. Si alguno falla, es una diferencia de texto y hay que corregir la constante, nunca el test.

> `@gira/shared` se debe rebuildear tras cualquier cambio de tipos o `apps/web` sigue viendo el `dist` anterior.

---

## Tarea 2: Tokens de capa + saneado del skip link

**Depends on:** 0. **Files:** modify `apps/web/src/styles/tokens.css`, `src/app/layout.tsx`, `vitest.config.ts`; move `src/app/kit/` → `src/app/(admin)/kit/`

El shell entero y el palette dependen de la escala de apilamiento, y `test.env` tiene que existir antes de que ningún test importe `lib/config.ts`.

- [ ] **Paso 1:** añadir al final de `tokens.css`, después del bloque `LAYOUT`:

```css
  /* ── SCRIM ── the only translucent surface in the project ───────────────── */
  /* Lives here because it is a colour literal: writing it in a component would
     fail tests/designTokens.test.ts, which is exactly the point. */
  --color-scrim: oklch(24% 0.02 var(--brand-hue) / 0.4);

  /* ── LAYERING ── one scale, six steps, no ad-hoc z-index anywhere else ──── */
  /* Tailwind v4 has no theme namespace for z-index, so components read these as
     `z-[var(--z-sidebar)]`. Gaps of 10 leave room without renumbering. */
  --z-topbar: 20;
  --z-scrim: 30;
  --z-sidebar: 40;
  --z-overlay: 50;
  --z-dialog: 60;
  --z-skip-link: 100;
```

- [ ] **Paso 2:** en `src/app/layout.tsx`, eliminar el `<div id="main-content">` (pasa a `{children}` pelado) y cambiar `focus:z-50` por `focus:z-[var(--z-skip-link)]`. El `id` lo pone ahora el `<main>` de cada route group.
- [ ] **Paso 3:** mover `src/app/kit/` a `src/app/(admin)/kit/` (con `git mv`, para conservar el historial) y envolver el contenido de `page.tsx` en `<main id="main-content">`. La URL sigue siendo `/kit` — los route groups no aparecen en la ruta — y el `notFound()` en producción se conserva tal cual.
- [ ] **Paso 4:** en `vitest.config.ts`, dentro de `test`:

```ts
    // lib/config.ts throws at import time when this is missing; setting it here
    // runs before any module is evaluated, unlike vi.stubEnv inside a test.
    env: { NEXT_PUBLIC_API_URL: "http://api.test/api/v1" },
```

**Verificación:**

```bash
pnpm --filter @gira/web test tests/designTokens.test.ts
pnpm --filter @gira/web typecheck && pnpm lint
```

Expected: la guardia de tokens sigue verde (el scrim está en el archivo exento), typecheck y lint limpios.

---

## Tarea 3: Núcleo del cliente HTTP (TDD)

**Depends on:** 2. **Files:** create `src/lib/api/{ApiError.ts,messages.ts,request.ts}`, `tests/helpers/fetchMock.ts`, `tests/lib/request.test.ts`

- [ ] **Paso 1:** `tests/helpers/fetchMock.ts`. Nada de `new Response()` — su disponibilidad depende del entorno jsdom; se devuelve un objeto mínimo casteado:

```ts
const jsonResponse = (status: number, body: unknown) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;
```

Más `stubFetch()` (instala `vi.fn()` en `globalThis.fetch` y restaura en `afterEach`) y `networkFailure()` (rechaza con `new TypeError("Failed to fetch")`, que es lo que lanza `fetch` de verdad sin red).

- [ ] **Paso 2:** escribir `tests/lib/request.test.ts` **antes** de la implementación:

| Caso | Aserción |
|---|---|
| URL | `request("/auth/me")` llama a `http://api.test/api/v1/auth/me` — sin `//` doble, sin `/api/v1` repetido |
| body JSON | `POST` con body → `content-type: application/json` y `JSON.stringify` |
| envelope éxito | 200 `{status:"success",message:"ok",data:{user:{…}}}` → `{message, data, meta: undefined}` |
| `meta` | listado con `meta` → se propaga tal cual |
| sin `data` | 200 sin `data` (caso logout) → `data === undefined`, **no lanza** |
| error 4xx | 401 `{status:"fail",message:"…"}` → `ApiError` con `status:401`, `kind:"http"` y ese `message` |
| error sin JSON | 500 con `json()` que rechaza → `kind:"parse"`, mensaje genérico en español |
| red caída | `fetch` rechaza `TypeError` → `kind:"network"` |
| timeout | timers falsos, `fetch` que nunca resuelve → `kind:"timeout"` a los 10 s |
| abort del caller | señal externa abortada → `kind:"network"`, **no** `"timeout"` |
| `expectData` | resultado sin `data` → `ApiError` `kind:"parse"` |

- [ ] **Paso 3:** implementar. Firmas exactas:

```ts
// ApiError.ts
type ApiErrorKind = "http" | "network" | "timeout" | "parse";
class ApiError extends Error {
  readonly status: number;   // 0 when there was no HTTP response at all
  readonly kind: ApiErrorKind;
}
const isApiError = (value: unknown): value is ApiError => value instanceof ApiError;

// request.ts
interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  headers?: Readonly<Record<string, string>>;
  signal?: AbortSignal;
  timeoutMs?: number;
  credentials?: RequestCredentials;
  cache?: RequestCache;
}
interface ApiResult<T> {
  message: string;
  data: Wire<T> | undefined;
  meta: ApiMeta | undefined;
}
const request = async <T>(path: string, options?: RequestOptions): Promise<ApiResult<T>>;
const expectData = <T>(result: ApiResult<T>): Wire<T>;
```

Lo que el test fija y la implementación debe respetar:
- Timeout con `AbortController` propio + `setTimeout`, `clearTimeout` en `finally`, flag `timedOut` para distinguirlo del abort del caller, y la señal del caller encadenada con `addEventListener("abort", …)`.
- El envelope de error se lee con el mismo `res.json()`; si falla, `kind: "parse"`.
- **`Wire<T>` lo aplica esta función**, no el call site.
- `exactOptionalPropertyTypes`: las opciones ausentes se **omiten**, nunca se pasan como `undefined`.

**Verificación:** `pnpm --filter @gira/web test tests/lib/request.test.ts && pnpm --filter @gira/web typecheck`

---

## Tarea 4: Fachadas navegador/servidor + módulos de auth (TDD)

**Depends on:** 3. **Files:** create `src/lib/api/{browser.ts,server.ts,auth.ts,session.ts}`, `tests/lib/{browser.test.ts,server.test.ts,session.test.ts}`

- [ ] **Paso 1:** tests primero.
  - `browser.test.ts`: toda llamada lleva `credentials: "include"`; `login()` con `code` lo incluye en el body y sin `code` **omite la clave** (el Joi del API tolera ausencia, no basura); `logout()` traga un 401 y resuelve; `logout()` propaga un 500.
  - `server.test.ts`: con `vi.mock("next/headers")` devolviendo `gira_session=abc`, la llamada lleva `headers.cookie === "gira_session=abc"` y `cache: "no-store"`; sin cookie, **no** se manda el header.
  - `session.test.ts` (tabla): sin cookie → `anonymous` **sin llamar a fetch**; 401 → `anonymous`; 200 con `role:"admin"` → `authenticated`; `kind:"network"` → `unavailable`; 500 → `unavailable`.

- [ ] **Paso 2:** implementar.

```ts
// browser.ts
const browserRequest = async <T>(path: string, options?: RequestOptions): Promise<ApiResult<T>> => {
  // Spec §6: every mutation must carry a browser Origin so verifyOrigin can
  // check it. Calling this from a Server Component would silently bypass the
  // CSRF defence, so it fails loudly instead.
  if (typeof window === "undefined") {
    throw new Error("browserRequest solo puede usarse en el navegador.");
  }
  return request<T>(path, { ...options, credentials: "include" });
};

// server.ts — must match COOKIE_NAME in apps/api/src/config/env.ts
const SESSION_COOKIE_NAME = "gira_session";
type ServerRequestOptions = Omit<RequestOptions, "method" | "body" | "credentials" | "cache">;
const serverRequest = async <T>(path: string, options?: ServerRequestOptions): Promise<ApiResult<T>>;

// auth.ts (browser)
const login = (input: LoginRequest): Promise<Wire<PublicUser>>;
const logout = (): Promise<void>;

// session.ts (server)
type Session =
  | { kind: "authenticated"; user: Wire<PublicUser> }
  | { kind: "anonymous" }
  | { kind: "unavailable"; message: string };
const loadSession = (): Promise<Session>;
```

`SESSION_COOKIE_NAME` va como constante con comentario apuntando a `apps/api/src/config/env.ts`, no como variable de entorno: una env var que debe coincidir con otra app es el mismo acoplamiento con un modo de fallo más silencioso.

**Verificación:**

```bash
pnpm --filter @gira/web test tests/lib
pnpm --filter @gira/web typecheck
```

Comprobar **a mano una vez** que `serverRequest("/x", { method: "POST" })` no compila; luego borrar la línea.

---

## Tarea 5: Login con 2FA (TDD)

**Depends on:** 4. **Files:** create `src/lib/auth/loginMachine.ts`, `src/components/auth/LoginForm.tsx`, `src/app/(auth)/{layout.tsx,login/page.tsx}`, `tests/helpers/nextNavigation.ts`, `tests/lib/loginMachine.test.ts`, `tests/components/LoginForm.test.tsx`

- [ ] **Paso 1:** `tests/helpers/nextNavigation.ts` — el mock que **lanza** en `redirect`:

```ts
class RedirectSentinel extends Error {
  constructor(readonly url: string) { super(`redirect:${url}`); }
}
// redirect: (url) => { throw new RedirectSentinel(url); }   ← igual que el real
```

Más un `router` con `push`/`replace`/`refresh` espiados y `usePathname` configurable.

- [ ] **Paso 2:** tabla del reducer, escrita antes de implementarlo:

| Estado | Evento | Resultado |
|---|---|---|
| `credentials` | `submit` | `pending: true`, `error: null` |
| `credentials` pendiente | `failure` 401 = `TWO_FACTOR_REQUIRED_MESSAGE` | `phase: "twoFactor"`, `pending: false`, **`error: null`** (es un paso, no un fallo) |
| `credentials` pendiente | `failure` 401 = `INVALID_CREDENTIALS_MESSAGE` | sigue en `credentials`, `error` = mensaje |
| `twoFactor` pendiente | `failure` 401 = `TWO_FACTOR_INVALID_MESSAGE` | sigue en `twoFactor`, `error` = mensaje |
| `twoFactor` pendiente | `failure` 400 «…debe tener 6 dígitos.» | sigue en `twoFactor`, `error` = mensaje |
| cualquiera | `failure` 429 | `error` = mensaje del servidor, `pending: false` |
| cualquiera | `failure` `kind:"network"` | `error` = mensaje de red |
| pendiente | `success` | `pending: true` — se queda ocupado durante la navegación: mata el doble submit |

- [ ] **Paso 3:** `LoginForm.test.tsx` — comportamiento, con `fetch` stubeado:
  1. Éxito sin 2FA → el body va sin `code` y con `credentials: "include"`; después `router.replace("/resumen")` **y** `router.refresh()`.
  2. 401 con el mensaje 2FA → aparece el campo «Código de verificación», **recibe el foco**, y **no** hay `role="alert"` visible.
  3. Segundo envío → el body lleva `code` y conserva correo y contraseña.
  4. Código incorrecto → sigue el campo y `role="alert"` con el texto exacto del API.
  5. Credenciales malas → `role="alert"`, **sin** campo de código.
  6. 429 → se muestra el mensaje del servidor.
  7. Red caída → «No se pudo conectar con el servidor…», el botón vuelve a habilitarse.
  8. Doble clic durante `pending` → `fetch` llamado **una** vez.

- [ ] **Paso 4:** implementar `LoginForm.tsx` (`"use client"`).
  - `Field` para correo (`type="email"`, `autoComplete="email"`, `required`), contraseña (`type="password"`, `autoComplete="current-password"`), y en fase `twoFactor` el código con `inputMode="numeric"`, `autoComplete="one-time-code"`, `maxLength={6}`, `pattern="\\d{6}"` y **`autoFocus`**.
  - El foco del código se resuelve con `autoFocus`, no con un `ref`: el campo solo se monta al entrar en la fase, que es exactamente la semántica de `autoFocus` — y así **no hay que tocar `Field`** para que reenvíe refs.
  - Errores en `<Notice variant="danger">` (ya trae `role="alert"`). Además una región `aria-live="polite"` `sr-only` **siempre montada** que anuncia el cambio de fase: «Ingresa el código de verificación de tu app de autenticación.» Un `role="alert"` que aparece y desaparece no sirve para anunciar un **paso**; una live region estable sí.
  - Botón `<Button variant="primary" type="submit" loading={pending}>` — el `disabled` sale gratis de `loading`.
  - `exactOptionalPropertyTypes`: el body se arma como `phase === "twoFactor" ? {email, password, code} : {email, password}`, nunca con spread de opcionales.

- [ ] **Paso 5:** `(auth)/layout.tsx` (tarjeta centrada, `<main id="main-content">`) y `(auth)/login/page.tsx` (RSC): `metadata.title = "Iniciar sesión"`, llama a `loadSession()` y si es `authenticated` con rol admin hace `redirect("/resumen")` — no tiene sentido mostrarle el formulario a quien ya entró.

**Verificación:**

```bash
pnpm --filter @gira/web test tests/lib/loginMachine.test.ts tests/components/LoginForm.test.tsx
```

Recorrido manual con `apps/api` levantada: cuenta con TOTP activo → aparece el campo; código incorrecto → el mensaje se anuncia; toda la pantalla recorrible solo con teclado.

---

## Tarea 6: Route guard de `(admin)` (TDD)

**Depends on:** 4 (para el recorrido manual, también 5). **Files:** create `src/app/(admin)/layout.tsx`, `src/components/shell/{ForbiddenScreen.tsx,SessionUnavailableScreen.tsx}`, `tests/app/adminLayout.test.tsx`

- [ ] **Paso 1:** test primero. El layout es una función `async`: se invoca directamente, sin renderer de RSC.

```
anonymous   → await expect(AdminLayout(...)).rejects.toThrow(RedirectSentinel) con url "/login"
customer    → el árbol contiene ForbiddenScreen y NO se llamó a redirect
unavailable → el árbol contiene SessionUnavailableScreen
admin       → el árbol contiene AdminShell y no redirige
```

- [ ] **Paso 2:** implementar:

```tsx
const AdminLayout = async ({ children }: { children: ReactNode }) => {
  const session = await loadSession();
  if (session.kind === "unavailable") return <SessionUnavailableScreen message={session.message} />;
  if (session.kind === "anonymous") redirect("/login");
  if (session.user.role !== UserRole.ADMIN) return <ForbiddenScreen />;
  return <AdminShell user={session.user}>{children}</AdminShell>;
};
```

El orden importa y no es estético: **`unavailable` se evalúa antes que `anonymous`**, porque un API caído no es una sesión inválida y mandar a `/login` mentiría sobre la causa.

- [ ] **Paso 3:** `ForbiddenScreen` (RSC): `EmptyState` + «Tu cuenta no tiene acceso al panel.» + `LogoutButton` para salir y entrar con otra cuenta. `SessionUnavailableScreen` (RSC): `Notice variant="danger"` + «No pudimos verificar tu sesión. Recarga la página.» — sin botón de reintento, que sería un componente cliente más por un `location.reload()`.

**Verificación:**

```bash
pnpm --filter @gira/web test tests/app/adminLayout.test.tsx
```

Manual, con la API arriba: sin cookie → `/kit` redirige a `/login`; cookie de `customer` → pantalla «sin permiso», **no** login; API apagada → pantalla «no pudimos verificar», **no** login.

> Nota: el guard **no se re-ejecuta** en navegación cliente dentro del mismo segmento. Una sesión que expira a media sesión no redirige hasta el siguiente render de servidor; el backstop es el 401 que devuelve el propio API en la siguiente llamada. Un poller de sesión sería una feature no pedida.

---

## Tarea 7: Registro de navegación + Sidebar + drawer (TDD)

**Depends on:** 6. **Files:** create `src/lib/navigation.ts`, `src/components/shell/{AdminShell.tsx,MobileNavProvider.tsx,Sidebar.tsx,NavItem.tsx,SidebarFooter.tsx,LogoutButton.tsx}`, `tests/components/{Sidebar.test.tsx,LogoutButton.test.tsx}`

- [ ] **Paso 1:** `src/lib/navigation.ts` — la pieza de la que cuelgan tres consumidores (Sidebar, Breadcrumbs, CommandPalette):

```ts
interface NavItemConfig {
  key: string;                    // stable id, English
  label: string;                  // user-facing, Spanish
  href: string;
  icon: PhosphorIcon;
  keywords: readonly string[];    // palette search terms, Spanish
  available: boolean;             // false until its milestone lands
}
interface NavGroupConfig { key: string; label: string; items: readonly NavItemConfig[] }
const NAV_GROUPS: readonly NavGroupConfig[];
const NAV_ITEMS: readonly NavItemConfig[];   // flattened, for palette + breadcrumbs
```

Grupos, orden e iconos del mockup ([resumen-a.html](mockups/resumen-a.html#L23-L82)), importados desde `@phosphor-icons/react/dist/ssr`:

- **Operación** — Resumen `/resumen`, Pedidos `/pedidos`, Envíos `/envios`
- **Catálogo** — Productos `/productos`, Estampas `/estampas`, Familias `/familias`, Categorías `/categorias`
- **Inventario** — Variantes `/inventario`
- **Sistema** — Clientes `/clientes`, Ajustes `/ajustes`, Auditoría `/auditoria`

`available: true` **solo en Resumen** (destino del login; su página llega en M8 — ver «Hueco conocido»).

- [ ] **Paso 2:** tests de `Sidebar`: el ítem cuyo href coincide con `usePathname` lleva `aria-current="page"`; `/pedidos/abc` marca «Pedidos» (coincidencia por prefijo); los ítems `available: false` se renderizan **sin `<a>`**, con `aria-disabled="true"` y la etiqueta «Pronto»; la hamburguesa abre el drawer (`aria-expanded` cambia); scrim y Escape lo cierran; cambiar de pathname lo cierra.
- [ ] **Paso 3:** implementar. `MobileNavProvider` es un contexto cliente con un `useEffect` sobre `usePathname` para cerrar al navegar. `Sidebar` (`"use client"`): `<aside id="sidebar">` fijo con `-translate-x-full` → `translate-x-0`, `lg:sticky lg:translate-x-0`, `z-[var(--z-sidebar)]`, `transition-transform duration-[var(--duration-enter)] ease-[var(--ease-drawer)]` (ahí se estrena `--ease-drawer`), `bg-surface-raised border-r-2 border-ink`. Scrim: `lg:hidden fixed inset-0 z-[var(--z-scrim)] bg-scrim`.

> **El riel no lleva sombra dura ni radio.** Spec §4: el fondo de página y el sidebar quedan neutros y calmos; el neobrutalismo es de los componentes de dentro.

- [ ] **Paso 4:** `NavItem` — activo = `bg-brand-soft` + `border-l-2 border-brand` + `text-brand font-bold`, como el mockup. `SidebarFooter` — iniciales del nombre, nombre, «Administrador · 2FA activo/inactivo» derivado de `user.twoFactorEnabled`, y el `LogoutButton`.
- [ ] **Paso 5:** `LogoutButton` (`"use client"`): `await logout()` (traga el 401), luego `router.replace("/login")` + `router.refresh()`. Test: un 401 no muestra error y navega igual.
- [ ] **Paso 6:** `AdminShell` (RSC): grid `lg:grid-cols-[var(--sidebar-width)_1fr]`, columna derecha con TopBar → Breadcrumbs → `<main id="main-content" className="flex-1 p-4 lg:px-6">`.

**Verificación:**

```bash
pnpm --filter @gira/web test tests/components/Sidebar.test.tsx tests/components/LogoutButton.test.tsx
pnpm lint    # react-hooks: deps del efecto que cierra el drawer
```

Manual a 390 / 834 / 1440 sobre `/kit`: el drawer abre y cierra, el foco no se escapa detrás del scrim, el logout vuelve a `/login`.

---

## Tarea 8: TopBar + Breadcrumbs (TDD)

**Depends on:** 7. **Files:** create `src/lib/breadcrumbs.ts`, `src/components/shell/{TopBar.tsx,Breadcrumbs.tsx}`, `tests/lib/breadcrumbs.test.ts`, `tests/components/TopBar.test.tsx`

- [ ] **Paso 1:** tabla de `breadcrumbsFor` (función pura, sin React):

| pathname | resultado |
|---|---|
| `/resumen` | `[{label:"Panel", href:"/resumen"}, {label:"Resumen"}]` |
| `/pedidos` | `[Panel → /resumen, {label:"Pedidos"}]` |
| `/pedidos/68f2ab` | `[Panel, Pedidos → /pedidos, {label:"68f2ab"}]` |
| `/ruta-inventada` | `[Panel, {label:"ruta-inventada"}]` — no lanza |

El último crumb nunca lleva `href` y va con `aria-current="page"`. Con `exactOptionalPropertyTypes`, `href` se **omite**, no se pone `undefined`.

- [ ] **Paso 2:** `Breadcrumbs` (`"use client"`, `usePathname`): `<nav aria-label="Ruta">`, separadores `aria-hidden`, `text-xs text-text-muted` y el padding del mockup.
- [ ] **Paso 3:** `TopBar` (`"use client"`): `sticky top-0 z-[var(--z-topbar)] min-h-[var(--topbar-height)] bg-wallpaper border-b-2 border-ink`. A la izquierda la hamburguesa (`IconButton` `lg:hidden`, `aria-controls="sidebar"`, `aria-expanded`); a la derecha el disparador del palette con `<kbd>⌘K</kbd>` (cinco líneas inline, no un componente de kit). Test: el click en el disparador produce el mismo efecto que ⌘K.

**Verificación:** `pnpm --filter @gira/web test tests/lib/breadcrumbs.test.ts tests/components/TopBar.test.tsx`

---

## Tarea 9: `useFocusTrap` + CommandPalette (TDD)

**Depends on:** 8. **Files:** create `src/hooks/useFocusTrap.ts`, `src/components/shell/{CommandPaletteMount.tsx,CommandPalette.tsx}`, `tests/hooks/useFocusTrap.test.tsx`, `tests/components/CommandPalette.test.tsx`

- [ ] **Paso 1:** `useFocusTrap(active: boolean): RefObject<HTMLElement | null>` — al activarse guarda `document.activeElement` y enfoca el primer focusable del contenedor; cicla con Tab/Shift+Tab; al desactivarse **devuelve el foco al disparador**. Escape **no** lo maneja el hook: cada consumidor tiene su semántica. Tests: ciclo hacia delante, ciclo hacia atrás, restauración del foco, y `active: false` como no-op. Lo reusará el `SlideOver` de M9.
- [ ] **Paso 2:** `CommandPalette.test.tsx`:
  - ⌘K y Ctrl+K abren; Escape cierra y el foco vuelve al disparador.
  - Escribir «ped» filtra a «Pedidos»; con y sin acento da lo mismo (normalización NFD).
  - ↓/↑ mueven `aria-activedescendant` y **saltan** los ítems `available: false`.
  - Enter sobre un ítem disponible → `router.push(href)` y cierra.
  - Sin coincidencias → mensaje «Sin resultados», sin opciones.
- [ ] **Paso 3:** implementar. `CommandPaletteMount` (`"use client"`) tiene el listener global y hace la carga diferida:

```tsx
const CommandPaletteDialog = dynamic(
  () => import("./CommandPalette").then((m) => m.CommandPalette),
  { ssr: false },
);
```

`ssr: false` **solo es válido dentro de un Client Component** en Next 15 — por eso el mount existe y el layout no importa el diálogo directamente.

`CommandPalette` renderiza con `createPortal(…, document.body)` para escapar de los contextos de apilamiento que crean sidebar y topbar; scrim en `z-[var(--z-overlay)]`, diálogo en `z-[var(--z-dialog)]`. Patrón ARIA combobox + listbox: input `role="combobox"` con `aria-expanded`/`aria-controls`/`aria-activedescendant`, lista `role="listbox"`, ítems `role="option"` con `aria-selected` (y `aria-disabled` los no disponibles). Contenedor `role="dialog" aria-modal="true" aria-labelledby`.

**Verificación:**

```bash
pnpm --filter @gira/web test tests/hooks tests/components/CommandPalette.test.tsx
pnpm lint
```

Manual: ⌘K con el drawer abierto, con el foco dentro de un input, y solo con teclado.

---

## Tarea 10: Verificación de cierre (los 7 puntos del spec §8)

**Depends on:** todas.

- [ ] **Paso 1:** suite completa

```bash
pnpm -r build && pnpm typecheck && pnpm lint && pnpm -r test && pnpm audit --prod --audit-level=high
```

Expected: todo limpio. **Sobre `pnpm -r test`:** hay un flake conocido en `apps/api` bajo suite completa (`orderRoutes.test.ts > sin Origin responde 403`, contención de CPU) que aborta el recorrido antes de llegar a `apps/web`. Si aparece, revalidar `@gira/api` en aislamiento y correr `@gira/web` por separado; documentar, no reportarlo como regresión de M7. **Ojo:** M7 sí toca `authService.ts`, así que un fallo en tests de auth **no** es el flake — es una regresión de la Tarea 1.

- [ ] **Paso 2:** guardias específicas de este milestone

```bash
pnpm --filter @gira/web test tests/designTokens.test.ts     # ningún color nuevo fuera de tokens.css
grep -rn "z-\[[0-9]\|z-50\|z-40" apps/web/src || echo "sin z-index ad-hoc ✓"
grep -rn "credentials" apps/web/src/lib/api                 # solo en browser.ts
grep -rn "Se requiere el código" apps/web/src apps/api/src  # cero literales: solo la constante
```

- [ ] **Paso 3:** recorrido manual end-to-end con `apps/api` levantada: login sin 2FA · login con 2FA (mensaje exacto → campo → código correcto) · código incorrecto · API apagada durante el login · `/kit` con cookie de `customer` → pantalla sin permiso · logout → `/login` · entrada directa a `/kit` sin cookie → `/login`.
- [ ] **Paso 4:** sobre `/kit` (dentro del shell): tres breakpoints **390 / 834 / 1440** sin scroll horizontal del body · pasada **solo con teclado** con el foco siempre visible y fuera de la sombra dura · `prefers-reduced-motion: reduce` sin transición del drawer · ⌘K abre, atrapa el foco y lo devuelve.
- [ ] **Paso 5:** checklist de seguridad del milestone
  - Cero `Authorization: Bearer` en todo `apps/web`.
  - Cero mutaciones desde Server Components o Server Actions (`serverRequest` es GET-only por tipo).
  - Cero `dangerouslySetInnerHTML`; ninguna contraseña ni código en `console.log`.
  - `/kit` sigue devolviendo 404 con `NODE_ENV=production` (`pnpm --filter @gira/web build && start`), **y ahora además queda detrás del guard**.
  - Ninguna variable `NEXT_PUBLIC_*` nueva.
- [ ] **Paso 6:** escribir la sección **«Pendientes conocidos (post-review)»** al final del plan copiado en `docs/superpowers/plans/`, incluyendo el estado del hueco de `/resumen`.
- [ ] **Paso 7:** mostrar `git status` + `git diff` completo y **esperar aprobación explícita de Manuel** antes de cualquier `git add`/`commit`. **Este plan no hace commit por su cuenta.**

---

## Verificación end-to-end (resumen)

| Qué | Comando / evidencia |
|---|---|
| Tipos | `pnpm typecheck` (shared + api + web) |
| Build | `pnpm -r build` |
| Lint | `pnpm lint` |
| Tests | `pnpm -r test` — API intacto tras el cambio de `authService`, web con ~11 suites nuevas |
| Dependencias | `pnpm audit --prod --audit-level=high` — M7 **no agrega ninguna** |
| Un solo lugar para color | `tests/designTokens.test.ts` en verde con `--color-scrim` |
| Mutaciones solo del navegador | `serverRequest` con `method` no compila; `credentials` solo aparece en `browser.ts` |
| Mensaje 2FA sin duplicar | `grep` no encuentra el literal fuera de `packages/shared` |
| Guard | Tests de las cuatro ramas + recorrido manual de las tres cookies |
| A11y | Teclado completo en login y shell; live region del cambio de fase; foco atrapado y devuelto en el palette |
| Responsive | 390 / 834 / 1440 sobre `/kit` sin scroll horizontal del body |

---

## Gotchas a recordar durante la ejecución

1. **`lib/config.ts` lanza al importarse.** Cualquier test que toque el cliente HTTP, aun transitivamente, muere sin la env var. Por eso va en `test.env` (Tarea 2) y no en un `vi.stubEnv` local: los imports están hoisteados y el módulo ya se evaluó cuando corre el `beforeEach`.
2. **Un `redirect()` mockeado que no lanza deja pasar guards rotos.** El real lanza; si el mock devuelve `undefined`, el código posterior sigue corriendo y el test aprueba un layout que no protege nada. El helper lanza `RedirectSentinel`. Es el fallo más caro de este milestone.
3. **`next/dynamic({ssr:false})` desde un Server Component es error de build en Next 15.** Vive dentro de `CommandPaletteMount` (`"use client"`).
4. **Contextos de apilamiento.** Sidebar y TopBar son `sticky`/`fixed` con `transform`: sin `createPortal`, el diálogo del palette queda por debajo del scrim aunque su `z-index` sea mayor. El portal no es una optimización.
5. **El scrim es un color literal.** Escrito en el componente hace fallar `designTokens.test.ts`. Va a `tokens.css` como `--color-scrim` y se consume como `bg-scrim`.
6. **Doble `/api/v1` o `//`.** `NEXT_PUBLIC_API_URL` ya termina en `/api/v1` y el path empieza con `/`: concatenación directa, con un test dedicado a la URL.
7. **`sameSite: "strict"` da miedo y no debería** en dev (`localhost:3000` ↔ `:4000` son same-site). Lo que hay que vigilar es **producción**: si el API queda en otro dominio registrable, la sesión deja de existir. Es una restricción de despliegue, no de código.
8. **`cookies()` es asíncrona en Next 15** (`await cookies()`), y no reenvía nada sola: el header `cookie` se arma a mano.
9. **`SESSION_COOKIE_NAME` duplicado entre apps.** Constante con comentario apuntando a `apps/api/src/config/env.ts`. Si alguien cambia `COOKIE_NAME` en el API, el guard deja de encontrar la cookie y todo el panel se comporta como anónimo: síntoma confuso, causa trivial.
10. **`exactOptionalPropertyTypes` en el body del login.** `{code: undefined}` **no compila** al pasar por `LoginRequest`. El body se arma condicionalmente.
11. **429 no reproducible en dev**: `loginLimiter` lleva `skip: NODE_ENV !== "production"`. Se cubre solo con `fetch` stubeado; no perder tiempo intentando dispararlo a mano.
12. **`Response` global en jsdom.** No construir respuestas reales en los tests: objetos literales casteados a `Response`.
13. **`matchMedia` no existe en jsdom.** El responsive es **solo por CSS** (`lg:`), sin `useMediaQuery`. Introducir uno rompería de golpe todos los tests del shell.
14. **`autoFocus` en el campo de código** es legítimo aquí porque el elemento se monta al cambiar de fase. Si algún día el campo pasa a estar siempre montado, se convierte en un robo de foco al cargar y hay que sustituirlo por un `ref` — lo que obligaría a que `Field` acepte `ComponentPropsWithRef<"input">`.
15. **Skip link sin destino.** Al quitar el `<div id="main-content">` del layout raíz, cada group debe poner el `id` en su `<main>`: `(admin)`, `(auth)` y `/kit`. Son tres y están en las Tareas 2, 5 y 7.
16. **`@gira/shared` se rebuildea tras la Tarea 1** o `apps/web` y `apps/api` siguen viendo el `dist` anterior.
17. **Git:** ninguna tarea ejecuta `git add`/`commit`/`push` sin mostrar el diff y recibir aprobación explícita.

---

## Pendientes conocidos (post-review)

**Ejecutado el 2026-07-31.** Verificación final: `pnpm -r build` limpio (`@gira/shared` + `@gira/api` +
`next build`, con `NEXT_PUBLIC_API_URL` seteada en el entorno de build — el fail-fast de `lib/config.ts`
lo exige), `pnpm typecheck` limpio (los 3 paquetes), `pnpm lint` limpio, `pnpm audit --prod
--audit-level=high` limpio (M7 no agregó dependencias). Suites: `@gira/web` en **134/134** verde en
cada corrida. `@gira/api` en **595/595** verde en la corrida limpia; en una segunda corrida completa
`orderCreate.test.ts` y `reservation.test.ts` (ninguno tocado por M7) fallaron bajo contención de CPU de
la suite completa y dieron **30/30** en aislamiento — mismo flake documentado en la memoria del proyecto
y en el cierre de M5/M6 (no siempre son los mismos archivos los que lo muestran, lo que confirma que es
contención del host, no un test roto).

### 1. Recorrido end-to-end real contra API + MongoDB Atlas de desarrollo (no solo mocks)

Sin navegador disponible en esta sesión (igual que M6), pero se corrió el flujo completo con `curl` contra
`apps/api` real (ya levantada, conectada al Atlas de desarrollo) y `apps/web` en `next dev`/`next start`:

- Se creó un admin de prueba (`seed:admin`), se activó su 2FA vía `/auth/2fa/setup` + `/auth/2fa/enable`
  con un TOTP generado con `otplib` (la misma librería del backend), y se confirmó **el string exacto**
  que la constante de `packages/shared` debe reconocer: login sin código → 401
  `"Se requiere el código de verificación de dos factores."`; código incorrecto → 401 `"El código de
  verificación es incorrecto."`; con el código correcto → 200 + `Set-Cookie` `HttpOnly; SameSite=Strict`.
- `GET /kit` sin cookie → `307` a `/login` (guard server-side funcionando con el API real, no con
  `loadSession` mockeado).
- `GET /kit` con cookie de un customer registrado por `/auth/register` → `200` con el contenido de
  `ForbiddenScreen` ("Sin acceso" / "no tiene acceso al panel"), **sin redirigir** — confirma la
  distinción 401 vs 403 en vivo.
- `GET /login` con cookie de admin → `307` a `/resumen` (guard inverso del login funcionando).
- `verifyOrigin` real: sin `Origin` en una mutación → pasa (se resuelve por sesión, no por CORS); con
  `Origin: http://evil.example` → `403 "Origen no permitido."`.
- Los usuarios de prueba (`m7test-admin@gira.mx`, `m7test-customer@gira.mx`) se borraron de la base al
  cerrar la verificación.

**Lo que sigue pendiente y requiere un navegador real:** los tres breakpoints (390/834/1440) vistos, una
pasada solo con teclado de principio a fin (Tab a través de todo el shell, no solo dentro del formulario
o del diálogo — eso sí está cubierto por tests), `prefers-reduced-motion` real, y confirmar visualmente
que el foco nunca queda oculto detrás de la sombra dura. Los tests automatizados cubren el mecanismo
(`useFocusTrap`, `Escape`, `ArrowUp/Down`, `aria-current`, `aria-expanded`) pero no el criterio visual.

### 2. `/kit` en producción: 404 real solo para quien llega autenticado

Al mover `/kit` dentro de `(admin)` (Tarea 2), el guard del layout se evalúa **antes** que el
`notFound()` de la propia página. Consecuencia verificada con `next start`:

- Sin cookie → `307` a `/login` (el guard nunca deja llegar a la página; el visitante anónimo no ve ni
  el contenido de `/kit` ni su 404).
- Con cookie de admin → `404` real (el `notFound()` de `kit/page.tsx` sí se ejecuta).

No es una fuga: nadie sin sesión ve contenido de `/kit` en producción, antes o después de este cambio.
Pero difiere de la expectativa ingenua "`/kit` siempre 404 en producción" que tenía sentido cuando la
ruta vivía fuera de cualquier guard (M6). Vale la pena tenerlo presente si `/kit` se borra en M12: ese
día desaparece también esta capa doble.

### 3. Hueco de `/resumen` (documentado desde el diseño, reconfirmado en vivo)

`GET /resumen` con cookie de admin → `404` real: la ruta no existe hasta M8. Confirmado contra el API
real, no solo por inspección de código. Primera tarea de M8: crear `src/app/(admin)/resumen/page.tsx`.

### 4. El escenario `unavailable` (API caída) no se probó contra un backend real apagado

Se cubrió con la suite automatizada (`session.test.ts`, `adminLayout.test.tsx`) en vez de apagar el API
real: la instancia de `apps/api` usada para el resto del recorrido manual está conectada a una base de
datos compartida de desarrollo, y apagarla a medias para simular el caso hubiera sido más riesgoso que
informativo. El mecanismo (orden `unavailable` antes que `anonymous`, mensaje del `ApiError` propagado a
`SessionUnavailableScreen`) queda cubierto por los tests unitarios del guard.
