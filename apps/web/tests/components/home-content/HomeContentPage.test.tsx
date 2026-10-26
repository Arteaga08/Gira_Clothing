import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HomeContentPage } from "@/components/home-content/HomeContentPage";
import { ToastProvider } from "@/components/ui/Toast";

const { client, uploads, products } = vi.hoisted(() => ({
  client: { get: vi.fn(), updateAnnouncement: vi.fn(), updateHero: vi.fn(), updateOfferBanner: vi.fn() },
  uploads: { uploadImage: vi.fn() },
  products: { fetchHeroProductOptions: vi.fn() },
}));
vi.mock("@/lib/api/adminSettings", () => ({ settingsClient: client }));
vi.mock("@/lib/api/adminUploads", () => uploads);
vi.mock("@/lib/api/adminHeroProducts", () => products);

const IMAGE = { url: "https://res.cloudinary.com/gira/image/upload/a.jpg", publicId: "gira/home/a", width: 1600, height: 1000 };

const EMPTY_BANNER = { enabled: false, image: null, alt: "", message: "", buttonLabel: "", productId: null };

const makeSettings = (
  announcement = { enabled: false, messages: [] as string[] },
  hero: { slides: unknown[] } = { slides: [] },
  offerBanner: Record<string, unknown> = EMPTY_BANNER,
) => ({
  id: "s1",
  storefront: { announcement, hero, offerBanner },
});

const renderPage = () =>
  render(
    <ToastProvider>
      <HomeContentPage />
    </ToastProvider>,
  );

beforeEach(() => {
  client.get.mockReset().mockResolvedValue(makeSettings());
  client.updateAnnouncement.mockReset();
  client.updateHero.mockReset();
  client.updateOfferBanner.mockReset();
  uploads.uploadImage.mockReset().mockResolvedValue(IMAGE);
  products.fetchHeroProductOptions.mockReset().mockResolvedValue([{ value: "p1", label: "Playera Flor" }]);
});

