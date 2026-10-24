import { Badge } from "@/components/ui/Badge";
import { Table, Tbody, Td, Th, Thead, Tr } from "@/components/ui/Table";
import { cn } from "@/lib/cn";
import { CATEGORY_TONE } from "@/lib/store/categoryColors";
import { formatShortDate } from "@/lib/format";
import type { TaxonConfig } from "@/lib/taxonomy/config";
import type { PanelTaxon } from "@/lib/taxonomy/panelTaxon";

interface TaxonTableProps {
  config: TaxonConfig;
  items: PanelTaxon[];
  onOpen: (id: string) => void;
}

const capitalize = (value: string): string => value.charAt(0).toUpperCase() + value.slice(1);

/**
 * One row per family / category. The name is a button stretched over the whole
 * row, so the row opens the modal with the mouse and is one stop for the
 * keyboard. A retired record is greyed and flagged, never hidden: the "Estado"
 * filter decides what is listed.
 */
const TaxonTable = ({ config, items, onOpen }: TaxonTableProps) => (
  <Table>
    <Thead>
      <tr>
        <Th scope="col">{capitalize(config.singular)}</Th>
        <Th scope="col">{capitalize(config.child.plural)}</Th>
        <Th scope="col" className="hidden sm:table-cell">
          Actualizada
        </Th>
        <Th scope="col">Estado</Th>
      </tr>
    </Thead>
    <Tbody>
      {items.map((item) => (
        <Tr key={item.id} className={cn("relative cursor-pointer", !item.isActive && "text-text-muted")}>
          <Td className="max-w-0 sm:max-w-none">
            <button
              type="button"
              aria-label={`${item.name}, ${config.child.activeCount(item.activeChildCount)} de ${item.childCount}`}
              onClick={() => onOpen(item.id)}
              className="block max-w-full cursor-pointer text-left text-base font-bold after:absolute after:inset-0 after:content-['']"
            >
              {item.color ? (
                <span aria-hidden className={cn("mr-2 inline-block size-3 rounded-full border-2 border-ink align-middle", CATEGORY_TONE[item.color].strong)} />
              ) : null}
              {item.name}
            </button>
            {item.description ? <p className="max-w-[46ch] truncate text-sm text-text-muted">{item.description}</p> : null}
          </Td>
          <Td className="whitespace-nowrap font-mono">
            {item.activeChildCount} de {item.childCount}
          </Td>
          <Td className="hidden whitespace-nowrap font-mono text-sm sm:table-cell">
            {formatShortDate(new Date(item.updatedAt))}
          </Td>
          <Td>
            <Badge variant={item.isActive ? "ok" : "neutral"}>{item.isActive ? "Activa" : "Retirada"}</Badge>
          </Td>
        </Tr>
      ))}
    </Tbody>
  </Table>
);

export type { TaxonTableProps };
export { TaxonTable };
