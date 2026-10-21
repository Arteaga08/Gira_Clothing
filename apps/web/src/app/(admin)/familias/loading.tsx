import { PageHeader } from "@/components/ui/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";

/** Same geometry as the real page (filters island, table), so nothing shifts when data lands. */
const FamiliasLoading = () => (
  <div className="flex flex-col gap-6">
    <PageHeader title="Familias" />
    <Skeleton className="h-20 w-full" />
    <Skeleton className="h-72 w-full" />
  </div>
);

export default FamiliasLoading;
