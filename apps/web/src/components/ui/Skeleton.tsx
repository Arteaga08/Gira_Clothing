import { cn } from "@/lib/cn";
import { NB_SURFACE } from "./styles";

interface SkeletonProps {
  className?: string;
}

/**
 * The shimmer gradient references tokens (`var(--color-surface-*)`), never a
 * literal — it's an arbitrary Tailwind value, but it reads the same two
 * surface tokens every other component reads.
 */
const Skeleton = ({ className }: SkeletonProps) => (
  <div
    aria-hidden="true"
    className={cn(
      "h-3 animate-shimmer rounded-nb-pill bg-[length:200%_100%]",
      "bg-[linear-gradient(90deg,var(--color-surface-sunken)_0%,var(--color-surface-raised)_50%,var(--color-surface-sunken)_100%)]",
      "motion-reduce:animate-none motion-reduce:bg-surface-sunken",
      className,
    )}
  />
);

/** Row height matches the real table row (61px) so swapping skeleton for data shifts nothing — zero CLS. */
const SkeletonRows = ({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) => (
  <div>
    {Array.from({ length: rows }).map((_, rowIndex) => (
      <div
        key={rowIndex}
        className="flex min-h-[61px] items-center gap-3 border-t border-border px-6 py-3.5 first:border-t-0"
      >
        {Array.from({ length: cols }).map((_, colIndex) => (
          <Skeleton key={colIndex} className="h-3 flex-1" />
        ))}
      </div>
    ))}
  </div>
);

const SkeletonStatCard = () => (
  <div className={cn(NB_SURFACE, "p-6")}>
    <Skeleton className="h-3 w-20" />
    <Skeleton className="mt-3 h-6 w-24" />
  </div>
);

export type { SkeletonProps };
export { Skeleton, SkeletonRows, SkeletonStatCard };
