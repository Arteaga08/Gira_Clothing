"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Modal } from "@/components/ui/Modal";
import { Notice } from "@/components/ui/Notice";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { useCouponSave } from "@/hooks/useCouponSave";
import { couponClient } from "@/lib/api/adminCoupons";
import { isApiError } from "@/lib/api/ApiError";
import {
  EMPTY_COUPON_VALUES,
  toUpdateBody,
  validateCouponForm,
  valuesFromCoupon,
  type CouponFormErrors,
  type CouponFormValues,
} from "@/lib/coupons/couponForm";
import type { PanelCoupon } from "@/lib/coupons/panelCoupon";
import { CouponForm } from "./CouponForm";
import { RetireCouponButton } from "./RetireCouponButton";

interface CouponModalProps {
  /** `"nuevo"` for the create form, a coupon id for an existing one, `undefined` while closed. */
  selected: string | undefined;
  /** The page already loaded: the modal opens from it without another request. */
  items: PanelCoupon[];
  onClose: () => void;
  /** The list changed (create / edit / retire / reactivate): refresh it. The modal closes itself. */
  onChanged: () => void;
}

interface BodyProps extends Omit<CouponModalProps, "selected"> {
  selected: string;
}

type Loaded = { id: string; coupon: PanelCoupon } | { id: string; error: string; gone: boolean };

const GENERIC_LOAD_ERROR = "No se pudo cargar el cupón.";
const FORM_ID = "coupon-form";

interface EditorProps {
  coupon: PanelCoupon | undefined;
  onClose: () => void;
  onChanged: () => void;
}

/** The form and the actions of one coupon (or the empty form). Mounted once the coupon is in hand, so its fields start from it. */
const Editor = ({ coupon, onClose, onChanged }: EditorProps) => {
  const { toast } = useToast();
  const save = useCouponSave();
  const formId = `${FORM_ID}-${useId()}`;
  const editing = coupon !== undefined;
  const locked = editing && coupon.redeemedCount > 0;
  const baseline = coupon ? valuesFromCoupon(coupon) : EMPTY_COUPON_VALUES;
  const [values, setValues] = useState<CouponFormValues>(baseline);
  const [errors, setErrors] = useState<CouponFormErrors>({});
  const [discarding, setDiscarding] = useState(false);

  // A request that outlives the modal (back button, another row opened) must not close whatever is open now.
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const dirty = JSON.stringify(values) !== JSON.stringify(baseline);
  const unchanged = editing && Object.keys(toUpdateBody(values, baseline, locked)).length === 0;

  const finish = (title: string) => {
    toast({ variant: "success", title });
    onChanged();
    if (alive.current) onClose();
  };

  // Escape, the X and the veil all land here: not while a request is running, and not over unsaved typing without asking.
  const requestClose = () => {
    if (save.saving) return;
    if (dirty) setDiscarding(true);
    else onClose();
  };

  const submit = async () => {
    if (save.saving) return;
    const found = validateCouponForm(values, locked);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    const code = values.code.trim().toUpperCase();
    if (!editing) {
      if (await save.create(values)) finish(`Cupón «${code}» creado`);
      return;
    }
    if (await save.update(coupon.id, values, baseline, locked)) finish(`Cupón «${coupon.code}» guardado`);
  };

  const fieldErrors: CouponFormErrors = { ...errors, ...(save.codeError ? { code: save.codeError } : {}) };

  const footer = (
    <>
      {editing ? (
        <RetireCouponButton
          coupon={coupon}
          disabled={save.saving}
          onRetire={async () => {
            const done = await save.retire(coupon.id);
            if (done) finish(`Cupón «${coupon.code}» retirado`);
            return done;
          }}
          onReactivate={async () => {
            const done = await save.reactivate(coupon.id);
            if (done) finish(`Cupón «${coupon.code}» reactivado`);
            return done;
          }}
        />
      ) : null}
      <Button onClick={requestClose} disabled={save.saving}>
        Cancelar
      </Button>
      <Button type="submit" form={formId} variant="primary" loading={save.saving} disabled={unchanged}>
        {editing ? "Guardar cambios" : "Crear cupón"}
      </Button>
    </>
  );

  return (
    <Modal open onClose={requestClose} title={editing ? "Editar cupón" : "Nuevo cupón"} footer={footer}>
      <div className="flex flex-col gap-5">
        {editing && !coupon.isActive ? (
          <Notice variant="warning" title="Este cupón está retirado">
            <p>Ya no se puede usar. Reactívalo para volver a ofrecerlo.</p>
          </Notice>
        ) : null}
        <CouponForm
          formId={formId}
          mode={editing ? "edit" : "create"}
          values={values}
          errors={fieldErrors}
          error={save.error}
          locked={locked}
          redeemedCount={coupon?.redeemedCount ?? 0}
          onChange={(next) => {
            save.clearErrors();
            setValues(next);
          }}
          onSubmit={() => void submit()}
        />
      </div>
      <ConfirmDialog
        open={discarding}
        tone="danger"
        title="¿Descartar los cambios?"
        description="Lo que escribiste no se ha guardado."
        confirmLabel="Descartar"
        onCancel={() => setDiscarding(false)}
        onConfirm={() => {
          setDiscarding(false);
          onClose();
        }}
      />
    </Modal>
  );
};

