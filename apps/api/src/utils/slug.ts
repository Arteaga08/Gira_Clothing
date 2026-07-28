import { AppError } from "./AppError.js";

/** URL-safe slug: strips diacritics ("Bárbara" -> "barbara"), lowercases, dashes. */
const slugify = (input: string): string =>
  input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip combining diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/**
 * Appends -2, -3, ... until `isTaken` says the candidate is free. IO is injected
 * so this stays pure and unit-testable; each service passes its own model check.
 * The unique index is the real guarantee — this loop is only UX.
 */
const resolveUniqueSlug = async (
  base: string,
  isTaken: (candidate: string) => Promise<boolean>,
): Promise<string> => {
  if (!base) throw new AppError("El nombre no permite generar una URL válida.", 400);
  let candidate = base;
  let n = 1;
  while (await isTaken(candidate)) {
    n += 1;
    candidate = `${base}-${n}`;
  }
  return candidate;
};

export { slugify, resolveUniqueSlug };
