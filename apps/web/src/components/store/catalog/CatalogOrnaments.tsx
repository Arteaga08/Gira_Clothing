interface OrnamentProps {
  className?: string;
  /** Fill colour as a CSS value (a token variable); ink when omitted. */
  fill?: string;
}

const SPARKLE_PATH = "M12 0C13 8 16 11 24 12C16 13 13 16 12 24C11 16 8 13 0 12C8 11 11 8 12 0Z";

/** Four-point sparkle; a coloured one carries an ink outline so it reads on a photo. */
const Sparkle = ({ className, fill }: OrnamentProps) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
    <path
      d={SPARKLE_PATH}
      fill={fill ?? "var(--color-ink)"}
      stroke={fill ? "var(--color-ink)" : "none"}
      strokeWidth="1.5"
      strokeLinejoin="round"
    />
  </svg>
);

/** Hand-drawn wave line, ink. */
const Squiggle = ({ className }: OrnamentProps) => (
  <svg viewBox="0 0 160 24" aria-hidden="true" className={className}>
    <path
      d="M4 12q10-14 20 0t20 0 20 0 20 0 20 0 20 0 20 0 20 0"
      fill="none"
      stroke="var(--color-ink)"
      strokeWidth="3.5"
      strokeLinecap="round"
    />
  </svg>
);

/** Three crossing strokes, ink. */
const Asterisk = ({ className }: OrnamentProps) => (
  <svg viewBox="0 0 40 40" aria-hidden="true" className={className}>
    <path d="M20 4v32M6 12l28 16M34 12L6 28" fill="none" stroke="var(--color-ink)" strokeWidth="5" strokeLinecap="round" />
  </svg>
);

/** Round seal with the brand running along its edge; the page turns it slowly (`.catalog-sticker`). */
const RoundSticker = ({ className, fill }: OrnamentProps) => (
  <svg viewBox="0 0 120 120" aria-hidden="true" className={className}>
    <circle cx="60" cy="60" r="58" fill={fill ?? "var(--color-accent)"} stroke="var(--color-ink)" strokeWidth="2.5" />
    <defs>
      <path id="catalog-sticker-ring" d="M60,60 m-43,0 a43,43 0 1,1 86,0 a43,43 0 1,1 -86,0" />
    </defs>
    <text className="fill-ink font-mono text-[11px] font-bold" letterSpacing="1">
      <textPath href="#catalog-sticker-ring" textLength="262" lengthAdjust="spacing">
        GIRA CLOTHING · ESTAMPAS ·{" "}
      </textPath>
    </text>
    <path transform="translate(40 40) scale(1.7)" d={SPARKLE_PATH} fill="var(--color-ink)" />
  </svg>
);

export type { OrnamentProps };
export { Sparkle, Squiggle, Asterisk, RoundSticker };
