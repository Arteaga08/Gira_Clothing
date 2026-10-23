import type { StorefrontAnnouncement } from "@gira/shared";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Panel";

interface AnnouncementPanelProps {
  announcement: StorefrontAnnouncement;
  onEdit: () => void;
}

const AnnouncementPanel = ({ announcement, onEdit }: AnnouncementPanelProps) => (
  <Panel
    title="Barra de anuncios"
    hint="Arriba de la tienda"
    actions={
      <Button variant="edit" size="sm" onClick={onEdit}>
        Editar
      </Button>
    }
  >
    <div className="flex items-center gap-2">
      <Badge variant={announcement.enabled ? "ok" : "neutral"}>{announcement.enabled ? "Visible" : "Oculta"}</Badge>
      <span className="text-sm text-text-secondary">
        {announcement.messages.length === 1 ? "1 mensaje" : `${announcement.messages.length} mensajes`}
      </span>
    </div>
    {announcement.messages.length > 0 ? (
      <ul className="mt-3 flex list-disc flex-col gap-1 pl-5 text-sm text-text-primary">
        {announcement.messages.map((message, index) => (
          <li key={`${index}-${message}`}>{message}</li>
        ))}
      </ul>
    ) : (
      <p className="mt-3 text-sm text-text-secondary">Aún no hay mensajes. La barra corre en bucle sobre la navegación.</p>
    )}
  </Panel>
);

export type { AnnouncementPanelProps };
export { AnnouncementPanel };
