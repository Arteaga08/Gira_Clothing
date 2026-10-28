"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { T_PANEL_TITLE } from "@/components/ui/typography";
import { logoutAll } from "@/lib/api/auth";
import { STORE_ROUTES } from "@/lib/store/routes";

/** «Sesiones»: close the account on every device. It asks first, since it also ends this one. */
const SessionsCard = () => {
  const [open, setOpen] = useState(false);

  const confirm = async () => {
    await logoutAll();
    window.location.assign(STORE_ROUTES.login);
  };

  return (
    <section aria-labelledby="sessions-title" className="grid gap-3">
      <h2 id="sessions-title" className={`${T_PANEL_TITLE} text-2xl`}>
        Sesiones
      </h2>
      <p className="text-sm text-text-secondary">Si usaste tu cuenta en un equipo ajeno, ciérrala en todos tus dispositivos.</p>
      <Button variant="danger" size="sm" className="justify-self-start" onClick={() => setOpen(true)}>
        Cerrar sesión en todos los dispositivos
      </Button>
      <ConfirmDialog
        open={open}
        tone="danger"
        title="Cerrar sesión en todos los dispositivos"
        description="Cerraremos tu sesión aquí y en todos tus otros dispositivos. Tendrás que volver a ingresar."
        confirmLabel="Cerrar todas las sesiones"
        onConfirm={confirm}
        onCancel={() => setOpen(false)}
      />
    </section>
  );
};

export { SessionsCard };
