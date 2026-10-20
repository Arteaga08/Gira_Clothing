import { describe, expect, it } from "vitest";
import { centsToPesosText, formatPesos, parsePesos } from "@/lib/catalog/money";

describe("parsePesos", () => {
  it.each([
    ["189", 18900],
    ["189.5", 18950],
    ["189.50", 18950],
    ["$1,234.50", 123450],
    ["0", 0],
    [" 12.05 ", 1205],
  ])("%s → %i centavos", (text, cents) => {
    expect(parsePesos(text)).toBe(cents);
  });

  it.each(["", "abc", "1.234", "-5", "12.", "1e3", "1,2,3.4x"])("rechaza %j", (text) => {
    expect(parsePesos(text)).toBeNull();
  });
});

describe("centsToPesosText", () => {
  it("siempre dos decimales, sin separador de miles", () => {
    expect(centsToPesosText(18900)).toBe("189.00");
    expect(centsToPesosText(21950)).toBe("219.50");
    expect(centsToPesosText(123450)).toBe("1234.50");
  });
});

describe("formatPesos", () => {
  it("formatea en MXN con símbolo y miles", () => {
    expect(formatPesos(18900)).toBe("$189.00");
    expect(formatPesos(123450)).toBe("$1,234.50");
  });
});
