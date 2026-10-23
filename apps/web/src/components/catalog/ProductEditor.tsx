"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { BreadcrumbLabel } from "@/components/shell/BreadcrumbLabel";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Notice } from "@/components/ui/Notice";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { useImageUpload } from "@/hooks/useImageUpload";
import { useProductEditorData } from "@/hooks/useProductEditorData";
import { useProductSave } from "@/hooks/useProductSave";
import { reactivateProduct, retireProduct } from "@/lib/api/adminProducts";
import { isApiError } from "@/lib/api/ApiError";
import { withCurrentCategory, type CatalogOptions, type PickerPrint } from "@/lib/catalog/catalogOptions";
import type { ExistingVariant } from "@/lib/catalog/editorProduct";
import { centsToPesosText } from "@/lib/catalog/money";
import { productPath } from "@/lib/catalog/productId";
import {
  addPrint,
  appendDraftImages,
  emptyFormState,
  isDirty,
  removePrint,
  setDraftImages,
  setDraftPrice,
  stateFromBaseline,
  validateModel,
  validateVariantPrices,
  type ModelErrors,
  type ProductBaseline,
  type ProductFormState,
} from "@/lib/catalog/productForm";
import { EditorSection } from "./EditorSection";
import { ModelDataSection } from "./ModelDataSection";
import { NewPrintSlideOver } from "./NewPrintSlideOver";
import { PrintPicker } from "./PrintPicker";
import { PrintPriceOverrides } from "./PrintPriceOverrides";
import { RetireModelSection } from "./RetireModelSection";
import { SaveBar } from "./SaveBar";
import { VariantPhotos } from "./VariantPhotos";

interface ProductEditorProps {
  /** `null` is the create form. */
  productId: string | null;
}

interface EditorFormProps {
  options: CatalogOptions;
  baseline: ProductBaseline | null;
  onReload: () => void;
  onPrintCreated: (print: PickerPrint) => void;
}

const GENERIC_ERROR = "Inténtalo de nuevo en un momento.";

/** `fieldset disabled` switches off every native control inside it: the form cannot be edited while a save is running. */
const FIELDSET_CLASS = "m-0 flex min-w-0 flex-col gap-6 border-0 p-0";

const piecesLabel = (count: number): string => (count === 1 ? "1 en mano" : `${count} en mano`);

