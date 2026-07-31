# M6 · Scaffold `apps/web` + sistema de diseño — Implementation Plan

> **Para ejecutar:** usa `subagent-driven-development` o `executing-plans`, tarea por tarea. Los pasos usan checkbox (`- [ ]`).
>
> **Al aprobar:** copiar este archivo a `docs/superpowers/plans/2026-07-30-m6-scaffold-web-sistema-diseno.md` (convención del repo) antes de empezar.

**Goal:** Levantar `apps/web` (Next 15 App Router + Tailwind v4 + TS estricto) y portar el sistema de
diseño de `mockups/` — tokens, tipografía y el tratamiento neobrutalista — como un UI kit a mano en
`components/ui/`, de modo que M7 (shell + login) y M8 (Resumen) compongan pantallas sin volver a
decidir nada visual ni escribir un solo color literal.

**Architecture:** Dos puntos de swap y nada más. `src/styles/tokens.css` (paleta, escalas,
primitivas neobrutalistas) y `src/app/fonts.ts` (tipografía) son los **únicos** archivos con un color
o una familia tipográfica; ambos llevan placeholders declarados. `globals.css` monta Tailwind sobre
esos tokens y no define **ni una clase de componente**: solo ~15 líneas de `@layer base` (defaults del
documento: `body`, `:focus-visible`, `prefers-reduced-motion`, un `@keyframes`). Todo lo visual vive
en React: la receta neobrutalista es un puñado de constantes TypeScript en
`components/ui/styles.ts` que los componentes componen. Cero hex, cero `font-family`, cero
gradientes, cero CSS de componente.

**Tech Stack:** Next 15 (App Router, RSC por defecto) · React 19 · Tailwind v4 (`@tailwindcss/postcss`)
· TypeScript estricto (extiende `tsconfig.base.json`) · `@phosphor-icons/react` peso `bold` ·
Vitest + Testing Library + jsdom · pnpm workspace ya existente.

---

## Context

El Bloque 1 (M1–M4) y M5 están mergeados en `main` (merge commit `1de930b`). El API expone `/api/v1`
completo y `packages/shared` publica enums, DTOs de dominio, `Wire<T>` y los labels en español. **No
existe una sola línea de frontend en el repo.**

La sesión de diseño previa cerró la dirección visual en `mockups/` (aprobada por Manuel): tokens en
OKLCH tintados hacia `--brand-hue`, tratamiento neobrutalista de borde 2px + sombra dura `4px 4px 0 0`
+ radio 12px, y cuatro pantallas de referencia. Ese trabajo es la especificación contra la cual se
contrasta lo que M6 construye; `mockups/` se borra al cerrar M12.

M6 no dibuja ninguna pantalla del panel. Produce la base sobre la que M7–M12 dibujan:

1. **El proyecto Next no existe** — no hay `package.json`, ni `tsconfig`, ni pipeline de CSS, ni
   `apps/web` en el workspace.
2. **Los tokens viven en un mockup estático** — hay que portarlos a la app sin perder la propiedad de
   que mover un solo número (`--brand-hue`) reencuadra todos los neutros.
3. **El tratamiento vive en 1866 líneas de CSS plano** — hay que reexpresarlo como Tailwind v4 +
   componentes React, conservando el TRATAMIENTO, no el archivo.
4. **No hay infraestructura de tests en el frontend** — `pnpm test` hoy solo corre el API.

**Restricción explícita de Manuel (vinculante):** aún no existen la paleta ni la tipografía
definitivas. Ambas entran como **placeholders declarados y globales**, en un solo lugar cada una, de
forma que el swap posterior no toque ni un componente. El plan lo blinda con un test automático
(Tarea 7) que falla si aparece un color o una familia tipográfica fuera de esos dos archivos.

**Resultado esperado:** `pnpm dev` levanta la app, `/kit` muestra cada componente con sus 7 estados
en los tres breakpoints, `pnpm -r build`/`typecheck`/`lint`/`test` en verde, y M7 arranca importando
`Button`, `Field`, `Panel` y `StatusChip` sin escribir CSS.

---

## Decisiones cerradas en esta sesión (vinculantes)

