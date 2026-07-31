import { Inter, JetBrains_Mono } from "next/font/google";

/**
 * SWAP POINT #2 — TYPOGRAPHY.
 *
 * Both families below are PLACEHOLDERS: the official typeface for Gira has not
 * been chosen yet. When it arrives, this file is the only one that changes —
 * swap the two `next/font` calls below and keep the variable names. No
 * component names a font family; they read `--font-sans` / `--font-mono` from
 * tokens.css, which point at the variables declared here.
 *
 * `next/font` self-hosts the files at build time: zero requests to an
 * external CDN at runtime, and no layout shift from a late font swap.
 */

const sans = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans-var",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-mono-var",
});

/** Applied once on <html> in the root layout. */
const fontVariables = `${sans.variable} ${mono.variable}`;

export { fontVariables };
