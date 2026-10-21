"use client";

import { COUPON_CODE_TAKEN_MESSAGE } from "@gira/shared";
import { useCallback, useState } from "react";
import { customerClient } from "@/lib/api/adminCustomers";
import { isApiError } from "@/lib/api/ApiError";
import { toGiveBody, validateGiveForm, type GiveCouponValues } from "@/lib/customers/giveCouponForm";

const GENERIC_ERROR = "Inténtalo de nuevo en un momento.";

type GiveOutcome = { ok: true; emailSent: boolean; code: string } | { ok: false };

interface UseGiveCoupon {
  saving: boolean;
  /** A message from the API (already in Spanish) or the generic one. */
  error: string | null;
  /** The duplicate-code 409, kept apart because it belongs on the Código field. */
  codeError: string | null;
  clearErrors: () => void;
  give: (customerId: string, values: GiveCouponValues) => Promise<GiveOutcome>;
}

const useGiveCoupon = (): UseGiveCoupon => {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);

  const give = useCallback(async (customerId: string, values: GiveCouponValues): Promise<GiveOutcome> => {
    // The form already shows field errors; this keeps a bad body off the network.
    if (Object.values(validateGiveForm(values)).some(Boolean)) return { ok: false };
    setSaving(true);
    setError(null);
    setCodeError(null);
    try {
      const result = await customerClient.giveCoupon(customerId, toGiveBody(values));
      return { ok: true, emailSent: result.emailSent, code: result.coupon.code };
    } catch (failure) {
      if (isApiError(failure) && failure.status === 409 && failure.message === COUPON_CODE_TAKEN_MESSAGE) {
        setCodeError(failure.message);
      } else {
        setError(isApiError(failure) ? failure.message : GENERIC_ERROR);
      }
      return { ok: false };
    } finally {
      setSaving(false);
    }
  }, []);

  const clearErrors = useCallback(() => {
    setError(null);
    setCodeError(null);
  }, []);

  return { saving, error, codeError, clearErrors, give };
};

export type { UseGiveCoupon, GiveOutcome };
export { useGiveCoupon };