/** Mounted only while the modal is open and keyed by the selection, so every opening starts clean. */
const ModalBody = ({ selected, items, onClose, onChanged }: BodyProps) => {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [retry, setRetry] = useState(0);

  const creating = selected === "nuevo";
  const listed = creating ? undefined : items.find((candidate) => candidate.id === selected);
  const needsFetch = !creating && !listed;

  useEffect(() => {
    if (!needsFetch) return;
    let cancelled = false;
    couponClient
      .get(selected)
      .then((coupon) => {
        if (!cancelled) setLoaded({ id: selected, coupon });
      })
      .catch((failure: unknown) => {
        if (cancelled) return;
        const gone = isApiError(failure) && failure.status === 404;
        setLoaded({
          id: selected,
          gone,
          error: gone
            ? "El cupón ya no existe. Puede que el enlace sea viejo."
            : isApiError(failure)
              ? failure.message
              : GENERIC_LOAD_ERROR,
        });
      });
    return () => {
      cancelled = true;
    };
  }, [needsFetch, selected, retry]);

  if (creating) return <Editor coupon={undefined} onClose={onClose} onChanged={onChanged} />;

  const mine = loaded?.id === selected ? loaded : null;
  const coupon = listed ?? (mine && "coupon" in mine ? mine.coupon : undefined);

  if (coupon) return <Editor coupon={coupon} onClose={onClose} onChanged={onChanged} />;

  if (mine && "error" in mine) {
    // A 404 will not heal on retry: the only way out is to close.
    return (
      <Modal key="error" open onClose={onClose} title="Cupón">
        <Notice variant="danger" title={mine.gone ? "Cupón no encontrado" : "No se pudo cargar"}>
          <p>{mine.error}</p>
          <Button
            size="sm"
            className="mt-2"
            onClick={() => {
              if (mine.gone) {
                onClose();
                return;
              }
              setLoaded(null);
              setRetry((count) => count + 1);
            }}
          >
            {mine.gone ? "Cerrar" : "Reintentar"}
          </Button>
        </Notice>
      </Modal>
    );
  }

  return (
    <Modal key="loading" open onClose={onClose} title="Cupón">
      <div aria-busy="true" className="flex flex-col gap-4">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    </Modal>
  );
};

const subscribeNothing = (): (() => void) => () => {};

/** The modal of the Cupones screen: create, edit, retire and reactivate one coupon without leaving the list. */
const CouponModal = ({ selected, ...rest }: CouponModalProps) => {
  // The modal is a portal the server never renders. Opened from the URL (`?cupon=`) it would exist on the
  // first client render and break hydration, so it waits until the page is hydrated.
  const hydrated = useSyncExternalStore(
    subscribeNothing,
    () => true,
    () => false,
  );
  if (!hydrated || !selected) return null;
  return <ModalBody key={selected} selected={selected} {...rest} />;
};

export type { CouponModalProps };
export { CouponModal };
