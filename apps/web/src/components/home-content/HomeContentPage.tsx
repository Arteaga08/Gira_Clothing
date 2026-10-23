"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { PageHeader } from "@/components/ui/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { useSettings } from "@/hooks/useSettings";
import { AnnouncementModal } from "./AnnouncementModal";
import { AnnouncementPanel } from "./AnnouncementPanel";

/**
 * Contenido de home: what the team edits to change the storefront's home.
 * Today only the announcement bar; each home section that becomes editable
 * (spec §4) adds its own panel here.
 */
const HomeContentPage = () => {
  const { state, refresh, replace } = useSettings();
  const [editing, setEditing] = useState(false);

  if (state.status === "error") {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Contenido de home" />
        <Notice variant="danger" title="No se pudo cargar el contenido">
          <p>{state.error}</p>
          <Button variant="positive" size="sm" className="mt-2" onClick={refresh}>
            Reintentar
          </Button>
        </Notice>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Contenido de home" subtitle="Lo que se muestra en la página de inicio de la tienda." />
      {state.status === "loading" ? (
        <div className="grid gap-5 lg:grid-cols-2" aria-busy="true">
          <Skeleton className="h-44 w-full" />
        </div>
      ) : (
        <div className="grid items-start gap-5 lg:grid-cols-2">
          <AnnouncementPanel announcement={state.settings.storefront.announcement} onEdit={() => setEditing(true)} />
        </div>
      )}
      {state.status === "ready" && editing ? (
        <AnnouncementModal
          announcement={state.settings.storefront.announcement}
          onClose={() => setEditing(false)}
          onSaved={replace}
        />
      ) : null}
    </div>
  );
};

export { HomeContentPage };