| Decisión | Elección | Por qué |
|---|---|---|
| **Puente tokens ↔ Tailwind** | `tokens.css` se porta literal pero su `:root {` pasa a `@theme static {`. Tailwind genera las utilidades desde los tokens; `globals.css` agrega un `@theme inline` mínimo solo para los nombres que no caen en un namespace de Tailwind (`--nb-shadow` → `shadow-nb`, `--nb-radius` → `rounded-nb`). | Los nombres de `tokens.css` ya usan los namespaces de Tailwind v4 (`--color-*`, `--font-*`, `--text-*`, `--ease-*`), así que el puente es casi gratis. `static` fuerza a emitir **todos** los tokens en `:root`, incluidos `--status-*`/`--ship-*`, que ningún utility referencia (los consume un selector por atributo) y que Tailwind podría podar. **Nunca** declarar un token con el mismo nombre a ambos lados (`--color-ink: var(--color-ink)`): una autorreferencia es inválida en tiempo de cómputo y mata el token en silencio. |
| **Un solo lugar para color** | `src/styles/tokens.css`. Ningún otro archivo del repo contiene un hex, un `oklch(`, un `rgb(` ni un `hsl(`. | Petición explícita de Manuel + spec §3. Blindado por el test de la Tarea 7, no por disciplina. |
| **Un solo lugar para tipografía** | `src/app/fonts.ts` (`next/font`, self-hosted) + las dos líneas `--font-sans`/`--font-mono` de `tokens.css`. | Ídem. `next/font` además elimina la petición a un CDN externo y el layout shift. |
| **Placeholder tipográfico** | `Inter` (sans) + `JetBrains Mono` (datos numéricos), declarados como PLACEHOLDER en el encabezado del archivo. `tokens.css` los consume con fallback al stack de sistema: `--font-sans: var(--font-sans-var), system-ui, …`. | El mockup usa stack de sistema; la app necesita el mecanismo real de `next/font` montado desde ya para que el swap sea de dos líneas. El fallback hace que un fallo de descarga de fuentes degrade en vez de romper. |
| **Cero CSS de componente** | No existe `@layer components`. La receta repetida vive como constantes TypeScript en `src/components/ui/styles.ts` (`NB_SURFACE`, `NB_PRESSABLE`) y el mapeo de estados como `Record<OrderStatus, string>`. En CSS solo quedan ~15 líneas de `@layer base`: `body`, `:focus-visible`, `prefers-reduced-motion` y un `@keyframes`. | Un typo en `className="nb-crd"` se renderiza sin borde **en silencio**; `NB_SURFCE` no compila. Un `Record<OrderStatus, string>` obliga a tsc a exigir los 9 estados: si falta uno, es error de compilación, no un chip gris que nadie nota. Además deja **un solo vocabulario** (utilidades) en vez de dos. El costo en bundle es equivalente (~40 bytes, string estático resuelto en build, cero runtime): lo que se gana es la detección de errores, no rendimiento. |
| **Alcance del UI kit** | Núcleo + primitivas de lista (14 componentes, Tarea 5). `SlideOver` → M9, `Toast`/`Toggle` → cuando exista la primera mutación (M7+). | Construir hoy un `SlideOver` cuyo consumidor real llega en M9 es diseñar a ciegas. Lo que se construye es exactamente lo que M7 y M8 consumen. |
| **Iconos** | `@phosphor-icons/react/dist/ssr`, envueltos en `components/ui/Icon.tsx` con `weight="bold"` fijo. | El entrypoint `/dist/ssr` no lleva `"use client"` (usable desde Server Components) y evita arrastrar el barrel completo al bundle. El wrapper hace que el peso `bold` sea estructural, no algo que cada call site pueda olvidar — y el peso regular desaparece junto a un borde de 2px. |
| **Tests** | Vitest + Testing Library + jsdom en `apps/web` desde M6. | `pnpm test` en la raíz deja de ser solo del API y M7–M12 lo heredan montado. Se testea comportamiento (estados, a11y, mapeo de enums), no apariencia. |
| **Página `/kit`** | `src/app/kit/page.tsx`, fuera del route group `(admin)` (que aún no existe), con `notFound()` si `NODE_ENV === "production"`. Se borra al cerrar M12, igual que `mockups/`. | Sin pantallas todavía, es la única forma de cumplir la verificación del spec §8 (3 estados, teclado, 3 breakpoints). Bloquearla en producción evita que una ruta de desarrollo quede publicada. |
| **`lib/config.ts`** | Entra en M6 con solo `apiBaseUrl` (desde `NEXT_PUBLIC_API_URL`) y fail-fast si falta. El cliente HTTP es M7. | Es parte del contrato de entorno del scaffold (`FRONTEND_GUIDELINES §4`), y llega con su `.env.development.example`. Ni una función más. |
| **`next-env.d.ts` se commitea** | Se versiona; `.gitignore` solo suma `.next/` y `out/`. | `pnpm typecheck` en un clon limpio falla sin ese archivo si no se corrió `next dev` antes. |

## Qué se copia literal y qué se reescribe

`mockups/` no se porta en bloque. Se reparte en tres cubetas, y confundirlas es el error clásico de
este milestone (terminar manteniendo un framework CSS a mano *además* de Tailwind):

| Cubeta | Contenido | Volumen | Trato |
|---|---|---|---|
| **1. Tokens** | `mockups/tokens.css` completo: colores, escala tipográfica, espaciado, sombras, radios, duraciones, layout | 133 líneas | **Copia literal.** No son estilos, son la *configuración*: Tailwind v4 lee ese archivo como su tema (`:root` → `@theme static`). Dos cambios y nada más (Tarea 2, Paso 1). |
| **2. Defaults del documento** | De `mockup.css`: `body` y el reset mínimo, el `:focus-visible` global, la anulación por `prefers-reduced-motion` (l. 33–84, 110–120) y el `@keyframes skel-shimmer` (l. 1795) | ~15 de 1866 líneas (**<1%**) | **Único CSS que sobrevive**, en `@layer base`. No estiliza componentes: son defaults de documento que ningún componente React puede expresar (no hay un componente `<body>`). |
| **3. Todo lo demás** | De `mockup.css`: `.nb-card`, `.nb-pressable`, `.chip` + sus 14 estados, `.skel`, `.btn`, `.panel`, `.stat`, `.table`, `.field`, `.tabs`, `.pagination`, `.empty`, `.notice`, grids, media queries | ~1850 líneas (**99%**) | **No se copia.** Se reescribe como componentes React con utilidades Tailwind; la parte repetida, como constantes TS en `components/ui/styles.ts`. El mockup se consulta como referencia de medidas, no como fuente. |

Ejemplo de la cubeta 3 — el botón, hoy ~40 líneas de CSS:

```css
/* mockups/mockup.css — se LEE como especificación, no se copia */
.btn { display:inline-flex; align-items:center; gap:var(--space-2);
       padding:var(--space-2) var(--space-4); min-height:38px;
       border:2px solid var(--color-ink); border-radius:var(--nb-radius-sm);
       box-shadow:var(--nb-shadow-sm); font-size:var(--text-sm); font-weight:700; }
.btn-primary { background:var(--color-brand); color:var(--color-text-inverse); }
```

```tsx
// apps/web/src/components/ui/Button.tsx — lo que se escribe
import { NB_PRESSABLE } from "./styles";

className={cn(
  "inline-flex items-center gap-2 px-4 min-h-[38px]",
  "border-2 border-ink rounded-nb-sm shadow-nb-sm text-sm font-bold",
  NB_PRESSABLE,
  variant === "primary" && "bg-brand text-text-inverse hover:bg-brand-hover",
)}
```

Las **medidas** salen del mockup; el **mecanismo** es Tailwind. `bg-brand` / `border-ink` /
`shadow-nb-sm` existen como utilidades porque la cubeta 1 se las enseñó a Tailwind.

**Por qué la receta repetida es TypeScript y no una clase CSS:** son las mismas 6 declaraciones en
botón, tarjeta, campo, panel y chip, así que tienen que vivir en **un** lugar — la pregunta es si ese
lugar es `.nb-pressable` en CSS o `NB_PRESSABLE` en TS. Gana TS porque un typo (`NB_PRESSABL`) no
compila, mientras que `className="nb-pressabl"` se renderiza sin sombra y sin una sola advertencia. El
mapeo de los 14 estados gana todavía más claro: `Record<OrderStatus, string>` obliga a tsc a exigir
los 9 valores del enum, cosa que un selector `[data-status]` faltante nunca reporta.

## Fuera de alcance (no-negociable #5)

- **Ninguna pantalla del panel.** Nada de Sidebar, TopBar, Breadcrumbs, CommandPalette, login,
  Resumen ni tablas con datos: eso es M7 y M8.
