import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Palette and typography are placeholders and live in exactly two files:
 * src/styles/tokens.css (colour) and src/app/fonts.ts (families). When the
 * official brand arrives, those two files change and NOTHING else does —
 * this test is what makes that promise checkable instead of aspirational.
 */

const SRC_DIR = join(process.cwd(), "src");
const EXEMPT_FILES = new Set([join(SRC_DIR, "styles", "tokens.css"), join(SRC_DIR, "app", "fonts.ts")]);
const TYPOGRAPHY_FILE = join(SRC_DIR, "components", "ui", "typography.ts");

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const fullPath = join(dir, entry);
    if (statSync(fullPath).isDirectory()) return walk(fullPath);
    return /\.(ts|tsx|css)$/.test(entry) ? [fullPath] : [];
  });

const SOURCE_FILES = walk(SRC_DIR).filter((file) => !EXEMPT_FILES.has(file));

// Hex literals or a colour function call — never `var(...)`, which is how
// every component is meant to reach a colour.
const COLOUR_LITERAL = /#[0-9a-fA-F]{3,8}\b|\b(?:oklch|rgba?|hsla?)\(/;
// `font-family: var(--font-sans)` is how every component reaches the
// typeface (tokens.css → fonts.ts) and must NOT trip this — only a literal
// family name (`font-family: "Arial"`, `fontFamily: "Arial"`) should.
const FONT_FAMILY = /(?:font-family|fontFamily)\s*:(?!\s*var\()/;
// Same colour vocabulary, but specifically inside a Tailwind arbitrary-value
// bracket (`bg-[#fff]`, `text-[oklch(60%_0.1_10)]`) — these dodge the plain
// COLOUR_LITERAL scan above only if written without a leading `#`/function
// name on the same line as something else; kept as its own assertion so a
// failure here names the actual anti-pattern instead of a generic "colour
// found" message.
const ARBITRARY_COLOUR = /\[[^\]]*(?:#[0-9a-fA-F]{3,8}|oklch\(|rgba?\(|hsla?\()[^\]]*\]/;

const findOffenders = (pattern: RegExp): string[] => {
  const offenders: string[] = [];
  for (const file of SOURCE_FILES) {
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, index) => {
      if (pattern.test(line)) {
        offenders.push(`${relative(SRC_DIR, file)}:${index + 1}: ${line.trim()}`);
      }
    });
  }
  return offenders;
};

describe("design tokens: un solo lugar para color y tipografía", () => {
  it("ningún archivo fuera de tokens.css declara un color", () => {
    const offenders = findOffenders(COLOUR_LITERAL);
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("ningún archivo fuera de fonts.ts nombra una familia tipográfica", () => {
    const offenders = findOffenders(FONT_FAMILY);
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("ninguna utilidad arbitraria lleva un color literal (bg-[#fff], text-[oklch(...)])", () => {
    const offenders = findOffenders(ARBITRARY_COLOUR);
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("permite referencias a tokens vía var() (no son falsos positivos)", () => {
    // Sanity check on the regexes themselves: `bg-[var(--status-paid)]`
    // (styles.ts) and `font-family: var(--font-sans)` (globals.css) are how
    // every component reaches a token — neither should ever be flagged.
    expect(ARBITRARY_COLOUR.test('"bg-[var(--status-paid)]"')).toBe(false);
    expect(COLOUR_LITERAL.test('"bg-[var(--status-paid)]"')).toBe(false);
    expect(FONT_FAMILY.test("font-family: var(--font-sans);")).toBe(false);
    expect(FONT_FAMILY.test('fontFamily: "Arial";')).toBe(true);
  });

  it("las superficies derivan de los literales de marca nombrados, no de un hex duplicado", () => {
    const tokens = readFileSync(join(SRC_DIR, "styles", "tokens.css"), "utf8");
    const derivations: Record<string, string> = {
      "--color-wallpaper": "--verde-bosque",
      "--color-surface": "--blanco-hueso",
      "--color-ink": "--negro-tinta",
      "--color-text-primary": "--negro-tinta",
    };
    for (const [token, source] of Object.entries(derivations)) {
      const derivesFromNamedBrand = new RegExp(`${token}:\\s*var\\(${source}\\)`);
      expect(tokens).toMatch(derivesFromNamedBrand);
    }
  });

  it("ningún <h1>/<h2> fuera de typography.ts escribe su propio tamaño o peso", () => {
    // The original bug: PageHeader, resumen/loading.tsx and login/page.tsx
    // each hand-wrote a heading's size/weight and drifted into three
    // different treatments. A heading may only reach typography via a JSX
    // expression (className={T_PAGE_TITLE}) — never a literal string.
    const HEADING_TAG = /<h[12][\s>]/;
    const SIZE_OR_WEIGHT_LITERAL =
      /className\s*=\s*"[^"]*\b(?:text-(?:2xs|xs|sm|base|lg|xl|2xl|3xl)|font-(?:normal|bold|extrabold|semibold))\b/;
    const offenders: string[] = [];

    for (const file of SOURCE_FILES) {
      if (file === TYPOGRAPHY_FILE) continue;
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, index) => {
        if (!HEADING_TAG.test(line)) return;
        // Accumulate only the opening tag itself (it may wrap a couple of
        // attributes across lines), never sibling/child JSX below it.
        let openingTag = "";
        for (let cursor = index; cursor < lines.length; cursor += 1) {
          openingTag += `${lines[cursor]} `;
          if (lines[cursor]?.includes(">")) break;
        }
        if (SIZE_OR_WEIGHT_LITERAL.test(openingTag)) {
          offenders.push(`${relative(SRC_DIR, file)}:${index + 1}: ${line.trim()}`);
        }
      });
    }

    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("amarillo eléctrico sólo aparece en los roles de CTA, nunca como fondo o acento suelto", () => {
    const tokens = readFileSync(join(SRC_DIR, "styles", "tokens.css"), "utf8");
    const usages = [...tokens.matchAll(/^\s*(--[\w-]+):\s*var\(--amarillo-electrico\)/gm)].map((m) => m[1]);
    expect(usages).toEqual(["--color-cta"]);
  });
});
