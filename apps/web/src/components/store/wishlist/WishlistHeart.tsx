"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Heart } from "@phosphor-icons/react";
import { isApiError } from "@/lib/api/ApiError";
import { STORE_ROUTES } from "@/lib/store/routes";
import { cn } from "@/lib/cn";
import { NB_ICON_TILE_CHROME, NB_PRESSABLE } from "@/components/ui/styles";
import { ensureLoaded, getServerSnapshot, getSnapshot, subscribe, toggleSaved } from "@/lib/wishlist/savedStore";

interface WishlistHeartProps {
  variantId: string;
  productName: string;
  authenticated: boolean;
  className?: string;
}

const failureMessage = (failure: unknown): string =>
  isApiError(failure) ? failure.message : "No se pudo actualizar tus guardados.";

/**
 * Save toggle of a variant. A visitor has no wishlist: the heart takes them to
 * the login. The state is announced politely and a refusal (full list, retired
 * product) says why in the title and to screen readers.
 */
const WishlistHeart = ({ variantId, productName, authenticated, className }: WishlistHeartProps) => {
  const savedIds = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const saved = authenticated && savedIds.has(variantId);

  useEffect(() => {
    if (authenticated) ensureLoaded();
  }, [authenticated]);

  const onClick = async (): Promise<void> => {
    if (!authenticated) {
      window.location.assign(STORE_ROUTES.login);
      return;
    }
    if (busy) return;
    setBusy(true);
    setProblem(await toggleSaved(variantId, failureMessage));
    setBusy(false);
  };

  return (
    <>
      <button
        type="button"
        aria-pressed={saved}
        aria-label={saved ? `Quitar ${productName} de guardados` : `Guardar ${productName}`}
        title={problem ?? (saved ? "Quitar de guardados" : "Guardar")}
        onClick={() => void onClick()}
        className={cn(NB_ICON_TILE_CHROME, NB_PRESSABLE, "size-10", saved ? "bg-brand-subtle text-danger" : "bg-tile-alt text-text-primary", className)}
      >
        <Heart weight={saved ? "fill" : "bold"} size={20} aria-hidden="true" />
      </button>
      <span role="status" className="sr-only">
        {problem ?? ""}
      </span>
    </>
  );
};

export type { WishlistHeartProps };
export { WishlistHeart };