- **Ningún fetch al API.** No hay cliente HTTP, ni route guard, ni `/auth/me`. `lib/config.ts` solo
  declara la URL base.
- **`SlideOver`, `Toast`, `Toggle`, `useFocusTrap`** — se construyen en el milestone que primero los
  consume.
- **Sin gráficas.** `MiniBarChart` es de M8, que ya conoce la forma real de `timeseries`.
- **No se toca `apps/api` ni `packages/shared`.** M6 solo consume `@gira/shared`.
- **No se borra `mockups/`.** Sigue siendo la referencia hasta M12.
- **Sin modo oscuro.** No está en el spec ni en los mockups.

---

## Estructura de archivos

### `apps/web` (todo nuevo)

| Archivo | Responsabilidad |
|---|---|
| `package.json` | `@gira/web`; deps: next, react, react-dom, `@gira/shared`, `@phosphor-icons/react`. |
| `tsconfig.json` | Extiende `tsconfig.base.json`; override de `module`/`moduleResolution` a `bundler`, `jsx: preserve`, `lib: [DOM, ES2023]`, `noEmit`, plugin `next`. |
| `next.config.ts` | Mínimo: `reactStrictMode`, `transpilePackages: ["@gira/shared"]`. |
| `postcss.config.mjs` | `@tailwindcss/postcss`. |
| `vitest.config.ts` | jsdom + `@vitejs/plugin-react` + `setupFiles`. |
| `next-env.d.ts` | Generado por Next, se commitea. |
| `.env.development.example` | `NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1`. |
| **`src/styles/tokens.css`** | **SWAP POINT #1.** Port literal de `mockups/tokens.css` con `:root {` → `@theme static {`. |
| **`src/app/fonts.ts`** | **SWAP POINT #2.** Dos `next/font` con `variable:`; exporta `fontVariables`. |
| `src/app/globals.css` | `@import "tailwindcss"` + tokens + `@theme inline` puente + `@layer base` (~15 líneas). **Sin `@layer components`.** |
| `src/components/ui/styles.ts` | La receta neobrutalista como constantes TS + los mapas `Record<OrderStatus\|ShipmentStatus, string>`. |
| `src/app/layout.tsx` | `<html lang="es">` con `fontVariables`, `metadata`, skip link. |
| `src/app/kit/page.tsx` | Kitchen sink: cada componente con sus 7 estados. Se borra en M12. |
| `src/lib/config.ts` | `apiBaseUrl` con fail-fast. |
| `src/lib/cn.ts` | Concatenador de clases (5 líneas, sin dependencia). |
| `src/components/ui/*.tsx` | El UI kit (Tarea 5). |
| `tests/**` | Tests de comportamiento + guardia de tokens. |

### Archivos existentes a modificar

| Archivo | Cambio |
|---|---|
| `eslint.config.mjs` | Bloque para `apps/web`: `eslint-plugin-react-hooks` + `@next/eslint-plugin-next`; `.next/**` a `ignores`. |
| `.gitignore` | Agregar `.next/` y `out/`. |
| `package.json` (raíz) | Sin cambios esperados — verificar que `pnpm -r build/typecheck/lint/test` alcanza a `apps/web`. |

---

## Tarea 0: Rama de trabajo

- [ ] **Paso 1:** confirmar estado limpio y que M5 quedó mergeado

```bash
git status --short && git branch --show-current
git merge-base --is-ancestor feat/m5-api-dtos-compartidos main && echo "M5 mergeado ✓"
```

Expected: status vacío, rama `main`, y el `echo` imprime la confirmación.

> **Regla de ramas (casi cuesta el commit de M5):** ninguna rama de milestone se borra sin que
> `git merge-base --is-ancestor <rama> main` haya salido en verde antes.

- [ ] **Paso 2:** pedir aprobación a Manuel y crear la rama

```bash
git checkout -b feat/m6-scaffold-web-sistema-diseno
```

> **Nombre exacto: `feat/m6-scaffold-web-sistema-diseno`.** Verificarlo con `git branch --show-current`.
> Ninguna tarea de este plan ejecuta `git add`/`commit`/`push` sin mostrar `git status` + `git diff` y
> esperar aprobación explícita.

---

## Tarea 1: Scaffold de `apps/web` (a mano, no `create-next-app`)

**Depends on:** 0. **Files:** Create `apps/web/{package.json,tsconfig.json,next.config.ts,postcss.config.mjs}`

`create-next-app` impone su propio `eslint`, su `tsconfig` y su estructura; este monorepo ya tiene los
tres resueltos. Se arma a mano para que `apps/web` herede `tsconfig.base.json` como lo hace `apps/api`.

- [ ] **Paso 1:** `package.json`

```json
{
  "name": "@gira/web",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@gira/shared": "workspace:*",
    "@phosphor-icons/react": "^2.1.7",
    "next": "^15.1.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4.0.0",
    "@testing-library/jest-dom": "^6.6.3",
    "@testing-library/react": "^16.1.0",
    "@testing-library/user-event": "^14.5.2",
    "@types/node": "^22.8.4",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.4",
    "jsdom": "^25.0.1",
    "tailwindcss": "^4.0.0",
    "vitest": "^2.1.4"
  }
}
```

- [ ] **Paso 2:** `tsconfig.json` — hereda la base y corrige lo que Next necesita

```jsonc
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    // La base es NodeNext (backend). Next resuelve con el bundler y necesita DOM + JSX.
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "jsx": "preserve",
    "noEmit": true,
    "declaration": false,
    "sourceMap": false,
    "allowJs": true,
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules", ".next"]
}
```

> `noUncheckedIndexedAccess` y `exactOptionalPropertyTypes` vienen de la base y **se conservan**. Van
> a exigir rigor en props opcionales (`error?: string` no acepta `error={undefined}` explícito): el
> patrón es omitir la prop, no pasarla como `undefined`. No relajarlos.

- [ ] **Paso 3:** `next.config.ts` y `postcss.config.mjs`

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@gira/shared"],
};

export default nextConfig;
```

```js
const config = { plugins: { "@tailwindcss/postcss": {} } };

