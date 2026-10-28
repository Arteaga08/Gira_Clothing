import Link from "next/link";
import { Package } from "@phosphor-icons/react/dist/ssr";
import { buttonClassName } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { STORE_ROUTES } from "@/lib/store/routes";

/** The customer has not bought yet: explains where their orders will show up and sends them to the shop. */
const EmptyOrders = ({ description = "Cuando hagas tu primer pedido lo verás aquí, con su seguimiento." }: { description?: string }) => (
  <EmptyState
    icon={Package}
    title="Todavía no has comprado"
    description={description}
    action={
      <Link href={STORE_ROUTES.shop} className={buttonClassName("primary")}>
        Ir a la tienda
      </Link>
    }
  />
);

export { EmptyOrders };
