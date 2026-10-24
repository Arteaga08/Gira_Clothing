import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HomeContentPage } from "@/components/home-content/HomeContentPage";
import { ToastProvider } from "@/components/ui/Toast";

const { client, uploads, products } = vi.hoisted(() => ({
  client: { get: vi.fn(), updateAnnouncement: vi.fn(), updateHero: vi.fn() },
  uploads: { uploadImage: vi.fn() },
  products: { fetchHeroProductOptions: vi.fn() },
}));
vi.mock("@/lib/api/adminSettings", () => ({ settingsClient: client }));
vi.mock("@/lib/api/adminUploads", () => uploads);
vi.mock("@/lib/api/adminHeroProducts", () => products);

const IMAGE = { url: "https://res.cloudinary.com/gira/image/upload/a.jpg", publicId: "gira/home/a", width: 1600, height: 1000 };

const makeSettings = (
  announcement = { enabled: false, messages: [] as string[] },
  hero: { headline: string; slides: unknown[] } = { headline: "", slides: [] },
) => ({
  id: "s1",
  storefront: { announcement, hero },
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
      expect(within(card as HTMLElement).getByText("Gira Clothing (por defecto)")).toBeInTheDocument();
      await userEvent.click(within(card as HTMLElement).getByRole("button", { name: "Editar" }));
    };

    it("guarda el titular sin fotos", async () => {
      client.updateHero.mockResolvedValue(makeSettings(undefined, { headline: "Estampa que gira", slides: [] }));
      await openHero();
      await userEvent.type(await screen.findByLabelText("Titular"), "  Estampa que gira ");
      await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
      await waitFor(() => expect(client.updateHero).toHaveBeenCalledWith({ headline: "Estampa que gira", slides: [] }));
    });

    it("no envía un titular de más de 3 palabras", async () => {
      await openHero();
      await userEvent.type(await screen.findByLabelText("Titular"), "uno dos tres cuatro");
      await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
      expect(await screen.findByText("El titular admite hasta 3 palabras.")).toBeInTheDocument();
      expect(client.updateHero).not.toHaveBeenCalled();
    });

    it("sube una foto y la manda con valores por defecto (hueso, amarillo, sin producto ni cards)", async () => {
      client.updateHero.mockResolvedValue(makeSettings());
      await openHero();
      await userEvent.upload(await firstPhotoInput(), new File(["x"], "foto.jpg", { type: "image/jpeg" }));
      expect(await screen.findByRole("heading", { name: "Foto 1" })).toBeInTheDocument();
      expect(uploads.uploadImage).toHaveBeenCalledWith(expect.any(File), "home");

      await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
      await waitFor(() =>
        expect(client.updateHero).toHaveBeenCalledWith({
          headline: "",
          slides: [{ image: IMAGE, productId: null, titleColor: "bone", buttonColor: "yellow", cards: [] }],
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
});
