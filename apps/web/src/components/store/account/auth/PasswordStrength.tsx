import { cn } from "@/lib/cn";
import { checkPassword } from "@/lib/auth/password";

/** Four bars, a word and a checklist: how close the password is to the policy the API enforces. */
const PasswordStrength = ({ value }: { value: string }) => {
  const check = checkPassword(value);

  return (
    <div>
      <div aria-hidden="true" className="grid grid-cols-4 gap-1">
        {[0, 1, 2, 3].map((index) => (
          <i key={index} className={cn("h-2 rounded-sm border-2 border-ink", index < check.score ? "bg-accent" : "bg-surface-sunken")} />
        ))}
      </div>
      <p aria-live="polite" className="mt-1 font-mono text-2xs font-bold uppercase text-text-secondary">
        {check.strength === "" ? " " : check.strength}
      </p>
      <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-text-secondary">
        {check.rules.map((rule) => (
          <li key={rule.id} className="flex items-start gap-1.5">
            <span aria-hidden="true" className={cn("font-bold", rule.met ? "text-success" : "text-text-muted")}>
              {rule.met ? "●" : "○"}
            </span>
            <span>
              {rule.label}
              <span className="sr-only">{rule.met ? ", cumplida" : ", pendiente"}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
};

export { PasswordStrength };
