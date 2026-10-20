import { ShippingCarrier } from "@gira/shared";
import { describe, expect, it } from "vitest";
import { carrierServiceLabel } from "@/lib/orders/shipping";

describe("carrierServiceLabel", () => {
  it("une paquetería y servicio", () => {
    expect(carrierServiceLabel(ShippingCarrier.DHL, "Terrestre")).toBe("DHL Terrestre");
  });

  it("no repite la paquetería si el servicio ya la trae", () => {
    expect(carrierServiceLabel(ShippingCarrier.FEDEX, "FedEx Económico")).toBe("FedEx Económico");
    expect(carrierServiceLabel(ShippingCarrier.DHL, "dhl express")).toBe("dhl express");
  });

  it("sin servicio muestra solo la paquetería", () => {
    expect(carrierServiceLabel(ShippingCarrier.ESTAFETA, undefined)).toBe("Estafeta");
    expect(carrierServiceLabel(ShippingCarrier.ESTAFETA, "  ")).toBe("Estafeta");
  });
});
