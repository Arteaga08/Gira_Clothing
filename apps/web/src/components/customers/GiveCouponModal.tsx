"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { useGiveCoupon } from "@/hooks/useGiveCoupon";
import { formatMxn, pesosToCents } from "@/lib/coupons/money";
import { endOfMxDayIso, formatMxDate, parseMxDate } from "@/lib/coupons/dates";
import {
  EMPTY_GIVE_VALUES,
  validateGiveForm,
  type GiveCouponErrors,
  type GiveCouponValues,
} from "@/lib/customers/giveCouponForm";
import type { PanelCustomer } from "@/lib/customers/panelCustomer";
import { GiveCouponForm } from "./GiveCouponForm";

interface GiveCouponModalProps {
  customer: PanelCustomer;
  open: boolean;
  onClose: () => void;
}

const FORM_ID = "give-coupon-form";

/** What the email will show as the discount, from what is typed so far; null while the value is not valid. */
const discountPreview = (values: GiveCouponValues): string | null => {
  if (values.discountType === "percent") {
    const percent = Number(values.percentOff.trim());
    return Number.isInteger(percent) && percent >= 1 && percent <= 100 ? `${percent}% de descuento` : null;
  }
  const cents = pesosToCents(values.amountOff);
  return cents !== null && cents > 0 ? `${formatMxn(cents)} de descuento` : null;
};

const expiryPreview = (values: GiveCouponValues): string | null => {
  const date = values.endsAt.trim() ? parseMxDate(values.endsAt) : null;
  return date ? `Vigente hasta el ${formatMxDate(endOfMxDayIso(date))}` : null;
};

/** «Así le llega»: a plain-text preview of the email. The message is text, never markup. */
const EmailPreview = ({ firstName, values }: { firstName: string; values: GiveCouponValues }) => {
  const discount = discountPreview(values);
  const expiry = expiryPreview(values);
  return (
    <div className="flex flex-col gap-2" aria-label="Así le llega">
      <p className="font-mono text-2xs font-bold uppercase tracking-wide text-text-secondary">Así le llega</p>
      <div className="flex flex-col gap-3 rounded-nb-sm border-2 border-ink bg-surface-raised p-4">
        <p className="font-display text-lg uppercase">Un detalle para tu próxima compra</p>
        <p className="text-sm">Hola {firstName}, queremos agradecerte por ser parte de Gira.</p>
        <div className="rounded-nb-sm border-2 border-dashed border-ink bg-brand-subtle p-3 text-center">
          <p className="text-sm">{discount ?? "Tu descuento"}</p>
          <p className="font-mono text-xl font-bold">{values.code.trim() || "TU-CODIGO"}</p>
          {expiry ? <p className="text-xs text-text-secondary">{expiry}</p> : null}
        </div>
        {values.message.trim() ? <p className="whitespace-pre-line text-sm">{values.message.trim()}</p> : null}
      </div>
    </div>
  );
};

interface EditorProps extends GiveCouponModalProps {
  open: true;
}

/** Mounted only while open, so every opening starts from an empty form. */
const Editor = ({ customer, onClose }: EditorProps) => {
  const { toast } = useToast();
  const give = useGiveCoupon();
  const formId = `${FORM_ID}-${useId()}`;
  const [values, setValues] = useState<GiveCouponValues>(EMPTY_GIVE_VALUES);
  const [errors, setErrors] = useState<GiveCouponErrors>({});
  const [discarding, setDiscarding] = useState(false);

  // A request that outlives the modal must not close whatever is open now.
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const dirty = JSON.stringify(values) !== JSON.stringify(EMPTY_GIVE_VALUES);

  // Escape, the X and the veil all land here: not while a request runs, and not over typed text without asking.
  const requestClose = () => {
    if (give.saving) return;
    if (dirty) setDiscarding(true);
    else onClose();
  };

  const submit = async () => {
    if (give.saving) return;
    const found = validateGiveForm(values);
    setErrors(found);
    if (Object.values(found).some(Boolean)) return;
    const outcome = await give.give(customer.id, values);
    if (!outcome.ok) return;
    if (outcome.emailSent) {
      toast({ variant: "success", title: "Cupón enviado", description: `${outcome.code} le llegó a ${customer.email}.` });
    } else {
      toast({
        variant: "warning",
        title: "Cupón creado, pero el correo no salió",
        description: `Avísale a ${customer.firstName} que su código es ${outcome.code}.`,
      });
    }
    if (alive.current) onClose();
  };

  const fieldErrors: GiveCouponErrors = { ...errors, ...(give.codeError ? { code: give.codeError } : {}) };

  const footer = (
    <>
      <Button onClick={requestClose} disabled={give.saving}>
        Cancelar
      </Button>
      <Button type="submit" form={formId} variant="primary" loading={give.saving}>
        Crear y enviar
      </Button>
    </>
  );

  return (
    <Modal open onClose={requestClose} title={`Dar cupón a ${customer.firstName}`} footer={footer}>
      <div className="flex flex-col gap-6">
        <GiveCouponForm
          formId={formId}
          firstName={customer.firstName}
          email={customer.email}
          values={values}
          errors={fieldErrors}
          error={give.error}
          onChange={(next) => {
            give.clearErrors();
            setValues(next);
          }}
          onSubmit={() => void submit()}
        />
        <EmailPreview firstName={customer.firstName} values={values} />
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

const subscribeNothing = (): (() => void) => () => {};

/** «Dar cupón a {nombre}»: creates a personal coupon and emails it, from the customer's page. */
const GiveCouponModal = ({ open, ...rest }: GiveCouponModalProps) => {
  // The modal is a portal the server never renders: opened from the URL it would exist on the first
  // client render and break hydration, so it waits until the page is hydrated.
  const hydrated = useSyncExternalStore(
    subscribeNothing,
    () => true,
    () => false,
  );
  if (!hydrated || !open) return null;
  return <Editor open {...rest} />;
};

export type { GiveCouponModalProps };
export { GiveCouponModal };
