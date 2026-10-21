import Link from "next/link";
import { Table, Tbody, Td, Th, Thead, Tr } from "@/components/ui/Table";
import { formatMxn } from "@/lib/coupons/money";
import { customerFullName, type PanelCustomer } from "@/lib/customers/panelCustomer";
import { formatShortDate } from "@/lib/format";

interface CustomerTableProps {
  items: PanelCustomer[];
}

/** One row per customer. The name is a link stretched over the whole row: one stop for the keyboard. */
const CustomerTable = ({ items }: CustomerTableProps) => (
  <Table>
    <Thead>
      <tr>
        <Th scope="col">Cliente</Th>
        <Th scope="col" className="hidden md:table-cell">
          Alta
        </Th>
        <Th scope="col" className="text-right">
          Compras
        </Th>
        <Th scope="col" className="text-right">
          Gasto neto
        </Th>
        <Th scope="col" className="hidden text-right md:table-cell">
          Último pedido
        </Th>
      </tr>
    </Thead>
    <Tbody>
      {items.map((customer) => (
        <Tr key={customer.id} className="relative cursor-pointer">
          <Td className="max-w-0 sm:max-w-none">
            <Link
              href={`/clientes/${customer.id}`}
              className="block max-w-full font-bold after:absolute after:inset-0 after:content-['']"
            >
              {customerFullName(customer)}
            </Link>
            <p className="max-w-[40ch] truncate font-mono text-xs text-text-muted">{customer.email}</p>
          </Td>
          <Td className="hidden whitespace-nowrap font-mono md:table-cell">
            {formatShortDate(new Date(customer.createdAt))}
          </Td>
          <Td className="text-right font-mono">{customer.orderCount}</Td>
          <Td className="whitespace-nowrap text-right font-mono">{formatMxn(customer.spentMxn)}</Td>
          <Td className="hidden whitespace-nowrap text-right font-mono md:table-cell">
            {customer.lastOrderAt ? formatShortDate(new Date(customer.lastOrderAt)) : "—"}
          </Td>
        </Tr>
      ))}
    </Tbody>
  </Table>
);

export type { CustomerTableProps };
export { CustomerTable };
