"use client";

import { useEffect, useRef, useState } from "react";
import { Receipt } from "@phosphor-icons/react";
import { CFDI_USES, FISCAL_REGIMES, type BillingInfo, type Wire } from "@gira/shared";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Notice } from "@/components/ui/Notice";
import { deleteBilling } from "@/lib/api/account";
import { authFailureMessage } from "@/lib/auth/authFailures";
import { goToLogin, isSessionExpired } from "@/lib/account/sessionExpired";
import { STORE_ROUTES } from "@/lib/store/routes";
import { BillingForm } from "./BillingForm";

const NOT_ISSUING = "Por ahora solo guardamos estos datos: todavía no emitimos facturas.";

const catalogLabel = (catalog: readonly { code: string; name: string }[], code: string): string => {
  const entry = catalog.find((item) => item.code === code);
  return entry ? `${entry.code} · ${entry.name}` : code;
};

const Row = ({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) => (
  <div className="flex justify-between gap-3 border-b-2 border-dashed border-border pb-2">
    <dt className="text-text-muted">{label}</dt>
    <dd className={`m-0 min-w-0 break-words text-right font-bold ${mono ? "font-mono" : ""}`}>{value}</dd>
  </div>
);

/**
 * Body of `/cuenta/facturacion`: empty, the saved data, or the form. After the form closes or the
 * data is deleted, focus goes to the section heading so a keyboard user is never left on a
 * button that no longer exists.
 */
const BillingSection = ({ initialBilling }: { initialBilling: Wire<BillingInfo> | null }) => {
  const [billing, setBilling] = useState(initialBilling);
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [focusTick, setFocusTick] = useState(0);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (focusTick > 0) headingRef.current?.focus();
  }, [focusTick]);

  const open = () => {
    setNotice(null);
    setEditing(true);
  };

  const close = () => {
    setEditing(false);
    setFocusTick((tick) => tick + 1);
  };

  const saved = (next: Wire<BillingInfo>) => {
    setBilling(next);
    setNotice("Guardamos tus datos fiscales.");
    close();
  };

  const confirmDelete = async () => {
    try {
      await deleteBilling();
    } catch (failure) {
      if (isSessionExpired(failure)) goToLogin(STORE_ROUTES.billing);
      throw new Error(authFailureMessage(failure));
    }
    setConfirming(false);
    setBilling(null);
    setNotice("Eliminamos tus datos fiscales.");
    setFocusTick((tick) => tick + 1);
  };

  return (
    <div className="grid gap-5">
      <h2 ref={headingRef} tabIndex={-1} className="sr-only">
        Datos fiscales
      </h2>
      {notice ? (
        <Notice variant="info" title="Listo">
          {notice}
        </Notice>
      ) : null}
      {editing ? (
        <BillingForm billing={billing} onSaved={saved} onCancel={close} />
      ) : billing ? (
        <>
          <dl className="grid gap-2.5">
            <Row label="RFC" value={billing.rfc} mono />
            <Row label="Razón social" value={billing.legalName} />
            <Row label="Régimen fiscal" value={catalogLabel(FISCAL_REGIMES, billing.fiscalRegime)} />
            <Row label="Uso de CFDI" value={catalogLabel(CFDI_USES, billing.cfdiUse)} />
            <Row label="Código postal fiscal" value={billing.postalCode} mono />
          </dl>
          <p className="text-sm text-text-secondary">{NOT_ISSUING}</p>
          <div className="flex flex-wrap gap-3">
            <Button variant="edit" size="sm" onClick={open}>
              Editar
            </Button>
            <Button variant="danger" size="sm" onClick={() => setConfirming(true)}>
              Eliminar datos fiscales
            </Button>
          </div>
        </>
      ) : (
        <EmptyState
          icon={Receipt}
          title="No has guardado datos fiscales"
          description={`Son opcionales. ${NOT_ISSUING}`}
          action={
            <Button variant="positive" onClick={open}>
              Agregar datos fiscales
            </Button>
          }
        />
      )}
      <ConfirmDialog
        open={confirming}
        tone="danger"
        title="Eliminar datos fiscales"
        description="Borraremos tu RFC y el resto de tus datos fiscales. Puedes volver a guardarlos cuando quieras."
        confirmLabel="Eliminar"
        onConfirm={confirmDelete}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
};

export { BillingSection };
