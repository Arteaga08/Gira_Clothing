# Gira Clothing — Dashboard admin (spec Bloque 2)

> Fecha: 2026-07-29 · Estado: aprobado por Manuel · Alcance actual: **panel admin, M5–M12**

## 1. Contexto

El Bloque 1 (backend + seguridad, M1–M4) está mergeado y verificado: `apps/api` expone un API REST
completo en `/api/v1` — catálogo, carrito, órdenes, pagos, envíos, notificaciones, ajustes y
auditoría. Hoy **nadie puede operar la tienda desde el navegador**: no existe una sola línea de
frontend en el repo. Cambiar el estado de un pedido, asignar una guía o corregir stock solo se puede
hacer con `curl` o directo en Mongo.

Este spec fija las decisiones de diseño y arquitectura frontend antes de escribir código, siguiendo
la misma regla del spec maestro (`2026-07-23-gira-clothing-plan-maestro.md:13`): cada milestone se
ejecuta en su **propia sesión/chat**, sin recargar el contexto completo del proyecto. Es el único
documento que una sesión de M6–M12 necesita cargar además del plan de su propio milestone.

Antes de este spec hubo una sesión de exploración visual: mockups estáticos HTML/CSS en `mockups/`
(servidos en `localhost:5050`), con dos direcciones de la pantalla Resumen contrastadas una contra
otra y aprobadas por Manuel. Ese trabajo cerró las decisiones de diseño §3 y produjo el archivo de
tokens que la app hereda literalmente. `mockups/` se mantiene en el repo como referencia mientras
dura la construcción y se borra al cerrar M12 (Tarea de cierre de M12).

### Alcance de este documento

1. **La tecnología no se elige aquí donde el estándar ya la fija.** Capas, TS estricto, bilingüismo
   código-inglés/UI-español, exportaciones al final, RSC-por-defecto y accesibilidad WCAG AA vienen
   de `~/.claude/standards/FRONTEND_GUIDELINES.md` y `DASHBOARD_GUIDELINES.md`. Este spec resuelve
   solo lo que esas guías dejan abierto por proyecto: paleta (placeholder), tipografía (placeholder),
   dirección visual concreta, y el mapeo de cada pantalla a su endpoint.
2. **El diseño visual ya no está en discusión.** Layout, jerarquía y tratamiento están aprobados
   (§3). Lo que queda abierto es la implementación con Next + Tailwind.
3. **Foco: el panel admin** (Bloque 2, M5–M12). El frontend público (Bloque 3) es un bloque aparte,
   posterior, con su propio brainstorming.

## 2. Estándares que rigen el proyecto

- `~/.claude/CLAUDE.md` — no-negociables (capas, bilingüismo, exportaciones al final, no agregar
  features no pedidas, **cero `git add/commit/push` sin permiso explícito**).
- `FRONTEND_GUIDELINES.md` — ingeniería: RSC por defecto, route guards contra `/auth/me`, Core Web
  Vitals, `lib/config.ts` centralizado, a11y, `ErrorBoundary` + tres estados, TS estricto.
- `DASHBOARD_GUIDELINES.md` — la base de arranque: shell (Sidebar + TopBar + Breadcrumbs +
  CommandPalette), plantilla de página de lista, inventario de componentes UI, patrones de datos
  (fetch + polling + fila en proceso), tokens re-skineables.
- `BACKEND_SECURITY_GUIDELINES.md` — sigue aplicando: la cookie `HttpOnly` + `sameSite: "strict"` y
  el `verifyOrigin` del API condicionan cómo el cliente HTTP se construye (§6).

Todo el "cómo" vive en esas guías. Este spec describe solo el "qué" del panel de Gira.

## 3. Decisiones cerradas

| Decisión | Elección | Por qué |
|---|---|---|
| Topología | **Una sola app Next en `apps/web`.** Route group `(admin)` = panel privado; la tienda pública será otro group en el Bloque 3. | La cookie de sesión es `sameSite: "strict"` y en producción `apps/api/src/config/cors.ts` permite un único origen. Dos apps en dos orígenes rompen la sesión o fuerzan a debilitar seguridad ya endurecida. |
| Dirección visual | Layout, arquitectura de información y calma de la referencia (KPIs, panel de gráfica, paneles laterales de listas). **Neobrutalismo en el tratamiento de tarjetas y componentes**, no en toda la estética. | Pedido explícito de Manuel: "el estilo es neobrutalista pero que se vean como la foto". |
| Pantalla Resumen | **Híbrido A+B**: banda "Requiere atención" a todo lo ancho arriba (de la dirección B) + KPI cards grandes, gráfica 2/3 con riel derecho, distribución, más vendidos y stock bajo (de la dirección A). | Se ve como la referencia, pero lo urgente salta primero. Decidido tras comparar las dos variantes en `mockups/resumen-a.html` / `resumen-b.html`. |
| Paleta y tipografía | **Placeholders.** Viven en `apps/web/src/styles/tokens.css` (colores) y `apps/web/src/app/fonts.ts` (tipografía) y en ningún otro lugar. | Aún no existe la paleta ni la tipografía oficiales. El swap posterior no debe tocar un solo componente. |
| Iconografía | **Phosphor Icons, peso `bold`**, vía `@phosphor-icons/react`. | El peso regular se adelgaza y desaparece junto a un borde de 2px. Los mockups ya usan el sprite bold con los mismos nombres. |
| UI kit | **A mano, sin shadcn/ui ni Radix.** | El tratamiento neobrutalista ya está especificado por completo (§4); una librería de componentes trae su propia capa de tokens que pelearía con la regla "un solo archivo con colores". |
| Huecos del API | Se agregan `GET /admin/stats/timeseries`, `GET /admin/users`, `GET /admin/shipments`, `GET /admin/notifications/health` (M5). | Sin `timeseries` no hay gráfica de tendencia; los otros tres alimentan pantallas del panel que hoy no tienen endpoint. |
| Mockups | Se commitean en M5 como referencia visual y **se borran al cerrar M12**. | Es la especificación contra la cual se contrastan las pantallas reales mientras se construyen; deja de tener sentido una vez que la app existe. |

