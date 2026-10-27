import { describe, expect, it } from "vitest";
import { blankEvent, eventsSignature, parseEvents } from "@/lib/settings/events";

const IMAGE = { url: "https://res.cloudinary.com/gira/image/upload/a.jpg", publicId: "gira/home/a", width: 1200, height: 1500 };

const event = (extra: Record<string, unknown> = {}) => ({
  ...blankEvent("e1"),
  title: "Bazar Callejero",
  date: "2099-11-14",
  startTime: "11:00",
  city: "Monterrey",
  venue: "Parque Fundidora",
  ...extra,
});

const events = (items: unknown[] = [event()], extra: Record<string, unknown> = {}) => ({
  items,
  emptyMessage: "Pronto anunciamos la siguiente parada",
  emptyLinkUrl: "",
  ...extra,
});

describe("parseEvents", () => {
  it("recorta los textos", () => {
    const result = parseEvents(events([event({ title: "  Bazar  ", city: " Monterrey " })]) as never);
    expect(result).toMatchObject({ events: { items: [{ title: "Bazar", city: "Monterrey" }] } });
  });

  it("sin eventos es válido mientras haya mensaje para cuando no hay", () => {
    expect(parseEvents(events([]) as never)).toEqual({ events: events([]) });
    expect(parseEvents(events([], { emptyMessage: " " }) as never)).toEqual({
      error: "Escribe el mensaje que se muestra cuando no hay eventos.",
    });
  });

  it.each([
    ["falta el nombre", { title: " " }, "Evento 1: falta el nombre."],
    ["falta la fecha", { date: "" }, "Evento 1: elige la fecha."],
    ["fecha inexistente", { date: "2099-13-45" }, "Evento 1: elige la fecha."],
    ["falta la hora", { startTime: "" }, "Evento 1: elige la hora de inicio."],
    ["falta la ciudad", { city: "" }, "Evento 1: falta la ciudad."],
    ["falta el lugar", { venue: "" }, "Evento 1: falta el lugar."],
    ["mapa sin https", { mapsUrl: "http://maps.example.com" }, "Evento 1: el enlace del mapa debe empezar con https://."],
    ["mapa javascript:", { mapsUrl: "javascript:alert(1)" }, "Evento 1: el enlace del mapa debe empezar con https://."],
    ["foto sin descripción", { image: IMAGE, alt: "" }, "Evento 1: describe la foto para poder mostrarla."],
  ])("%s no pasa", (_name, extra, error) => {
    expect(parseEvents(events([event(extra)]) as never)).toEqual({ error });
  });

  it("nombra el número del evento que falla", () => {
    expect(parseEvents(events([event(), event({ city: "" })]) as never)).toEqual({ error: "Evento 2: falta la ciudad." });
  });

  it("acepta una foto con descripción y un mapa https", () => {
    const result = parseEvents(events([event({ image: IMAGE, alt: "Puesto", mapsUrl: "https://maps.example.com/x" })]) as never);
    expect("events" in result).toBe(true);
  });

  it("rechaza más de 8 eventos y un enlace de botón sin https", () => {
    expect(parseEvents(events(Array.from({ length: 9 }, () => event())) as never)).toEqual({
      error: "Puedes guardar hasta 8 eventos.",
    });
    expect(parseEvents(events([], { emptyLinkUrl: "ftp://x.com" }) as never)).toEqual({
      error: "El enlace del botón debe empezar con https://.",
    });
  });
});

describe("eventsSignature", () => {
  it("los espacios de los extremos no cuentan como cambio", () => {
    expect(eventsSignature(events([event({ title: " Bazar Callejero " })]) as never)).toBe(
      eventsSignature(events() as never),
    );
  });
});
