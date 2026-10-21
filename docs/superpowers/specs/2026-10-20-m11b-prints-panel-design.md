# M11b · Panel de Estampas (diseño)

Fecha 2026-10-20 · rama `feat/m11b-prints-panel` (desde `main`, con M11a y sus menores mergeados) · **extiende el API** (DTO de admin con conteos y modelos en uso, SKU fijo).

M11 se partió en M11a (Productos, hecho), **M11b (Estampas, este documento)** y M11c (Familias + Categorías).

## Decisiones aprobadas

- **Dirección A «Vitrina»** (mockups en el scratchpad de la sesión, `m11b/a.html`; no van al repo): rejilla de tarjetas como la de Productos. Imagen cuadrada, nombre, SKU en mono, familia como chip y «N variantes». La retirada se ve en gris con el chip «Retirada».
- **Crear y editar en un panel lateral** (`SlideOver`) sobre la lista; sin páginas propias. El formulario es el mismo de «Nueva estampa» del editor de productos, generalizado a crear/editar (`PrintForm`).
- **SKU fijo una vez creada**, en el API y en la UI: las variantes arman su SKU con el de la estampa al crearse (`buildVariantSku`), y si cambiara quedarían desfasadas. El PATCH rechaza `sku` con 400 «El SKU no se puede cambiar.»; la UI lo muestra de solo lectura.
- **Retirar con variantes activas (el API responde 409):** la UI **bloquea y explica**: botón deshabilitado, aviso con el número de variantes activas, los modelos que la usan (cada uno enlaza a `/productos/[id]`) y un enlace a `/inventario?print=<id>`. El 409 del servidor también se muestra. Nada en cascada.
- **Listas desplegables propias** (`SelectField` nuevo, ver memoria `feedback-custom-select-dropdowns`): ya aplicado a toda la app en esta rama; M11b lo usa en el filtro de familia, el de orden y el campo Familia del panel.
- **Un solo botón amarillo por pantalla** («Nueva estampa» en la lista; «Crear estampa / Guardar cambios» dentro del panel, tapando al anterior con el velo). Anton solo en títulos. Sin colores ni fuentes fuera de `tokens.css` / `fonts.ts`. No se arregla el bug del `Button` primary (System Design).
- Datos recortados en la frontera HTTP (patrón `PanelProduct`): `PanelPrint`, sin `publicId` ni campos que la UI no use. Mutaciones solo por `browserRequest`; ids validados antes de armar rutas.

## API (cambios)

- `AdminPrint` en `@gira/shared`: `Print` + `variantCount` (todas), `activeVariantCount`, `activeProducts: { id, name }[]` (modelos con una variante activa de esa estampa, A-Z, **máximo 10**; el total real se deduce de `activeVariantCount`, hay una variante por modelo) y `updatedAt`.
- `services/adminPrintService.ts` (nuevo, patrón de `adminProductService`): `GET /admin/prints` y `GET /admin/prints/:id` pasan a agregación. Se corta la página antes del `$lookup` de familia y de variantes. Filtros sin cambios (`search` por nombre/SKU, `family`, `isActive`); orden en lista blanca `name | sku | updatedAt` (con `-`), por defecto `name`.
- Las mutaciones (`POST`, `PATCH`, `DELETE`) responden `AdminPrint`. Se quita la relectura redundante de `getPrint` (rendimiento contra Atlas, ~330 ms por operación).
- `updatePrintSchema` ya no acepta `sku` (`Joi.forbidden()` con mensaje) y `updatePrint` ya no lo recibe.
- Constantes `PRINT_NAME_MIN/MAX`, `PRINT_SKU_MIN/MAX` y `PRINT_SKU_PATTERN` en `@gira/shared`; las usan el validador y la web.
- Los consumidores actuales de `GET /admin/prints` (selector de estampas, opciones del editor) siguen funcionando: `AdminPrint` extiende `Print`.

## Estados y reglas de la UI

- Filtros en la URL en español (`q`, `familia`, `estado`, `orden`, `page`), ids validados con `isObjectId`, valores por defecto fuera de la URL y resincronizados cuando la URL cambia desde fuera (patrón `lib/catalog/filters.ts`). Estado: Activas (por defecto) · Retiradas · Todas. Orden: Nombre (A–Z) · SKU · Actualizadas recientemente.
- La búsqueda espera 300 ms tras escribir. Páginas de 24 (la rejilla de 2/3/4/5 columnas encaja bien) con `Pagination`.
- El panel lateral se abre con `?estampa=<id>` o `?estampa=nueva` en la URL: se puede recargar o compartir. Cerrar lo quita.
- Cada vista tiene estado de carga (esqueleto con la geometría real), vacío (distinto con filtros y sin ellos) y error con «Reintentar». Un refresco silencioso que falla deja las tarjetas y muestra un aviso (patrón M10/M11a).
- Familia del formulario: solo familias activas, más la actual de la estampa si está retirada (marcada «(retirada)», patrón `withCurrentCategory`). El filtro de la lista ofrece las activas.
- Reactivar una estampa cuya familia está retirada: el API responde 409 con su mensaje; el panel lo muestra junto al botón.
- Cambiar la imagen: subir la nueva (`/uploads`, carpeta `prints`), mostrar el progreso y reemplazar al guardar. La imagen anterior queda huérfana en Cloudinary (pendiente conocido).
- Errores de campo del API (Joi, en español) en un aviso del panel y en toast.
- Móvil (390): tarjetas a 2 columnas, filtros plegados en una isla que se apila, panel a ancho completo.
- Accesibilidad: tarjetas como botones con nombre completo («Rosas de verano, FLR-001, 6 variantes»), foco visible, el panel conserva el trap de foco del `SlideOver`, `prefers-reduced-motion`.

## Componentes y archivos nuevos

Web: `components/prints/` → `PrintsPage`, `PrintFilters`, `PrintCard`, `PrintEmpty`, `PrintSlideOver`, `PrintForm`, `RetirePrintSection`, `NewPrintButton`; `hooks/usePrintList.ts`, `hooks/usePrintSave.ts`; `lib/prints/` → `filters.ts`, `panelPrint.ts`, `printForm.ts`, `printId.ts`; `lib/api/adminPrints.ts`; ruta `app/(admin)/estampas/page.tsx` + `loading.tsx`; `navigation.ts` activa `prints`. `NewPrintSlideOver` del editor de productos pasa a usar `PrintForm`.
API: `services/adminPrintService.ts`.

## Fuera de alcance

Familias y Categorías (M11c), reordenar o agrupar por familia, acciones en lote, limpieza de imágenes huérfanas en Cloudinary, el bug del `Button` primary y el cursor global de `globals.css` (System Design), y cualquier otra pantalla.
