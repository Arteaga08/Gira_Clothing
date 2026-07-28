import { describe, it, expect, vi, beforeEach } from "vitest";
import { createStubUploadService } from "../../src/adapters/upload/stubUploadService.js";

describe("stubUploadService", () => {
  const stub = createStubUploadService();

  it("devuelve la forma { url, publicId, width, height }", async () => {
    const result = await stub.upload({
      buffer: Buffer.from("fake-image-bytes"),
      mimeType: "image/png",
      folder: "prints",
    });
    expect(result).toEqual({
      url: expect.stringMatching(/^https:\/\//),
      publicId: expect.any(String),
      width: 1,
      height: 1,
    });
  });

  it("es determinista: el mismo buffer produce el mismo publicId", async () => {
    const buffer = Buffer.from("same-bytes");
    const a = await stub.upload({ buffer, mimeType: "image/png", folder: "prints" });
    const b = await stub.upload({ buffer, mimeType: "image/png", folder: "prints" });
    expect(a.publicId).toBe(b.publicId);
  });

  it("produce una URL https válida (satisface imageObjectSchema)", async () => {
    const result = await stub.upload({
      buffer: Buffer.from("x"),
      mimeType: "image/png",
      folder: "variants",
    });
    expect(() => new URL(result.url)).not.toThrow();
    expect(result.url.startsWith("https://")).toBe(true);
  });

  it("destroy no lanza y no hace red", async () => {
    await expect(stub.destroy("prints/abc")).resolves.toBeUndefined();
  });
});

describe("getUploadService factory", () => {
  it("devuelve el stub cuando env.cloudinary es null", async () => {
    const { getUploadService } = await import("../../src/adapters/upload/index.js");
    const service = getUploadService();
    const result = await service.upload({
      buffer: Buffer.from("x"),
      mimeType: "image/png",
      folder: "prints",
    });
    expect(result.url).toMatch(/^https:\/\/stub\.local\//);
  });
});

vi.mock("cloudinary", () => {
  const uploadStream = vi.fn();
  const destroy = vi.fn().mockResolvedValue({ result: "ok" });
  return {
    v2: {
      config: vi.fn(),
      uploader: { upload_stream: uploadStream, destroy },
    },
  };
});

describe("createCloudinaryUploadService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("mapea secure_url/public_id/width/height y pasa resource_type: image", async () => {
    const cloudinaryModule = await import("cloudinary");
    const uploadStreamMock = cloudinaryModule.v2.uploader.upload_stream as unknown as ReturnType<
      typeof vi.fn
    >;
    uploadStreamMock.mockImplementation(
      (
        options: Record<string, unknown>,
        callback: (err: unknown, result?: Record<string, unknown>) => void,
      ) => {
        expect(options.resource_type).toBe("image");
        callback(null, {
          secure_url: "https://res.cloudinary.com/gira/image/upload/x.jpg",
          public_id: "gira/prints/x",
          width: 800,
          height: 600,
        });
        return { end: vi.fn() };
      },
    );

    const { createCloudinaryUploadService } = await import(
      "../../src/adapters/upload/cloudinaryUploadService.js"
    );
    const service = createCloudinaryUploadService({
      cloudName: "gira",
      apiKey: "key",
      apiSecret: "secret",
      folder: "gira",
    });

    const result = await service.upload({
      buffer: Buffer.from("x"),
      mimeType: "image/jpeg",
      folder: "prints",
    });

    expect(result).toEqual({
      url: "https://res.cloudinary.com/gira/image/upload/x.jpg",
      publicId: "gira/prints/x",
      width: 800,
      height: 600,
    });
  });

  it("un error del SDK se convierte en AppError 502", async () => {
    const cloudinaryModule = await import("cloudinary");
    const uploadStreamMock = cloudinaryModule.v2.uploader.upload_stream as unknown as ReturnType<
      typeof vi.fn
    >;
    uploadStreamMock.mockImplementation(
      (_options: Record<string, unknown>, callback: (err: unknown) => void) => {
        callback(new Error("network down"));
        return { end: vi.fn() };
      },
    );

    const { createCloudinaryUploadService } = await import(
      "../../src/adapters/upload/cloudinaryUploadService.js"
    );
    const service = createCloudinaryUploadService({
      cloudName: "gira",
      apiKey: "key",
      apiSecret: "secret",
      folder: "gira",
    });

    await expect(
      service.upload({ buffer: Buffer.from("x"), mimeType: "image/jpeg", folder: "prints" }),
    ).rejects.toMatchObject({ statusCode: 502 });
  });
});
