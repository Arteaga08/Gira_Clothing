import Link from "next/link";
import { Table, Tbody, Td, Th, Thead, Tr } from "@/components/ui/Table";
import type { PanelAuditLog } from "@/lib/api/adminAudit";
import { ACTION_LABELS, ACTOR_LABELS, MODULE_LABELS } from "@/lib/audit/labels";
import { auditTarget } from "@/lib/audit/target";
import { formatShortDateTime } from "@/lib/format";

interface AuditTableProps {
  items: PanelAuditLog[];
  onOpen: (id: string) => void;
}

/**
 * One row per entry, newest first. The action is a button stretched over the
 * row (one keyboard stop, the whole row clickable); the target link sits above
 * it so it can still be followed on its own.
 */
const AuditTable = ({ items, onOpen }: AuditTableProps) => (
  <Table>
    <Thead>
      <tr>
        <Th scope="col">Fecha</Th>
        <Th scope="col">Acción</Th>
        <Th scope="col">Quién</Th>
        <Th scope="col" className="hidden md:table-cell">
          Módulo
        </Th>
        <Th scope="col" className="hidden md:table-cell">
          Objetivo
        </Th>
      </tr>
    </Thead>
    <Tbody>
      {items.map((entry) => {
        const target = auditTarget(entry);
        return (
          <Tr key={entry.id} className="relative cursor-pointer">
            <Td className="whitespace-nowrap font-mono text-xs">{formatShortDateTime(entry.createdAt)}</Td>
            <Td>
              <button
                type="button"
                onClick={() => onOpen(entry.id)}
                className="cursor-pointer text-left font-bold after:absolute after:inset-0 after:content-['']"
              >
                {ACTION_LABELS[entry.action]}
              </button>
              {entry.changes.length > 0 ? (
                <span className="block text-xs text-text-muted">
                  {entry.changes.length === 1 ? "1 cambio" : `${entry.changes.length} cambios`}
                </span>
              ) : null}
            </Td>
            <Td className="whitespace-nowrap text-sm">{ACTOR_LABELS[entry.actor]}</Td>
            <Td className="hidden whitespace-nowrap text-sm md:table-cell">{MODULE_LABELS[entry.module]}</Td>
            <Td className="hidden md:table-cell">
              {target ? (
                <Link href={target.href} className="relative z-10 text-sm underline underline-offset-2">
                  {target.label}
                </Link>
              ) : (
                <span className="text-sm text-text-muted">—</span>
              )}
            </Td>
          </Tr>
        );
      })}
    </Tbody>
  </Table>
);

export type { AuditTableProps };
export { AuditTable };
