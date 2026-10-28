"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { logout } from "@/lib/api/auth";
import { STORE_ROUTES } from "@/lib/store/routes";

/** Ends this device's session and reloads at the login, so no signed-in screen stays in memory. */
const LogoutButton = ({ tile = false }: { tile?: boolean }) => {
  const [busy, setBusy] = useState(false);

  const signOut = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await logout();
    } catch {
      // The cookie may outlive a failed call: the login page re-checks it, so leaving is still right.
    }
    window.location.assign(STORE_ROUTES.login);
  };

  if (tile) {
    return (
      <button
        type="button"
        onClick={() => void signOut()}
        disabled={busy}
        className={cn("rounded-nb border-2 border-ink bg-danger-soft p-3.5 text-left text-danger", "disabled:opacity-45")}
      >
        <b className="block text-sm">Cerrar sesión</b>
      </button>
    );
  }

  return (
    <Button variant="danger" size="sm" loading={busy} onClick={() => void signOut()} className="w-full">
      Cerrar sesión
    </Button>
  );
};

export { LogoutButton };
