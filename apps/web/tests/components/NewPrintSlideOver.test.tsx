import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NewPrintSlideOver } from "@/components/catalog/NewPrintSlideOver";
import { ToastProvider } from "@/components/ui/Toast";
import { ApiError } from "@/lib/api/ApiError";
import type { PickerPrint } from "@/lib/catalog/catalogOptions";
import { makeImage } from "../helpers/catalog";
import { chooseOption } from "../helpers/select";

const api = vi.hoisted(() => ({ createPrint: vi.fn() }));
vi.mock("@/lib/api/adminCatalog", () => api);

const CREATED: PickerPrint = {
  id: "p9",
  name: "Cassette",
  sku: "CAS",
  familyId: "f1",
  familyName: "Retro",
  imageUrl: "https://res.cloudinary.com/gira/c.jpg",
};

const setup = (overrides: Partial<React.ComponentProps<typeof NewPrintSlideOver>> = {}) => {
  const props = {
    open: true,
    onClose: vi.fn(),
    families: [
      { value: "f1", label: "Retro" },
      { value: "f2", label: "Flora" },
    ],
    onCreated: vi.fn(),
    upload: vi.fn().mockResolvedValue({ ok: true, image: makeImage("cassette") }),
    uploading: false,
    ...overrides,
  };
  render(
    <ToastProvider>
      <NewPrintSlideOver {...props} />
    </ToastProvider>,
  );
  return props;
};

const dialog = () => screen.getByRole("dialog");

beforeEach(() => api.createPrint.mockReset());

describe("NewPrintSlideOver", () => {
  it("cerrado no pinta nada", () => {
    setup({ open: false });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("sin datos muestra qué falta y no llama al API", async () => {
    setup();
    await userEvent.click(within(dialog()).getByRole("button", { name: "Crear estampa" }));
    expect(screen.getByText("El nombre debe tener entre 2 y 80 caracteres.")).toBeInTheDocument();
    expect(screen.getByText("El SKU debe tener de 2 a 24 caracteres: letras, números y guiones.")).toBeInTheDocument();
    expect(screen.getByText("Elige una familia.")).toBeInTheDocument();
    expect(screen.getByText("Sube la imagen de la estampa.")).toBeInTheDocument();
    expect(api.createPrint).not.toHaveBeenCalled();
  });

  it("el SKU se escribe en mayúsculas", async () => {
    setup();
    const sku = within(dialog()).getByLabelText("SKU");
    await userEvent.type(sku, "cas-1");
    expect(sku).toHaveValue("CAS-1");
  });

  it("crea la estampa, la entrega al selector y cierra", async () => {
    api.createPrint.mockResolvedValue(CREATED);
    const props = setup();
    await userEvent.type(within(dialog()).getByLabelText("Nombre"), "  Cassette ");
    await userEvent.type(within(dialog()).getByLabelText("SKU"), "cas");
    await chooseOption(within(dialog()).getByLabelText("Familia"), "Retro");
    await userEvent.upload(
      within(dialog()).getByLabelText(/Subir imagen/),
      new File(["x"], "cassette.png", { type: "image/png" }),
    );
    await waitFor(() => expect(props.upload).toHaveBeenCalledWith(expect.any(File), "prints"));
    await userEvent.click(within(dialog()).getByRole("button", { name: "Crear estampa" }));
    await waitFor(() => expect(props.onCreated).toHaveBeenCalledWith(CREATED));
    expect(api.createPrint).toHaveBeenCalledWith({
      name: "Cassette",
      sku: "CAS",
      family: "f1",
      image: makeImage("cassette"),
    });
    expect(props.onClose).toHaveBeenCalled();
  });

  it("un error del API se muestra en el panel y no cierra", async () => {
    api.createPrint.mockRejectedValueOnce(new ApiError("Ya existe una estampa con ese SKU.", "http", 409));
    const props = setup();
    await userEvent.type(within(dialog()).getByLabelText("Nombre"), "Cassette");
    await userEvent.type(within(dialog()).getByLabelText("SKU"), "cas");
    await chooseOption(within(dialog()).getByLabelText("Familia"), "Retro");
    await userEvent.upload(
      within(dialog()).getByLabelText(/Subir imagen/),
      new File(["x"], "c.png", { type: "image/png" }),
    );
    await userEvent.click(within(dialog()).getByRole("button", { name: "Crear estampa" }));
    expect(await screen.findByText("Ya existe una estampa con ese SKU.")).toBeInTheDocument();
    expect(props.onClose).not.toHaveBeenCalled();
    expect(props.onCreated).not.toHaveBeenCalled();
  });

  it("un error de subida queda enlazado al input con aria-describedby", async () => {
    setup({ upload: vi.fn().mockResolvedValue({ ok: false, message: "La imagen pesa más de 5 MB." }) });
    await userEvent.upload(
      within(dialog()).getByLabelText(/Subir imagen/),
      new File(["x"], "grande.png", { type: "image/png" }),
    );
    expect(await within(dialog()).findByRole("alert")).toHaveTextContent("La imagen pesa más de 5 MB.");
    expect(within(dialog()).getByLabelText(/Subir imagen/)).toHaveAccessibleDescription("La imagen pesa más de 5 MB.");
  });
});
