/**
 * Semantic type recipes, in ONE place — same pattern as NB_SURFACE /
 * NB_PRESSABLE in ./styles.ts. A component never picks a font size or weight
 * directly; it picks a role, and the role resolves to a class string. A typo
 * here is a compile error; a typo in a raw `className="tex-2xl"` renders
 * with no warning at all, which is exactly how the old h1 drifted into three
 * different treatments across PageHeader, resumen/loading.tsx and login.
 *
 * Three families, three jobs (see tokens.css SWAP POINT #2): Anton is
 * EXCLUSIVE to titles and always uppercase — it has one weight (400), so a
 * recipe here never adds `font-bold` on top of it, that would ask the
 * browser to synthesize a fake bold and smudge the strokes. Space Grotesk
 * carries everything read. Space Mono carries everything counted.
 *
 * Titles sit directly on --color-wallpaper (verde bosque, the dominant page
 * background) in every screen this app has today, so the *_TITLE recipes
 * bake in `text-text-inverse` rather than leaving color to inheritance —
 * PANEL_TITLE is the one exception, because a panel's header is itself a
 * light surface (NB_SURFACE resets to text-primary there).
 *
 * Two densities: CONSOLE is what this app runs today. STORE is reserved for
 * the Bloque 3 storefront — same roles, one step up, never mixed with
 * console recipes on the same screen.
 */

/** `<h1>` of a page. Always on the green wallpaper, never inside a card. */
const T_PAGE_TITLE =
  "font-display font-normal uppercase text-2xl leading-[1.05] tracking-[0.01em] text-text-inverse";

/** Directly under T_PAGE_TITLE. */
const T_PAGE_SUBTITLE = "mt-1 text-sm text-text-inverse-secondary";

/** `<h2>` outside a panel — e.g. a standalone section heading on the wallpaper. */
const T_SECTION_TITLE =
  "font-display font-normal uppercase text-xl leading-[1.1] tracking-[0.01em] text-text-inverse";

/** `<h3>` / panel header title. The panel itself is a light surface, so this inherits ink. */
const T_PANEL_TITLE = "font-display font-normal uppercase text-lg leading-[1.2] tracking-[0.01em]";

/** The small "Gira" brand lockup — sidebar wordmark, login's card heading. Always on a light surface, so it inherits ink; never sized like a page title, it isn't one. */
const T_BRAND_LOCKUP = "font-display text-lg font-normal uppercase tracking-[0.01em]";

/** Subtitle under a panel title. */
const T_PANEL_HINT = "text-2xs text-text-muted";

/** Field labels, StatCard labels, `<Th>` — always mono, always uppercase. */
const T_LABEL = "font-mono text-2xs font-bold uppercase tracking-wide";

/** Prose. Caps at 65–75ch where it wraps. */
const T_BODY = "text-base leading-relaxed";
const T_BODY_SM = "text-sm leading-relaxed";

/** Pied de foto, ayuda, texto secundario pequeño. */
const T_CAPTION = "text-2xs text-text-muted";

/** KPI number on a StatCard. */
const T_METRIC = "font-mono text-xl font-bold tracking-tight lg:text-2xl";

/** Number on a compact MetricTile (AttentionBand / OutboxHealthPanel). */
const T_METRIC_SM = "font-mono text-lg font-bold leading-none";

/** Money / SKU / unit counts inside a table or list row — the Numbers-Are-Mono rule. */
const T_DATA = "font-mono text-sm font-bold";

/**
 * Reserved for the Bloque 3 storefront. Named now so the console and store
 * ladders never collide once the storefront exists; not consumed yet.
 */
const T_HERO = "font-display font-normal uppercase text-3xl leading-[0.95] tracking-[0.01em]";
const T_PRODUCT_TITLE = "font-display font-normal uppercase text-xl leading-[1.1] tracking-[0.01em]";
/** Rosa chicle fails AA at body size (3.1:1 on hueso) — a price MUST stay ≥18px/700 to clear the 3:1 large-text floor. */
const T_PRICE = "font-sans text-lg font-bold text-accent";

export {
  T_PAGE_TITLE,
  T_PAGE_SUBTITLE,
  T_SECTION_TITLE,
  T_PANEL_TITLE,
  T_BRAND_LOCKUP,
  T_PANEL_HINT,
  T_LABEL,
  T_BODY,
  T_BODY_SM,
  T_CAPTION,
  T_METRIC,
  T_METRIC_SM,
  T_DATA,
  T_HERO,
  T_PRODUCT_TITLE,
  T_PRICE,
};
