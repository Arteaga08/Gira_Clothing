import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProductEditor } from "@/components/catalog/ProductEditor";
import { ToastProvider } from "@/components/ui/Toast";
import { ApiError } from "@/lib/api/ApiError";
import type { CatalogOptions } from "@/lib/catalog/catalogOptions";
import { toEditorProduct, toExistingVariant } from "@/lib/catalog/editorProduct";
import {
  CATEGORY_ID,
  PRINT_A_ID,
  PRINT_B_ID,
  PRODUCT_ID,
  VARIANT_A_ID,
  makeImage,
  makeRawProduct,
  makeRawVariant,
} from "../helpers/catalog";
import { chooseOption } from "../helpers/select";

const catalog = vi.hoisted(() => ({ fetchCatalogOptions: vi.fn(), createPrint: vi.fn() }));
vi.mock("@/lib/api/adminCatalog", () => catalog);
const products = vi.hoisted(() => ({
  getEditorProduct: vi.fn(),
  createProduct: vi.fn(),
  updateProduct: vi.fn(),
  retireProduct: vi.fn(),
  reactivateProduct: vi.fn(),
}));
vi.mock("@/lib/api/adminProducts", () => products);
const variants = vi.hoisted(() => ({ listProductVariants: vi.fn(), createVariant: vi.fn(), updateVariant: vi.fn() }));
vi.mock("@/lib/api/adminVariants", () => variants);
const uploads = vi.hoisted(() => ({ uploadImage: vi.fn() }));
vi.mock("@/lib/api/adminUploads", () => uploads);

const { replaceMock, pushMock } = vi.hoisted(() => ({ replaceMock: vi.fn(), pushMock: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/productos",
  useRouter: () => ({ replace: replaceMock, push: pushMock, refresh: vi.fn() }),
}));

const OPTIONS: CatalogOptions = {
  categories: [{ value: CATEGORY_ID, label: "Cosmetiquera" }],
  families: [{ value: "f1", label: "Flora" }],
  prints: [
    { id: PRINT_A_ID, name: "Nopal en flor", sku: "NOP", familyId: "f1", familyName: "Flora", imageUrl: "https://res.cloudinary.com/gira/nopal.jpg" },
    { id: PRINT_B_ID, name: "Monarca", sku: "MON", familyId: "f1", familyName: "Flora", imageUrl: "https://res.cloudinary.com/gira/monarca.jpg" },
  ],
};

const EXISTING_A = toExistingVariant(makeRawVariant({ images: [makeImage("a1")] }));

const renderEditor = (productId: string | null) =>
  render(
    <ToastProvider>
      <ProductEditor productId={productId} />
    </ToastProvider>,
  );

const picker = () => screen.getByRole("region", { name: "Estampas" });

beforeEach(() => {
  [catalog, products, variants, uploads].forEach((group) => Object.values(group).forEach((mock) => mock.mockReset()));
  replaceMock.mockReset();
  pushMock.mockReset();
  catalog.fetchCatalogOptions.mockResolvedValue(OPTIONS);
  products.getEditorProduct.mockResolvedValue(toEditorProduct(makeRawProduct()));
  variants.listProductVariants.mockResolvedValue([EXISTING_A]);
});

