import { describe, it, expect, vi, afterEach } from "vitest";
import { createStubMailer } from "../../src/adapters/mailer/stubMailer.js";
import { createResendMailer } from "../../src/adapters/mailer/resendMailer.js";

const message = {
  to: "clienta@example.com",
  subject: "Confirmamos tu compra",
  html: "<p>Gracias</p>",
  text: "Gracias",
};

describe("stubMailer", () => {
  it("resuelve con un providerId determinista y no toca la red", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const result = await createStubMailer().send(message);
    expect(result.providerId).toMatch(/^stub-/);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

describe("resendMailer", () => {
  afterEach(() => vi.restoreAllMocks());

  it("hace POST a la API de Resend con el remitente configurado", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ id: "re_123" }), { status: 200 }));
    const mailer = createResendMailer({ apiKey: "re_test", from: "Gira <hola@gira.mx>" });

    const result = await mailer.send(message);

    expect(result.providerId).toBe("re_123");
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe("https://api.resend.com/emails");
    expect((init as RequestInit).method).toBe("POST");
    const body = JSON.parse((init as RequestInit).body as string) as Record<string, unknown>;
    expect(body.from).toBe("Gira <hola@gira.mx>");
    expect(body.to).toEqual(["clienta@example.com"]);
  });

  it("lanza AppError 502 cuando el proveedor responde error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ message: "invalid api key" }), { status: 401 }),
    );
    const mailer = createResendMailer({ apiKey: "re_bad", from: "Gira <hola@gira.mx>" });

    await expect(mailer.send(message)).rejects.toMatchObject({ statusCode: 502 });
  });

  it("no incluye la API key en el mensaje del error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("nope", { status: 500 }));
    const mailer = createResendMailer({ apiKey: "re_super_secret", from: "Gira <hola@gira.mx>" });

    await expect(mailer.send(message)).rejects.toThrow(
      expect.not.stringContaining("re_super_secret") as unknown as string,
    );
  });
});