## 4. Tratamiento visual (neobrutalismo en componentes)

Reglas concretas, ya implementadas en `mockups/tokens.css` y `mockups/mockup.css`, que la app porta:

- Bordes sólidos de **2px** en `--color-ink`.
- Sombra dura **`4px 4px 0 0`**, blur cero y alpha cero (una sombra con alpha se enloda sobre el
  neutro claro del fondo).
- Radio **12px**. Rellenos **planos**: cero gradientes, en ningún componente.
- El estado presionado se **traslada dentro de su sombra** en vez de escalar.
- Un solo acento saturado (`--color-brand`) para nav activo, botón primario y la serie principal de
  la gráfica. Nunca más de un KPI acentuado por pantalla.
- El fondo de página y el riel del sidebar **no** llevan el tratamiento: quedan neutros y calmos,
  como en la referencia.
- Colores en **OKLCH**, neutros teñidos hacia `--brand-hue` — mover ese único número reencuadra
  todos los grises de golpe.

Cada componente interactivo lleva sus 7 estados: default, hover, focus, active, disabled, loading,
error. El foco visible va **fuera** de la sombra dura; la sombra nunca se quita al enfocar.

## 5. Modelo de datos consumido

Enums y contrato de respuesta ya fijados por el API (`packages/shared`, ampliado en M5):

- `OrderStatus` (9 valores), `ShipmentStatus` (5), `UserRole`, `Currency`, `PriceRounding`,
  `NotificationChannelKind/Type/Status`, `AuditModule/Action`.
- Envelope: `{status, message, data?, meta?}`. `data` es un wrapper nombrado (`{orders: [...]}`)
  excepto en endpoints de stats, que esparcen el objeto directo en `data`.
- Dinero: enteros en centavos MXN en todo el API; la UI muestra y captura en pesos.
- `Variant` es la única dueña de stock (`onHand`, `reserved`, `available` calculado).
- Solo 4 transiciones de estado las puede hacer un humano (`ADMIN_ALLOWED` en
  `apps/api/src/utils/orderTransitions.ts`, exportado en M5): `paid→processing`,
  `processing→shipped`, `shipped→delivered`, `pending_payment→cancelled`. Todo lo demás lo decide el
  webhook de pago.

Detalle completo de rutas, DTOs y contrato de listado en el plan de M5.

## 6. Autenticación y cliente HTTP

- JWT en cookie `HttpOnly`, nombre `gira_session`, `sameSite: "strict"`, `secure` en prod. **Nunca**
  `Authorization: Bearer`.
- Login es de **un solo paso** con 2FA opcional: `POST /auth/login {email,password,code?}`; si el
  admin tiene TOTP activo y falta `code`, el API responde 401 con un mensaje fijo que dispara el
  reenvío con el código.
- CSRF: no hay token; la defensa es `verifyOrigin` sobre `Origin`/`Referer` en métodos mutantes. Las
  peticiones server-side (sin esos headers) pasan — por eso las mutaciones se hacen desde el
  cliente, nunca desde un Server Component o Server Action.
- El guard de rutas privadas valida contra `GET /auth/me` server-side, con `cache: "no-store"`,
  reenviando la cookie a mano (Next no la reenvía sola en `fetch` de servidor).

## 7. Roadmap

Ocho milestones, uno por sesión. Numeración continúa la del backend.

| M | Alcance |
|---|---|
| M5 | API: 4 endpoints faltantes + DTOs de dominio en `packages/shared` |
| M6 | Scaffold `apps/web` (Next + Tailwind v4 + TS estricto) + sistema de diseño (tokens + UI kit) |
| M7 | Shell `(admin)` + Login con 2FA + cliente HTTP |
| M8 | Resumen (híbrido A+B) |
| M9 | Pedidos + detalle en panel lateral |
| M10 | Envíos + Inventario |
| M11 | Catálogo: productos, estampas, familias, categorías + subida de imágenes |
| M12 | Clientes + Auditoría + Ajustes + cierre del bloque |

Dependencias reales: M7 necesita M6 (UI kit) y los DTOs de M5. M8 necesita `timeseries` y
`notifications/health` de M5. M10 necesita `/admin/shipments`. M12 necesita `/admin/users`.

**No se asume nada más allá de este roadmap.** Los planes detallados de M6 en adelante se escriben
al arrancar su propia sesión con `writing-plans`, cargando solo este spec y el estado del repo.

## 8. Verificación de cierre por milestone

Los 7 puntos del checklist del plan maestro, con salida real pegada (no afirmaciones): `pnpm -r
build` · `pnpm typecheck` · `pnpm lint` · `pnpm test` · `pnpm audit` · recorrido manual end-to-end ·
checklist de seguridad. En milestones de pantalla, además: los tres estados forzados (carga/vacío/
error), pasada solo con teclado, y los tres breakpoints (390 / 834 / 1440).
