import { PageHeader } from "@/components/ui/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";

const ContenidoHomeLoading = () => (
  <div className="flex flex-col gap-6">
    <PageHeader title="Contenido de home" />
    <div className="grid gap-5 lg:grid-cols-2">
      <Skeleton className="h-44 w-full" />
    </div>
  </div>
);

export default ContenidoHomeLoading;
