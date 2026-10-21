# M11c · Paneles de Familias y Categorías (diseño)

Fecha 2026-10-20 · rama `feat/m11c-families-categories-panel` (desde `main`, con M11b mergeada) · **extiende el API** (DTO de admin con conteos e hijos activos).

M11 se partió en M11a (Productos), M11b (Estampas) y **M11c (Familias + Categorías, este documento)**: cierra el bloque de catálogo.

## Decisiones aprobadas

- **Lista en tabla** (variante A «clásica» de 4 mockups en el scratchpad; no van al repo): pocas filas y sin imagen. Columnas: nombre (con la descripción recortada en segunda línea), hijos activos (`6 de 8`, mono), actualizada (mono) y estado. La retirada va en gris con chip «Retirada». En móvil cada fila se apila.
- **Crear y editar en un modal centrado** (decisión de Manuel, distinta a Estampas/Productos, que usan `SlideOver`): `Modal` base nuevo en `components/ui` (portal, trap de foco, Escape, velo, pie fijo con «Cancelar» y «Guardar cambios» amarillo; en móvil se pega abajo como hoja). Se abre con `?familia=<id|nueva>` / `?categoria=<id|nueva>` en la URL (se puede recargar o compartir), con guarda de hidratación (`useSyncExternalStore`).
- **Componentes genéricos** en `components/taxonomy/`, parametrizados por una config por recurso (familias: «estampas», `/estampas`; categorías: «modelos», `/productos`). Las dos son femeninas: el copy encaja.
- **Retiro bloqueado** (el API ya responde 409): botón deshabilitado + aviso con el número de hijos activos, hasta 10 enlaces (estampa → `/estampas?estampa=<id>`, modelo → `/productos/<id>`), «y N más» y un enlace al listado filtrado (`/estampas?familia=<id>`, `/productos?categoria=<id>`). El 409 del servidor también se muestra. **Reactivar** no valida padre. Confirmar el retiro con `ConfirmDialog` (se apila sobre el modal; si el foco se pelea se prueba en el recorrido y se mueve la confirmación dentro del modal).
- Un solo botón amarillo por pantalla («Nueva familia/categoría» en la lista; «Guardar cambios» dentro del modal, tapando al anterior con el velo). No se arregla el bug de `Button` primary / `Segmented` (System Design); `Segmented` seleccionado usa el mismo `bg-brand!` local que `PrintFilters`, sin parches nuevos.
- Datos recortados en la frontera HTTP (`PanelTaxon`: sin `slug`). Mutaciones solo por `browserRequest`; ids validados antes de armar rutas.

## API (cambios)

- `@gira/shared`: `AdminPrintFamily` (`PrintFamily` + `printCount`, `activePrintCount`, `activePrints: {id,name}[]` A–Z máx. 10, `updatedAt`) y `AdminProductCategory` (ídem con `productCount`, `activeProductCount`, `activeProducts`). Constantes `PRINT_FAMILY_*` y `PRODUCT_CATEGORY_*` (nombre 2–80, descripción ≤500).
- `services/adminPrintFamilyService.ts` y `adminProductCategoryService.ts` (patrón `adminPrintService`): agregación con página cortada antes del `$lookup` de hijos; filtros `search` (nombre) e `isActive`; orden en lista blanca `name | updatedAt` (con `-`), por defecto `name`, 24 por página.
- `GET` lista y detalle pasan al servicio admin; `POST/PATCH/DELETE` responden el DTO admin (una lectura al final, sin relecturas de más). Claves de respuesta sin cambio (`families/family`, `categories/category`): los consumidores de opciones siguen funcionando porque el DTO extiende el actual.
- Los validadores usan las constantes compartidas.

## Estados y reglas de la UI

- Filtros en la URL en español (`q`, `estado` activas|retiradas|todas, `orden`, `page`), ids con `isObjectId`, defaults fuera de la URL, resincronización cuando la URL cambia desde fuera (patrón `lib/prints/filters.ts`). Orden: Nombre (A–Z) · Actualizadas recientemente. Búsqueda con 300 ms. 24 por página con `Pagination`.
- Carga (esqueleto con la geometría de la tabla), vacío (con filtros / sin registros) y error con «Reintentar»; un refresco silencioso que falla deja la tabla y muestra aviso.
- `?familia=` inexistente → «ya no existe» con solo «Cerrar». Errores del API en aviso del modal.
- Accesibilidad: fila como botón con nombre completo («Florales, 6 de 8 estampas activas»), foco visible, `role="dialog"` con `aria-labelledby`, `prefers-reduced-motion`.

## Archivos nuevos

API: dos servicios admin. Web: `components/ui/Modal.tsx`; `components/taxonomy/` (`TaxonomyPage`, `TaxonomyFilters`, `TaxonomyTable`, `TaxonomyEmpty`, `TaxonomyModal`, `TaxonomyForm`, `RetireTaxonSection`, `NewTaxonButton`); `hooks/useTaxonList.ts`, `useTaxonSave.ts`; `lib/taxonomy/` (`config.ts`, `filters.ts`, `panelTaxon.ts`, `taxonForm.ts`); `lib/api/adminPrintFamilies.ts`, `adminProductCategories.ts`; rutas `(admin)/familias` y `(admin)/categorias` con `loading.tsx`; `navigation.ts` activa ambas.

## Fuera de alcance

Reordenar, acciones en lote, bug del `Button` primary / `Segmented`, cursor global de `globals.css`, CSP de Cloudinary, cualquier feature no pedida.
