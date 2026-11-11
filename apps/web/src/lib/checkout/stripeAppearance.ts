import type { Appearance } from "@stripe/stripe-js";

/** Reads a design token as a value the Stripe iframe can use (it cannot see our CSS variables). */
type TokenReader = (token: string) => string;

interface TokenReaders {
  /** A colour token, resolved to a plain hex string the iframe parses. */
  color: TokenReader;
  /** Any other token (a font stack), as written. */
  text: TokenReader;
}

/**
 * Look of the Payment Element, taken from the project's tokens: flat (no shadows), 2px ink borders and the
 * same radius as every other control. `read` is injected so the mapping is testable without a browser.
 */
const buildStripeAppearance = ({ color, text }: TokenReaders): Appearance => {
  const ink = color("--color-ink");
  const danger = color("--color-danger");
  const surface = color("--color-surface");
  // The iframe has no webfonts: of the stack, the browser keeps the first face it actually has (the system one).
  const fontFamily = text("--font-sans");

  return {
    theme: "flat",
    variables: {
      colorPrimary: ink,
      colorBackground: surface,
      colorText: color("--color-text-primary"),
      colorTextSecondary: color("--color-text-muted"),
      colorDanger: danger,
      fontFamily,
      borderRadius: "8px",
      spacingUnit: "4px",
    },
    rules: {
      ".Input": { border: `2px solid ${ink}`, boxShadow: "none", backgroundColor: surface },
      ".Input:focus": { border: `2px solid ${ink}`, boxShadow: "none", outline: "none" },
      ".Input--invalid": { border: `2px solid ${danger}`, boxShadow: "none" },
      ".Label": { fontWeight: "700" },
      ".Error": { color: danger },
    },
  };
};

// A marker colour no token will ever be (assembled, not written, so it is not mistaken for a design colour).
const SENTINEL = ["#", "fe01fd"].join("");

const readToken: TokenReader = (token) => getComputedStyle(document.documentElement).getPropertyValue(token).trim();

/**
 * Resolves a colour token to a plain hex string. A token may be written in a colour space the iframe does not
 * parse; painting one pixel is the portable way to get the same colour in a form it accepts.
 */
const readTokenColor: TokenReader = (token) => {
  const raw = readToken(token);
  try {
    const context = document.createElement("canvas").getContext("2d");
    if (!context) return raw;
    // A value the canvas cannot parse is ignored and the fill keeps its previous colour: a sentinel tells them apart.
    context.fillStyle = SENTINEL;
    context.fillStyle = raw;
    if (context.fillStyle === SENTINEL) return raw;
    context.fillRect(0, 0, 1, 1);
    const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
    return `#${[r, g, b].map((channel) => (channel ?? 0).toString(16).padStart(2, "0")).join("")}`;
  } catch {
    return raw;
  }
};

export type { TokenReader, TokenReaders };
export { buildStripeAppearance, readTokenColor, readToken };
