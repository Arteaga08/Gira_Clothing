import { describe, expect, it } from "vitest";
import { parseToken } from "@/lib/store/linkToken";

describe("parseToken", () => {
  it("acepta 64 hex en minúsculas", () => {
    expect(parseToken("a".repeat(64))).toBe("a".repeat(64));
    expect(parseToken("0123456789abcdef".repeat(4))).toBe("0123456789abcdef".repeat(4));
  });

  it.each([[undefined], [""], ["abc"], ["A".repeat(64)], ["g".repeat(64)], ["a".repeat(63)], ["a".repeat(65)], [["a".repeat(64)]]])(
    "rechaza %j",
    (raw) => {
      expect(parseToken(raw as string | string[] | undefined)).toBeNull();
    },
  );
});
