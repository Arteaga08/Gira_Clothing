# M11a · Panel de Productos (diseño)

Fecha 2026-10-20 · rama `feat/m11-catalog-panel` (desde `main`, con M10 mergeada) · depende de M10 · **extiende el API** (listado de productos, foto de tamaño, imágenes de variante, precio especial removible).

M11 se parte en **M11a (Productos)** y **M11b (Estampas, Familias, Categorías)**. Este documento es solo M11a.

## Decisiones aprobadas

- **Dirección visual A, «Vitrina»** (mockups en el scratchpad de la sesión, `m11/a`, servidos en localhost:5051 durante el diseño; no van al repo). Referencias revisadas: esencia_glow (rejilla de tarjetas, editor en una página) y bw_bikes (cajón de filtros en móvil, resumen de errores). Se tomó el editor de una sola página de esencia_glow con barra fija abajo.
- **Dominio:** Categoría (p. ej. Cosmetiquera) → modelos (por nombre o tamaño) → cada modelo tiene variantes, y cada variante es una **estampa** (Modelo × Print, sin tallas). El «producto» de la UI es el **modelo**.
- **Fotos por variante:** cada variante (estampa) lleva sus propias fotos (`Variant.images`, máx. 10, la primera es la portada). En el editor se **elige la estampa y debajo se ven y editan sus fotos**. Reordenar con flechas (sin arrastrar). Sin fotos de variante, la portada del modelo cae a la imagen de la estampa.
- **Foto de tamaño:** una sola por modelo (`Product.sizeImage`, opcional), dentro de «Datos del modelo», junto a las medidas.
- **Selector visual de estampas:** una sola cuadrícula con filtro por familia (Todas · cada familia). Las ya usadas por el modelo salen deshabilitadas con «Ya en el modelo». Recuadro «Nueva estampa» al final (ver «Decisiones por confirmar»).
- **Precio especial por estampa** (`priceOverride`) en línea; vacío = usa el precio base. Dinero en centavos en el API, pesos en el formulario y en mono.
- **Lista:** agrupada por categoría, A-Z dentro de cada una; selector de orden aparte (nombre, precio base, actualizado). Tarjeta: portada, nombre, precio base, «N estampas» y hasta 5 miniaturas de estampa (+N). Filtros en una isla de hueso: Buscar, Categoría, Estado (Activos / Retirados / Todos), Orden.
- **Retirar un modelo con variantes activas (el API responde 409):** la UI **bloquea y explica**. El botón se deshabilita y el aviso dice cuántas variantes activas quedan, con enlace a `/inventario?modelo=<id>`. Nada en cascada. El 409 del servidor también se muestra con ese texto.
- **Un solo botón amarillo por pantalla** («Nuevo producto» en la lista; «Guardar cambios» en el editor). Anton solo en títulos. Sin colores ni fuentes fuera de `tokens.css` / `fonts.ts`. No se arregla el bug del `Button` primary (milestone de System Design).
- Datos recortados en la frontera HTTP (patrón `PanelOrder` / `PanelVariant`): `PanelProduct`, sin `publicId` de imágenes ni campos que la UI no use. Mutaciones solo por `browserRequest`; ids validados antes de armar rutas (`assertProductId`, reutiliza `isObjectId`).

## API (cambios)

- `AdminProduct` en shared (nuevo): `{ id, name, slug, category: { id, name, slug }, description?, basePrice, weightGrams, measurements, materials, sizeImage?, isActive, variantCount, activeVariantCount, cover?, prints: [{ id, name, image }] (hasta 5), updatedAt }`. `cover` = primera foto de una variante activa o, si no hay, la imagen de su primera estampa activa o, sin variantes activas, la foto de tamaño.
- `GET /admin/products`: pasa a agregación con `$lookup` de categoría y variantes (como `adminVariantService`). Filtros existentes (`category`, `isActive`, búsqueda por nombre) y orden en lista blanca `category | name | basePrice | updatedAt` (con `-`); orden por defecto `category` (nombre de categoría, luego nombre del modelo). Límite 100 por página en el panel.
- `POST/PATCH /admin/products` aceptan `sizeImage` (`{url, publicId, width, height}`, https, opcional; `null` en PATCH lo quita). Responden `AdminProduct`.
- `POST /admin/uploads`: carpeta nueva `products` (además de `prints` y `variants`) en el validador y en el servicio.
- `AdminVariant` gana `images?` (lista de imágenes), **solo cuando se pide**: `GET /admin/variants?withImages=true` y las lecturas/mutaciones de una variante del catálogo (crear, detalle, editar, retirar) la incluyen; el listado normal y el ajuste de stock de Inventario no (el test de M10 que lo exige sigue vigente). `GET /admin/variants?product=<id>&withImages=true` carga las variantes del modelo en el editor.
- `PATCH /admin/variants/:id` acepta `priceOverride: null` para quitar el precio especial (hoy Joi rechaza `null` y no hay `$unset`) y responde `AdminVariant` (hoy devuelve `PublicVariant` con ids sueltos). `POST /admin/variants` también responde `AdminVariant`.
- Sin endpoint en lote: al crear, `POST /products` y luego un `POST /variants` por estampa elegida, **en secuencia**, informando cuáles fallaron (el modelo ya existe; se pasa a `/productos/[id]` con aviso y «Reintentar» solo para las pendientes).