describe("ProductEditor · crear", () => {
  it("con datos faltantes marca los campos, no llama al API y avisa", async () => {
    renderEditor(null);
    await screen.findByLabelText("Nombre");
    await userEvent.click(screen.getByRole("button", { name: "Crear producto" }));
    expect(products.createProduct).not.toHaveBeenCalled();
    expect(screen.getByText("Elige una categoría.")).toBeInTheDocument();
    expect(screen.getByText("Indica el peso en gramos para cotizar el envío.")).toBeInTheDocument();
    expect(screen.getByText("Revisa los campos marcados")).toBeInTheDocument();
  });

  it("crea el modelo y sus variantes, y pasa al editor del modelo nuevo", async () => {
    products.createProduct.mockResolvedValue(PRODUCT_ID);
    variants.createVariant.mockResolvedValue({});
    renderEditor(null);
    await userEvent.type(await screen.findByLabelText("Nombre"), "Cosmetiquera chica");
    await chooseOption(screen.getByLabelText("Categoría"), "Cosmetiquera");
    await userEvent.type(screen.getByLabelText("Precio base (MXN)"), "189");
    await userEvent.type(screen.getByLabelText("Peso (g)"), "140");
    await userEvent.click(within(picker()).getByRole("button", { name: /Nopal en flor/ }));
    await userEvent.click(screen.getByRole("button", { name: "Crear producto" }));

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith(`/productos/${PRODUCT_ID}`));
    expect(products.createProduct).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Cosmetiquera chica", category: CATEGORY_ID, basePrice: 18900, weightGrams: 140 }),
    );
    expect(variants.createVariant).toHaveBeenCalledWith({ product: PRODUCT_ID, print: PRINT_A_ID, images: [] });
  });

  it("si una variante falla, el modelo ya existe: avisa cuál quedó pendiente y pasa a editar", async () => {
    products.createProduct.mockResolvedValue(PRODUCT_ID);
    variants.createVariant.mockRejectedValue(new ApiError("Ya existe una variante con ese SKU.", "http", 409));
    renderEditor(null);
    await userEvent.type(await screen.findByLabelText("Nombre"), "Cosmetiquera chica");
    await chooseOption(screen.getByLabelText("Categoría"), "Cosmetiquera");
    await userEvent.type(screen.getByLabelText("Precio base (MXN)"), "189");
    await userEvent.type(screen.getByLabelText("Peso (g)"), "140");
    await userEvent.click(within(picker()).getByRole("button", { name: /Nopal en flor/ }));
    await userEvent.click(screen.getByRole("button", { name: "Crear producto" }));

    expect(await screen.findByText(/Nopal en flor: Ya existe una variante con ese SKU\./)).toBeInTheDocument();
    expect(screen.getByText("Guardado con pendientes")).toBeInTheDocument();
    expect(screen.getByText(/subirlas de nuevo/)).toBeInTheDocument();
    expect(replaceMock).toHaveBeenCalledWith(`/productos/${PRODUCT_ID}`);
  });

  it("un error del API al crear el modelo se muestra y no cambia de pantalla", async () => {
    products.createProduct.mockRejectedValue(new ApiError("La categoría no existe.", "http", 400));
    renderEditor(null);
    await userEvent.type(await screen.findByLabelText("Nombre"), "Cosmetiquera chica");
    await chooseOption(screen.getByLabelText("Categoría"), "Cosmetiquera");
    await userEvent.type(screen.getByLabelText("Precio base (MXN)"), "189");
    await userEvent.type(screen.getByLabelText("Peso (g)"), "140");
    await userEvent.click(screen.getByRole("button", { name: "Crear producto" }));
    expect(await screen.findByText("La categoría no existe.")).toBeInTheDocument();
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it("sube la foto de tamaño a la carpeta products y la muestra", async () => {
    uploads.uploadImage.mockResolvedValue(makeImage("tamano"));
    renderEditor(null);
    await screen.findByLabelText("Nombre");
    await userEvent.upload(
      screen.getByLabelText(/Subir foto de tamaño/),
      new File(["x"], "tamano.png", { type: "image/png" }),
    );
    expect(await screen.findByRole("img", { name: "Foto de tamaño del modelo" })).toBeInTheDocument();
    expect(uploads.uploadImage).toHaveBeenCalledWith(expect.any(File), "products");
  });

  it("«Nueva estampa» abre el panel", async () => {
    renderEditor(null);
    await screen.findByLabelText("Nombre");
    await userEvent.click(within(picker()).getByRole("button", { name: /Nueva estampa/ }));
    expect(await screen.findByRole("dialog", { name: "Nueva estampa" })).toBeInTheDocument();
  });
});

