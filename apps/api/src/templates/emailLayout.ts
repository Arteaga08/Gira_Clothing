/**
 * Shared email shell. Every transactional template (orders, account) renders
 * its body into `layout` so all mail looks the same. Every interpolated value
 * goes through escapeHtml: an email built by string concatenation must not
 * depend on the input sanitizer having run first.
 */

interface RenderedMail {
  subject: string;
  html: string;
  text: string;
}

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const layout = (heading: string, bodyHtml: string): string =>
  `<!doctype html><html lang="es"><body style="font-family:system-ui,sans-serif;color:#1a1a1a">` +
  `<h1 style="font-size:20px">${escapeHtml(heading)}</h1>${bodyHtml}` +
  `<p style="font-size:12px;color:#666">Gira Clothing</p></body></html>`;

export type { RenderedMail };
export { escapeHtml, layout };
