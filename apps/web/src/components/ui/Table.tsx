import type { ReactNode, TdHTMLAttributes, ThHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

interface TableProps {
  children: ReactNode;
  className?: string;
}

/** Its own overflow-x container — the page body never scrolls horizontally. */
const Table = ({ children, className }: TableProps) => (
  <div className="overflow-x-auto">
    <table className={cn("w-full border-collapse text-sm", className)}>{children}</table>
  </div>
);

const Thead = ({ children }: { children: ReactNode }) => (
  <thead className="bg-surface-raised">{children}</thead>
);

const Tbody = ({ children }: { children: ReactNode }) => <tbody>{children}</tbody>;

interface TrProps {
  children: ReactNode;
  /** A row mid-mutation: dimmed and inert until the request settles. */
  busy?: boolean;
  className?: string;
}

const Tr = ({ children, busy = false, className }: TrProps) => (
  <tr
    {...(busy ? { "data-busy": "true" } : {})}
    className={cn(
      "border-b border-border last:border-none hover:bg-surface-raised",
      busy && "pointer-events-none opacity-50",
      className,
    )}
  >
    {children}
  </tr>
);

const Th = ({ children, className, ...rest }: ThHTMLAttributes<HTMLTableCellElement>) => (
  <th
    className={cn(
      "whitespace-nowrap border-b-2 border-ink px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-text-secondary",
      className,
    )}
    {...rest}
  >
    {children}
  </th>
);

interface TdProps extends TdHTMLAttributes<HTMLTableCellElement> {
  numeric?: boolean;
  actions?: boolean;
}

const Td = ({ children, numeric = false, actions = false, className, ...rest }: TdProps) => (
  <td
    className={cn(
      "px-4 py-3 align-middle",
      numeric && "whitespace-nowrap text-right font-mono font-bold",
      actions && "whitespace-nowrap text-right",
      className,
    )}
    {...rest}
  >
    {children}
  </td>
);

export type { TableProps, TrProps, TdProps };
export { Table, Thead, Tbody, Tr, Th, Td };
