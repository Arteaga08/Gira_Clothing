import { Currency } from "@gira/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  formatInteger,
  formatLongDate,
  formatMoneyParts,
  formatShortDay,
  greetingFor,
} from "@/lib/format";

describe("formatMoneyParts", () => {
  it("34,175 pesos en centavos -> $34,175 + .00", () => {
    expect(formatMoneyParts(3_417_500, Currency.MXN)).toEqual({ amount: "$34,175", fraction: ".00" });
  });

  it("0 centavos -> $0 + .00, sin dividir entre cero ni NaN", () => {
    expect(formatMoneyParts(0, Currency.MXN)).toEqual({ amount: "$0", fraction: ".00" });
  });

  it("USD usa su propio símbolo/prefijo, distinto de MXN", () => {
    const usd = formatMoneyParts(41_400, Currency.USD);
    const mxn = formatMoneyParts(41_400, Currency.MXN);
    expect(usd.amount).not.toBe(mxn.amount);
    expect(usd.fraction).toBe(".00");
  });
});

describe("formatInteger", () => {
  it("agrupa miles", () => {
    expect(formatInteger(1234)).toBe("1,234");
  });
});

describe("formatLongDate", () => {
  const originalTz = process.env.TZ;

  beforeEach(() => {
    process.env.TZ = "UTC";
  });

  afterEach(() => {
    process.env.TZ = originalTz;
  });

  it("usa America/Mexico_City de forma explícita, no la del proceso", () => {
    // 2026-07-30T02:00:00Z es 2026-07-29 20:00 en CDMX (UTC-6): debe leerse
    // como miércoles 29, no jueves 30 como leería un TZ=UTC implícito.
    const instant = new Date("2026-07-30T02:00:00Z");
    expect(formatLongDate(instant)).toBe("miércoles, 29 de julio de 2026");
  });
});

describe("formatShortDay", () => {
  it('"2026-07-01" -> "1", sin desfase de un día', () => {
    expect(formatShortDay("2026-07-01")).toBe("1");
  });

  it('"2026-07-29" -> "29"', () => {
    expect(formatShortDay("2026-07-29")).toBe("29");
  });
});

describe("greetingFor", () => {
  it.each([
    ["2026-07-29T13:00:00Z", "Buenos días"], // 07:00 CDMX
    ["2026-07-29T18:00:00Z", "Buenas tardes"], // 12:00 CDMX
    ["2026-07-30T01:00:00Z", "Buenas noches"], // 19:00 CDMX
  ] as const)("%s -> %s", (iso, expected) => {
    expect(greetingFor(new Date(iso))).toBe(expected);
  });
});