const EditorForm = ({ options, baseline, onReload, onPrintCreated }: EditorFormProps) => {
  const router = useRouter();
  const { toast } = useToast();
  const uploader = useImageUpload();
  const saver = useProductSave();
  const formRef = useRef<HTMLDivElement>(null);

  const [state, setState] = useState<ProductFormState>(() => (baseline ? stateFromBaseline(baseline) : emptyFormState()));
  const [errors, setErrors] = useState<ModelErrors>({});
  const [priceErrors, setPriceErrors] = useState<Record<string, string>>({});
  const [sizeError, setSizeError] = useState<string | undefined>(undefined);
  const [activePrintId, setActivePrintId] = useState<string | null>(null);
  const [newPrintOpen, setNewPrintOpen] = useState(false);
  const [pendingRemoval, setPendingRemoval] = useState<ExistingVariant | null>(null);

  const existing = useMemo<ExistingVariant[]>(() => baseline?.variants ?? [], [baseline]);
  const dirty = isDirty(state, baseline);
  const retired = baseline !== null && !baseline.product.isActive;

  // A browser-level guard for reloads and tab closes; in-app navigation is not blocked.
  useEffect(() => {
    if (!dirty) return;
    const guard = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty]);

  const printsById = useMemo(() => new Map(options.prints.map((print) => [print.id, print])), [options.prints]);
  const printNames = useMemo(() => new Map(options.prints.map((print) => [print.id, print.name])), [options.prints]);
  const selectedIds = useMemo(() => new Set(state.selected.map((draft) => draft.printId)), [state.selected]);
  const lockedIds = useMemo(
    () => new Set(existing.filter((variant) => variant.isActive && variant.reserved > 0).map((variant) => variant.printId)),
    [existing],
  );
  const retiredIds = useMemo(
    () => new Set(existing.filter((variant) => !variant.isActive).map((variant) => variant.printId)),
    [existing],
  );
  const categories = baseline
    ? withCurrentCategory(options.categories, baseline.product.categoryId, baseline.product.categoryName)
    : options.categories;
  const activeId = selectedIds.has(activePrintId ?? "") ? activePrintId : (state.selected[0]?.printId ?? null);

  const togglePrint = (printId: string) => {
    if (selectedIds.has(printId)) {
      const current = existing.find((variant) => variant.printId === printId && variant.isActive);
      if (current) setPendingRemoval(current);
      else setState((previous) => removePrint(previous, printId));
      return;
    }
    setState((previous) => addPrint(previous, printId, existing));
    setActivePrintId(printId);
  };

  const pickSizeImage = async (file: File) => {
    setSizeError(undefined);
    const outcome = await uploader.upload(file, "products");
    if (!outcome.ok) {
      setSizeError(outcome.message);
      return;
    }
    setState((previous) => ({ ...previous, sizeImage: outcome.image }));
  };

  const save = async () => {
    if (uploader.busy) return;
    const modelErrors = validateModel(state.model);
    const variantErrors = validateVariantPrices(state.selected);
    setErrors(modelErrors);
    setPriceErrors(variantErrors);
    if (Object.keys(modelErrors).length > 0 || Object.keys(variantErrors).length > 0) {
      toast({ variant: "warning", title: "Revisa los campos marcados", description: "Hay datos por corregir antes de guardar." });
      requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }

    const outcome = baseline
      ? await saver.saveExisting(baseline.product.id, state, baseline, printNames)
      : await saver.saveNew(state, printNames);

    if (!outcome.ok) {
      toast({ variant: "error", title: "No se pudo guardar", description: outcome.message });
      return;
    }
    if (outcome.failures.length > 0) {
      toast({
        variant: "warning",
        title: "Guardado con pendientes",
        description: `${outcome.failures.map((failure) => `${failure.printName}: ${failure.message}`).join(" · ")}. Las fotos de esas estampas hay que subirlas de nuevo.`,
      });
    } else {
      toast({ variant: "success", title: baseline ? "Cambios guardados" : "Producto creado" });
    }
    if (baseline) onReload();
    else router.replace(productPath(outcome.productId));
  };

  const retire = async () => {
    if (!baseline) return;
    await retireProduct(baseline.product.id);
    toast({ variant: "success", title: `«${baseline.product.name}» retirado` });
    onReload();
  };

  const reactivate = async () => {
    if (!baseline) return;
    try {
      await reactivateProduct(baseline.product.id);
      toast({ variant: "success", title: `«${baseline.product.name}» reactivado` });
      onReload();
    } catch (failure) {
      toast({ variant: "error", title: "No se pudo reactivar", description: isApiError(failure) ? failure.message : GENERIC_ERROR });
    }
  };

  const basePricePlaceholder = state.model.price.trim() || (baseline ? centsToPesosText(baseline.product.basePrice) : "189.00");

  return (
    <div ref={formRef} className="flex flex-col gap-6 pb-24">
      <fieldset disabled={saver.saving} className={FIELDSET_CLASS}>
      <ModelDataSection
        model={state.model}
        errors={errors}
        categories={categories}
        onChange={(patch) => setState((previous) => ({ ...previous, model: { ...previous.model, ...patch } }))}
        sizePhoto={{
          imageUrl: state.sizeImage?.url ?? null,
          busy: uploader.busy,
          error: sizeError,
          onPick: (file) => void pickSizeImage(file),
          onRemove: () => setState((previous) => ({ ...previous, sizeImage: null })),
        }}
      />
      </fieldset>

      <fieldset disabled={saver.saving || retired} className={FIELDSET_CLASS}>
      <EditorSection
        title="Estampas"
        hint="Cada estampa elegida es una variante de este modelo."
        aside={
          <span className="font-mono text-sm font-bold">
            {state.selected.length === 1 ? "1 elegida" : `${state.selected.length} elegidas`}
          </span>
        }
      >
        <PrintPicker
          prints={options.prints}
          selectedIds={selectedIds}
          lockedIds={lockedIds}
          retiredIds={retiredIds}
          onToggle={togglePrint}
          onCreate={() => setNewPrintOpen(true)}
        />
        <PrintPriceOverrides
          drafts={state.selected}
          prints={printsById}
          errors={priceErrors}
          basePricePlaceholder={basePricePlaceholder}
          onChange={(printId, value) => setState((previous) => setDraftPrice(previous, printId, value))}
        />
      </EditorSection>

      <EditorSection title="Fotos por estampa" hint="Elige la estampa y sube sus fotos. La primera es la portada.">
        <VariantPhotos
          drafts={state.selected}
          prints={printsById}
          activePrintId={activeId}
          onSelect={setActivePrintId}
          onImagesChange={(printId, images) => setState((previous) => setDraftImages(previous, printId, images))}
          onImagesAppend={(printId, added) => setState((previous) => appendDraftImages(previous, printId, added))}
          upload={uploader.upload}
          uploading={uploader.busy}
        />
      </EditorSection>
      </fieldset>

      {baseline ? (
        <RetireModelSection
          productId={baseline.product.id}
          productName={baseline.product.name}
          isActive={baseline.product.isActive}
          activeVariantCount={baseline.product.activeVariantCount}
          onRetire={retire}
          onReactivate={reactivate}
        />
      ) : null}

      <SaveBar
        dirty={dirty}
        saving={saver.saving}
        uploading={uploader.busy}
        submitLabel={baseline ? "Guardar cambios" : "Crear producto"}
        requireDirty={baseline !== null}
        onSave={() => void save()}
        onCancel={() => router.push("/productos")}
      />

      <NewPrintSlideOver
        open={newPrintOpen}
        onClose={() => setNewPrintOpen(false)}
        families={options.families}
        onCreated={onPrintCreated}
        upload={uploader.upload}
        uploading={uploader.busy}
      />

      <ConfirmDialog
        open={pendingRemoval !== null}
        title="Quitar estampa"
        description={
          pendingRemoval
            ? `La variante ${pendingRemoval.sku} se retirará al guardar. Tiene ${piecesLabel(pendingRemoval.onHand)}; el stock se conserva y puedes volver a elegir la estampa.`
            : undefined
        }
        confirmLabel="Quitar estampa"
        tone="danger"
        onCancel={() => setPendingRemoval(null)}
        onConfirm={() => {
          if (pendingRemoval) setState((previous) => removePrint(previous, pendingRemoval.printId));
          setPendingRemoval(null);
        }}
      />
    </div>
  );
};

