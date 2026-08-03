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

Claro, robusto, directo. Ya expresado en el sistema neobrutalista construido en M6-M8: bordes de
tinta de 2px, sombras duras (`shadow-nb`), cero gradientes, cero vidrio translúcido. La herramienta
se siente como una consola física bien construida: confiable, legible, sin decoración porque sí.

## Anti-references

La plantilla genérica de dashboard SaaS: glassmorphism suave, gradientes morado-a-azul, bordes
hairline de 1px casi invisibles, métricas hero con texto degradado. Todo esto ya se rechaza
explícitamente en las convenciones actuales (`NB_SURFACE` usa bordes duros y sombra sólida, nunca
paneles translúcidos).

## Design Principles

- Un solo lugar para el color: `tokens.css` es la única fuente, nunca colores inline (impuesto por
  `designTokens.test.ts`).
- Lo urgente sube arriba siempre: el patrón de "banda de atención" antes que cualquier KPI.
- Cero animación decorativa: feedback de estado sí, coreografía no.
- Un acento por pantalla, nunca más (regla de KPI acentuado).
- Cada estado se dibuja explícito (vacío, error, cero) — nunca un hueco silencioso que parezca un
  bug.

## Accessibility & Inclusion

WCAG AA como mínimo. Navegación completa por teclado con foco visible en cada pantalla (ya
verificado en M6-M8). `prefers-reduced-motion: reduce` respetado — sin transiciones en gráficas o
barras. Es una herramienta interna, no pública, pero el personal de operación puede incluir usuarios
de tecnología asistiva, así que el estándar aplica igual.
