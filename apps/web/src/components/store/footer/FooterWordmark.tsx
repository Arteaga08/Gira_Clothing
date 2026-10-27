/**
 * GIRA across the whole width. SVG text stretched to the box with
 * `textLength`, so it fills edge to edge at every width without measuring the
 * font; the font size is picked so Anton's own width is close to 1000 units
 * and the stretch stays slight. Anton's caps rise about 0.88em, so the box is
 * 456 tall with the baseline at 450 (room for the ink stroke) and nothing
 * spills past the section. Capped at max-w-3xl and centred. Decorative: the navbar logo already carries
 * the brand's accessible name.
 */
const FooterWordmark = () => (
  <svg
    viewBox="0 0 1000 456"
    aria-hidden="true"
    focusable="false"
    className="mx-auto block h-auto w-full max-w-3xl select-none text-accent"
  >
    <text
      x="0"
      y="450"
      textLength="1000"
      lengthAdjust="spacingAndGlyphs"
      fill="currentColor"
      stroke="var(--color-ink)"
      strokeWidth="6"
      paintOrder="stroke"
      fontSize="500"
      className="font-display uppercase"
    >
      Gira
    </text>
  </svg>
);

export { FooterWordmark };