export default config;
```

- [ ] **Paso 4:** instalar y verificar que el workspace lo reconoce

```bash
pnpm install
pnpm --filter @gira/web exec next --version
```

Expected: pnpm enlaza `@gira/shared` desde el workspace; Next imprime su versión.

---

## Tarea 2: Tokens y tipografía — los dos puntos de swap

**Depends on:** 1. **Files:** Create `apps/web/src/styles/tokens.css`, `apps/web/src/app/fonts.ts`, `apps/web/src/app/globals.css`

- [ ] **Paso 1:** portar `mockups/tokens.css` **literal** a `apps/web/src/styles/tokens.css`

Copiar el archivo entero (133 líneas, incluidos los comentarios de swap point) y aplicar exactamente
dos cambios:

1. `:root {` → `@theme static {`
2. Las dos líneas de tipografía pasan a consumir las variables de `next/font`, conservando el stack de
   sistema como fallback:

```css
  /* ── TYPOGRAPHY ── PLACEHOLDER ──────────────────────────────────────────── */
  /* Las familias reales las declara src/app/fonts.ts (SWAP POINT #2). El stack
     de sistema queda como fallback: si la fuente no carga, la UI degrada en vez
     de romperse. */
  --font-sans: var(--font-sans-var), system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --font-mono: var(--font-mono-var), ui-monospace, "SF Mono", Menlo, Consolas, monospace;
```

Y actualizar el encabezado: `Destination: apps/web/src/styles/tokens.css (Phase 4)` → indicar que ya
llegó, y que sigue siendo el único archivo del proyecto con un literal de color.

> **Por qué `@theme static` y no `@theme`:** `static` obliga a Tailwind a emitir **todos** los tokens
> en `:root`. Los 14 `--status-*`/`--ship-*` no los referencia ninguna utilidad (los consume
> `.chip[data-status="…"]` en la capa de componentes), así que sin `static` Tailwind puede podarlos y
> los chips salen sin color. `--brand-hue`, `--nb-*`, `--space-*`, `--sidebar-width` y `--topbar-height`
> tampoco pertenecen a un namespace de Tailwind y dependen de lo mismo.

- [ ] **Paso 2:** `src/app/fonts.ts` — SWAP POINT #2

```ts
import { Inter, JetBrains_Mono } from "next/font/google";

/**
 * SWAP POINT #2 — TYPOGRAPHY.
 *
 * Both families below are PLACEHOLDERS: the official typeface for Gira has not
 * been chosen yet. When it arrives, this file is the only one that changes —
 * swap the two `next/font` calls and keep the variable names. No component
 * names a font family; they read `--font-sans` / `--font-mono` from tokens.css,
 * which point at the variables declared here.
 *
 * `next/font` self-hosts the files: zero requests to an external CDN at
 * runtime, and no layout shift from a late font swap.
 */

const sans = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans-var",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-mono-var",
});

/** Applied once on <html> in the root layout. */
const fontVariables = `${sans.variable} ${mono.variable}`;

export { fontVariables };
```

- [ ] **Paso 3:** `src/app/globals.css` — Tailwind + puente + capas

```css
@import "tailwindcss";
@import "../styles/tokens.css";

/*
 * Bridge for the token names that do NOT fall inside a Tailwind v4 namespace.
 * `inline` matters here: the generated utility emits `var(--nb-shadow)`, which
 * itself resolves `var(--color-ink)` live — so a palette swap moves the shadows
 * too. Names on the left are deliberately different from the token names on the
 * right: a self-referential entry (`--color-ink: var(--color-ink)`) is invalid
 * at computed-value time and would silently kill the token.
 */
@theme inline {
  --shadow-nb-sm: var(--nb-shadow-sm);
  --shadow-nb: var(--nb-shadow);
  --shadow-nb-lg: var(--nb-shadow-lg);
  --radius-nb: var(--nb-radius);
  --radius-nb-sm: var(--nb-radius-sm);
  --radius-nb-pill: var(--nb-radius-pill);
}

/*
 * Único CSS del proyecto además de tokens.css, y a propósito: son defaults del
 * documento, no estilos de componente. No existe @layer components — la receta
 * neobrutalista vive en src/components/ui/styles.ts como constantes TS, donde
 * un typo no compila en vez de renderizar sin borde.
 */
@layer base {
  /* Portado de mockups/mockup.css: reset mínimo + foco único de toda la superficie. */
  body {
    min-height: 100dvh;
    background: var(--color-wallpaper);
    color: var(--color-text-primary);
    font-family: var(--font-sans);
    font-size: var(--text-base);
    -webkit-font-smoothing: antialiased;
  }

  /* El outline va FUERA de la sombra dura; la sombra nunca se quita al enfocar. */
  :focus-visible {
    outline: 2px solid var(--color-focus);
    outline-offset: 2px;
    border-radius: var(--nb-radius-sm);
  }

  @media (prefers-reduced-motion: reduce) {
    *,
    *::before,
    *::after {
      transition-duration: 0.01ms !important;
      animation-duration: 0.01ms !important;
    }
  }
}

/* El shimmer del skeleton: los @keyframes son lo único que no se puede
   expresar como utilidad. El token --animate-shimmer vive en tokens.css y
   genera la utilidad `animate-shimmer`. */
@keyframes shimmer {
  from { background-position: 200% 0; }
  to { background-position: -200% 0; }
}
```

> **No hay `@layer components`.** `.nb-card`, `.nb-pressable`, `.chip`, `.skel`, `.btn`, `.panel`,
> `.stat`, `.table`, `.field` y `.tabs` NO se portan como CSS: se reexpresan como componentes React
> con utilidades (Tarea 5), y la parte repetida como constantes en `components/ui/styles.ts`.

- [ ] **Paso 4:** `src/app/layout.tsx` + `src/lib/cn.ts` + `src/lib/config.ts`

```tsx
// layout.tsx — lang="es" (UI en español), fontVariables en <html>, skip link visible al enfocar.
export const metadata: Metadata = {
  title: { default: "Panel · Gira Clothing", template: "%s · Gira Clothing" },
  robots: { index: false, follow: false },
};
```

```ts
// lib/config.ts — fail-fast: un panel apuntando a `undefined/orders` falla en runtime
// con un error incomprensible; aquí falla al arrancar, con nombre de variable.
const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL;
if (!apiBaseUrl) throw new Error("Falta NEXT_PUBLIC_API_URL. Copia .env.development.example.");

