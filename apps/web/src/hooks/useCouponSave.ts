"use client";

import { COUPON_CODE_TAKEN_MESSAGE } from "@gira/shared";
import { useCallback, useState } from "react";
import { couponClient } from "@/lib/api/adminCoupons";
import { isApiError } from "@/lib/api/ApiError";
import {
  toCreateBody,
  toUpdateBody,
  validateCouponForm,
  type CouponFormValues,
} from "@/lib/coupons/couponForm";

const GENERIC_ERROR = "Inténtalo de nuevo en un momento.";

interface UseCouponSave {
  saving: boolean;
  /** A message from the API (already in Spanish) or the generic one. */
  error: string | null;
  /** The duplicate-code 409, kept apart because it belongs on the Código field. */
  codeError: string | null;
  clearErrors: () => void;
  /** Each action resolves `true` when it went through; on `false` the reason is in `error` / `codeError`. */
  create: (values: CouponFormValues) => Promise<boolean>;
  update: (id: string, values: CouponFormValues, baseline: CouponFormValues, locked: boolean) => Promise<boolean>;
  retire: (id: string) => Promise<boolean>;
  reactivate: (id: string) => Promise<boolean>;
}

/** Runs one write at a time: field checks first (no request if they fail), then the call, mapping failures to a message. */
const useCouponSave = (): UseCouponSave => {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);

  const run = useCallback(async (action: () => Promise<unknown>): Promise<boolean> => {
    setSaving(true);
    setError(null);
    setCodeError(null);
    try {
      await action();
      return true;
    } catch (failure) {
      if (isApiError(failure) && failure.status === 409 && failure.message === COUPON_CODE_TAKEN_MESSAGE) {
        setCodeError(failure.message);
      } else {
        setError(isApiError(failure) ? failure.message : GENERIC_ERROR);
      }
      return false;
    } finally {
      setSaving(false);
    }
  }, []);

  const create = useCallback(
    async (values: CouponFormValues): Promise<boolean> => {
      // The form already shows field errors; this is the guard that keeps a bad body off the network.
      if (Object.keys(validateCouponForm(values, false)).length > 0) return false;
      return run(() => couponClient.create(toCreateBody(values)));
    },
    [run],
  );

  const update = useCallback(
    async (id: string, values: CouponFormValues, baseline: CouponFormValues, locked: boolean): Promise<boolean> => {
      if (Object.keys(validateCouponForm(values, locked)).length > 0) return false;
      const body = toUpdateBody(values, baseline, locked);
      if (Object.keys(body).length === 0) return true;
      return run(() => couponClient.update(id, body));
    },
    [run],
  );

  const retire = useCallback((id: string) => run(() => couponClient.retire(id)), [run]);
  const reactivate = useCallback((id: string) => run(() => couponClient.reactivate(id)), [run]);
  const clearErrors = useCallback(() => {
    setError(null);
    setCodeError(null);
  }, []);

  return { saving, error, codeError, clearErrors, create, update, retire, reactivate };
};

export type { UseCouponSave };
export { useCouponSave };
