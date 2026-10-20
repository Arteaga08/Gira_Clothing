import { describe, expect, it } from "vitest";
import { formatShortDateTime } from "@/lib/format";

const NOW = new Date("2026-10-19T18:00:00.000Z");

describe("formatShortDateTime", () => {
  it("mismo año: sin año, hora de la Ciudad de México en 24 h", () => {
    expect(formatShortDateTime("2026-10-19T22:05:00.000Z", NOW)).toBe("19 oct, 16:05");
  });

  it("otro año: lo incluye para que un pedido viejo no sea ambiguo", () => {
    expect(formatShortDateTime("2025-12-30T22:05:00.000Z", NOW)).toBe("30 dic 2025, 16:05");
  });

  it("usa la zona de México, no la del equipo (cerca de la medianoche UTC)", () => {
    expect(formatShortDateTime("2026-10-20T03:30:00.000Z", NOW)).toBe("19 oct, 21:30");
  });
});
