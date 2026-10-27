/**
 * Stickers stuck over the right of the bone sheet, where the text never
 * reaches (the sheet keeps room for them from md up): a round «¡Nos vemos!»
 * badge, a star and a flower, each a flat fill with an ink edge, tilted like
 * hand-placed vinyl. Decorative only. On a phone only the badge stays, small
 * and over the corner, so nothing covers the text.
 */
const EventStickers = () => (
  <div aria-hidden="true" className="pointer-events-none absolute inset-0">
    <svg viewBox="0 0 120 120" className="absolute -right-2 -top-6 size-24 rotate-12 md:-right-6 md:-top-8 md:size-36">
      <circle cx="60" cy="60" r="56" fill="var(--color-accent)" stroke="var(--color-ink)" strokeWidth="4" />
      <circle cx="60" cy="60" r="46" fill="none" stroke="var(--color-ink)" strokeWidth="2" strokeDasharray="3 5" />
      <text
        x="60"
        y="54"
        textAnchor="middle"
        fontSize="26"
        fill="var(--color-ink)"
        className="font-display uppercase"
      >
        ¡Nos
      </text>
      <text
        x="60"
        y="82"
        textAnchor="middle"
        fontSize="26"
        fill="var(--color-ink)"
        className="font-display uppercase"
      >
        vemos!
      </text>
    </svg>
    <svg viewBox="0 0 100 100" className="absolute -bottom-5 right-6 hidden size-24 -rotate-12 md:block">
      <path
        d="M50 2 59 33 85 15 67 41 98 50 67 59 85 85 59 67 50 98 41 67 15 85 33 59 2 50 33 41 15 15 41 33Z"
        fill="var(--color-brand-subtle)"
        stroke="var(--color-ink)"
        strokeWidth="4"
        strokeLinejoin="round"
      />
    </svg>
    <svg viewBox="0 0 100 100" className="absolute right-10 top-[44%] hidden size-20 rotate-6 md:block">
      <g fill="var(--color-tile-alt)" stroke="var(--color-ink)" strokeWidth="4">
        <circle cx="50" cy="22" r="19" />
        <circle cx="76" cy="41" r="19" />
        <circle cx="66" cy="72" r="19" />
        <circle cx="34" cy="72" r="19" />
        <circle cx="24" cy="41" r="19" />
      </g>
      <circle cx="50" cy="50" r="13" fill="var(--color-surface)" stroke="var(--color-ink)" strokeWidth="4" />
    </svg>
  </div>
);

export { EventStickers };
