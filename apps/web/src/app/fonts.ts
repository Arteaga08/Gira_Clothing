import { Anton, Space_Grotesk, Space_Mono } from "next/font/google";

/**
 * SWAP POINT #2 — TYPOGRAPHY.
 *
 * Three families, three jobs, never mixed: Anton carries every title (always
 * uppercase — it has no lowercase design worth using), Space Grotesk carries
 * everything a person reads, Space Mono carries everything a person counts.
 * No component names a font family directly; they read `--font-display` /
 * `--font-sans` / `--font-mono` from tokens.css, which point at the
 * variables declared here.
 *
 * Anton ships ONE weight (400). Requesting `font-weight: 700` on it asks the
 * browser to synthesize a fake bold, which fattens the strokes unevenly and
 * looks smudged — the design spec never applies a weight to `--font-display`,
 * it relies on the typeface's own (very heavy) default instead.
 *
 * `next/font` self-hosts the files at build time: zero requests to an
 * external CDN at runtime, and no layout shift from a late font swap.
 */

const display = Anton({
  subsets: ["latin"],
  weight: "400",
  display: "swap",
  variable: "--font-display-var",
});

const sans = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  display: "swap",
  variable: "--font-sans-var",
});

const mono = Space_Mono({
  subsets: ["latin"],
  weight: ["400", "700"],
  display: "swap",
  variable: "--font-mono-var",
});

/** Applied once on <html> in the root layout. */
const fontVariables = `${display.variable} ${sans.variable} ${mono.variable}`;

export { fontVariables };
