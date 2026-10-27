"use client";

import { Button } from "@/components/ui/Button";
import type { useResendVerification } from "@/hooks/useResendVerification";

type Resend = ReturnType<typeof useResendVerification>;

/** «Reenviar el enlace», disabled with a countdown while the API would refuse a new link. */
const ResendButton = ({ resend }: { resend: Resend }) => (
  <Button
    type="button"
    variant="edit"
    loading={resend.pending}
    disabled={resend.cooldown.active}
    onClick={() => void resend.resend()}
  >
    {resend.cooldown.active ? `Reenviar en ${resend.cooldown.label}` : "Reenviar el enlace"}
  </Button>
);

export { ResendButton };
