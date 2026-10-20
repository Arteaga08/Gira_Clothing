import { describe, expect, it } from "vitest";
import { validateImageFile } from "@/lib/catalog/imageFile";

const file = (type: string, size: number, name = "foto"): File => {
  const blob = new File(["x"], name, { type });
  Object.defineProperty(blob, "size", { value: size });
  return blob;
};

describe("validateImageFile", () => {
  it("acepta JPG, PNG, WEBP y AVIF de hasta 5 MB", () => {
    for (const type of ["image/jpeg", "image/png", "image/webp", "image/avif"]) {
      expect(validateImageFile(file(type, 1024))).toBeNull();
    }
    expect(validateImageFile(file("image/png", 5 * 1024 * 1024))).toBeNull();
  });

  it("rechaza otros tipos y archivos grandes con un mensaje en español", () => {
    expect(validateImageFile(file("application/pdf", 10, "x.pdf"))).toMatch(/JPG, PNG, WEBP o AVIF/);
    expect(validateImageFile(file("image/gif", 10, "x.gif"))).toMatch(/JPG, PNG, WEBP o AVIF/);
    expect(validateImageFile(file("image/png", 5 * 1024 * 1024 + 1, "grande.png"))).toMatch(/5 MB/);
  });
});
