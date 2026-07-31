"use client";

import { cn } from "@/lib/cn";
import { Button } from "./Button";

interface PaginationProps {
  page: number;
  limit: number;
  total: number;
  onPageChange: (page: number) => void;
  className?: string;
}

const Pagination = ({ page, limit, total, onPageChange, className }: PaginationProps) => {
  const lastPage = Math.max(1, Math.ceil(total / limit));
  const start = total === 0 ? 0 : (page - 1) * limit + 1;
  const end = Math.min(page * limit, total);

  return (
    <div className={cn("mt-4 flex flex-wrap items-center gap-3", className)}>
      <p className="text-xs text-text-secondary">
        {total === 0 ? "Sin resultados" : `${start}–${end} de ${total}`}
      </p>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          Anterior
        </Button>
        <Button size="sm" variant="ghost" disabled={page >= lastPage} onClick={() => onPageChange(page + 1)}>
          Siguiente
        </Button>
      </div>
    </div>
  );
};

export type { PaginationProps };
export { Pagination };