describe("ProductEditor · editar", () => {
  it("carga el modelo con sus estampas y no deja guardar sin cambios", async () => {
    renderEditor(PRODUCT_ID);
    expect(await screen.findByLabelText("Nombre")).toHaveValue("Cosmetiquera chica");
    expect(screen.getByLabelText("Precio base (MXN)")).toHaveValue("189.00");
    expect(within(picker()).getByRole("button", { name: /Nopal en flor/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Guardar cambios" })).toBeDisabled();
  });

  it("quitar una estampa con variante pide confirmar y, al guardar, la retira", async () => {
    variants.updateVariant.mockResolvedValue({});
    renderEditor(PRODUCT_ID);
    await screen.findByLabelText("Nombre");
    await userEvent.click(within(picker()).getByRole("button", { name: /Nopal en flor/ }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/Tiene 12 en mano/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Quitar estampa" }));

    const save = screen.getByRole("button", { name: "Guardar cambios" });
    expect(save).toBeEnabled();
    await userEvent.click(save);
    await waitFor(() => expect(variants.updateVariant).toHaveBeenCalledWith(VARIANT_A_ID, { isActive: false }));
    expect(products.updateProduct).not.toHaveBeenCalled();
  });

  it("cambiar un dato solo manda ese dato", async () => {
    products.updateProduct.mockResolvedValue(undefined);
    renderEditor(PRODUCT_ID);
    const name = await screen.findByLabelText("Nombre");
    await userEvent.clear(name);
    await userEvent.type(name, "Cosmetiquera mini");
    await userEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(products.updateProduct).toHaveBeenCalledWith(PRODUCT_ID, { name: "Cosmetiquera mini" }));
    expect(variants.updateVariant).not.toHaveBeenCalled();
  });

  it("la sección Tienda guarda el precio de rebaja en centavos", async () => {
    products.updateProduct.mockResolvedValue(undefined);
    renderEditor(PRODUCT_ID);
    await userEvent.type(await screen.findByLabelText("Precio de rebaja (opcional)"), "159.90");
    await userEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(products.updateProduct).toHaveBeenCalledWith(PRODUCT_ID, { salePrice: 15990 }));
  });

  it("una rebaja que no baja del precio base marca el campo y no llama al API", async () => {
    renderEditor(PRODUCT_ID);
    await userEvent.type(await screen.findByLabelText("Precio de rebaja (opcional)"), "189");
    await userEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    expect(await screen.findByText(/La rebaja debe ser menor al precio base/)).toBeInTheDocument();
    expect(products.updateProduct).not.toHaveBeenCalled();
  });

  it("una estampa con apartados no se puede quitar", async () => {
    variants.listProductVariants.mockResolvedValue([{ ...EXISTING_A, reserved: 2 }]);
    renderEditor(PRODUCT_ID);
    await screen.findByLabelText("Nombre");
    expect(within(picker()).getByRole("button", { name: /Nopal en flor/ })).toBeDisabled();
  });

  it("un error de carga muestra el mensaje y Reintentar vuelve a pedir", async () => {
    products.getEditorProduct.mockRejectedValueOnce(new ApiError("El producto no existe.", "http", 404));
    renderEditor(PRODUCT_ID);
    expect(await screen.findByText("El producto no existe.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByLabelText("Nombre")).toBeInTheDocument();
  });
});

describe("ProductEditor · retirar", () => {
  it("con variantes activas bloquea el botón y manda a Inventario", async () => {
    renderEditor(PRODUCT_ID);
    await screen.findByLabelText("Nombre");
    expect(screen.getByRole("button", { name: "Retirar modelo" })).toBeDisabled();
    expect(screen.getByText(/Tiene 2 variantes activas/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver en Inventario" })).toHaveAttribute(
      "href",
      `/inventario?modelo=${PRODUCT_ID}`,
    );
  });

  it("sin variantes activas pide confirmar y retira", async () => {
    products.getEditorProduct.mockResolvedValue(toEditorProduct(makeRawProduct({ activeVariantCount: 0, variantCount: 0 })));
    variants.listProductVariants.mockResolvedValue([]);
    products.retireProduct.mockResolvedValue(undefined);
    renderEditor(PRODUCT_ID);
    await screen.findByLabelText("Nombre");
    await userEvent.click(screen.getByRole("button", { name: "Retirar modelo" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Retirar modelo" }));
    await waitFor(() => expect(products.retireProduct).toHaveBeenCalledWith(PRODUCT_ID));
  });

  it("si el API responde 409 el diálogo muestra su mensaje y no cierra", async () => {
    products.getEditorProduct.mockResolvedValue(toEditorProduct(makeRawProduct({ activeVariantCount: 0, variantCount: 0 })));
    variants.listProductVariants.mockResolvedValue([]);
    products.retireProduct.mockRejectedValue(new ApiError("No puedes retirar un producto con variantes activas.", "http", 409));
    renderEditor(PRODUCT_ID);
    await screen.findByLabelText("Nombre");
    await userEvent.click(screen.getByRole("button", { name: "Retirar modelo" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Retirar modelo" }));
    expect(await within(dialog).findByText("No puedes retirar un producto con variantes activas.")).toBeInTheDocument();
  });

  it("un modelo retirado ofrece reactivarlo", async () => {
    products.getEditorProduct.mockResolvedValue(toEditorProduct(makeRawProduct({ isActive: false, activeVariantCount: 0 })));
    variants.listProductVariants.mockResolvedValue([]);
    products.reactivateProduct.mockResolvedValue(undefined);
    renderEditor(PRODUCT_ID);
    await screen.findByLabelText("Nombre");
    await userEvent.click(screen.getByRole("button", { name: "Reactivar modelo" }));
    await waitFor(() => expect(products.reactivateProduct).toHaveBeenCalledWith(PRODUCT_ID));
  });
});
