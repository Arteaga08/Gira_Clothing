type ClassValue = string | false | null | undefined;

/**
 * Minimal class-name joiner: filters falsy values and joins with a space. No
 * dependency (clsx/tailwind-merge) — this project has no conflicting utility
 * pairs to dedupe yet, and pulling one in for five lines of logic isn't
 * justified.
 */
const cn = (...values: ClassValue[]): string => values.filter(Boolean).join(" ");

export { cn };
