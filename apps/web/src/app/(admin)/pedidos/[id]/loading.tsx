import { PageHeader } from "@/components/ui/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { NB_SURFACE } from "@/components/ui/styles";

/** Same width and block rhythm as the detail card, so the swap shifts nothing. */
const PedidoLoading = () => (
  <div className="flex flex-col gap-6">
    <PageHeader title="Pedido" />
    <div className={`${NB_SURFACE} mx-auto flex w-full max-w-[820px] flex-col gap-6 p-6`}>
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  </div>
);

export default PedidoLoading;
