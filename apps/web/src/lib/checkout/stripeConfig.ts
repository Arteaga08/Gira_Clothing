/**
 * Only a PUBLISHABLE key may reach the browser. A secret (`sk_`) or restricted (`rk_`) key pasted by
 * mistake into a NEXT_PUBLIC_ variable is treated as missing instead of being shipped to every visitor.
 */
const parsePublishableKey = (raw: string | undefined): string | null => {
  const key = raw?.trim();
  return key?.startsWith("pk_") ? key : null;
};

// The literal `process.env.NEXT_PUBLIC_*` access is what lets Next inline it into the bundle.
const stripePublishableKey = parsePublishableKey(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);

export { parsePublishableKey, stripePublishableKey };
