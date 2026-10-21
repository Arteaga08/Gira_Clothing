import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PrintSlideOver } from "@/components/prints/PrintSlideOver";
import { ToastProvider } from "@/components/ui/Toast";
import { ApiError } from "@/lib/api/ApiError";
import { makeImage } from "../../helpers/catalog";
import { chooseOption } from "../../helpers/select";
import { FAMILY_A_ID, FAMILY_B_ID, PRINT_ID, makePanelPrint } from "../../helpers/prints";

const api = vi.hoisted(() => ({
  createAdminPrint: vi.fn(),
  updateAdminPrint: vi.fn(),
  retirePrint: vi.fn(),
  reactivatePrint: vi.fn(),
  getPrint: vi.fn(),
}));
vi.mock("@/lib/api/adminPrints", () => api);
const uploads = vi.hoisted(() => ({ uploadImage: vi.fn() }));
vi.mock("@/lib/api/adminUploads", () => uploads);

const FAMILIES = [
  { value: FAMILY_A_ID, label: "Florales" },
  { value: FAMILY_B_ID, label: "Geométricas" },
];

const setup = (selected: string | undefined, prints = [makePanelPrint()]) => {
  const props = { selected, prints, families: FAMILIES, onClose: vi.fn(), onChanged: vi.fn() };
  render(
    <ToastProvider>
      <PrintSlideOver {...props} />
    </ToastProvider>,
  );
  return props;
};

const dialog = () => screen.getByRole("dialog");

beforeEach(() => {
  Object.values(api).forEach((fn) => fn.mockReset());
  uploads.uploadImage.mockReset().mockResolvedValue(makeImage("nueva"));
});

