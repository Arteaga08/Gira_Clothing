import { EVENT_ALT_MAX_LENGTH, EVENT_CITY_MAX_LENGTH, EVENT_TITLE_MAX_LENGTH, EVENT_URL_MAX_LENGTH, EVENT_VENUE_MAX_LENGTH, type StorefrontEvent } from "@gira/shared";
import { Trash } from "@phosphor-icons/react/dist/ssr";
import { ImageTile } from "@/components/catalog/ImageTile";
import { UploadTile } from "@/components/catalog/UploadTile";
import { Field } from "@/components/ui/Field";
import { IconButton } from "@/components/ui/IconButton";
import { T_LABEL } from "@/components/ui/typography";

interface EventEditorProps {
  event: StorefrontEvent;
  /** 0-based; shown as «Evento N». */
  index: number;
  busy: boolean;
  onChange: (event: StorefrontEvent) => void;
  onReplaceImage: (file: File) => void;
  onRemove: () => void;
}

/** One event: when, where, its name, an optional photo and the map link. */
const EventEditor = ({ event, index, busy, onChange, onReplaceImage, onRemove }: EventEditorProps) => {
  const number = index + 1;
  const update = (change: Partial<StorefrontEvent>) => onChange({ ...event, ...change });
  return (
    <li className="flex flex-col gap-4 border-t-2 border-ink pt-4 first:border-t-0 first:pt-0">
      <div className="flex items-center justify-between gap-2">
        <h3 className={T_LABEL}>Evento {number}</h3>
        <IconButton icon={Trash} label={`Quitar el evento ${number}`} variant="danger" size="sm" onClick={onRemove} />
      </div>
      <Field
        label="Nombre del evento"
        helper={`${event.title.length}/${EVENT_TITLE_MAX_LENGTH}`}
        maxLength={EVENT_TITLE_MAX_LENGTH}
        autoComplete="off"
        value={event.title}
        onChange={(change) => update({ title: change.target.value })}
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Fecha" type="date" value={event.date} onChange={(change) => update({ date: change.target.value })} />
        <Field label="Hora de inicio" type="time" value={event.startTime} onChange={(change) => update({ startTime: change.target.value })} />
        <Field
          label="Hora de cierre"
          type="time"
          helper="Opcional"
          value={event.endTime}
          onChange={(change) => update({ endTime: change.target.value })}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Ciudad"
          helper={`${event.city.length}/${EVENT_CITY_MAX_LENGTH}`}
          maxLength={EVENT_CITY_MAX_LENGTH}
          autoComplete="off"
          value={event.city}
          onChange={(change) => update({ city: change.target.value })}
        />
        <Field
          label="Lugar"
          helper={`${event.venue.length}/${EVENT_VENUE_MAX_LENGTH}`}
          maxLength={EVENT_VENUE_MAX_LENGTH}
          autoComplete="off"
          value={event.venue}
          onChange={(change) => update({ venue: change.target.value })}
        />
      </div>
      <Field
        label="Enlace del mapa"
        helper="Opcional · empieza con https:// · si lo dejas vacío no sale el botón «Cómo llegar»"
        maxLength={EVENT_URL_MAX_LENGTH}
        type="url"
        autoComplete="off"
        value={event.mapsUrl}
        onChange={(change) => update({ mapsUrl: change.target.value })}
      />
      <div className="grid items-start gap-4 sm:grid-cols-[10rem_minmax(0,1fr)]">
        <div className="flex flex-col gap-2">
          {event.image ? (
            <ImageTile
              url={event.image.url}
              alt={event.alt || `Foto del evento ${number}`}
              className="aspect-[4/5] w-full rounded-nb-sm border-2 border-ink object-cover"
            />
          ) : null}
          <UploadTile
            label={event.image ? "Cambiar foto" : "Subir foto"}
            hint="Opcional · vertical (4:5)"
            busy={busy}
            className="w-full"
            onFiles={(files) => onReplaceImage(files[0] as File)}
          />
        </div>
        <Field
          label="Descripción de la foto"
          helper={`Para lectores de pantalla · obligatoria con foto · ${event.alt.length}/${EVENT_ALT_MAX_LENGTH}`}
          maxLength={EVENT_ALT_MAX_LENGTH}
          autoComplete="off"
          value={event.alt}
          onChange={(change) => update({ alt: change.target.value })}
        />
      </div>
    </li>
  );
};

export type { EventEditorProps };
export { EventEditor };
