import { PageHeader } from "@/components/ui/PageHeader";
import { Skeleton, SkeletonRows } from "@/components/ui/Skeleton";

/** Same geometry as the real page (tabs row, filters row, category islands), so nothing shifts when data lands. */
const InventarioLoading = () => (
  <div className="flex flex-col gap-6">
    <PageHeader title="Inventario" />
    <div className="flex gap-2">
      {Array.from({ length: 4 }, (_, index) => (
        <Skeleton key={index} className="h-9 w-28" />
      ))}
    </div>
    <Skeleton className="h-16 w-full" />
    <div className="rounded-nb border-2 border-ink bg-surface text-text-primary shadow-nb">
      <SkeletonRows rows={5} cols={3} />
    </div>
  </div>
);

export default InventarioLoading;
