import { describe, it, expect, vi, afterEach } from "vitest";
import { createStubChannel } from "../../src/adapters/notification/stubChannel.js";
import { createTelegramChannel } from "../../src/adapters/notification/telegramChannel.js";

const message = { title: "Nueva orden pagada", lines: ["Folio: ABC", "Total: $1,200.00 MXN"] };

describe("stubChannel", () => {
  it("resuelve sin tocar la red", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await expect(createStubChannel().notify(message)).resolves.toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

describe("telegramChannel", () => {
  afterEach(() => vi.restoreAllMocks());

  it("manda el mensaje al chat configurado", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    await createTelegramChannel({ botToken: "123:abc", chatId: "-100" }).notify(message);

    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe("https://api.telegram.org/bot123:abc/sendMessage");
    const body = JSON.parse((init as RequestInit).body as string) as Record<string, unknown>;
    expect(body.chat_id).toBe("-100");
    expect(String(body.text)).toContain("Nueva orden pagada");
    expect(String(body.text)).toContain("Folio: ABC");
  });

  it("lanza AppError 502 cuando Telegram responde error, sin filtrar el token", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("bad", { status: 400 }));
    const channel = createTelegramChannel({ botToken: "123:supersecret", chatId: "-100" });

    await expect(channel.notify(message)).rejects.toMatchObject({ statusCode: 502 });
    await expect(channel.notify(message)).rejects.toThrow(
      expect.not.stringContaining("supersecret") as unknown as string,
    );
  });
});
