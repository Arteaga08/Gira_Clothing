import type { AccountProfile, Wire } from "@gira/shared";
import { Button } from "@/components/ui/Button";
import { T_PANEL_TITLE } from "@/components/ui/typography";
import { ProfileForm } from "./ProfileForm";

interface PersonalDataCardProps {
  profile: Wire<AccountProfile>;
  editing: boolean;
  onEdit: () => void;
  onSaved: (profile: Wire<AccountProfile>) => void;
  onCancel: () => void;
}

/** `2026-05-17` → `17/05/2026`, from the string itself: no `Date`, so no timezone can shift the day. */
const readableDate = (iso: string): string => iso.split("-").reverse().join("/");

const Row = ({ label, value }: { label: string; value: string | null }) => (
  <div className="flex justify-between gap-3 border-b-2 border-dashed border-border pb-2">
    <dt className="text-text-muted">{label}</dt>
    <dd className="m-0 min-w-0 break-words text-right font-bold">{value ?? "Sin agregar"}</dd>
  </div>
);

/** «Datos personales»: read-only by default, the form while editing. */
const PersonalDataCard = ({ profile, editing, onEdit, onSaved, onCancel }: PersonalDataCardProps) => (
  <section aria-labelledby="personal-title" className="grid gap-4">
    <h2 id="personal-title" className={`${T_PANEL_TITLE} text-2xl`}>
      Datos personales
    </h2>
    {editing ? (
      <ProfileForm profile={profile} onSaved={onSaved} onCancel={onCancel} />
    ) : (
      <>
        <dl className="grid gap-2.5">
          <Row label="Nombre" value={profile.firstName} />
          <Row label="Apellido" value={profile.lastName} />
          <Row label="Correo" value={profile.email} />
          <Row label="Celular" value={profile.phone} />
          <Row label="Nacimiento" value={profile.birthDate ? readableDate(profile.birthDate) : null} />
          <Row label="Ciudad" value={profile.city} />
        </dl>
        <Button variant="edit" size="sm" className="justify-self-start" onClick={onEdit}>
          Editar
        </Button>
      </>
    )}
  </section>
);

export { PersonalDataCard };