const EditorSkeleton = () => (
  <div className="flex flex-col gap-6" aria-busy="true">
    <Skeleton className="h-96 w-full" />
    <Skeleton className="h-72 w-full" />
    <Skeleton className="h-56 w-full" />
  </div>
);

/**
 * Create or edit one model on a single page: data, prints (each a variant),
 * and the photos of each print. Loads everything it needs in parallel, then
 * hands a frozen baseline to a form that is keyed by the data version, so a
 * reload after saving starts over from what the server now holds.
 */
const ProductEditor = ({ productId }: ProductEditorProps) => {
  const editor = useProductEditorData(productId);

  if (editor.status === "loading") return <EditorSkeleton />;
  if (editor.status === "error" || !editor.data) {
    return (
      <Notice variant="danger" title="No se pudo cargar el editor">
        <p>{editor.error}</p>
        <Button variant="positive" size="sm" className="mt-2" onClick={editor.reload}>
          Reintentar
        </Button>
      </Notice>
    );
  }

  return (
    <>
      <BreadcrumbLabel label={editor.data.baseline?.product.name ?? "Nuevo producto"} />
      <EditorForm
        key={editor.dataVersion}
        options={editor.data.options}
        baseline={editor.data.baseline}
        onReload={editor.reload}
        onPrintCreated={editor.addCreatedPrint}
      />
    </>
  );
};

export type { ProductEditorProps };
export { ProductEditor };
