import { Skeleton, SkeletonRows, SkeletonStatCard } from "@/components/ui/Skeleton";

/**
 * Mirrors the real page's geometry exactly — same heights, same grid — so
 * swapping this for data shifts nothing (zero CLS). `page.tsx` has no
 * internal Suspense boundary, so this replaces the whole screen while the
 * three fetches are in flight, header included.
 */
const ResumenLoading = () => (
  <div className="flex flex-col gap-4">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold">Resumen</h1>
        <Skeleton className="mt-2 h-4 w-64" />
      </div>
      <Skeleton className="h-9 w-40" />
    </div>

    <div className="rounded-nb border-2 border-ink bg-surface shadow-nb-lg">
      <div className="border-b-2 border-ink px-4 py-3">
        <Skeleton className="h-4 w-40" />
      </div>
      <div className="grid grid-cols-2 gap-3 p-4 md:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="rounded-nb-sm border-2 border-ink p-3">
            <Skeleton className="h-6 w-10" />
            <Skeleton className="mt-2 h-3 w-full" />
          </div>
        ))}
      </div>
    </div>

    <div className="grid grid-cols-2 gap-3 xl:grid-cols-3 xl:gap-4">
      {Array.from({ length: 3 }, (_, index) => (
        <SkeletonStatCard key={index} />
      ))}
    </div>

    <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <div className="rounded-nb border-2 border-ink bg-surface shadow-nb">
        <div className="border-b-2 border-ink px-4 py-3">
          <Skeleton className="h-4 w-32" />
        </div>
        <div className="p-4">
          <Skeleton className="h-44 w-full lg:h-52" />
        </div>
      </div>
      <div className="rounded-nb border-2 border-ink bg-surface shadow-nb">
        <div className="border-b-2 border-ink px-4 py-3">
          <Skeleton className="h-4 w-24" />
        </div>
        <SkeletonRows rows={5} cols={2} />
      </div>
      <div className="rounded-nb border-2 border-ink bg-surface shadow-nb">
        <div className="border-b-2 border-ink px-4 py-3">
          <Skeleton className="h-4 w-48" />
        </div>
        <div className="p-4">
          <Skeleton className="h-[34px] w-full" />
        </div>
      </div>
      <div className="rounded-nb border-2 border-ink bg-surface shadow-nb">
        <div className="border-b-2 border-ink px-4 py-3">
          <Skeleton className="h-4 w-28" />
        </div>
        <SkeletonRows rows={5} cols={2} />
      </div>
    </div>

    <div className="grid gap-4 md:grid-cols-2">
      <div className="rounded-nb border-2 border-ink bg-surface shadow-nb">
        <div className="border-b-2 border-ink px-4 py-3">
          <Skeleton className="h-4 w-32" />
        </div>
        <SkeletonRows rows={5} cols={2} />
      </div>
      <div className="rounded-nb border-2 border-ink bg-surface shadow-nb">
        <div className="border-b-2 border-ink px-4 py-3">
          <Skeleton className="h-4 w-52" />
        </div>
        <div className="grid grid-cols-3 gap-3 p-4">
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
