const SEGMENTS = 24;
const WIDTH = 1200;
const STEP = WIDTH / SEGMENTS;

const buildCrest = (): string => {
  let d = `M0 14`;
  for (let i = 0; i < SEGMENTS; i += 1) {
    const x = i * STEP;
    d += ` Q${x + STEP / 4} -1 ${x + STEP / 2} 7 T${x + STEP} 14`;
  }
  return d;
};

const CREST = buildCrest();

interface WaveEdgeProps {
  /** CSS colour value the area under the crest is filled with (a category token). */
  fill: string;
  className?: string;
}

/**
 * Wavy top edge for a band or a label: the crest is drawn in ink and the body
 * under it takes the band colour, so the band reads as one cut-out shape.
 */
const WaveEdge = ({ fill, className }: WaveEdgeProps) => (
  <svg
    viewBox={`0 0 ${WIDTH} 18`}
    preserveAspectRatio="none"
    aria-hidden="true"
    className={className}
  >
    <path d={`${CREST} L${WIDTH} 18 L0 18Z`} fill={fill} />
    <path
      d={CREST}
      fill="none"
      stroke="var(--color-ink)"
      strokeWidth="2"
      vectorEffect="non-scaling-stroke"
    />
  </svg>
);

export { WaveEdge };
