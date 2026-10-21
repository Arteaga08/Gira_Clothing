import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TaxonModal } from "@/components/taxonomy/TaxonModal";
import { ToastProvider } from "@/components/ui/Toast";
import { ApiError } from "@/lib/api/ApiError";
import { familyConfig } from "@/lib/taxonomy/config";
import { FAMILY_ID, FAMILY_2_ID, makePanelTaxon } from "../../helpers/taxonomy";

const client = vi.hoisted(() => ({ current: null as null | ReturnType<typeof import("../../helpers/taxonomy").makeClientMock> }));
vi.mock("@/lib/api/adminTaxonomy", async () => {
  const { makeClientMock: make } = await import("../../helpers/taxonomy");
  client.current = make();
  return { familyClient: client.current, categoryClient: make() };
});

const mock = () => client.current!;
const onClose = vi.fn();
const onChanged = vi.fn();

const renderModal = (selected: string | undefined, items = [makePanelTaxon()]) =>
  render(
    <ToastProvider>
      <TaxonModal config={familyConfig} selected={selected} items={items} onClose={onClose} onChanged={onChanged} />
    </ToastProvider>,
  );

beforeEach(() => {
  Object.values(mock()).forEach((fn) => fn.mockReset());
  onClose.mockReset();
  onChanged.mockReset();
});

describe("TaxonModal", () => {
  it("sin selección no dibuja nada", () => {
    renderModal(undefined);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("abre un registro de la lista sin pedir nada, con sus datos", async () => {
    renderModal(FAMILY_ID);
    const dialog = await screen.findByRole("dialog", { name: "Florales" });
    expect(within(dialog).getByLabelText("Nombre")).toHaveValue("Florales");
    expect(within(dialog).getByLabelText("Descripción")).toHaveValue("Rosas y peonías");
    expect(mock().get).not.toHaveBeenCalled();
  });

  it("«Guardar cambios» está desactivado hasta que algo cambia y manda solo lo cambiado", async () => {
    mock().update.mockResolvedValue(makePanelTaxon({ name: "Florales 2" }));
    renderModal(FAMILY_ID);
    const save = await screen.findByRole("button", { name: "Guardar cambios" });
    expect(save).toBeDisabled();
    await userEvent.type(screen.getByLabelText("Nombre"), " 2");
    expect(save).toBeEnabled();
    await userEvent.click(save);
    await waitFor(() => expect(mock().update).toHaveBeenCalledWith(FAMILY_ID, { name: "Florales 2" }));
    expect(onChanged).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("crear valida el nombre antes de pedir nada y luego crea", async () => {
    mock().create.mockResolvedValue(makePanelTaxon());
    renderModal("nueva");
    const create = await screen.findByRole("button", { name: "Crear familia" });
    await userEvent.type(screen.getByLabelText("Nombre"), "a");
    await userEvent.click(create);
    expect(await screen.findByText(/entre 2 y 80/)).toBeInTheDocument();
    expect(mock().create).not.toHaveBeenCalled();
    await userEvent.type(screen.getByLabelText("Nombre"), "bc");
    await userEvent.click(create);
    await waitFor(() => expect(mock().create).toHaveBeenCalledWith({ name: "abc" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("un error del API se muestra en el modal y no cierra", async () => {
    mock().update.mockRejectedValue(new ApiError("Ya existe una familia con ese nombre.", "http", 409));
    renderModal(FAMILY_ID);
    await userEvent.type(await screen.findByLabelText("Nombre"), "x");
    await userEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    expect(await screen.findByText("Ya existe una familia con ese nombre.")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("un registro que no está en la lista se pide al API", async () => {
    mock().get.mockResolvedValue(makePanelTaxon({ id: FAMILY_2_ID, name: "Rayas", activeChildCount: 0, activeChildren: [] }));
    renderModal(FAMILY_2_ID);
    expect(await screen.findByRole("dialog", { name: "Rayas" })).toBeInTheDocument();
    expect(mock().get).toHaveBeenCalledWith(FAMILY_2_ID);
  });

  it("404: «ya no existe» con solo «Cerrar»", async () => {
    mock().get.mockRejectedValue(new ApiError("No existe.", "http", 404));
    renderModal(FAMILY_2_ID, []);
    expect(await screen.findByText(/La familia ya no existe/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reintentar" })).not.toBeInTheDocument();
    await userEvent.click(screen.getAllByRole("button", { name: "Cerrar" }).at(-1) as HTMLElement);
    expect(onClose).toHaveBeenCalled();
  });

  it("otro error de carga ofrece «Reintentar»", async () => {
    mock().get.mockRejectedValueOnce(new ApiError("Sin conexión.", "network"));
    mock().get.mockResolvedValueOnce(makePanelTaxon({ id: FAMILY_2_ID, name: "Rayas" }));
    renderModal(FAMILY_2_ID, []);
    await userEvent.click(await screen.findByRole("button", { name: "Reintentar" }));
    expect(await screen.findByRole("dialog", { name: "Rayas" })).toBeInTheDocument();
  });

  it("retirar una familia con estampas activas queda bloqueado dentro del modal", async () => {
    renderModal(FAMILY_ID);
    expect(await screen.findByText("No se puede retirar todavía")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retirar familia" })).toBeDisabled();
  });

  it("con texto sin guardar, Escape pregunta antes de descartar", async () => {
    renderModal(FAMILY_ID);
    await userEvent.type(await screen.findByLabelText("Nombre"), "x");
    await userEvent.keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();
    expect(await screen.findByText("¿Descartar los cambios?")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Descartar" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("sin cambios, Escape cierra directo", async () => {
    renderModal(FAMILY_ID);
    await screen.findByLabelText("Nombre");
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("mientras guarda no se puede cerrar con Escape", async () => {
    mock().update.mockReturnValue(new Promise(() => {}));
    renderModal(FAMILY_ID);
    await userEvent.type(await screen.findByLabelText("Nombre"), "x");
    await userEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await userEvent.keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByText("¿Descartar los cambios?")).not.toBeInTheDocument();
  });

  it("una respuesta tardía no cierra lo que haya abierto después", async () => {
    let finishSave: (value: unknown) => void = () => {};
    mock().update.mockReturnValue(new Promise((resolve) => (finishSave = resolve)));
    const { rerender } = renderModal(FAMILY_ID);
    await userEvent.type(await screen.findByLabelText("Nombre"), "x");
    await userEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    rerender(
      <ToastProvider>
        <TaxonModal config={familyConfig} selected={undefined} items={[makePanelTaxon()]} onClose={onClose} onChanged={onChanged} />
      </ToastProvider>,
    );
    finishSave(makePanelTaxon());
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(onClose).not.toHaveBeenCalled();
  });
});
