import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { PrintsShowcase } from "@/components/store/prints/PrintsShowcase";
import type { PublicPrintSummary } from "@/lib/api/storefront";

const print = (name: string, slug: string): PublicPrintSummary => ({
  id: `id-${slug}`,
  name,
  slug,
  sku: slug.toUpperCase(),
  family: { id: "f1", name: "Flora mexicana", slug: "flora-mexicana" },
  image: { url: `https://res.cloudinary.com/gira/image/upload/v1/${slug}.jpg`, width: 864, height: 576 },
});

const PRINTS = [
  { ...print("Amapolas", "amapolas"), blurb: "Flores rojas, bordadas a mano." },
  print("Cempasúchil", "cempasuchil"),
  { ...print("La Luna", "la-luna"), blurb: "Cartas clásicas de la lotería." },
];

const visibleHeading = () => screen.getByRole("heading", { level: 3 });
const cta = () => screen.getByRole("link", { name: /Ver prendas con la estampa/ });

describe("PrintsShowcase", () => {
  it("arranca con la primera estampa: su nombre, su pestaña marcada y el CTA a su catálogo", () => {
    render(<PrintsShowcase prints={PRINTS} />);
    expect(screen.getByRole("heading", { level: 2, name: "Prints" })).toBeInTheDocument();
    expect(visibleHeading()).toHaveTextContent("Amapolas");
    expect(screen.getByRole("tab", { name: "Amapolas" })).toHaveAttribute("aria-selected", "true");
    expect(cta()).toHaveAttribute("href", "/tienda?estampa=amapolas");
    expect(cta()).toHaveTextContent("¡Quiero de esta!");
  });

  it("al elegir otra estampa cambia el título, la foto activa y el CTA", async () => {
    const { container } = render(<PrintsShowcase prints={PRINTS} />);
    await userEvent.click(screen.getByRole("tab", { name: "La Luna" }));
    expect(visibleHeading()).toHaveTextContent("La Luna");
    expect(screen.getByRole("tab", { name: "La Luna" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Amapolas" })).toHaveAttribute("aria-selected", "false");
    expect(cta()).toHaveAttribute("href", "/tienda?estampa=la-luna");
    const active = container.querySelector('img[data-active="true"]');
    expect(active?.getAttribute("src")).toContain("la-luna.jpg");
    expect(screen.getByRole("tabpanel")).toHaveAttribute("aria-labelledby", "print-tab-la-luna");
  });

  it("las flechas mueven foco y selección, y dan la vuelta", async () => {
    render(<PrintsShowcase prints={PRINTS} />);
    screen.getByRole("tab", { name: "Amapolas" }).focus();
    await userEvent.keyboard("{ArrowLeft}");
    expect(screen.getByRole("tab", { name: "La Luna" })).toHaveFocus();
    expect(visibleHeading()).toHaveTextContent("La Luna");
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Amapolas" })).toHaveFocus();
    await userEvent.keyboard("{End}");
    expect(screen.getByRole("tab", { name: "La Luna" })).toHaveAttribute("aria-selected", "true");
  });

  it("muestra la frase de la estampa elegida y ninguna si no tiene", async () => {
    render(<PrintsShowcase prints={PRINTS} />);
    const panel = screen.getByRole("tabpanel");
    expect(panel).toHaveTextContent("Flores rojas, bordadas a mano.");
    await userEvent.click(screen.getByRole("tab", { name: "Cempasúchil" }));
    const visible = [...panel.querySelectorAll('[data-active="true"] p')];
    expect(visible).toHaveLength(0);
    await userEvent.click(screen.getByRole("tab", { name: "La Luna" }));
    expect(panel.querySelector('[data-active="true"] p')).toHaveTextContent("Cartas clásicas de la lotería.");
  });

  it("solo la pestaña seleccionada entra al orden de tabulación", () => {
    render(<PrintsShowcase prints={PRINTS} />);
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((tab) => tab.getAttribute("tabindex"))).toEqual(["0", "-1", "-1"]);
  });

  it("las fotos son decorativas y piden a Cloudinary el tamaño web sin recorte", () => {
    const { container } = render(<PrintsShowcase prints={PRINTS} />);
    const images = container.querySelectorAll("img");
    expect(images).toHaveLength(3);
    expect(images[0]?.getAttribute("alt")).toBe("");
    expect(images[0]?.getAttribute("src")).toContain("/image/upload/c_limit,w_1600,f_auto,q_auto/v1/amapolas.jpg");
  });
});
