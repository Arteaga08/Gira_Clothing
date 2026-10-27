"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { PageHeader } from "@/components/ui/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { useSettings } from "@/hooks/useSettings";
import { AnnouncementModal } from "./AnnouncementModal";
import { AnnouncementPanel } from "./AnnouncementPanel";
import { EventsModal } from "./EventsModal";
import { EventsPanel } from "./EventsPanel";
import { HeroModal } from "./HeroModal";
import { HeroPanel } from "./HeroPanel";
import { OfferBannerModal } from "./OfferBannerModal";
import { OfferBannerPanel } from "./OfferBannerPanel";

/**
 * Contenido de home: what the team edits to change the storefront's home.
 * The announcement bar, the hero, the offer banner and the events; each home section that becomes editable
 * (spec §4) adds its own panel here.
 */
const HomeContentPage = () => {
  const { state, refresh, replace } = useSettings();
  // The shop's day, to tell which events are still upcoming (the API drops the past ones by the same clock).
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(new Date());
  const [editing, setEditing] = useState<"announcement" | "hero" | "offerBanner" | "events" | null>(null);

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
          <Skeleton className="h-44 w-full" />
        </div>
      ) : (
        <div className="grid items-start gap-5 lg:grid-cols-2">
          <AnnouncementPanel announcement={state.settings.storefront.announcement} onEdit={() => setEditing("announcement")} />
          <HeroPanel hero={state.settings.storefront.hero} onEdit={() => setEditing("hero")} />
          <OfferBannerPanel banner={state.settings.storefront.offerBanner} onEdit={() => setEditing("offerBanner")} />
          <EventsPanel events={state.settings.storefront.events} today={today} onEdit={() => setEditing("events")} />
        </div>
      )}
      {state.status === "ready" && editing === "announcement" ? (
        <AnnouncementModal
          announcement={state.settings.storefront.announcement}
          onClose={() => setEditing(null)}
          onSaved={replace}
        />
      ) : null}
      {state.status === "ready" && editing === "hero" ? (
        <HeroModal hero={state.settings.storefront.hero} onClose={() => setEditing(null)} onSaved={replace} />
      ) : null}
      {state.status === "ready" && editing === "offerBanner" ? (
        <OfferBannerModal
          banner={state.settings.storefront.offerBanner}
          onClose={() => setEditing(null)}
          onSaved={replace}
        />
      ) : null}
      {state.status === "ready" && editing === "events" ? (
        <EventsModal events={state.settings.storefront.events} onClose={() => setEditing(null)} onSaved={replace} />
      ) : null}
    </div>
  );
};

export { HomeContentPage };
