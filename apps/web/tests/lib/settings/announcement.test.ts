import { describe, expect, it } from "vitest";
import { cleanAnnouncementMessages, parseAnnouncement } from "@/lib/settings/announcement";

describe("announcement form helpers", () => {
  it("recorta y descarta filas vacías", () => {
    expect(cleanAnnouncementMessages(["  hola ", "", "   ", "adiós"])).toEqual(["hola", "adiós"]);
  });

  it("acepta una barra apagada sin mensajes", () => {
    expect(parseAnnouncement(false, [""])).toEqual({ messages: [] });
  });

  it("exige al menos un mensaje si está encendida", () => {
    expect(parseAnnouncement(true, ["  "])).toEqual({ error: "Agrega al menos un mensaje para mostrar la barra." });
  });

  it("rechaza más de 5 mensajes y mensajes de más de 80 caracteres", () => {
    expect(parseAnnouncement(true, ["a", "b", "c", "d", "e", "f"])).toEqual({ error: "Máximo 5 mensajes." });
    expect(parseAnnouncement(true, ["x".repeat(81)])).toEqual({
      error: "Cada mensaje admite hasta 80 caracteres.",
    });
    expect(parseAnnouncement(true, ["x".repeat(80)])).toEqual({ messages: ["x".repeat(80)] });
  });
});