export { apiBaseUrl };
```

Y `.env.development.example` con `NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1` — **sin secretos**
(no-negociable #7: nada sensible en `NEXT_PUBLIC_*`; la URL del API no lo es).

- [ ] **Paso 5:** verificar que el pipeline de CSS funciona

```bash
pnpm --filter @gira/web dev
```

Expected: la app levanta en `localhost:3000` con el fondo `--color-wallpaper` (no blanco). Confirmar
en DevTools que `:root` trae `--status-disputed` y `--nb-shadow` — si falta alguno, `@theme static`
no se aplicó.

---

## Tarea 3: Infraestructura de tests (Vitest + Testing Library)

**Depends on:** 1. **Files:** Create `apps/web/vitest.config.ts`, `apps/web/tests/setup.ts`

- [ ] **Paso 1:** `vitest.config.ts`

```ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.tsx", "tests/**/*.test.ts"],
  },
  resolve: { alias: { "@": new URL("./src", import.meta.url).pathname } },
});
```

`tests/setup.ts`: `import "@testing-library/jest-dom/vitest";` + `afterEach(cleanup)`.

- [ ] **Paso 2:** test de humo que prueba que el arnés funciona

```tsx
// tests/setup.test.tsx
it("renderiza y consulta el DOM", () => {
  render(<button type="button">Hola</button>);
  expect(screen.getByRole("button", { name: "Hola" })).toBeInTheDocument();
});
```

Run: `pnpm --filter @gira/web test`
Expected: 1 test en verde. Y `pnpm test` en la raíz ahora corre API + web.

---

## Tarea 4: ESLint y `.gitignore` para el frontend

**Depends on:** 1. **Files:** Modify `eslint.config.mjs`, `.gitignore`

- [ ] **Paso 1:** instalar `eslint-plugin-react-hooks` y `@next/eslint-plugin-next` en la raíz
  (devDependencies), donde ya viven eslint y typescript-eslint.

- [ ] **Paso 2:** agregar a `eslint.config.mjs`, **después** del bloque `noModelImports` y **antes**
  de `prettier`:

```js
// Frontend: reglas de React/Next solo sobre apps/web. El guard de capas del API
// no aplica aquí; el equivalente en el frontend es que ningún componente escriba
// un color o una familia tipográfica (Tarea 7, con test).
const webConfig = {
  files: ["apps/web/**/*.{ts,tsx}"],
  plugins: { "react-hooks": reactHooks, "@next/next": nextPlugin },
  rules: {
    ...reactHooks.configs.recommended.rules,
    ...nextPlugin.configs["core-web-vitals"].rules,
  },
};
```

Y sumar `"**/.next/**"` al bloque `ignores`.

- [ ] **Paso 3:** `.gitignore` — agregar bajo *Build output*:

```
.next/
out/
```

> `next-env.d.ts` **sí** se commitea: sin él, `pnpm typecheck` falla en un clon limpio que nunca
> corrió `next dev`.

- [ ] **Paso 4:** `pnpm lint` en la raíz. Expected: limpio.

---

## Tarea 5: UI kit (`components/ui/`) — TDD por componente

**Depends on:** 2, 3. **Files:** Create `apps/web/src/components/ui/*.tsx`, `apps/web/tests/components/*.test.tsx`

- [ ] **Paso 0:** `src/components/ui/styles.ts` — la receta, en TypeScript, antes de cualquier componente

```ts
import { OrderStatus, ShipmentStatus } from "@gira/shared";

/**
 * The neobrutalist recipe, in ONE place. Lives in TypeScript rather than an
 * @layer components class on purpose: a typo here is a compile error, whereas
 * `className="nb-pressabl"` renders with no shadow and no warning at all.
 *
 * These are static strings resolved at build time — Tailwind scans this file
 * and emits the utilities. Zero runtime cost.
 */

/** 2px ink border + hard 4px offset shadow + 12px radius + flat fill. */
const NB_SURFACE = "bg-surface border-2 border-ink rounded-nb shadow-nb";

/** Press feedback translates INTO the shadow instead of scaling. */
const NB_PRESSABLE = [
  "transition-[transform,box-shadow] ease-out-expo duration-[var(--duration-state)]",
  "hover:-translate-x-px hover:-translate-y-px hover:shadow-nb-lg",
  "active:translate-x-0.5 active:translate-y-0.5 active:shadow-none",
  "motion-reduce:transform-none",
].join(" ");

/**
 * One entry per enum member. `Record<OrderStatus, string>` is the point: drop a
 * status and tsc fails the build. The CSS attribute-selector version of this
 * map failed silently with a colourless chip.
 */
const ORDER_STATUS_BG: Record<OrderStatus, string> = {
  [OrderStatus.PENDING_PAYMENT]: "bg-[var(--status-pending_payment)]",
  [OrderStatus.PAID]: "bg-[var(--status-paid)]",
  // … los 9
};

const SHIPMENT_STATUS_BG: Record<ShipmentStatus, string> = { /* … los 5 */ };

