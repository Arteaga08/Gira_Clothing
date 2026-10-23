import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HomeContentPage } from "@/components/home-content/HomeContentPage";
import { ToastProvider } from "@/components/ui/Toast";

const { client } = vi.hoisted(() => ({ client: { get: vi.fn(), updateAnnouncement: vi.fn() } }));
vi.mock("@/lib/api/adminSettings", () => ({ settingsClient: client }));

const makeSettings = (announcement = { enabled: false, messages: [] as string[] }) => ({
  id: "s1",
  storefront: { announcement },
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
});
