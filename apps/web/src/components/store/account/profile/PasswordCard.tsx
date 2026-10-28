import { Button } from "@/components/ui/Button";
import { T_PANEL_TITLE } from "@/components/ui/typography";
import { ChangePasswordForm } from "./ChangePasswordForm";

interface PasswordCardProps {
  editing: boolean;
  onEdit: () => void;
  onDone: () => void;
  onCancel: () => void;
}

/** «Contraseña»: a line of text and «Cambiar», or the change form while editing. */
const PasswordCard = ({ editing, onEdit, onDone, onCancel }: PasswordCardProps) => (
  <section aria-labelledby="password-title" className="grid gap-4">
    <h2 id="password-title" className={`${T_PANEL_TITLE} text-2xl`}>
      Contraseña
    </h2>
    {editing ? (
      <ChangePasswordForm onDone={onDone} onCancel={onCancel} />
    ) : (
      <>
        <p className="text-sm text-text-secondary">Elige una contraseña que no uses en ningún otro sitio.</p>
        <Button variant="edit" size="sm" className="justify-self-start" onClick={onEdit}>
          Cambiar
        </Button>
      </>
    )}
  </section>
);

export { PasswordCard };
