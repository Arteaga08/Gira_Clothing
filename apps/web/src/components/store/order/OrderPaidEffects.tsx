"use client";

import { useEffect } from "react";
import { announceCartChange } from "@/lib/cart/guestCart";
import { forgetCheckoutKey } from "@/lib/checkout/idempotencyKey";

/** Renders nothing: once the server says the order is paid, the cart counter is re-read (the API emptied the cart) and the checkout key is released. */
const OrderPaidEffects = () => {
  useEffect(() => {
    announceCartChange();
    forgetCheckoutKey();
  }, []);
  return null;
};

export { OrderPaidEffects };
