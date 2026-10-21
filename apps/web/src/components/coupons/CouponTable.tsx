import { CouponDiscountType, CouponKind, CouponStatus } from "@gira/shared";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Table, Tbody, Td, Th, Thead, Tr } from "@/components/ui/Table";
import { cn } from "@/lib/cn";
import { formatMxDate } from "@/lib/coupons/dates";
import { formatMxn } from "@/lib/coupons/money";
import type { PanelCoupon } from "@/lib/coupons/panelCoupon";
import { COUPON_STATUS_LABELS, COUPON_STATUS_VARIANTS } from "@/lib/coupons/status";

interface CouponTableProps {
  items: PanelCoupon[];
  onOpen: (id: string) => void;
}

const discountLabel = (coupon: PanelCoupon): string =>
  coupon.discountType === CouponDiscountType.PERCENT
    ? `${coupon.percentOff ?? 0}%`
    : formatMxn(coupon.amountOffMxn ?? 0);

/** How full the cap is, drawn as a bar. Unlimited coupons have no bar: there is nothing to fill. */
const RedemptionMeter = ({ used, max }: { used: number; max: number }) => {
  const full = used >= max;
  return (
    <span
      aria-hidden="true"
      className="mt-1 block h-2 w-full min-w-20 overflow-hidden rounded-nb-pill border-[1.5px] border-ink bg-surface-sunken"
    >
      <span
        className={cn("block h-full", full ? "bg-ink" : "bg-brand")}
        style={{ width: `${Math.min(100, Math.round((used / max) * 100))}%` }}
      />
    </span>
  );
};

/**
 * One row per coupon. The code is a button stretched over the whole row, so the
 * row opens the modal with the mouse and is one stop for the keyboard. An
 * expired or retired coupon is greyed, never hidden: the "Estado" filter decides
 * what is listed.
 */
const CouponTable = ({ items, onOpen }: CouponTableProps) => (
  <Table>
    <Thead>
      <tr>
        <Th scope="col">Cupón</Th>
        <Th scope="col">Descuento</Th>
        <Th scope="col" className="hidden md:table-cell">
          Compra mín.
        </Th>
        <Th scope="col" className="hidden md:table-cell">
          Vigencia
        </Th>
        <Th scope="col">Canjes</Th>
        <Th scope="col">Estado</Th>
      </tr>
    </Thead>
    <Tbody>
      {items.map((coupon) => {
        const dim = coupon.status === CouponStatus.EXPIRED || coupon.status === CouponStatus.RETIRED;
        return (
          <Tr key={coupon.id} className={cn("relative cursor-pointer", dim && "text-text-muted")}>
            <Td className="max-w-0 sm:max-w-none">
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <button
                  type="button"
                  aria-label={`${coupon.code}, ${coupon.name}`}
                  onClick={() => onOpen(coupon.id)}
                  className="block max-w-full cursor-pointer text-left font-mono text-base font-bold tracking-wide after:absolute after:inset-0 after:content-['']"
                >
                  {coupon.code}
                </button>
                {coupon.kind === CouponKind.PERSONAL ? <Badge variant="neutral">Personal</Badge> : null}
              </span>
              {coupon.assignedCustomer ? (
                <Link
                  href={`/clientes/${coupon.assignedCustomer.id}`}
                  className="relative z-10 text-sm underline underline-offset-2"
                >
                  {`${coupon.assignedCustomer.firstName} ${coupon.assignedCustomer.lastName}`}
                </Link>
              ) : (
                <p className="max-w-[40ch] truncate text-sm text-text-muted">{coupon.name}</p>
              )}
            </Td>
            <Td className="whitespace-nowrap font-mono font-bold">{discountLabel(coupon)}</Td>
            <Td className="hidden whitespace-nowrap font-mono md:table-cell">
              {coupon.minSubtotalMxn > 0 ? formatMxn(coupon.minSubtotalMxn) : "Sin mínimo"}
            </Td>
            <Td className="hidden whitespace-nowrap font-mono text-xs md:table-cell">
              <span className="block">{coupon.startsAt ? formatMxDate(coupon.startsAt) : "Sin inicio"}</span>
              <span className="block">{coupon.endsAt ? formatMxDate(coupon.endsAt) : "Sin fin"}</span>
            </Td>
            <Td className="min-w-32">
              <span className="block whitespace-nowrap font-mono font-bold">
                {coupon.redeemedCount} / {coupon.maxRedemptions ?? "∞"}
              </span>
              {coupon.maxRedemptions !== undefined ? (
                <RedemptionMeter used={coupon.redeemedCount} max={coupon.maxRedemptions} />
              ) : null}
            </Td>
            <Td>
              <Badge variant={COUPON_STATUS_VARIANTS[coupon.status]}>{COUPON_STATUS_LABELS[coupon.status]}</Badge>
            </Td>
          </Tr>
        );
      })}
    </Tbody>
  </Table>
);

export type { CouponTableProps };
export { CouponTable };
