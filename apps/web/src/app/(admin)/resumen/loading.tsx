import { Skeleton, SkeletonRows, SkeletonStatCard } from "@/components/ui/Skeleton";
import { NB_SURFACE } from "@/components/ui/styles";
import { T_PAGE_TITLE } from "@/components/ui/typography";
import { cn } from "@/lib/cn";

/**
 * Mirrors the real page's geometry exactly — same heights, same grid — so
 * swapping this for data shifts nothing (zero CLS). `page.tsx` has no
 * internal Suspense boundary, so this replaces the whole screen while the
 * three fetches are in flight, header included.
 *
 * The h1 renders T_PAGE_TITLE directly instead of importing PageHeader: this
 * file needs a Skeleton, not a real subtitle string, so it composes the same
 * recipe rather than the whole component — but the recipe is the single
 * source, never a re-typed class string.
 */
const ResumenLoading = () => (
  <div className="flex flex-col gap-10">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className={T_PAGE_TITLE}>Resumen</h1>
        <Skeleton className="mt-2 h-4 w-64" />
      </div>
      <Skeleton className="h-10 w-40" />
    </div>

    <div className={cn(NB_SURFACE, "shadow-nb-lg")}>
      <div className="border-b-2 border-ink px-6 py-4">
        <Skeleton className="h-4 w-40" />
      </div>
      <div className="grid grid-cols-2 gap-3 p-6 md:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="rounded-nb-sm border-2 border-ink p-3">
            <Skeleton className="h-6 w-10" />
            <Skeleton className="mt-2 h-3 w-full" />
          </div>
        ))}
      </div>
    </div>

    <div className="grid grid-cols-2 gap-6 xl:grid-cols-3">
      {Array.from({ length: 3 }, (_, index) => (
        <SkeletonStatCard key={index} />
      ))}
    </div>

    <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <div className={NB_SURFACE}>
        <div className="border-b-2 border-ink px-6 py-4">
          <Skeleton className="h-4 w-32" />
        </div>
        <div className="p-6">
          <Skeleton className="h-44 w-full lg:h-52" />
        </div>
      </div>
      <div className={NB_SURFACE}>
        <div className="border-b-2 border-ink px-6 py-4">
          <Skeleton className="h-4 w-24" />
        </div>
        <SkeletonRows rows={5} cols={2} />
      </div>
      <div className={NB_SURFACE}>
        <div className="border-b-2 border-ink px-6 py-4">
          <Skeleton className="h-4 w-48" />
        </div>
        <div className="p-6">
          <Skeleton className="h-8.5 w-full" />
        </div>
      </div>
      <div className={NB_SURFACE}>
        <div className="border-b-2 border-ink px-6 py-4">
          <Skeleton className="h-4 w-28" />
        </div>
        <SkeletonRows rows={5} cols={2} />
      </div>
    </div>

    <div className="grid gap-6 md:grid-cols-2">
      <div className={NB_SURFACE}>
        <div className="border-b-2 border-ink px-6 py-4">
          <Skeleton className="h-4 w-32" />
        </div>
        <SkeletonRows rows={5} cols={2} />
      </div>
      <div className={NB_SURFACE}>
        <div className="border-b-2 border-ink px-6 py-4">
          <Skeleton className="h-4 w-52" />
        </div>
        <div className="grid grid-cols-3 gap-3 p-6">
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="rounded-nb-sm border-2 border-ink p-3">
              <Skeleton className="h-6 w-10" />
              <Skeleton className="mt-2 h-3 w-16" />
            </div>
          ))}
        </div>
      </div>
    </div>
  </div>
);

export default ResumenLoading;