describe("HomeContentPage", () => {
  it("la tarjeta muestra el estado y guarda los mensajes", async () => {
    client.updateAnnouncement.mockResolvedValue(makeSettings({ enabled: true, messages: ["Envío gratis"] }));
    renderPage();
    const card = (await screen.findByText("Oculta")).closest("section") ?? document.body;
    await userEvent.click(within(card as HTMLElement).getByRole("button", { name: "Editar" }));

    await userEvent.click(await screen.findByRole("switch", { name: "Mostrar la barra en la tienda" }));
    await userEvent.type(screen.getByLabelText("Mensaje 1"), "  Envío gratis ");
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() =>
      expect(client.updateAnnouncement).toHaveBeenCalledWith({ enabled: true, messages: ["Envío gratis"] }),
    );
  });

  it("no envía una barra encendida sin mensajes", async () => {
    renderPage();
    const card = (await screen.findByText("Oculta")).closest("section") ?? document.body;
    await userEvent.click(within(card as HTMLElement).getByRole("button", { name: "Editar" }));
    await userEvent.click(await screen.findByRole("switch", { name: "Mostrar la barra en la tienda" }));
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(await screen.findByText("Agrega al menos un mensaje para mostrar la barra.")).toBeInTheDocument();
    expect(client.updateAnnouncement).not.toHaveBeenCalled();
  });

  describe("portada", () => {
    const firstPhotoInput = async (): Promise<HTMLInputElement> => {
      const label = (await screen.findByText("Subir la primera foto")).closest("label");
      return label?.querySelector("input") as HTMLInputElement;
    };

    const openHero = async () => {
      renderPage();
      const card = (await screen.findByText("Sin fotos")).closest("section") ?? document.body;
      await userEvent.click(within(card as HTMLElement).getByRole("button", { name: "Editar" }));
    };

    it("no envía un titular de más de 3 palabras", async () => {
      await openHero();
      await userEvent.upload(await firstPhotoInput(), new File(["x"], "foto.jpg", { type: "image/jpeg" }));
      await userEvent.type(await screen.findByLabelText("Titular de esta foto"), "uno dos tres cuatro");
      await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
      expect(await screen.findByText("Foto 1: el titular admite hasta 3 palabras.")).toBeInTheDocument();
      expect(client.updateHero).not.toHaveBeenCalled();
    });

    it("sube una foto con su titular y la manda con valores por defecto (hueso, amarillo, sin producto ni cards)", async () => {
      client.updateHero.mockResolvedValue(makeSettings());
      await openHero();
      await userEvent.upload(await firstPhotoInput(), new File(["x"], "foto.jpg", { type: "image/jpeg" }));
      expect(await screen.findByRole("heading", { name: "Foto 1" })).toBeInTheDocument();
      expect(uploads.uploadImage).toHaveBeenCalledWith(expect.any(File), "home");
      await userEvent.type(screen.getByLabelText("Titular de esta foto"), "  Estampa que gira ");

      await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
      await waitFor(() =>
        expect(client.updateHero).toHaveBeenCalledWith({
          slides: [{ headline: "Estampa que gira", image: IMAGE, productId: null, titleColor: "bone", buttonColor: "yellow", cards: [] }],
        }),
      );
    });

    it("el botón no ofrece el color hueso y cada card se limita a 2", async () => {
      await openHero();
      await userEvent.upload(await firstPhotoInput(), new File(["x"], "foto.jpg", { type: "image/jpeg" }));
      const buttonColors = within(await screen.findByRole("group", { name: "Color del botón" }));
      expect(buttonColors.queryByLabelText("Hueso")).not.toBeInTheDocument();
      expect(buttonColors.getByLabelText("Amarillo")).toBeChecked();

      await userEvent.click(screen.getByRole("button", { name: "Agregar card" }));
      await userEvent.click(screen.getByRole("button", { name: "Agregar card" }));
      expect(screen.getByRole("button", { name: "Agregar card" })).toBeDisabled();
    });
  });

  describe("banner de ofertas", () => {
    const openBanner = async () => {
      renderPage();
      const card = (await screen.findByText("Oculto")).closest("section") ?? document.body;
      await userEvent.click(within(card as HTMLElement).getByRole("button", { name: "Editar" }));
      return within(await screen.findByRole("dialog"));
    };

    it("no muestra un banner incompleto", async () => {
      const dialog = await openBanner();
      await userEvent.click(dialog.getByRole("switch", { name: "Mostrar el banner en la tienda" }));
      await userEvent.type(dialog.getByLabelText("Frase que corre"), "Rebajas");
      await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
      expect(
        await screen.findByText("Para mostrar el banner completa la foto, su descripción, la frase y el botón."),
      ).toBeInTheDocument();
      expect(client.updateOfferBanner).not.toHaveBeenCalled();
    });

    it("el botón lleva a un producto elegido de la lista, como en la portada; no hay campo de enlace", async () => {
      const dialog = await openBanner();
      expect(dialog.getByText("Producto al que lleva")).toBeInTheDocument();
      expect(dialog.getAllByText("Ir a la tienda (sin producto)").length).toBeGreaterThan(0);
      expect(dialog.queryByLabelText("Enlace")).not.toBeInTheDocument();
      expect(products.fetchHeroProductOptions).toHaveBeenCalled();
    });

    it("sube la foto y guarda el banner visible con los textos recortados", async () => {
      client.updateOfferBanner.mockResolvedValue(makeSettings());
      const dialog = await openBanner();
      const input = (await screen.findByText("Subir foto")).closest("label")?.querySelector("input") as HTMLInputElement;
      await userEvent.upload(input, new File(["x"], "banner.jpg", { type: "image/jpeg" }));
      expect(await screen.findByText("Cambiar foto")).toBeInTheDocument();
      expect(uploads.uploadImage).toHaveBeenCalledWith(expect.any(File), "home");

      await userEvent.click(dialog.getByRole("switch", { name: "Mostrar el banner en la tienda" }));
      await userEvent.type(dialog.getByLabelText("Descripción de la foto"), "Modelo con playeras");
      await userEvent.type(dialog.getByLabelText("Frase que corre"), "  Rebajas de temporada ");
      await userEvent.type(dialog.getByLabelText("Texto del botón"), "Comprar ahora");
      await userEvent.click(screen.getByRole("button", { name: "Guardar" }));

      await waitFor(() =>
        expect(client.updateOfferBanner).toHaveBeenCalledWith({
          enabled: true,
          image: IMAGE,
          alt: "Modelo con playeras",
          message: "Rebajas de temporada",
          buttonLabel: "Comprar ahora",
          productId: null,
        }),
      );
    });
  });
});
