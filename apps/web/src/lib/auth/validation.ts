/** Client-side field checks for the account forms. The API validates again; these only save the round trip and explain. */

const EMAIL_EXAMPLE = "maria.lopez@correo.mx";
// Letters (any script, with accents), spaces and the apostrophe, dot and hyphen the API allows in names.
const NAME_PATTERN = /^[\p{L}\p{M}][\p{L}\p{M} '.-]*$/u;

const emailError = (value: string): string | null => {
  const email = value.trim();
  if (email === "") return "Falta tu correo.";
  const at = email.indexOf("@");
  if (at === -1) return `Al correo le falta la @, por ejemplo ${EMAIL_EXAMPLE}.`;
  const domain = email.slice(at + 1);
  if (at === 0 || !domain.includes(".") || domain.startsWith(".") || domain.endsWith(".")) {
    return `Al correo le falta el dominio, por ejemplo ${EMAIL_EXAMPLE}.`;
  }
  return null;
};

const nameError = (value: string, noun: "nombre" | "apellido"): string | null => {
  const name = value.trim();
  if (name === "") return `Falta tu ${noun}.`;
  if (name.length < 2) return "Escribe al menos 2 letras.";
  if (!NAME_PATTERN.test(name)) return `Usa solo letras en tu ${noun}.`;
  return null;
};

const confirmPasswordError = (password: string, confirmation: string): string | null => {
  if (confirmation === "") return "Repite tu contraseña.";
  return password === confirmation ? null : "Las contraseñas no coinciden.";
};

export { emailError, nameError, confirmPasswordError };
