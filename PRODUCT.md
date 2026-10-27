# Product

## Register

product

## Users

Personal interno de operación de Gira Clothing (una marca D2C de ropa con estampados
personalizables: playeras, sudaderas, etc.). Usan este dashboard durante su turno para procesar
pedidos y envíos, gestionar catálogo (productos, estampas, familias, categorías) e inventario, y
vigilar la salud del negocio. Contexto: de escritorio, trabajando por colas (pedidos atorados, stock
bajo, notificaciones fallidas), necesitan ver de un vistazo qué requiere atención y actuar rápido —
no es una experiencia de navegación pausada, es una consola de trabajo.

## Product Purpose

Un panel de administración interno para que el equipo de operación de Gira Clothing corra el día a
día de la tienda: ver qué necesita atención ahora mismo (pedidos atorados, stock bajo,
notificaciones fallidas), procesar pedidos y envíos, mantener el catálogo, y vigilar KPIs del
negocio (ingresos, más vendidos) sin tocar la base de datos directamente. Éxito = decisiones
operativas más rápidas con menos fricción, nunca "bonito" a costa de "claro".

## Brand Personality

Claro, robusto, directo — expresado en un neobrutalismo que ya no es placeholder: paleta y
tipografía finales (ver DESIGN.md), bordes de tinta de 2px, sombras duras (`shadow-nb`), cero
gradientes, cero vidrio translúcido. Verde bosque es el fondo dominante de TODA la app, consola
incluida — no es un acento tenue reservado a la tienda. La herramienta se siente como una consola
física bien construida: confiable, legible, sin decoración porque sí, aunque el fondo ya no sea
neutro. Un solo lenguaje de forma para consola y tienda; lo que cambia entre ambas es la densidad
(consola apretada, tienda respira más), nunca el vocabulario visual.

## Anti-references

La plantilla genérica de dashboard SaaS: glassmorphism suave, gradientes morado-a-azul, bordes
hairline de 1px casi invisibles, métricas hero con texto degradado. Todo esto ya se rechaza
explícitamente en las convenciones actuales (`NB_SURFACE` usa bordes duros y sombra sólida, nunca
paneles translúcidos).

## Design Principles

- Un solo lugar para el color y la tipografía: `tokens.css` y `fonts.ts` son la única fuente, nunca
  colores ni familias inline (impuesto por `designTokens.test.ts`).
- Lo urgente sube arriba siempre: el patrón de "banda de atención" antes que cualquier KPI.
- Cero animación decorativa: feedback de estado sí, coreografía no.
- Amarillo eléctrico es exclusivo del CTA — nunca decoración, nunca un segundo uso en la misma
  pantalla. Rosa chicle es la identidad de marca (precios, links, logo) pero nunca en texto corrido:
  falla AA a tamaño de párrafo (~3.1:1), así que se reserva a títulos ≥18px/700 o chips.
- Cada estado se dibuja explícito (vacío, error, cero) — nunca un hueco silencioso que parezca un
  bug.

## Accessibility & Inclusion

WCAG AA como mínimo. Navegación completa por teclado con foco visible en cada pantalla (ya
verificado en M6-M8). `prefers-reduced-motion: reduce` respetado — sin transiciones en gráficas o
barras. Es una herramienta interna, no pública, pero el personal de operación puede incluir usuarios
de tecnología asistiva, así que el estándar aplica igual.

## Tienda pública (Bloque 3) — registro brand

La tienda (`apps/web/src/app/(store)`) es **brand**: la voz visual importa y el diseño es parte del
producto. El panel sigue siendo **product**; nunca se mezclan recetas de uno y otro en la misma
pantalla. Mismos tokens y mismo lenguaje de forma, otra densidad (escala "Store" de DESIGN.md).
Usuarios: clientas y clientes que navegan desde el celular, sin prisa, y compran solo con cuenta.
Éxito = que la marca se sienta propia y que llegar a una prenda y pagarla sea obvio.

- La piel vive en `src/styles/store-skin.css` (variables `--store-*` que apuntan a tokens). Cambiar de
  dirección visual (A, B o C) debe costar un cambio ahí, no en los componentes.
- Navbar: variante B (editorial). Logo centrado, transparente arriba, relleno verde bosque al hacer
  scroll; sin pills ni sombras. Marquee de anuncios arriba, editable desde Ajustes.
- Un solo botón primario (amarillo) por pantalla; el navbar no lleva ninguno.
- Hero de la home: la foto es el hero (a pantalla completa, detrás del navbar), el titular y las cards
  son etiquetas flotantes con pinta de botón que no lo son, y su único botón cambia de color con cada foto
  (excepción documentada en DESIGN.md). Todo se edita en «Contenido de home».
- Banner de ofertas (debajo de Novedades): foto a sangre, frase en bucle infinito y un botón lila.
  Foto, descripción, frase, texto del botón, producto al que lleva y visibilidad se editan en «Contenido de home».
- Eventos (debajo del banner de ofertas): cartel del próximo evento sobre franja lila y los siguientes en renglones; sin eventos, un mensaje editable. Eventos, mensaje y enlace se editan en «Contenido de home»; los eventos pasados se ocultan solos.
- Footer (en todas las páginas de la tienda): estructura del de Esencia Glow, verde bosque con «GIRA» rosa a todo el ancho, cuatro columnas (acordeón en móvil), créditos y redes fijas en código. Sin boletín.

