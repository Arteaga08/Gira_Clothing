"use client";

import { useRouter } from "next/navigation";
import { Warning } from "@phosphor-icons/react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";

/** Load error of «Guardados»: the reason and a retry that re-runs the server render. */
const SavedError = () => {
  const router = useRouter();
  return (
    <EmptyState
      icon={Warning}
      title="No pudimos cargar tus guardados"
      description="Revisa tu conexión e inténtalo de nuevo."
      action={
        <Button variant="primary" onClick={() => router.refresh()}>
          Reintentar
        </Button>
      }
    />
  );
};

export { SavedError };
