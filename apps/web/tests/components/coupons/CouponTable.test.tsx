import { CouponDiscountType, CouponStatus } from "@gira/shared";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CouponTable } from "@/components/coupons/CouponTable";
import { COUPON_2_ID, COUPON_ID, makePanelCoupon } from "../../helpers/coupons";

const FIXED = makePanelCoupon({
  id: COUPON_2_ID,
  code: "FIJO150",
  name: "Fijo de verano",
  discountType: CouponDiscountType.FIXED,
  percentOff: undefined as never,
  amountOffMxn: 15000,
  minSubtotalMxn: 79900,
  startsAt: "2026-06-01T06:00:00.000Z",
  endsAt: "2026-09-01T05:59:59.000Z",
  maxRedemptions: 120,
  redeemedCount: 120,
  status: CouponStatus.EXHAUSTED,
});

describe("CouponTable", () => {
  it("pinta código, nombre, descuento, canjes y estado de cada cupón", () => {
    render(<CouponTable items={[makePanelCoupon(), FIXED]} onOpen={vi.fn()} />);

    const percent = screen.getByRole("button", { name: "VERANO10, Verano" }).closest("tr") as HTMLElement;
    expect(within(percent).getByText("10%")).toBeInTheDocument();
    expect(within(percent).getByText("0 / ∞")).toBeInTheDocument();
    expect(within(percent).getByText("Sin mínimo")).toBeInTheDocument();
    expect(within(percent).getByText("Sin inicio")).toBeInTheDocument();
    expect(within(percent).getByText("Activo")).toBeInTheDocument();

    const fixed = screen.getByRole("button", { name: "FIJO150, Fijo de verano" }).closest("tr") as HTMLElement;
    expect(within(fixed).getByText("$150.00")).toBeInTheDocument();
    expect(within(fixed).getByText("$799.00")).toBeInTheDocument();
    expect(within(fixed).getByText("120 / 120")).toBeInTheDocument();
    expect(within(fixed).getByText("01 jun 2026")).toBeInTheDocument();
    expect(within(fixed).getByText("31 ago 2026")).toBeInTheDocument();
    expect(within(fixed).getByText("Agotado")).toBeInTheDocument();
  });

  it("un cupón con tope dibuja el medidor y uno ilimitado no", () => {
    const { container } = render(<CouponTable items={[makePanelCoupon(), FIXED]} onOpen={vi.fn()} />);
    expect(container.querySelectorAll("tbody tr")[0]!.querySelectorAll("[style]")).toHaveLength(0);
    expect(container.querySelectorAll("tbody tr")[1]!.querySelector("[style]")).toHaveStyle({ width: "100%" });
  });

  it("clic en el código abre ese cupón", async () => {
    const onOpen = vi.fn();
    render(<CouponTable items={[makePanelCoupon()]} onOpen={onOpen} />);
    await userEvent.click(screen.getByRole("button", { name: /VERANO10/ }));
    expect(onOpen).toHaveBeenCalledWith(COUPON_ID);
  });

  it("cada estado tiene su etiqueta en español", () => {
    const statuses = [CouponStatus.SCHEDULED, CouponStatus.EXPIRED, CouponStatus.RETIRED];
    render(
      <CouponTable
        items={statuses.map((status, index) => makePanelCoupon({ id: `68f2ab12c3d4e5f6a7b8cb0${index}`, code: `COD-${index}XX`, status }))}
        onOpen={vi.fn()}
      />,
    );
    expect(screen.getByText("Programado")).toBeInTheDocument();
    expect(screen.getByText("Vencido")).toBeInTheDocument();
    expect(screen.getByText("Retirado")).toBeInTheDocument();
  });
});
