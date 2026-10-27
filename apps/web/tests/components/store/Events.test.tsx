import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EventsView } from "@/components/store/events/EventsView";

const event = (extra: Record<string, unknown> = {}) => ({
  title: "Bazar Callejero",
  date: "2026-11-14",
  startTime: "11:00",
  endTime: "19:00",
  city: "Monterrey",
  venue: "Parque Fundidora",
  mapsUrl: "https://maps.example.com/fundidora",
  image: { url: "https://res.cloudinary.com/gira/image/upload/v1/home/bazar.jpg", width: 1200, height: 1500 },
  alt: "Puesto de Gira en el bazar",
  ...extra,
});

const events = (extra: Record<string, unknown> = {}) => ({
  next: event(),
  later: [],
  emptyMessage: "Pronto anunciamos la siguiente parada",
  emptyLinkUrl: "",
  ...extra,
});

describe("EventsView", () => {
  it("pinta el cartel del próximo evento: día, mes, nombre, lugar, horario y foto 4:5", () => {
    render(<EventsView events={events() as never} />);
    expect(screen.getByRole("heading", { level: 2, name: "Próximas paradas" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "Bazar Callejero" })).toBeInTheDocument();
    expect(screen.getByText("14")).toBeInTheDocument();
    expect(screen.getByText(/NOV · SÁB/)).toBeInTheDocument();
    expect(screen.getByText("Parque Fundidora")).toBeInTheDocument();
    expect(screen.getByText("11:00 – 19:00")).toBeInTheDocument();
    const photo = screen.getByRole("img", { name: "Puesto de Gira en el bazar" });
    expect(photo.getAttribute("src")).toContain("c_fill,w_960,h_1200");
  });

  it("«Cómo llegar» abre el mapa en otra pestaña con rel seguro", () => {
    render(<EventsView events={events() as never} />);
    const link = screen.getByRole("link", { name: "Cómo llegar a Bazar Callejero" });
    expect(link).toHaveAttribute("href", "https://maps.example.com/fundidora");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("sin mapa no hay botón, y sin foto no hay imagen", () => {
    render(<EventsView events={events({ next: event({ mapsUrl: "", image: null, alt: "" }) }) as never} />);
    expect(screen.queryByRole("link", { name: /Cómo llegar/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("sin hora de cierre dice desde qué hora", () => {
    render(<EventsView events={events({ next: event({ endTime: "" }) }) as never} />);
    expect(screen.getByText("Desde las 11:00")).toBeInTheDocument();
  });

  it("«Después» lista los siguientes; solo los que tienen mapa son enlace", () => {
    render(
      <EventsView
        events={
          events({
            later: [
              event({ title: "Pop-up La Nave", date: "2026-11-29", city: "Saltillo", mapsUrl: "https://maps.example.com/nave" }),
              event({ title: "Mercado Roma", date: "2026-12-06", city: "CDMX", mapsUrl: "" }),
            ],
          }) as never
        }
      />,
    );
    expect(screen.getByRole("heading", { level: 3, name: "Después" })).toBeInTheDocument();
    expect(screen.getByText("29 NOV")).toBeInTheDocument();
    expect(screen.getByText("6 DIC")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Cómo llegar a Pop-up La Nave" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Cómo llegar a Mercado Roma" })).not.toBeInTheDocument();
  });

  it("sin eventos próximos muestra el mensaje del equipo, y el botón solo con enlace", () => {
    const { rerender } = render(<EventsView events={events({ next: null }) as never} />);
    expect(screen.getByText("Pronto anunciamos la siguiente parada")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Síguenos/ })).not.toBeInTheDocument();

    rerender(<EventsView events={events({ next: null, emptyLinkUrl: "https://instagram.com/gira" }) as never} />);
    expect(screen.getByRole("link", { name: /Síguenos/ })).toHaveAttribute("href", "https://instagram.com/gira");
  });
});
