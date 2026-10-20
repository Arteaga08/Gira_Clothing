import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/ApiError";
import { useImageUpload } from "@/hooks/useImageUpload";
import { makeImage } from "../helpers/catalog";

const api = vi.hoisted(() => ({ uploadImage: vi.fn() }));
vi.mock("@/lib/api/adminUploads", () => api);

const png = (size = 10) => {
  const file = new File(["x"], "foto.png", { type: "image/png" });
  Object.defineProperty(file, "size", { value: size });
  return file;
};

beforeEach(() => api.uploadImage.mockReset());

describe("useImageUpload", () => {
  it("un archivo inválido se rechaza sin llamar al API", async () => {
    const { result } = renderHook(() => useImageUpload());
    let outcome: Awaited<ReturnType<typeof result.current.upload>> | undefined;
    await act(async () => {
      outcome = await result.current.upload(new File(["x"], "a.pdf", { type: "application/pdf" }), "variants");
    });
    expect(outcome).toMatchObject({ ok: false, message: expect.stringMatching(/JPG, PNG, WEBP o AVIF/) });
    expect(api.uploadImage).not.toHaveBeenCalled();
  });

  it("sube y devuelve la imagen", async () => {
    api.uploadImage.mockResolvedValue(makeImage("ok"));
    const { result } = renderHook(() => useImageUpload());
    let outcome: Awaited<ReturnType<typeof result.current.upload>> | undefined;
    await act(async () => {
      outcome = await result.current.upload(png(), "products");
    });
    expect(outcome).toEqual({ ok: true, image: makeImage("ok") });
    expect(api.uploadImage).toHaveBeenCalledWith(expect.any(File), "products");
    expect(result.current.busy).toBe(false);
  });

  it("un fallo del API vuelve como mensaje, sin lanzar", async () => {
    api.uploadImage.mockRejectedValueOnce(new ApiError("El archivo no es una imagen válida.", "http", 400));
    const { result } = renderHook(() => useImageUpload());
    let outcome: Awaited<ReturnType<typeof result.current.upload>> | undefined;
    await act(async () => {
      outcome = await result.current.upload(png(), "variants");
    });
    expect(outcome).toEqual({ ok: false, message: "El archivo no es una imagen válida." });
  });

  it("busy es true mientras sube", async () => {
    let finish: (image: ReturnType<typeof makeImage>) => void = () => {};
    api.uploadImage.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const { result } = renderHook(() => useImageUpload());
    let pending: Promise<unknown> = Promise.resolve();
    act(() => {
      pending = result.current.upload(png(), "variants");
    });
    expect(result.current.busy).toBe(true);
    await act(async () => {
      finish(makeImage("x"));
      await pending;
    });
    expect(result.current.busy).toBe(false);
  });
});
