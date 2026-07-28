import { describe, it, expect } from "vitest";
import { assertImageSignature } from "../../src/utils/imageSignature.js";

// Minimal real magic-byte headers for each allowed format.
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
const WEBP = Buffer.concat([
  Buffer.from("RIFF", "ascii"),
  Buffer.from([0x00, 0x00, 0x00, 0x00]),
  Buffer.from("WEBP", "ascii"),
]);
const AVIF = Buffer.concat([
  Buffer.from([0x00, 0x00, 0x00, 0x1c]),
  Buffer.from("ftyp", "ascii"),
  Buffer.from("avif", "ascii"),
]);

describe("assertImageSignature", () => {
  it("acepta un JPEG real", () => {
    expect(() => assertImageSignature(JPEG, "image/jpeg")).not.toThrow();
  });

  it("acepta un PNG real", () => {
    expect(() => assertImageSignature(PNG, "image/png")).not.toThrow();
  });

  it("acepta un WEBP real", () => {
    expect(() => assertImageSignature(WEBP, "image/webp")).not.toThrow();
  });

  it("acepta un AVIF real", () => {
    expect(() => assertImageSignature(AVIF, "image/avif")).not.toThrow();
  });

  it("rechaza texto plano disfrazado de image/png con 400", () => {
    const fake = Buffer.from("no soy una imagen, soy texto plano", "utf-8");
    expect(() => assertImageSignature(fake, "image/png")).toThrow(
      expect.objectContaining({ statusCode: 400 }),
    );
  });

  it("rechaza un buffer truncado", () => {
    const truncated = Buffer.from([0xff, 0xd8]);
    expect(() => assertImageSignature(truncated, "image/jpeg")).toThrow(
      expect.objectContaining({ statusCode: 400 }),
    );
  });
});
