"use client";

import { UploadSimpleIcon } from "@phosphor-icons/react/dist/ssr";
import { Icon } from "@/components/ui/Icon";
import { T_CAPTION } from "@/components/ui/typography";
import { cn } from "@/lib/cn";
import { IMAGE_ACCEPT } from "@/lib/catalog/imageFile";

interface UploadTileProps {
  label: string;
  hint?: string;
  multiple?: boolean;
  busy?: boolean;
  disabled?: boolean;
  className?: string;
  onFiles: (files: File[]) => void;
}

/**
 * The dashed "drop a photo here" tile. It is a label around a visually hidden
 * file input, so the click, the keyboard and a screen reader all work with no
 * extra code. The input is cleared after every pick so choosing the same file
 * twice still fires.
 */
const UploadTile = ({ label, hint, multiple = false, busy = false, disabled = false, className, onFiles }: UploadTileProps) => (
  <label
    className={cn(
      "grid cursor-pointer place-content-center justify-items-center gap-1 rounded-nb-sm border-2 border-dashed border-ink bg-surface-raised p-3 text-center text-sm text-text-primary",
      "hover:bg-brand-subtle focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus",
      (busy || disabled) && "pointer-events-none opacity-60",
      className,
    )}
  >
    <Icon icon={UploadSimpleIcon} size={20} />
    <span className="font-bold">{busy ? "Subiendo…" : label}</span>
    {hint ? <span className={T_CAPTION}>{hint}</span> : null}
    <input
      type="file"
      accept={IMAGE_ACCEPT}
      multiple={multiple}
      disabled={busy || disabled}
      className="sr-only"
      onChange={(event) => {
        const files = Array.from(event.target.files ?? []);
        event.target.value = "";
        if (files.length > 0) onFiles(files);
      }}
    />
  </label>
);

export type { UploadTileProps };
export { UploadTile };
