import { describe, expect, it } from "vitest";
import { eventDay, eventHours } from "@/lib/store/eventDate";

describe("eventDay", () => {
  it("separa día, mes y día de la semana en mayúsculas", () => {
    expect(eventDay("2026-11-14")).toEqual({ day: "14", month: "NOV", weekday: "SÁB" });
  });

  it("no lleva cero a la izquierda y no se corre de día con la zona del visitante", () => {
    expect(eventDay("2026-12-06")).toEqual({ day: "6", month: "DIC", weekday: "DOM" });
    expect(eventDay("2027-01-01").day).toBe("1");
  });
});

describe("eventHours", () => {
  it("con cierre muestra el rango", () => {
    expect(eventHours("11:00", "19:00")).toBe("11:00 – 19:00");
  });

  it("sin cierre dice desde qué hora", () => {
    expect(eventHours("11:00", "")).toBe("Desde las 11:00");
  });
});
