import { PageHeader } from "@/components/ui/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";

/** Same geometry as the real page (filters island, grid of cards), so nothing shifts when data lands. */
const ProductosLoading = () => (
  <div className="flex flex-col gap-6">
    <PageHeader title="Productos" />
    <Skeleton className="h-20 w-full" />
    <div className="grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-[repeat(auto-fill,minmax(14rem,1fr))]">
      {Array.from({ length: 6 }, (_, index) => (
        <Skeleton key={index} className="aspect-[4/5] w-full" />
      ))}
    </div>
  </div>
);

export default ProductosLoading;
