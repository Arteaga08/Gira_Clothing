"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { PageHeader } from "@/components/ui/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { useSettings } from "@/hooks/useSettings";
import { SECTION_PARAM, type SettingsSection } from "@/lib/settings/sections";
import { ResetTwoFactorModal } from "./ResetTwoFactorModal";
import { SecurityPanel } from "./SecurityPanel";
import { ShippingModal } from "./ShippingModal";
import { ShippingPanel } from "./ShippingPanel";
import { TaxModal } from "./TaxModal";
import { TaxPanel } from "./TaxPanel";

interface SettingsPageProps {
  /** `?seccion=` from the URL: that section's modal opens on load. Plain data from the server component. */
  initialSection?: SettingsSection | undefined;
}

const subscribeNothing = (): (() => void) => () => {};

/**
 * Ajustes: one read-only card per section and, for each, a modal editor whose
 * «Guardar» is the screen's only yellow button. The open section lives in the
 * URL. What this component wrote itself is not re-applied when the server
 * hands it back (a late echo would reopen a modal just closed); anything else
 * (back/forward, a pasted link) wins.
 */
const SettingsPage = ({ initialSection }: SettingsPageProps) => {
  const router = useRouter();
  const pathname = usePathname();
  const { state, refresh, replace } = useSettings();
  const [section, setSection] = useState(initialSection);
  const written = useRef(new Set<string>());
  const seenInitial = useRef(initialSection ?? "");

  // Modals are portals the server never renders: opened from the URL they must wait for hydration.
  const hydrated = useSyncExternalStore(
    subscribeNothing,
    () => true,
    () => false,
  );

  const openSection = useCallback(
    (next: SettingsSection | undefined) => {
      setSection(next);
      written.current.add(next ?? "");
      router.replace(next ? `${pathname}?${SECTION_PARAM}=${next}` : pathname, { scroll: false });
    },
    [pathname, router],
  );

  const incoming = initialSection ?? "";
  useEffect(() => {
    if (seenInitial.current === incoming) return;
    seenInitial.current = incoming;
    if (written.current.delete(incoming)) return;
    setSection(initialSection);
  }, [incoming, initialSection]);

  const close = () => openSection(undefined);

  if (state.status === "error") {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Ajustes" />
        <Notice variant="danger" title="No se pudieron cargar los ajustes">
          <p>{state.error}</p>
          <Button size="sm" className="mt-2" onClick={refresh}>
            Reintentar
          </Button>
        </Notice>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Ajustes" subtitle="IVA, envíos y la seguridad de tu cuenta." />

      {state.status === "loading" ? (
        <div className="grid gap-5 lg:grid-cols-2" aria-busy="true">
          <Skeleton className="h-44 w-full" />
          <Skeleton className="h-44 w-full" />
          <Skeleton className="h-72 w-full lg:col-span-2" />
        </div>
      ) : (
        <div className="grid items-start gap-5 lg:grid-cols-2">
          <TaxPanel rateBps={state.settings.tax.rateBps} onEdit={() => openSection("iva")} />
          <SecurityPanel onReset={() => openSection("2fa")} />
          <div className="lg:col-span-2">
            <ShippingPanel shipping={state.settings.shipping} onEdit={() => openSection("envio")} />
          </div>
        </div>
      )}

      {hydrated && section === "2fa" ? <ResetTwoFactorModal onClose={close} /> : null}
      {hydrated && state.status === "ready" && section === "iva" ? (
        <TaxModal rateBps={state.settings.tax.rateBps} onClose={close} onSaved={replace} />
      ) : null}
      {hydrated && state.status === "ready" && section === "envio" ? (
        <ShippingModal shipping={state.settings.shipping} onClose={close} onSaved={replace} />
      ) : null}
    </div>
  );
};

export type { SettingsPageProps };
export { SettingsPage };
