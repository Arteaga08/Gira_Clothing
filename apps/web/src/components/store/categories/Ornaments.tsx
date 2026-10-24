interface OrnamentProps {
  className?: string;
}

/** Eight-point star, the stamp motif of the brand. Ink fill. */
const Star = ({ className }: OrnamentProps) => (
  <svg viewBox="0 0 100 100" aria-hidden="true" className={className}>
    <path
      d="M50 2 59 33 85 15 67 41 98 50 67 59 85 85 59 67 50 98 41 67 15 85 33 59 2 50 33 41 15 15 41 33Z"
      fill="var(--color-ink)"
    />
  </svg>
);

/** Five-petal flower with a hueso centre. */
const Flower = ({ className }: OrnamentProps) => (
  <svg viewBox="0 0 100 100" aria-hidden="true" className={className}>
    <g fill="var(--color-ink)">
      <circle cx="50" cy="22" r="19" />
      <circle cx="76" cy="41" r="19" />
      <circle cx="66" cy="72" r="19" />
      <circle cx="34" cy="72" r="19" />
      <circle cx="24" cy="41" r="19" />
    </g>
    <circle cx="50" cy="50" r="12" fill="var(--blanco-hueso)" />
  </svg>
);

export { Star, Flower };
