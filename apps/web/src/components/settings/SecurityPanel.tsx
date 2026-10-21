import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Panel";

interface SecurityPanelProps {
  onReset: () => void;
}

/** An admin session only exists with the second factor on, so on this screen it is always active. */
const SecurityPanel = ({ onReset }: SecurityPanelProps) => (
  <Panel
    title="Seguridad"
    hint="Tu cuenta de administrador"
    actions={
      <Button size="sm" onClick={onReset}>
        Reiniciar 2FA
      </Button>
    }
  >
    <p className="flex flex-wrap items-center gap-2 text-sm font-bold">
      Verificación en dos pasos <Badge variant="ok">Activa</Badge>
    </p>
    <p className="mt-2 text-sm text-text-secondary">
      Reinícialo si cambias de teléfono o de app de autenticación. Necesitas el código actual; si ya no tienes
      acceso a tu app, el reinicio se hace desde el servidor.
    </p>
  </Panel>
);

export type { SecurityPanelProps };
export { SecurityPanel };