export { NB_SURFACE, NB_PRESSABLE, ORDER_STATUS_BG, SHIPMENT_STATUS_BG };
```

> **Test que acompaña este archivo** (`tests/components/styles.test.ts`): que ambos `Record` tengan
> exactamente `Object.values(OrderStatus).length` / `ShipmentStatus.length` entradas. tsc ya obliga a
> que no falte ninguna; el test protege contra una entrada *de más* con una llave inventada.

Catorce componentes. Reglas transversales, sin excepción:

- **Exportaciones al final del archivo**, nunca inline (no-negociable #4).
- **Sin `"use client"`** salvo donde haya estado, efecto o clase: solo `ErrorBoundary`, `Tabs` y
  `Pagination` lo llevan. Los presentacionales quedan RSC-compatibles.
- Nombres de archivo, props y comentarios **en inglés**; todo texto visible **en español**.
- Cada uno acepta `className` (mezclado con `cn`) y reenvía el resto de props del elemento nativo.
- Los 7 estados donde apliquen: default, hover, focus, active, disabled, loading, error.

| Componente | API | Notas de tratamiento |
|---|---|---|
| `Icon` | `{ icon, size?, className? }` | Envuelve Phosphor con `weight="bold"` fijo. Import desde `@phosphor-icons/react/dist/ssr`. |
| `Button` | `variant: primary\|secondary\|ghost\|danger`, `size: sm\|md`, `loading` | `nb-pressable` + sombra sm→md en hover. `loading` ⇒ `disabled` + `aria-busy` + spinner; `disabled` ⇒ opacidad .45, sin sombra, sin translate. |
| `IconButton` | `{ icon, label, ...button }` | `label` obligatorio → `aria-label`. Un icon button sin nombre accesible es un botón invisible para un lector de pantalla. |
| `Card` | `{ as?, children }` | Solo `.nb-card` + padding. |
| `Panel` | `{ title, hint?, actions?, flush?, children }` | Cabecera con borde inferior 2px ink; `flush` quita el padding del cuerpo (tablas a sangre). |
| `PageHeader` | `{ title, subtitle?, actions? }` | `<h1>` único de la página. |
| `StatCard` | `{ label, value, unit?, foot?, icon?, accent? }` | Valor en `font-mono`. **`accent` es responsabilidad del consumidor: máximo uno por pantalla** (spec §4) — documentarlo en el JSDoc. |
| `StatusChip` | `{ status }` \| `{ shipmentStatus }` | Label desde `ORDER_STATUS_LABELS`/`SHIPMENT_STATUS_LABELS` de `@gira/shared` (**nunca un mapa local de etiquetas**); fondo desde `ORDER_STATUS_BG`/`SHIPMENT_STATUS_BG` del Paso 0. Emite además `data-status` con el valor crudo del enum, para que los tests y el DOM sean legibles. |
| `Field` | `{ label, error?, helper?, icon?, ...input }` | `<label>` asociado por `htmlFor`; error ⇒ `aria-invalid` + `aria-describedby`; el foco va en `:focus-within` del contenedor. |
| `SelectField` | igual que `Field`, con `options` | Mismo contenedor, `<select>` nativo. |
| `Table` | `Table`/`Thead`/`Tbody`/`Tr`/`Th`/`Td` + `Td` con `numeric`/`actions` | Fila en proceso: `data-busy="true"` ⇒ opacidad .5 + `pointer-events: none`. Envuelto en un contenedor con `overflow-x:auto` propio: **el body nunca hace scroll horizontal**. |
| `Tabs` | `{ tabs: {id,label,count?}[], value, onChange }` | `role="tablist"`, `aria-selected`, navegación con flechas ←/→ + Home/End. Cliente. |
| `Pagination` | `{ page, limit, total, onPageChange }` | Deshabilita en los extremos; anuncia el rango en texto («21–40 de 137»). Cliente. |
| `Skeleton` | `Skeleton` + presets `SkeletonRows`, `SkeletonStatCard` | Alto idéntico al de la fila real (61px) ⇒ cero CLS. |
| `EmptyState` | `{ icon, title, description, action? }` | Icono en caja `.nb-card` chica. |
| `Notice` | `{ variant: info\|warning\|danger, title, children }` | Fondo desde el token de estado; borde 2px ink. |
| `ErrorBoundary` | class + `fallback` | Cliente. Envuelve secciones que hacen fetch (M7+). |

**Orden de trabajo por componente (TDD):** escribir el test de comportamiento → verlo fallar →
implementar → verde. Los tests que importan (no se testea apariencia):

- [ ] **Paso 1:** `Button` — `loading` deshabilita y pone `aria-busy`; `disabled` no dispara `onClick`;
  `variant="danger"` no pierde el borde ink.
- [ ] **Paso 2:** `StatusChip` — **test de tabla sobre los 9 `OrderStatus` y los 5 `ShipmentStatus`**:
  cada uno renderiza el label español de `@gira/shared` y su `data-status` es el valor crudo del enum.
  Este test es el que impide que una etiqueta del panel se desincronice del API.
- [ ] **Paso 3:** `Field` — el label queda asociado al input (`getByLabelText`); con `error`, el input
  tiene `aria-invalid="true"` y el mensaje está referenciado por `aria-describedby`.
- [ ] **Paso 4:** `Tabs` — flecha derecha mueve la selección y el foco; `aria-selected` solo en uno.
- [ ] **Paso 5:** `Pagination` — «Anterior» deshabilitado en página 1; «Siguiente» en la última;
  `onPageChange` recibe el número correcto.
- [ ] **Paso 6:** `ErrorBoundary` — un hijo que lanza renderiza el fallback y no propaga.
- [ ] **Paso 7:** `IconButton` — sin `label` no compila (test de tipos vía `@ts-expect-error`); con
  `label` expone nombre accesible.
- [ ] **Paso 8:** el resto (`Card`, `Panel`, `PageHeader`, `StatCard`, `Table`, `Skeleton`,
  `EmptyState`, `Notice`, `Icon`) — un test de render mínimo cada uno: role/estructura esperada y que
  `className` se mezcla en vez de reemplazar.

Run: `pnpm --filter @gira/web test`
Expected: todo verde. Después: diff, aprobación, commit.

---

## Tarea 6: Página `/kit` (verificación visual)

**Depends on:** 5. **Files:** Create `apps/web/src/app/kit/page.tsx`

- [ ] **Paso 1:** la página, bloqueada en producción

```tsx
import { notFound } from "next/navigation";

/**
 * Kitchen sink del sistema de diseño. Existe para contrastar el port contra
 * mockups/ mientras dura el Bloque 2 — se borra al cerrar M12, junto con
 * mockups/. No es una pantalla del panel y no consume el API.
 */
export default function KitPage() {
  if (process.env.NODE_ENV === "production") notFound();
  …
}
```

- [ ] **Paso 2:** secciones, en este orden: tokens (muestrario de superficies, ink, brand, los 14
  estados), tipografía (escala completa `--text-xs`…`--text-3xl`, sans y mono), botones (4 variantes ×
  2 tamaños × los 7 estados, incluida una fila con `disabled` y otra con `loading`), campos (normal /
  con icono / con helper / con error), chips (los 9 de pedido y los 5 de envío, con su label real),
  StatCards (normal y accent), Panel + Table con `data-busy` en una fila, Tabs, Pagination,
  Skeleton, EmptyState, Notice ×3.

- [ ] **Paso 3:** contrastar contra el mockup

```bash
python3 -m http.server 5050 -d mockups   # referencia
pnpm --filter @gira/web dev              # /kit
```

Comparar lado a lado: grosor de borde, offset de sombra, radio, comportamiento de presión (traslada
DENTRO de la sombra, no escala), y que el fondo de página quede neutro y sin tratamiento.

---

## Tarea 7: Guardia de "un solo lugar para color y tipografía"

**Depends on:** 5, 6. **Files:** Create `apps/web/tests/designTokens.test.ts`

Esta es la tarea que convierte la restricción de Manuel en algo que no depende de la disciplina de
nadie: si un componente escribe un color, la suite se pone roja.

- [ ] **Paso 1: Test primero**

```ts
/**
 * Palette and typography are placeholders and live in exactly two files:
 * src/styles/tokens.css (colour) and src/app/fonts.ts (families). When the
 * official brand arrives, those two files change and NOTHING else does — this
 * test is what makes that promise checkable instead of aspirational.
 */
