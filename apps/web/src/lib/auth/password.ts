import { PASSWORD_MAX_BYTES, PASSWORD_MIN_LENGTH } from "@gira/shared";

/**
 * The password policy as the API enforces it (authValidator.ts): at least
 * PASSWORD_MIN_LENGTH characters, upper + lower case and a digit, and at most
 * PASSWORD_MAX_BYTES bytes (bcrypt's limit; accents and emojis weigh more than one).
 */
type PasswordRuleId = "length" | "upper" | "lower" | "digit";
type PasswordStrength = "" | "Débil" | "Regular" | "Buena" | "Fuerte";

interface PasswordRule {
  id: PasswordRuleId;
  label: string;
  met: boolean;
}

interface PasswordCheck {
  rules: PasswordRule[];
  /** How many of the four rules are met. */
  score: number;
  strength: PasswordStrength;
  tooLong: boolean;
  valid: boolean;
}

const STRENGTH_BY_SCORE: PasswordStrength[] = ["", "Débil", "Regular", "Buena", "Fuerte"];
const TOO_LONG_MESSAGE = `La contraseña no puede pasar de ${String(PASSWORD_MAX_BYTES)} bytes (acentos y emojis cuentan más de uno).`;

const MISSING_LABEL: Record<PasswordRuleId, string> = {
  length: `al menos ${String(PASSWORD_MIN_LENGTH)} caracteres`,
  upper: "una mayúscula",
  lower: "una minúscula",
  digit: "un número",
};

const byteLength = (value: string): number => new TextEncoder().encode(value).length;

const checkPassword = (value: string): PasswordCheck => {
  const bytes = byteLength(value);
  const tooLong = bytes > PASSWORD_MAX_BYTES;
  const rules: PasswordRule[] = [
    {
      id: "length",
      label: `Al menos ${String(PASSWORD_MIN_LENGTH)} caracteres`,
      met: value.length >= PASSWORD_MIN_LENGTH && !tooLong,
    },
    { id: "upper", label: "Una mayúscula", met: /[A-Z]/.test(value) },
    { id: "lower", label: "Una minúscula", met: /[a-z]/.test(value) },
    { id: "digit", label: "Un número", met: /\d/.test(value) },
  ];
  const score = rules.filter((rule) => rule.met).length;

  return { rules, score, strength: STRENGTH_BY_SCORE[score] ?? "", tooLong, valid: score === rules.length };
};

const joinList = (items: string[]): string =>
  items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} y ${items[items.length - 1] ?? ""}`;

/** The message to show under the field, or null when the password is acceptable. */
const passwordError = (value: string): string | null => {
  if (value === "") return "Escribe una contraseña.";
  const check = checkPassword(value);
  if (check.valid) return null;
  if (check.tooLong) return TOO_LONG_MESSAGE;
  const missing = check.rules.filter((rule) => !rule.met).map((rule) => MISSING_LABEL[rule.id]);
  return `Te falta ${joinList(missing)}.`;
};

export type { PasswordCheck, PasswordRule, PasswordStrength };
export { checkPassword, passwordError };
