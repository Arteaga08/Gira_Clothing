import { PageHeader } from "@/components/ui/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";

/** Same geometry as the editor (three islands), so nothing shifts when data lands. */
const EditarProductoLoading = () => (
  <div className="flex flex-col gap-6">
    <PageHeader title="Editar producto" />
    <Skeleton className="h-96 w-full" />
    <Skeleton className="h-72 w-full" />
    <Skeleton className="h-56 w-full" />
  </div>
);

export default EditarProductoLoading;
