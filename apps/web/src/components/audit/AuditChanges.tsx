import type { AuditChange } from "@gira/shared";
import { Table, Tbody, Td, Th, Thead, Tr } from "@/components/ui/Table";
import { formatChangeValue } from "@/lib/audit/changes";
import { fieldLabel } from "@/lib/audit/labels";

interface AuditChangesProps {
  changes: AuditChange[];
}

/**
 * Before → after of the fields the API lets through. A protected field (the
 * shipping origin: phone, email, address) only says that it changed.
 */
const AuditChanges = ({ changes }: AuditChangesProps) =>
  changes.length === 0 ? (
    <p className="text-sm text-text-muted">Este registro no guarda cambios que mostrar.</p>
  ) : (
    <div className="overflow-hidden rounded-nb border-2 border-ink">
      <Table>
        <Thead>
          <tr>
            <Th scope="col">Campo</Th>
            <Th scope="col">Antes</Th>
            <Th scope="col">Después</Th>
          </tr>
        </Thead>
        <Tbody>
          {changes.map((change) => (
            <Tr key={change.field}>
              <Td className="text-sm font-bold">{fieldLabel(change.field)}</Td>
              {change.redacted ? (
                <Td colSpan={2} className="text-sm text-text-secondary">
                  Modificado · datos protegidos
                </Td>
              ) : (
                <>
                  <Td className="font-mono text-sm text-text-secondary">{formatChangeValue(change.field, change.before)}</Td>
                  <Td className="font-mono text-sm font-bold">{formatChangeValue(change.field, change.after)}</Td>
                </>
              )}
            </Tr>
          ))}
        </Tbody>
      </Table>
    </div>
  );

export type { AuditChangesProps };
export { AuditChanges };
