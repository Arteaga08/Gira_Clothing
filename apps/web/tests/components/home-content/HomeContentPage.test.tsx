import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HomeContentPage } from "@/components/home-content/HomeContentPage";
import { ToastProvider } from "@/components/ui/Toast";

const { client, uploads, products } = vi.hoisted(() => ({
  client: { get: vi.fn(), updateAnnouncement: vi.fn(), updateHero: vi.fn(), updateOfferBanner: vi.fn(), updateEvents: vi.fn() },
  uploads: { uploadImage: vi.fn() },
  products: { fetchHeroProductOptions: vi.fn() },
}));
vi.mock("@/lib/api/adminSettings", () => ({ settingsClient: client }));
vi.mock("@/lib/api/adminUploads", () => uploads);
vi.mock("@/lib/api/adminHeroProducts", () => products);

const IMAGE = { url: "https://res.cloudinary.com/gira/image/upload/a.jpg", publicId: "gira/home/a", width: 1600, height: 1000 };

const EMPTY_BANNER = { enabled: false, image: null, alt: "", message: "", buttonLabel: "", productId: null };

const EMPTY_EVENTS = { items: [] as unknown[], emptyMessage: "", emptyLinkUrl: "" };

const makeSettings = (
  announcement = { enabled: false, messages: [] as string[] },
  hero: { slides: unknown[] } = { slides: [] },
  offerBanner: Record<string, unknown> = EMPTY_BANNER,
  events: { items: unknown[]; emptyMessage: string; emptyLinkUrl: string } = EMPTY_EVENTS,
) => ({
  id: "s1",
  storefront: { announcement, hero, offerBanner, events },
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
  client.updateEvents.mockReset();
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
  describe("Eventos", () => {
    const openEvents = async () => {
      const card = (await screen.findByRole("heading", { name: "Eventos" })).closest("section") ?? document.body;
      await userEvent.click(within(card as HTMLElement).getByRole("button", { name: "Editar" }));
    };

    it("la tarjeta avisa que no hay eventos próximos", async () => {
      renderPage();
      expect(await screen.findByText("Sin eventos próximos")).toBeInTheDocument();
    });

    it("la tarjeta cuenta los próximos y nombra el más cercano, sin contar los pasados", async () => {
      client.get.mockResolvedValue(
        makeSettings(undefined, undefined, undefined, {
          items: [
            { id: "e1", title: "Bazar viejo", date: "2020-01-01", startTime: "10:00", endTime: "", city: "MTY", venue: "X", mapsUrl: "", image: null, alt: "" },
            { id: "e2", title: "Bazar Callejero", date: "2099-11-14", startTime: "11:00", endTime: "", city: "Monterrey", venue: "Fundidora", mapsUrl: "", image: null, alt: "" },
          ],
          emptyMessage: "Pronto",
          emptyLinkUrl: "",
        }),
      );
      renderPage();
      expect(await screen.findByText("1 próximo")).toBeInTheDocument();
      expect(screen.getByText(/Bazar Callejero/)).toBeInTheDocument();
      expect(screen.queryByText(/Bazar viejo/)).not.toBeInTheDocument();
    });

    it("agrega un evento, pide el mensaje de vacío y guarda lo escrito con los espacios recortados", async () => {
      client.updateEvents.mockResolvedValue(makeSettings());
      renderPage();
      await openEvents();

      await userEvent.click(await screen.findByRole("button", { name: "Agregar evento" }));
      await userEvent.type(screen.getByLabelText("Nombre del evento"), "  Bazar Callejero ");
      await userEvent.type(screen.getByLabelText("Fecha"), "2099-11-14");
      await userEvent.type(screen.getByLabelText("Hora de inicio"), "11:00");
      await userEvent.type(screen.getByLabelText("Ciudad"), "Monterrey");
      await userEvent.type(screen.getByLabelText("Lugar"), "Parque Fundidora");

      await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
      expect(await screen.findByText("Escribe el mensaje que se muestra cuando no hay eventos.")).toBeInTheDocument();
      expect(client.updateEvents).not.toHaveBeenCalled();

      await userEvent.type(screen.getByLabelText("Mensaje"), "Pronto anunciamos la siguiente parada");
      await userEvent.click(screen.getByRole("button", { name: "Guardar" }));

      await waitFor(() => expect(client.updateEvents).toHaveBeenCalledTimes(1));
      const sent = client.updateEvents.mock.calls[0]?.[0] as { items: Record<string, unknown>[]; emptyMessage: string };
      expect(sent.emptyMessage).toBe("Pronto anunciamos la siguiente parada");
      expect(sent.items[0]).toMatchObject({
        title: "Bazar Callejero",
        date: "2099-11-14",
        startTime: "11:00",
        city: "Monterrey",
        venue: "Parque Fundidora",
        mapsUrl: "",
        image: null,
      });
    });

    it("rechaza un enlace del mapa sin https antes de llamar al API", async () => {
      renderPage();
      await openEvents();
      await userEvent.click(await screen.findByRole("button", { name: "Agregar evento" }));
      await userEvent.type(screen.getByLabelText("Nombre del evento"), "Bazar");
      await userEvent.type(screen.getByLabelText("Fecha"), "2099-11-14");
      await userEvent.type(screen.getByLabelText("Hora de inicio"), "11:00");
      await userEvent.type(screen.getByLabelText("Ciudad"), "Monterrey");
      await userEvent.type(screen.getByLabelText("Lugar"), "Fundidora");
      await userEvent.type(screen.getByLabelText("Enlace del mapa"), "http://maps.example.com");
      await userEvent.type(screen.getByLabelText("Mensaje"), "Pronto");
      await userEvent.click(screen.getByRole("button", { name: "Guardar" }));

      expect(await screen.findByText("Evento 1: el enlace del mapa debe empezar con https://.")).toBeInTheDocument();
      expect(client.updateEvents).not.toHaveBeenCalled();
    });

    it("quita un evento de la lista", async () => {
      client.get.mockResolvedValue(
        makeSettings(undefined, undefined, undefined, {
          items: [{ id: "e2", title: "Bazar Callejero", date: "2099-11-14", startTime: "11:00", endTime: "", city: "Monterrey", venue: "Fundidora", mapsUrl: "", image: null, alt: "" }],
          emptyMessage: "Pronto",
          emptyLinkUrl: "",
        }),
      );
      renderPage();
      await openEvents();
      await userEvent.click(await screen.findByRole("button", { name: "Quitar el evento 1" }));
      expect(screen.queryByLabelText("Nombre del evento")).not.toBeInTheDocument();
      expect(screen.getByText("Aún no hay eventos guardados.")).toBeInTheDocument();
    });
  });
});
