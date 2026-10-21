import { CouponStatus } from "@gira/shared";
import type { BadgeVariant } from "@/components/ui/Badge";

const COUPON_STATUS_LABELS: Readonly<Record<CouponStatus, string>> = {
  [CouponStatus.ACTIVE]: "Activo",
  [CouponStatus.SCHEDULED]: "Programado",
  [CouponStatus.EXPIRED]: "Vencido",
  [CouponStatus.EXHAUSTED]: "Agotado",
  [CouponStatus.RETIRED]: "Retirado",
};

/** Only "can be used right now" is green and "ran out" is amber; the rest are informational. */
const COUPON_STATUS_VARIANTS: Readonly<Record<CouponStatus, BadgeVariant>> = {
  [CouponStatus.ACTIVE]: "ok",
  [CouponStatus.SCHEDULED]: "neutral",
  [CouponStatus.EXPIRED]: "neutral",
  [CouponStatus.EXHAUSTED]: "warn",
  [CouponStatus.RETIRED]: "neutral",
};

export { COUPON_STATUS_LABELS, COUPON_STATUS_VARIANTS };
