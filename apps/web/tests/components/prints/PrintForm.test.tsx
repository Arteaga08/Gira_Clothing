import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PrintForm, type PrintFormProps } from "@/components/prints/PrintForm";
import { makeImage } from "../../helpers/catalog";
import { chooseOption } from "../../helpers/select";
import { FAMILY_A_ID, FAMILY_B_ID, makePanelPrint } from "../../helpers/prints";

const FAMILIES = [
  { value: FAMILY_A_ID, label: "Florales" },
  { value: FAMILY_B_ID, label: "Geométricas" },
];

const setup = (overrides: Partial<PrintFormProps> = {}) => {
  const props: PrintFormProps = {
    mode: "create",
    families: FAMILIES,
    upload: vi.fn().mockResolvedValue({ ok: true, image: makeImage("nueva") }),
    uploading: false,
    saving: false,
    error: null,
    onSubmit: vi.fn(),
    onCancel: vi.fn(),
    ...overrides,
  };
  render(<PrintForm {...props} />);
  return props;
};

describe("PrintForm · crear", () => {
  it("sin datos marca cada campo y no entrega nada", async () => {
    const props = setup();
    await userEvent.click(screen.getByRole("button", { name: "Crear estampa" }));
    expect(screen.getByText("El nombre debe tener entre 2 y 80 caracteres.")).toBeInTheDocument();
    expect(screen.getByText("Elige una familia.")).toBeInTheDocument();
    expect(screen.getByText("Sube la imagen de la estampa.")).toBeInTheDocument();
    expect(props.onSubmit).not.toHaveBeenCalled();
  });

  it("con datos válidos entrega los valores (SKU en mayúsculas)", async () => {
    const props = setup();
    await userEvent.type(screen.getByLabelText("Nombre"), "Rosas");
    await userEvent.type(screen.getByLabelText("SKU"), "flr-9");
    await chooseOption(screen.getByRole("combobox", { name: "Familia" }), "Geométricas");
    await userEvent.upload(screen.getByLabelText(/Subir imagen/), new File(["x"], "r.png", { type: "image/png" }));
    await userEvent.click(screen.getByRole("button", { name: "Crear estampa" }));
    expect(props.onSubmit).toHaveBeenCalledWith({
      name: "Rosas",
      sku: "FLR-9",
      familyId: FAMILY_B_ID,
      image: makeImage("nueva"),
      homePosition: "",
    });
  });

  it("entrega la posición en la home elegida", async () => {
    const props = setup();
    await userEvent.type(screen.getByLabelText("Nombre"), "Rosas");
    await userEvent.type(screen.getByLabelText("SKU"), "flr-9");
    await chooseOption(screen.getByRole("combobox", { name: "Familia" }), "Geométricas");
    await chooseOption(screen.getByRole("combobox", { name: "Posición en la home" }), "Posición 2");
    await userEvent.upload(screen.getByLabelText(/Subir imagen/), new File(["x"], "r.png", { type: "image/png" }));
    await userEvent.click(screen.getByRole("button", { name: "Crear estampa" }));
    expect(props.onSubmit).toHaveBeenCalledWith(expect.objectContaining({ homePosition: "2" }));
  });

  it("muestra el error del API", () => {
    setup({ error: "Ya existe una estampa con ese SKU." });
    expect(screen.getByText("No se pudo crear la estampa")).toBeInTheDocument();
    expect(screen.getByText("Ya existe una estampa con ese SKU.")).toBeInTheDocument();
  });
});

describe("PrintForm · editar", () => {
  const print = makePanelPrint();

  it("el SKU es de solo lectura y avisa por qué", () => {
    setup({ mode: "edit", print });
    const sku = screen.getByLabelText("SKU");
    expect(sku).toHaveAttribute("readonly");
    expect(sku).toHaveValue("FLR-001");
    expect(screen.getByText("Fijo una vez creada: las variantes ya lo usan.")).toBeInTheDocument();
  });

  it("Guardar cambios espera un cambio real", async () => {
    setup({ mode: "edit", print });
    const save = screen.getByRole("button", { name: "Guardar cambios" });
    expect(save).toBeDisabled();
    await userEvent.type(screen.getByLabelText("Nombre"), " 2");
    expect(save).toBeEnabled();
  });

  it("entrega los valores tal cual (la imagen solo si se reemplazó)", async () => {
    const props = setup({ mode: "edit", print });
    await userEvent.type(screen.getByLabelText("Nombre"), " 2");
    await userEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    expect(props.onSubmit).toHaveBeenCalledWith({ name: "Rosas de verano 2", sku: "FLR-001", familyId: FAMILY_A_ID, image: null, homePosition: "" });
  });

  it("reemplazar la imagen la sube a la carpeta de estampas", async () => {
    const props = setup({ mode: "edit", print });
    await userEvent.upload(screen.getByLabelText(/Reemplazar imagen/), new File(["x"], "n.png", { type: "image/png" }));
    expect(props.upload).toHaveBeenCalledWith(expect.any(File), "prints");
    expect(await screen.findByRole("button", { name: "Guardar cambios" })).toBeEnabled();
  });

  it("una familia retirada sigue apareciendo, marcada", () => {
    setup({ mode: "edit", print: makePanelPrint({ family: { id: "retirada1", name: "Antigua" } }) });
    expect(screen.getByRole("combobox", { name: "Familia" })).toHaveTextContent("Antigua (retirada)");
  });
});
