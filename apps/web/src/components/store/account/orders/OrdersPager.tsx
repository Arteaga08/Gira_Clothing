"use client";

import { useRouter } from "next/navigation";
import { Pagination } from "@/components/ui/Pagination";
import { STORE_ROUTES } from "@/lib/store/routes";

/** Page buttons of the list: the page number lives in the URL (`?pagina=`) so Back and reloads keep it. */
const OrdersPager = ({ page, limit, total }: { page: number; limit: number; total: number }) => {
  const router = useRouter();
  return (
    <Pagination
      page={page}
      limit={limit}
      total={total}
      onPageChange={(next) => router.push(next <= 1 ? STORE_ROUTES.orders : `${STORE_ROUTES.orders}?pagina=${String(next)}`)}
    />
  );
};

export { OrdersPager };
