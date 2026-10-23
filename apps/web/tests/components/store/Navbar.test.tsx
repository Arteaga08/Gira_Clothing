import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AnnouncementBar } from "@/components/store/navbar/AnnouncementBar";
import { MobileMenu } from "@/components/store/navbar/MobileMenu";
import { SiteHeader } from "@/components/store/navbar/SiteHeader";
import { GUEST_CART_KEY } from "@/lib/cart/guestCart";

const { fetchCartCount } = vi.hoisted(() => ({ fetchCartCount: vi.fn() }));
vi.mock("@/lib/api/cart", () => ({ fetchCartCount }));
vi.mock("next/navigation", () => ({ usePathname: () => "/" }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

beforeEach(() => {
  window.localStorage.clear();
  fetchCartCount.mockReset();
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia;
});

describe("AnnouncementBar", () => {
  it("no renderiza nada si está apagada o vacía", () => {
    const { container, rerender } = render(<AnnouncementBar announcement={{ enabled: false, messages: ["x"] }} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<AnnouncementBar announcement={{ enabled: true, messages: [] }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("muestra los mensajes como texto y oculta la copia duplicada al lector de pantalla", () => {
    render(<AnnouncementBar announcement={{ enabled: true, messages: ["<b>Envío</b> gratis"] }} />);
    expect(screen.getByRole("region", { name: "Anuncios" })).toBeInTheDocument();
    // Plain text, never HTML: the angle brackets survive literally.
    expect(screen.getAllByText("<b>Envío</b> gratis").length).toBeGreaterThan(1);
    expect(document.querySelector("b")).toBeNull();
    expect(document.querySelectorAll('ul[aria-hidden="true"]')).toHaveLength(1);
  });
});

describe("SiteHeader", () => {
  it("visitante: Iniciar sesión y contador desde el carrito del navegador", async () => {
    window.localStorage.setItem(GUEST_CART_KEY, JSON.stringify([{ variantId: "a", qty: 2 }]));
    render(<SiteHeader authenticated={false} />);
    expect(screen.getAllByRole("link", { name: "Iniciar sesión" })[0]).toHaveAttribute("href", "/ingresar");
    expect(await screen.findByRole("link", { name: /Carrito, 2 artículos/ })).toHaveAttribute("href", "/carrito");
    expect(fetchCartCount).not.toHaveBeenCalled();
  });

  it("con sesión: Mi cuenta y contador desde el API", async () => {
    fetchCartCount.mockResolvedValue(5);
    render(<SiteHeader authenticated />);
    expect(screen.getAllByRole("link", { name: "Mi cuenta" })[0]).toHaveAttribute("href", "/cuenta");
    expect(await screen.findByRole("link", { name: /Carrito, 5 artículos/ })).toBeInTheDocument();
  });

  it("el logo lleva a inicio y Tienda a /tienda", () => {
    render(<SiteHeader authenticated={false} />);
    expect(screen.getByRole("link", { name: "Gira Clothing, inicio" })).toHaveAttribute("href", "/");
    expect(screen.getAllByRole("link", { name: "Tienda" })[0]).toHaveAttribute("href", "/tienda");
  });
});

describe("MobileMenu", () => {
  it("abre y cierra con aria-expanded, Esc y devuelve el foco al botón", async () => {
    render(<MobileMenu authenticated={false} />);
    const toggle = screen.getByRole("button", { name: "Abrir menú" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    await userEvent.click(toggle);
    const open = screen.getByRole("button", { name: "Cerrar menú" });
    expect(open).toHaveAttribute("aria-expanded", "true");
    expect(open.getAttribute("aria-controls")).toBe(screen.getByRole("navigation", { name: "Menú móvil" }).id);
    expect(document.body.style.overflow).toBe("hidden");

    await userEvent.keyboard("{Escape}");
    const closed = screen.getByRole("button", { name: "Abrir menú" });
    expect(closed).toHaveAttribute("aria-expanded", "false");
    expect(document.body.style.overflow).toBe("");
    expect(closed).toHaveFocus();
  });
});
