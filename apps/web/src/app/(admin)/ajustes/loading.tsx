import { PageHeader } from "@/components/ui/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";

/** Same geometry as the real page (two cards, then shipping), so nothing shifts when data lands. */
const AjustesLoading = () => (
  <div className="flex flex-col gap-6">
    <PageHeader title="Ajustes" />
    <div className="grid gap-5 lg:grid-cols-2">
      <Skeleton className="h-44 w-full" />
      <Skeleton className="h-44 w-full" />
      <Skeleton className="h-72 w-full lg:col-span-2" />
    </div>
  </div>
);

export default AjustesLoading;
