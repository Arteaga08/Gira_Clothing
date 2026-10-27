import type { StorefrontEvents } from "@gira/shared";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Panel";
import { eventDay } from "@/lib/store/eventDate";

interface EventsPanelProps {
  events: StorefrontEvents;
  /** Today as YYYY-MM-DD in the shop's zone; past events do not show in the store. */
  today: string;
  onEdit: () => void;
}

/** Summary of the events: how many are upcoming and the next one. Editing happens in the modal. */
const EventsPanel = ({ events, today, onEdit }: EventsPanelProps) => {
  const upcoming = events.items
    .filter((item) => item.date >= today)
    .sort((a, b) => `${a.date}T${a.startTime}`.localeCompare(`${b.date}T${b.startTime}`));
  const next = upcoming[0];
  return (
    <Panel
      title="Eventos"
      hint="Debajo del banner de ofertas"
      actions={
        <Button variant="edit" size="sm" onClick={onEdit}>
          Editar
        </Button>
      }
    >
      <Badge variant={next ? "ok" : "neutral"}>
        {next ? `${upcoming.length} próximo${upcoming.length === 1 ? "" : "s"}` : "Sin eventos próximos"}
      </Badge>
      {next ? (
        <p className="mt-3 flex flex-col gap-1 text-sm">
          <span className="font-bold text-text-primary">
            {eventDay(next.date).day} {eventDay(next.date).month} · {next.title}
          </span>
          <span className="text-text-secondary">
            {next.city} · {next.venue}
          </span>
        </p>
      ) : (
        <p className="mt-3 text-sm text-text-secondary">
          {events.emptyMessage
            ? `La tienda muestra: «${events.emptyMessage}»`
            : "Aún no hay eventos. Agrega el siguiente y la sección aparece en la tienda."}
        </p>
      )}
    </Panel>
  );
};

export type { EventsPanelProps };
export { EventsPanel };
