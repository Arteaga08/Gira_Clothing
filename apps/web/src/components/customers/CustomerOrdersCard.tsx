import { ReceiptIcon } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Notice } from "@/components/ui/Notice";
import { Skeleton } from "@/components/ui/Skeleton";
import { StatusChip } from "@/components/ui/StatusChip";
import { NB_SURFACE } from "@/components/ui/styles";
import { T_PANEL_TITLE } from "@/components/ui/typography";
import { Table, Tbody, Td, Th, Thead, Tr } from "@/components/ui/Table";
import type { Section } from "@/hooks/useCustomerDetail";
import { formatShortDate } from "@/lib/format";
import { formatMoney } from "@/lib/orders/money";
import type { PanelOrder } from "@/lib/orders/panelOrder";

interface CustomerOrdersCardProps {
  state: Section<PanelOrder[]>;
  onRetry: () => void;
}

const SKELETON_ROWS = 3;

/** The customer's most recent orders. It can fail on its own while the rest of the page stands. */
const CustomerOrdersCard = ({ state, onRetry }: CustomerOrdersCardProps) => (
  <section className={`${NB_SURFACE} flex flex-col gap-4 p-5`} aria-label="Pedidos">
    <div>
      <h2 className={T_PANEL_TITLE}>Pedidos</h2>
      <p className="text-sm text-text-muted">Los más recientes, del más nuevo al más antiguo.</p>
    </div>

    {state.status === "error" ? (
      <Notice variant="danger" title="No se pudieron cargar los pedidos">
        <p>{state.error}</p>
        <Button variant="positive" size="sm" className="mt-2" onClick={onRetry}>
          Reintentar
        </Button>
      </Notice>
    ) : state.status === "loading" ? (
      <div className="flex flex-col gap-3" aria-busy="true">
        {Array.from({ length: SKELETON_ROWS }, (_, index) => (
          <Skeleton key={index} className="h-10 w-full" />
        ))}
      </div>
    ) : (state.data ?? []).length === 0 ? (
      <EmptyState icon={ReceiptIcon} title="Sin pedidos" description="Este cliente todavía no ha comprado nada." />
    ) : (
      <div className="overflow-hidden rounded-nb-sm border-2 border-ink">
        <Table>
          <Thead>
            <tr>
              <Th scope="col">Folio</Th>
              <Th scope="col">Fecha</Th>
              <Th scope="col">Estado</Th>
              <Th scope="col" className="text-right">
                Total
              </Th>
            </tr>
          </Thead>
          <Tbody>
            {(state.data ?? []).map((order) => (
              <Tr key={order.id}>
                <Td className="font-mono font-bold">
                  <Link href={`/pedidos/${order.id}`} className="underline-offset-2 hover:underline">
                    {order.orderNumber}
                  </Link>
                </Td>
                <Td className="whitespace-nowrap font-mono">{formatShortDate(new Date(order.createdAt))}</Td>
                <Td>
                  <StatusChip status={order.status} />
                </Td>
                <Td className="whitespace-nowrap text-right font-mono">{formatMoney(order.total, order.currency)}</Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      </div>
    )}
  </section>
);

export type { CustomerOrdersCardProps };
export { CustomerOrdersCard };
