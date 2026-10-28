"use client";

import { useEffect, useRef, useState } from "react";
import { MapPin } from "@phosphor-icons/react";
import { SAVED_ADDRESSES_MAX, type SavedAddress, type Wire } from "@gira/shared";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Notice } from "@/components/ui/Notice";
import { useSubmit } from "@/hooks/useSubmit";
import { deleteAddress, setDefaultAddress } from "@/lib/api/account";
import { authFailureMessage } from "@/lib/auth/authFailures";
import { goToLogin, isSessionExpired } from "@/lib/account/sessionExpired";
import { STORE_ROUTES } from "@/lib/store/routes";
import { AddressCard } from "./AddressCard";
import { AddressForm } from "./AddressForm";

type View = { kind: "list" } | { kind: "form"; address: Wire<SavedAddress> | null };

const LIST_VIEW: View = { kind: "list" };

/**
 * Body of `/cuenta/direcciones`. The list and the form take turns in the same place (one block in
 * edit at a time, like the profile). The server decides which address is the default, so every
 * change replaces the whole list with its answer. After the form closes or a card disappears,
 * focus goes to the section heading, so a keyboard user never lands on a vanished button.
 */
const AddressesSection = ({ initialAddresses }: { initialAddresses: Wire<SavedAddress>[] }) => {
  const [addresses, setAddresses] = useState(initialAddresses);
  const [view, setView] = useState<View>(LIST_VIEW);
  const [notice, setNotice] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<Wire<SavedAddress> | null>(null);
  const [focusTick, setFocusTick] = useState(0);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const { pending, error, setError, run } = useSubmit();

  useEffect(() => {
    if (focusTick > 0) headingRef.current?.focus();
  }, [focusTick]);

  const full = addresses.length >= SAVED_ADDRESSES_MAX;

  const saved = (next: Wire<SavedAddress>[], message: string) => {
    setAddresses(next);
    setView(LIST_VIEW);
    setNotice(message);
    setFocusTick((tick) => tick + 1);
  };

  const makeDefault = (address: Wire<SavedAddress>) => {
    setNotice(null);
    void run(
      async () => {
        saved(await setDefaultAddress(address.id), `«${address.label ?? address.recipient}» es ahora tu dirección predeterminada.`);
      },
      {
        onError: (failure) => {
          if (isSessionExpired(failure)) goToLogin(STORE_ROUTES.addresses);
          else setError(authFailureMessage(failure));
        },
      },
    );
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    try {
      const next = await deleteAddress(toDelete.id);
      setToDelete(null);
      saved(next, "Eliminamos la dirección.");
    } catch (failure) {
      if (isSessionExpired(failure)) goToLogin(STORE_ROUTES.addresses);
      throw new Error(authFailureMessage(failure));
    }
  };

  const open = (address: Wire<SavedAddress> | null) => {
    setNotice(null);
    setError(null);
    setView({ kind: "form", address });
  };

  const cancel = () => {
    setView(LIST_VIEW);
    setFocusTick((tick) => tick + 1);
  };

  const deletingDefault = toDelete?.isDefault === true && addresses.length > 1;

  return (
    <div className="grid gap-5">
      <h2 ref={headingRef} tabIndex={-1} className="sr-only">
        Tus direcciones
      </h2>
      {notice ? (
        <Notice variant="info" title="Listo">
          {notice}
        </Notice>
      ) : null}
      {error ? (
        <Notice variant="danger" title="No pudimos hacer el cambio">
          {error}
        </Notice>
      ) : null}
      {view.kind === "form" ? (
        <AddressForm address={view.address} offerDefault={addresses.length > 0} onSaved={saved} onCancel={cancel} />
      ) : addresses.length === 0 ? (
        <EmptyState
          icon={MapPin}
          title="Aún no tienes direcciones"
          description="Guarda una y la tendrás lista al pagar, sin volver a escribirla."
          action={
            <Button variant="positive" onClick={() => open(null)}>
              Agregar dirección
            </Button>
          }
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="font-mono text-sm text-text-secondary">{`${String(addresses.length)} de ${String(SAVED_ADDRESSES_MAX)} direcciones`}</p>
            <Button variant="positive" size="sm" disabled={full} onClick={() => open(null)}>
              Agregar dirección
            </Button>
          </div>
          {full ? (
            <Notice variant="warning" title="Llegaste al máximo">
              {`Puedes guardar hasta ${String(SAVED_ADDRESSES_MAX)} direcciones. Elimina una para agregar otra.`}
            </Notice>
          ) : null}
          <ul className="grid divide-y-2 divide-dashed divide-ink border-t-2 border-dashed border-ink pt-5">
            {addresses.map((address) => (
              <AddressCard
                key={address.id}
                address={address}
                disabled={pending}
                onEdit={() => open(address)}
                onMakeDefault={() => makeDefault(address)}
                onDelete={() => setToDelete(address)}
              />
            ))}
          </ul>
        </>
      )}
      <ConfirmDialog
        open={toDelete !== null}
        tone="danger"
        title="Eliminar dirección"
        description={`Vas a eliminar «${toDelete?.label ?? toDelete?.recipient ?? ""}».${deletingDefault ? " Otra de tus direcciones pasará a ser la predeterminada." : ""} Tus pedidos anteriores no cambian.`}
        confirmLabel="Eliminar"
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
};

export { AddressesSection };
