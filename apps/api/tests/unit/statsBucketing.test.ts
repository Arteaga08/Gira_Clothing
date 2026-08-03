import { describe, it, expect } from "vitest";
import { bucketKeyFor, enumerateBucketKeys } from "../../src/utils/statsBucketing.js";

const isMonday = (key: string): boolean => new Date(`${key}T00:00:00Z`).getUTCDay() === 1;

describe("bucketKeyFor", () => {
  it("day: devuelve la llave sin cambios", () => {
    expect(bucketKeyFor("2026-07-15", "day")).toBe("2026-07-15");
  });

  it("month: siempre el día 1 del mismo año/mes", () => {
    expect(bucketKeyFor("2026-07-15", "month")).toBe("2026-07-01");
    expect(bucketKeyFor("2026-07-01", "month")).toBe("2026-07-01");
    expect(bucketKeyFor("2026-07-31", "month")).toBe("2026-07-01");
  });

  it("year: siempre el 1 de enero del mismo año", () => {
    expect(bucketKeyFor("2026-07-15", "year")).toBe("2026-01-01");
    expect(bucketKeyFor("2026-01-01", "year")).toBe("2026-01-01");
    expect(bucketKeyFor("2026-12-31", "year")).toBe("2026-01-01");
  });

  it("week: el resultado siempre cae en lunes", () => {
    const sample = [
      "2026-01-01",
      "2026-03-15",
      "2026-07-15",
      "2026-07-19",
      "2026-07-20",
      "2026-12-31",
      "2027-01-01",
    ];
    for (const day of sample) {
      expect(isMonday(bucketKeyFor(day, "week"))).toBe(true);
    }
  });

  it("week: dos días de la misma semana caen en la misma llave", () => {
    // 2026-07-15 es miércoles; el domingo 2026-07-19 es el último día de esa
    // misma semana ISO (lunes 13 a domingo 19).
    expect(bucketKeyFor("2026-07-15", "week")).toBe(bucketKeyFor("2026-07-19", "week"));
  });

  it("week: cruza el límite de año sin romperse (semana ISO puede empezar en diciembre)", () => {
    const dec31 = bucketKeyFor("2026-12-31", "week");
    const jan1 = bucketKeyFor("2027-01-01", "week");
    expect(isMonday(dec31)).toBe(true);
    expect(isMonday(jan1)).toBe(true);
  });
});

describe("enumerateBucketKeys", () => {
  it("day: una llave por cada día, sin deduplicar", () => {
    const days = ["2026-07-01", "2026-07-02", "2026-07-03"];
    expect(enumerateBucketKeys(days, "day")).toEqual(days);
  });

  it("week: dedupe a un solo bucket por semana, orden ascendente", () => {
    const days = Array.from({ length: 10 }, (_, i) => {
      const d = new Date(Date.UTC(2026, 6, 13 + i)); // 13 jul (lunes) .. 22 jul
      return d.toISOString().slice(0, 10);
    });
    const buckets = enumerateBucketKeys(days, "week");
    expect(buckets.length).toBeLessThan(days.length);
    expect([...buckets].sort()).toEqual(buckets);
    for (const b of buckets) expect(isMonday(b)).toBe(true);
  });

  it("month: 31 días de julio producen un único bucket 2026-07-01", () => {
    const days = Array.from({ length: 31 }, (_, i) => {
      const d = new Date(Date.UTC(2026, 6, 1 + i));
      return d.toISOString().slice(0, 10);
    });
    expect(enumerateBucketKeys(days, "month")).toEqual(["2026-07-01"]);
  });

  it("year: los 365 días de 2026 producen un único bucket 2026-01-01", () => {
    const days = Array.from({ length: 365 }, (_, i) => {
      const d = new Date(Date.UTC(2026, 0, 1 + i));
      return d.toISOString().slice(0, 10);
    });
    expect(enumerateBucketKeys(days, "year")).toEqual(["2026-01-01"]);
  });
});