const COLOUR = /#[0-9a-fA-F]{3,8}\b|\b(oklch|rgba?|hsla?)\(/;
const FONT_FAMILY = /font-family\s*:|fontFamily\s*:/;

it("ningún archivo fuera de tokens.css declara un color", () => { … });
it("ningún archivo fuera de fonts.ts nombra una familia tipográfica", () => { … });
it("ninguna utilidad arbitraria lleva un color literal", () => { … });
```

Recorre recursivamente `src/` (excluyendo `styles/tokens.css` y `app/fonts.ts`) y falla listando
archivo + línea + el literal encontrado. El tercer caso atrapa `bg-[#fff]` y `text-[oklch(60%_...)]`,
que esquivan los dos primeros.

> **Lo que sí está permitido:** `bg-[var(--status-paid)]` — es una referencia al token, no un literal.
> La regex prohíbe hex y funciones de color (`oklch(`, `rgb(`, `hsl(`), nunca `var(`. Sin esa
> distinción el test rechazaría `styles.ts`, que es justamente donde debe vivir ese mapeo.

- [ ] **Paso 2:** correr. Si algo falla, **corregir el componente**, nunca la regex.

- [ ] **Paso 3:** test de que `--brand-hue` sigue siendo la palanca única

```ts
it("los neutros derivan de --brand-hue", () => {
  const tokens = readFileSync("src/styles/tokens.css", "utf8");
  for (const token of ["--color-wallpaper", "--color-surface", "--color-ink", "--color-text-primary"]) {
    expect(tokens).toMatch(new RegExp(`${token}:[^;]*var\\(--brand-hue\\)`));
  }
});
```

Un port que "simplifique" reemplazando `var(--brand-hue)` por `162` pasa desapercibido a simple vista
y mata la propiedad central del sistema. Este test lo detecta.

---

## Tarea 8: Verificación de cierre (los 7 puntos del spec §8)

**Depends on:** todas.

- [ ] **Paso 1:** tipos — `pnpm typecheck` (raíz). Expected: limpio, API y web.
- [ ] **Paso 2:** build — `pnpm -r build`. Expected: `@gira/shared` compila, `next build` genera `/kit`
  sin errores de tipos ni de CSS.
- [ ] **Paso 3:** lint — `pnpm lint`. Expected: limpio.
- [ ] **Paso 4:** tests — `pnpm test`. Expected: la suite del API sigue en su número de M5 (ver el
  flake conocido de `inventoryStats.test.ts` bajo suite completa: revalidar en aislamiento antes de
  reportarlo como regresión) y la nueva suite de web en verde.
- [ ] **Paso 5:** dependencias — `pnpm audit --prod --audit-level=high`. **M6 sí agrega dependencias**
  (next, react, tailwind, phosphor); si aparece un hallazgo alto, resolverlo o documentarlo con
  justificación antes de cerrar.
- [ ] **Paso 6:** recorrido manual en `/kit`
  - Los tres breakpoints: **390 / 834 / 1440**. En ninguno el `body` hace scroll horizontal.
  - **Pasada solo con teclado:** Tab recorre todo en orden lógico, el foco es visible siempre y su
    outline queda FUERA de la sombra dura (la sombra nunca desaparece al enfocar).
  - `prefers-reduced-motion: reduce` activo: sin shimmer en skeletons y sin translate al presionar.
  - Cambiar `--brand-hue` de `162` a `20` en DevTools: **toda** la UI se reencuadra (fondos, bordes,
    textos). Si algún elemento queda con el matiz viejo, ahí hay un color escapado.
- [ ] **Paso 7:** checklist de seguridad de este milestone
  - `.env.development.local` git-ignored; solo `.env.development.example` versionado, sin secretos.
  - Ninguna variable `NEXT_PUBLIC_*` lleva algo sensible (solo la URL del API).
  - Cero `dangerouslySetInnerHTML` en todo `apps/web`.
  - `/kit` responde 404 con `NODE_ENV=production` (probarlo: `pnpm --filter @gira/web build && start`).
  - Cero peticiones a CDN externos: fuentes self-hosted por `next/font`, iconos desde el paquete.
  - `robots: { index: false }` en el layout raíz — un panel admin no se indexa.
- [ ] **Paso 8:** escribir la sección **"Pendientes conocidos (post-review)"** al final del plan
  copiado en `docs/superpowers/plans/`, aunque quede corta.
- [ ] **Paso 9:** mostrar `git status` + `git diff` completo y esperar aprobación explícita de Manuel
  antes de cualquier `git add`/`commit`. **Este plan no hace commit por su cuenta.**

---

## Verificación end-to-end (resumen)

| Qué | Comando / evidencia |
|---|---|
| Tipos | `pnpm typecheck` |
| Build | `pnpm -r build` (incluye `next build`) |
| Lint | `pnpm lint` (nuevas reglas react-hooks + next) |
| Tests | `pnpm test` — API intacto + suite nueva de `@gira/web` |
| Dependencias | `pnpm audit --prod --audit-level=high` |
| Un solo lugar para color/fuente | `tests/designTokens.test.ts` en verde |
| Cero CSS de componente | `globals.css` sin `@layer components`; `grep -r "@apply" apps/web` sin resultados |
| Palanca `--brand-hue` | Test de derivación + prueba manual en DevTools |
| Tratamiento portado | `/kit` contrastado contra `mockups/` lado a lado |
| A11y | Pasada solo con teclado en `/kit`; foco visible fuera de la sombra |
| Responsive | 390 / 834 / 1440 sin scroll horizontal del body |
| Producción | `/kit` → 404 con `NODE_ENV=production` |

---

## Gotchas a recordar durante la ejecución

1. **Nunca declarar un token con el mismo nombre a ambos lados del puente.**
   `@theme inline { --color-ink: var(--color-ink) }` es una autorreferencia inválida en tiempo de
   cómputo: el token queda vacío y el borde desaparece sin un solo error en consola.
2. **`@theme static`, no `@theme`.** Sin `static`, Tailwind puede podar los `--status-*`/`--ship-*`,
   que ninguna utilidad del tema referencia (los consumen utilidades arbitrarias
   `bg-[var(--status-paid)]`), y los 14 chips salen todos del mismo color.
   **Corolario:** no reintroducir `@layer components`. Si durante la ejecución aparece la tentación
   de "esto se ve más limpio como clase CSS", la respuesta es una constante en `styles.ts`: el
   criterio es que un typo rompa el build, no el diseño.
3. **`tokens.css` y `fonts.ts` son los únicos archivos con color y familia.** Si un componente
   "necesita" un color nuevo, el color se agrega a `tokens.css` y el componente lo consume —
   jamás al revés. El test de la Tarea 7 lo hace obligatorio.
4. **`var(--brand-hue)` no se resuelve a mano al portar.** Reemplazarlo por `162` compila, se ve
   idéntico y destruye la propiedad central del sistema.
5. **La sombra nunca se quita al enfocar.** El outline va fuera, con `outline-offset`. Un
   `focus:shadow-none` rompe la regla del spec §4.
6. **El presionado traslada, no escala.** `translate(2px,2px)` + sombra a cero. Un `scale(0.98)`
   contradice el tratamiento aprobado.
7. **`StatusChip` deriva sus labels de `@gira/shared`**, nunca de un mapa local. Una copia en
   `apps/web` se desincroniza en silencio del español que el API ya devuelve en sus errores.
8. **Iconos desde `@phosphor-icons/react/dist/ssr`**, no desde la raíz del paquete: la raíz lleva
   `"use client"` y arrastra el barrel completo al bundle.
9. **`"use client"` solo donde hay estado o clase** (`ErrorBoundary`, `Tabs`, `Pagination`). Ponerlo
   "por si acaso" en un presentacional convierte a todos sus consumidores en cliente.
10. **`exactOptionalPropertyTypes` está activo.** `<Field error={undefined} />` no compila: se omite
    la prop. No relajar el flag para esquivarlo.
11. **`@gira/shared` se debe rebuildear** (`pnpm --filter @gira/shared build`) tras cualquier cambio
    de tipos, o web sigue viendo el `dist` anterior.
12. **El body nunca hace scroll horizontal.** Lo hacen los contenedores anchos (tabla, tabs),
    cada uno con su propio `overflow-x: auto`.
13. **`/kit` se borra en M12**, junto con `mockups/`. Anotarlo en la tarea de cierre de M12.
14. **Git:** ninguna tarea ejecuta `git add`/`commit`/`push` sin mostrar el diff y recibir aprobación
    explícita. La rama es `feat/m6-scaffold-web-sistema-diseno`. **Ninguna rama de milestone se borra
    sin que `git merge-base --is-ancestor <rama> main` haya salido en verde primero.**

---

## Pendientes conocidos (post-review)

**Ejecutado el 2026-07-30.** Verificación final: `pnpm typecheck` limpio (API + web), `pnpm -r build`
limpio (`@gira/shared` + `@gira/api` + `next build`, `/kit` prerenderizado), `pnpm lint` limpio,
`pnpm audit --prod --audit-level=high` limpio tras el fix del punto 2 abajo, suite de `@gira/web` en
56/56, y suite de `@gira/api` en 595/595 corrida en aislamiento (ver punto 1). `/kit` verificado con
`next start` real: 404 en producción, 200 con contenido completo en dev.

### 1. `pnpm -r test` (raíz) aborta antes de llegar a `apps/web` por un timeout en `apps/api`

`orderRoutes.test.ts > sin Origin responde 403 (verifyOrigin)` superó los 30s bajo la suite completa
de `@gira/api` (595 tests). Es el mismo flake ya documentado en la memoria del proyecto y en
`apps/api/vitest.config.ts` (contención de CPU del host bajo carga completa, no un bug de app): corrido
en aislamiento, `@gira/api` dio **595/595 verdes**. No relacionado con M6 — ningún archivo de este
milestone toca `orderRoutes.test.ts` ni `verifyOrigin`. Como `pnpm -r test` se detiene en el primer
paquete que falla (`ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL`), `@gira/web` se corrió por separado
(`pnpm --filter @gira/web test`) y dio **56/56 verdes**. No bloqueante para cerrar M6; mismo tratamiento
que el flake de M5.

### 2. `pnpm audit` encontró 3 altos heredados de `next@15.5.22`, corregidos con `pnpm.overrides`

`next` (incluso en su versión `latest`, 16.2.12) fija internamente `postcss@8.4.31` (vulnerable a dos
CVE de `sourceMappingURL`) y arrastra `sharp@0.34.5` (vulnerable vía `libvips`) como dependencia de su
optimización de imágenes — ninguna de las dos es una dependencia directa de este proyecto ni una
decisión de M6. Se confirmó que `postcss` no está vendorizado dentro de `next/dist/compiled/` (a
diferencia de sus plugins), así que un `pnpm.overrides` en la raíz (`postcss: ">=8.5.18"`,
`sharp: ">=0.35.0"`) sí resuelve la instancia real que Next usa. Aplicado en `package.json` raíz;
`pnpm why postcss`/`pnpm why sharp` confirman `8.5.23`/`0.35.3` resueltos, y build + typecheck + lint +
tests de `@gira/web` se volvieron a correr completos después del cambio, todos en verde.
`pnpm audit --prod --audit-level=high` quedó limpio.

### 3. El recorrido manual del spec §8 (breakpoints, teclado, `prefers-reduced-motion`) no se hizo en un navegador real

Esta sesión no tiene un navegador disponible. Lo que sí se verificó con herramientas: el HTML/CSS
servido por `next dev` contiene las clases y valores esperados (`border-ink`, `shadow-nb`,
`--status-disputed`, `--color-wallpaper` derivando de `var(--brand-hue)` en el CSS compilado), los 9+5
chips de estado renderizan su label real, y el build de producción marca `/kit` como 404. **Lo que
falta y queda pendiente para quien revise visualmente (o para el arranque de M7):** contrastar `/kit`
contra `mockups/` lado a lado en 390/834/1440, una pasada real solo con teclado (Tab, foco visible
fuera de la sombra), y confirmar visualmente `prefers-reduced-motion` y el cambio en vivo de
`--brand-hue` en DevTools. Ninguno de los tests automatizados sustituye esa pasada; se deja como
verificación manual explícita antes de dar M6 por cerrado del todo.

### 4. `next-env.d.ts` quedó con una línea añadida por Next al primer `next dev`

Next agregó `/// <reference path="./.next/types/routes.d.ts" />` la primera vez que corrió `next dev`
(typed routes). Es el comportamiento estándar del archivo autogenerado — se dejó tal cual (el archivo
ya estaba marcado como "no editar" y excluido de ESLint) en vez de revertirlo a la plantilla mínima
original.
