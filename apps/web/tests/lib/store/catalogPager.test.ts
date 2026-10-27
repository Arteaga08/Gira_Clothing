import { describe, expect, it } from "vitest";
import { pagerItems } from "@/lib/store/catalogPager";

describe("pagerItems", () => {
  it("con pocas páginas las muestra todas", () => {
    expect(pagerItems(1, 1)).toEqual([1]);
    expect(pagerItems(2, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("con muchas: primera, última y vecinas de la actual, con huecos", () => {
    expect(pagerItems(1, 20)).toEqual([1, 2, "gap", 20]);
    expect(pagerItems(10, 20)).toEqual([1, "gap", 9, 10, 11, "gap", 20]);
    expect(pagerItems(20, 20)).toEqual([1, "gap", 19, 20]);
  });

  it("un hueco de una sola página se escribe como esa página", () => {
    expect(pagerItems(4, 20)).toEqual([1, 2, 3, 4, 5, "gap", 20]);
  });
});
