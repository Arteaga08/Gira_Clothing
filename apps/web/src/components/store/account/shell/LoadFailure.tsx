"use client";

import { useRouter } from "next/navigation";
import { Warning } from "@phosphor-icons/react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";

/** A «Mi cuenta» read that failed (or an API outage): the reason and a retry that re-runs the server render. */
const LoadFailure = ({ what }: { what: string }) => {
  const router = useRouter();
  return (
    <EmptyState
      icon={Warning}
      title={`No pudimos cargar ${what}`}
      description="Revisa tu conexión e inténtalo de nuevo."
      action={
        <Button variant="positive" onClick={() => router.refresh()}>
          Reintentar
        </Button>
      }
    />
  );
};

export { LoadFailure };
