import { Notice } from "@/components/ui/Notice";

/**
 * The API answered with something other than a clean 401/anonymous, or
 * didn't answer at all. Never redirects to `/login`: a login form can't fix
 * a downed API, and showing one would misstate the problem as "you're not
 * logged in" when the real cause is unrelated to the session.
 */
const SessionUnavailableScreen = ({ message }: { message?: string }) => (
  <div className="flex min-h-dvh items-center justify-center p-4">
    <Notice variant="danger" title="No pudimos verificar tu sesión" className="max-w-sm">
      Recarga la página. {message ?? "Si el problema sigue, intenta de nuevo en unos minutos."}
    </Notice>
  </div>
);

export { SessionUnavailableScreen };
