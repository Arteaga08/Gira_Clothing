import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CouponForm } from "@/components/coupons/CouponForm";
import { EMPTY_COUPON_VALUES, type CouponFormValues } from "@/lib/coupons/couponForm";

const MINIMUM_WARNING = /no se podrá pagar/i;

const renderForm = (patch: Partial<CouponFormValues>) =>
  render(
    <CouponForm
      formId="f"
      mode="create"
      values={{ ...EMPTY_COUPON_VALUES, ...patch }}
      errors={{}}
      error={null}
      locked={false}
      redeemedCount={0}
      onChange={() => undefined}
      onSubmit={() => undefined}
    />,
  );

describe("CouponForm · aviso del mínimo de $10", () => {
  it("con 100 % avisa que un pedido de menos de $10 no se podrá pagar", () => {
    renderForm({ discountType: "percent", percentOff: "100" });
    expect(screen.getByText(MINIMUM_WARNING)).toBeInTheDocument();
  });

  it("con un monto fijo también avisa", () => {
    renderForm({ discountType: "fixed", amountOff: "150" });
    expect(screen.getByText(MINIMUM_WARNING)).toBeInTheDocument();
  });

  it("con un porcentaje menor a 100 no avisa", () => {
    renderForm({ discountType: "percent", percentOff: "20" });
    expect(screen.queryByText(MINIMUM_WARNING)).not.toBeInTheDocument();
  });
});