describe("PrintSlideOver", () => {
  it("cerrado no pinta nada", () => {
    setup(undefined);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("«nueva» abre el formulario de crear y, al guardar, refresca y cierra", async () => {
    api.createAdminPrint.mockResolvedValue(makePanelPrint());
    const props = setup("nueva");
    expect(within(dialog()).getByRole("heading", { name: "Nueva estampa" })).toBeInTheDocument();
    await userEvent.type(within(dialog()).getByLabelText("Nombre"), "Rosas");
    await userEvent.type(within(dialog()).getByLabelText("SKU"), "flr-9");
    await chooseOption(within(dialog()).getByRole("combobox", { name: "Familia" }), "Florales");
    await userEvent.upload(within(dialog()).getByLabelText(/Subir imagen/), new File(["x"], "r.png", { type: "image/png" }));
    await userEvent.click(within(dialog()).getByRole("button", { name: "Crear estampa" }));
    await waitFor(() => expect(props.onChanged).toHaveBeenCalled());
    expect(api.createAdminPrint).toHaveBeenCalledWith(expect.objectContaining({ name: "Rosas", sku: "FLR-9", family: FAMILY_A_ID }));
    expect(props.onClose).toHaveBeenCalled();
  });

  it("una estampa de la lista abre sin pedirla al API y guarda solo lo que cambió", async () => {
    api.updateAdminPrint.mockResolvedValue(makePanelPrint({ name: "Rosas 2" }));
    const props = setup(PRINT_ID);
    expect(api.getPrint).not.toHaveBeenCalled();
    expect(within(dialog()).getByRole("heading", { name: "Rosas de verano" })).toBeInTheDocument();
    await userEvent.type(within(dialog()).getByLabelText("Nombre"), "!");
    await userEvent.click(within(dialog()).getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(api.updateAdminPrint).toHaveBeenCalledWith(PRINT_ID, { name: "Rosas de verano!" }));
    expect(props.onChanged).toHaveBeenCalled();
    expect(props.onClose).toHaveBeenCalled();
  });

  it("un error del API al guardar se queda en el panel", async () => {
    api.updateAdminPrint.mockRejectedValue(new ApiError("El nombre no es válido.", "http", 400));
    const props = setup(PRINT_ID);
    await userEvent.type(within(dialog()).getByLabelText("Nombre"), "!");
    await userEvent.click(within(dialog()).getByRole("button", { name: "Guardar cambios" }));
    expect(await within(dialog()).findByText("El nombre no es válido.")).toBeInTheDocument();
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it("si la estampa no está en la página cargada la pide al API", async () => {
    api.getPrint.mockResolvedValue(makePanelPrint({ id: "68f2ab12c3d4e5f6a7b8c9ff", name: "Lejana" }));
    setup("68f2ab12c3d4e5f6a7b8c9ff", []);
    expect(dialog()).toHaveAttribute("aria-modal", "true");
    expect(await within(dialog()).findByLabelText("Nombre")).toHaveValue("Lejana");
  });

  it("si no se puede cargar ofrece reintentar", async () => {
    api.getPrint.mockRejectedValueOnce(new ApiError("Sin conexión.", "network"));
    api.getPrint.mockResolvedValueOnce(makePanelPrint({ id: "68f2ab12c3d4e5f6a7b8c9ff", name: "Lejana" }));
    setup("68f2ab12c3d4e5f6a7b8c9ff", []);
    expect(await within(dialog()).findByText("Sin conexión.")).toBeInTheDocument();
    await userEvent.click(within(dialog()).getByRole("button", { name: "Reintentar" }));
    expect(await within(dialog()).findByLabelText("Nombre")).toHaveValue("Lejana");
  });

  it("una estampa que ya no existe (404) solo deja cerrar", async () => {
    api.getPrint.mockRejectedValue(new ApiError("El estampado no existe.", "http", 404));
    const props = setup("68f2ab12c3d4e5f6a7b8c9ff", []);
    expect(await within(dialog()).findByText(/ya no existe/)).toBeInTheDocument();
    expect(within(dialog()).queryByRole("button", { name: "Reintentar" })).not.toBeInTheDocument();
    await userEvent.click(within(dialog()).getByRole("button", { name: "Cerrar" }));
    expect(props.onClose).toHaveBeenCalled();
  });

  it("con variantes activas el retiro está bloqueado y explica por qué", () => {
    setup(PRINT_ID);
    expect(within(dialog()).getByRole("button", { name: "Retirar estampa" })).toBeDisabled();
    expect(within(dialog()).getByText(/No se puede retirar todavía/)).toBeInTheDocument();
  });

  it("retira una estampa sin variantes tras confirmar", async () => {
    api.retirePrint.mockResolvedValue(makePanelPrint({ isActive: false }));
    const props = setup(PRINT_ID, [makePanelPrint({ activeVariantCount: 0, activeProducts: [] })]);
    await userEvent.click(within(dialog()).getByRole("button", { name: "Retirar estampa" }));
    const confirm = screen.getAllByRole("dialog").at(-1) as HTMLElement;
    await userEvent.click(within(confirm).getByRole("button", { name: "Retirar estampa" }));
    await waitFor(() => expect(api.retirePrint).toHaveBeenCalledWith(PRINT_ID));
    await waitFor(() => expect(props.onChanged).toHaveBeenCalled());
  });

  it("reactivar con la familia retirada muestra el 409 del API junto al botón", async () => {
    api.reactivatePrint.mockRejectedValue(
      new ApiError("No puedes reactivar este estampado: su familia está retirada.", "http", 409),
    );
    const props = setup(PRINT_ID, [makePanelPrint({ isActive: false, activeVariantCount: 0, activeProducts: [] })]);
    await userEvent.click(within(dialog()).getByRole("button", { name: "Reactivar estampa" }));
    expect(await within(dialog()).findByRole("alert")).toHaveTextContent("su familia está retirada");
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it("Escape cierra el panel", async () => {
    const props = setup(PRINT_ID);
    await userEvent.keyboard("{Escape}");
    expect(props.onClose).toHaveBeenCalled();
  });
});

describe("PrintSlideOver · hidratación", () => {
  it("no pinta nada en el servidor aunque la URL traiga una estampa abierta", async () => {
    const { renderToString } = await import("react-dom/server");
    const html = renderToString(
      <ToastProvider>
        <PrintSlideOver selected={PRINT_ID} prints={[makePanelPrint()]} families={FAMILIES} onClose={vi.fn()} onChanged={vi.fn()} />
      </ToastProvider>,
    );
    // The panel renders nothing on the server; only the toast host's own (empty) container is there.
    expect(html).not.toContain("Rosas de verano");
    expect(html).not.toContain('role="dialog"');
  });
});
