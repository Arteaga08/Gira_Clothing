import { PageHeader } from "@/components/ui/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";

/** Same geometry as the real page (profile tile, orders), so nothing shifts when data lands. */
const ClienteLoading = () => (
  <div className="flex flex-col gap-6">
    <PageHeader title="Cliente" />
    <div className="grid gap-5 lg:grid-cols-[340px_1fr]">
      <Skeleton className="h-72 w-full" />
      <Skeleton className="h-72 w-full" />
    </div>
  </div>
);

export default ClienteLoading;
