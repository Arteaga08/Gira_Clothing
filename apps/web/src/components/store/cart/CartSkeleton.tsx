import { Skeleton } from "@/components/ui/Skeleton";

/**
 * Placeholder with the shape of two cart lines while the cart is read. Only one of the two on screen announces
 * itself (`announce`): the one on the stub is decoration, or a screen reader would say «cargando» twice.
 */
const CartSkeleton = ({ announce = true }: { announce?: boolean }) => (
  <div {...(announce ? { role: "status", "aria-label": "Cargando tu carrito" } : { "aria-hidden": true })} className="grid gap-5">
    {[0, 1].map((n) => (
      <div key={n} className="flex gap-4">
        <Skeleton className="size-20! shrink-0 rounded-nb-sm!" />
        <div className="grid flex-1 content-start gap-2">
          <Skeleton className="h-4! w-2/3" />
          <Skeleton className="h-3 w-1/3" />
          <Skeleton className="mt-2 h-9! w-32 rounded-nb-sm!" />
        </div>
      </div>
    ))}
  </div>
);

export { CartSkeleton };
