"use client";

import { useState } from "react";
import { Heart } from "@phosphor-icons/react";
import type { Wire, WishlistItem } from "@gira/shared";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { isApiError } from "@/lib/api/ApiError";
import { unsaveVariant } from "@/lib/api/wishlist";
import { STORE_ROUTES } from "@/lib/store/routes";
import { forgetSaved } from "@/lib/wishlist/savedStore";
import { SavedCard } from "./SavedCard";

interface SavedGridProps {
  initialItems: Wire<WishlistItem>[];
}

/**
 * The grid of «Guardados». Removing is immediate and asks nothing: the card
 * leaves at once and comes back only if the API refuses, saying why.
 */
const SavedGrid = ({ initialItems }: SavedGridProps) => {
  const [items, setItems] = useState(initialItems);
  const [problem, setProblem] = useState<string | null>(null);

  const remove = async (variantId: string): Promise<void> => {
    const previous = items;
    setProblem(null);
    setItems((current) => current.filter((item) => item.variantId !== variantId));
    forgetSaved(variantId);
    try {
      await unsaveVariant(variantId);
    } catch (failure) {
      setItems(previous);
      setProblem(isApiError(failure) ? failure.message : "No se pudo quitar de guardados.");
    }
  };

  if (items.length === 0) {
    return (
      <EmptyState
        icon={Heart}
        title="Aún no guardas nada"
        description="Toca el corazón en una prenda y la encontrarás aquí."
        action={
          <a href={STORE_ROUTES.shop}>
            <Button variant="primary">Ir a la tienda</Button>
          </a>
        }
      />
    );
  }

  return (
    <>
      <p role="status" className="min-h-5 text-sm font-bold text-danger">
        {problem ?? ""}
      </p>
      <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => (
          <SavedCard key={item.variantId} item={item} onRemove={(id) => void remove(id)} />
        ))}
      </ul>
    </>
  );
};

export type { SavedGridProps };
export { SavedGrid };
