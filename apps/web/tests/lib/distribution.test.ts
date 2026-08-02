import { OrderStatus } from "@gira/shared";
import { describe, expect, it } from "vitest";
import { distributionFrom } from "@/lib/stats/distribution";

describe("distributionFrom", () => {
  it("{} -> sin segmentos, total 0, sin dividir entre cero", () => {
    expect(distributionFrom({})).toEqual({ segments: [], total: 0 });
  });

  it("descarta los estados en 0 y ordena descendente por conteo", () => {
    const { segments, total } = distributionFrom({
      [OrderStatus.SHIPPED]: 14,
      [OrderStatus.DELIVERED]: 11,
      [OrderStatus.PAID]: 0,
      [OrderStatus.CANCELLED]: 2,
    });

    expect(total).toBe(27);
    expect(segments.map((segment) => segment.status)).toEqual([
      OrderStatus.SHIPPED,
      OrderStatus.DELIVERED,
      OrderStatus.CANCELLED,
    ]);
  });

  it("los porcentajes suman ~100", () => {
    const { segments } = distributionFrom({ [OrderStatus.SHIPPED]: 1, [OrderStatus.PAID]: 2 });
    const sum = segments.reduce((acc, segment) => acc + segment.percent, 0);
    expect(sum).toBeCloseTo(100, 0);
  });

  it("usa las etiquetas en español de @gira/shared", () => {
    const { segments } = distributionFrom({ [OrderStatus.SHIPPED]: 1 });
    expect(segments[0]!.label).toBe("enviada");
  });
});
