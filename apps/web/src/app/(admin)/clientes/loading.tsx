import { PageHeader } from "@/components/ui/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";

/** Same geometry as the real page (ranking header, podium, table), so nothing shifts when data lands. */
const ClientesLoading = () => (
  <div className="flex flex-col gap-6">
    <PageHeader title="Clientes" />
    <Skeleton className="h-24 w-full" />
    <div className="grid gap-4 md:grid-cols-3">
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-40 w-full" />
    </div>
    <Skeleton className="h-72 w-full" />
  </div>
);

export default ClientesLoading;
