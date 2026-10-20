import { Button } from "@/components/ui/Button";
import { T_CAPTION } from "@/components/ui/typography";

interface SaveBarProps {
  dirty: boolean;
  saving: boolean;
  /** A photo is still uploading: saving now would leave it out. */
  uploading: boolean;
  submitLabel: string;
  /** Edit mode: nothing to save until something changed. Create mode always lets you try (validation explains what is missing). */
  requireDirty: boolean;
  onSave: () => void;
  onCancel: () => void;
}

/**
 * Fixed to the bottom of the content area (it starts after the sidebar on
 * desktop). It carries the screen's ONE yellow button, so the rest of the
 * editor never competes with it.
 */
const SaveBar = ({ dirty, saving, uploading, submitLabel, requireDirty, onSave, onCancel }: SaveBarProps) => (
  <div className="fixed inset-x-0 bottom-0 z-(--z-topbar) border-t-2 border-ink bg-surface text-text-primary lg:left-(--sidebar-width)">
    <div className="flex items-center gap-3 px-4 py-3 sm:px-8">
      <p className={`${T_CAPTION} min-w-0 flex-1 truncate`} aria-live="polite">
        {dirty ? "Cambios sin guardar" : "Sin cambios"}
      </p>
      <Button variant="ghost" onClick={onCancel} disabled={saving}>
        Cancelar
      </Button>
      <Button variant="primary" loading={saving} disabled={(requireDirty && !dirty) || uploading} onClick={onSave}>
        {submitLabel}
      </Button>
    </div>
  </div>
);

export type { SaveBarProps };
export { SaveBar };