## Guardado en el editor

- **Crear:** `POST /products` → `POST /variants` por cada estampa elegida (con su `priceOverride`) → subir las fotos de cada variante (`POST /uploads` con `folder=variants`, luego `PATCH /variants/:id { images }`; el orden del arreglo define la portada) → redirige a `/productos/[id]`.
- **Editar:** solo se envía lo que cambió. Elegir una estampa nueva crea su variante; **quitar una estampa que ya tiene variante la retira** (`PATCH isActive:false`) tras un `ConfirmDialog` que dice cuántas piezas hay en mano. Si la variante tiene apartadas (`reserved > 0`), la UI no deja quitarla. Volver a elegirla la reactiva (`PATCH isActive:true`; el API valida que modelo y estampa estén activos).
- Subida al elegir el archivo: se muestra progreso y error por foto. Las fotos subidas y luego quitadas sin guardar quedan huérfanas en Cloudinary (pendiente conocido).
- Aviso «Cambios sin guardar» en la barra fija y guardia `beforeunload`.

## Estados y reglas de la UI

- Cada vista tiene estado de carga (skeleton con la geometría real), vacío (distinto con filtros que sin ellos) y error con «Reintentar». Un refresco silencioso que falla deja las tarjetas y muestra un aviso (patrón M10).
- Filtros en la URL en español (`categoria`, `estado`, `q`, `orden`, `page`), ids validados con `isObjectId`, valores por defecto fuera de la URL, y resincronizados cuando la URL cambia desde fuera (patrón `lib/inventory/filters.ts`).
- Errores de campo del API (Joi, en español) se muestran junto al campo y en un toast; el primer error recibe el foco.
- Validaciones de cliente: nombre 2-120, categoría requerida, precio base 0-100,000.00, peso 1-20,000 g, medidas 0-500, materiales ≤10, descripción ≤2000; la tienda de verdad las impone el API.
- Móvil (390): tarjetas a 2 columnas, filtros plegables, barra fija sin tapar contenido, estampas y fotos a 2 columnas.
- Accesibilidad: botones de estampa con `aria-pressed`, filtro de familia como grupo de botones, acciones de foto con `aria-label`, foco visible, `prefers-reduced-motion`.

## Componentes nuevos

`ProductsPage`, `ProductFilters`, `CategorySection`, `ProductCard`, `ProductEmpty`, `ProductForm`, `ModelDataSection`, `SizePhotoField`, `PrintPicker`, `PrintPriceOverrides`, `VariantPhotos` (tira de estampas + galería), `ImageUploader`, `RetireModelSection`, `SaveBar`, `NewPrintSlideOver`. Se reutilizan `PageHeader`, `Field`, `SelectField`, `Segmented`, `Badge`, `SlideOver`, `ConfirmDialog`, `Toast`, `EmptyState`, `Notice`, `Skeleton`, `Pagination`, `ErrorBoundary`. Hooks: `useProductList`, `useProductSave`, `useImageUpload`. Rutas: `/productos`, `/productos/nuevo`, `/productos/[id]` (con su `loading.tsx`); `navigation.ts` activa `products` y `breadcrumbs.ts` muestra el nombre del modelo.

## Decisiones por confirmar

- **«Nueva estampa»:** se propone un `SlideOver` dentro del editor (nombre, SKU, familia, imagen) con `POST /prints`, sin salir del producto. Necesita la lista de familias (se amplía `adminCatalogOptions`). La pantalla completa de Estampas sigue en M11b. Alternativa: enlazar a Estampas.
- **Retirar una variante con piezas en mano:** se propone permitirlo con confirmación y bloquearlo solo con apartadas. Si prefieres bloquear también con stock en mano, se ajusta.

## Fuera de alcance

Pantallas de Estampas, Familias y Categorías (M11b); arrastrar para reordenar fotos; acciones en lote; limpieza de fotos huérfanas en Cloudinary; una foto de tamaño por variante; precio por variante en masa; el bug del `Button` primary y la paleta (System Design); reactivar un modelo con categoría retirada fuera de lo que ya valida el API.
