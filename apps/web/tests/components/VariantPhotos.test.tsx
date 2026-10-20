import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { VariantPhotos } from "@/components/catalog/VariantPhotos";
import { ToastProvider } from "@/components/ui/Toast";
import type { PickerPrint } from "@/lib/catalog/catalogOptions";
import type { VariantDraft } from "@/lib/catalog/productForm";
import { PRINT_A_ID, PRINT_B_ID, makeImage } from "../helpers/catalog";

const printOf = (id: string, name: string): PickerPrint => ({
  id,
  name,
  sku: name.slice(0, 3).toUpperCase(),
  familyId: "f1",
  familyName: "Flora",
  imageUrl: `https://res.cloudinary.com/gira/${id}.jpg`,
});
const PRINTS = new Map([
  [PRINT_A_ID, printOf(PRINT_A_ID, "Nopal en flor")],
  [PRINT_B_ID, printOf(PRINT_B_ID, "Monarca")],
]);

const A1 = makeImage("a1");
const A2 = makeImage("a2");
const DRAFTS: VariantDraft[] = [
  { printId: PRINT_A_ID, priceOverride: "", images: [A1, A2] },
  { printId: PRINT_B_ID, priceOverride: "", images: [] },
];

const renderPhotos = (overrides: Partial<React.ComponentProps<typeof VariantPhotos>> = {}) => {
  const props = {
    drafts: DRAFTS,
    prints: PRINTS,
    activePrintId: PRINT_A_ID as string | null,
    onSelect: vi.fn(),
    onImagesChange: vi.fn(),
    onImagesAppend: vi.fn(),
    upload: vi.fn(),
    uploading: false,
    ...overrides,
  };
  render(
    <ToastProvider>
      <VariantPhotos {...props} />
    </ToastProvider>,
  );
  return props;
};

describe("VariantPhotos", () => {
  it("sin estampas elegidas explica qué hacer", () => {
    renderPhotos({ drafts: [], activePrintId: null });
    expect(screen.getByText(/Elige al menos una estampa/)).toBeInTheDocument();
  });

  it("muestra la galería de la estampa activa y la portada solo en la primera", () => {
    renderPhotos();
    const photos = screen.getByRole("list", { name: "Fotos de Nopal en flor" });
    expect(photos.querySelectorAll("img")).toHaveLength(2);
    expect(screen.getAllByText("Portada")).toHaveLength(1);
    expect(screen.getByRole("button", { name: /Nopal en flor/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("2 fotos")).toBeInTheDocument();
    expect(screen.getByText("0 fotos")).toBeInTheDocument();
  });

  it("elegir otra estampa avisa para cambiar de galería", async () => {
    const { onSelect } = renderPhotos();
    await userEvent.click(screen.getByRole("button", { name: /Monarca/ }));
    expect(onSelect).toHaveBeenCalledWith(PRINT_B_ID);
  });

  it("mover una foto cambia el orden; la primera no se mueve antes ni la última después", async () => {
    const { onImagesChange } = renderPhotos();
    const before = screen.getAllByRole("button", { name: "Mover antes" });
    const after = screen.getAllByRole("button", { name: "Mover después" });
    expect(before[0]).toBeDisabled();
    expect(after[1]).toBeDisabled();
    await userEvent.click(after[0] as HTMLElement);
    expect(onImagesChange).toHaveBeenCalledWith(PRINT_A_ID, [A2, A1]);
  });

  it("quitar una foto la saca de la lista", async () => {
    const { onImagesChange } = renderPhotos();
    await userEvent.click(screen.getAllByRole("button", { name: "Quitar foto" })[0] as HTMLElement);
    expect(onImagesChange).toHaveBeenCalledWith(PRINT_A_ID, [A2]);
  });

  it("subir fotos las agrega al final de la estampa activa", async () => {
    const upload = vi.fn().mockResolvedValue({ ok: true, image: makeImage("nueva") });
    const { onImagesAppend } = renderPhotos({ upload });
    const file = new File(["x"], "nueva.png", { type: "image/png" });
    await userEvent.upload(screen.getByLabelText(/Subir fotos/), file);
    await waitFor(() => expect(onImagesAppend).toHaveBeenCalledWith(PRINT_A_ID, [makeImage("nueva")]));
    expect(upload).toHaveBeenCalledWith(file, "variants");
  });

  it("una subida que falla avisa y no cambia las fotos", async () => {
    const upload = vi.fn().mockResolvedValue({ ok: false, message: "El archivo pesa demasiado." });
    const { onImagesAppend } = renderPhotos({ upload });
    await userEvent.upload(screen.getByLabelText(/Subir fotos/), new File(["x"], "n.png", { type: "image/png" }));
    expect(await screen.findByText("El archivo pesa demasiado.")).toBeInTheDocument();
    expect(onImagesAppend).not.toHaveBeenCalled();
  });

  it("con 10 fotos ya no deja subir más", () => {
    const ten = Array.from({ length: 10 }, (_, i) => makeImage(`f${i}`));
    renderPhotos({ drafts: [{ printId: PRINT_A_ID, priceOverride: "", images: ten }] });
    expect(screen.getByLabelText(/Subir fotos/)).toBeDisabled();
  });
});
