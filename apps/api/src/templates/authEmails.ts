import { env } from "../config/env.js";
import { escapeHtml, layout, type RenderedMail } from "./emailLayout.js";

/**
 * Account emails (verification, password reset) on the shared shell. The
 * token travels only here — the DB keeps its hash — and lands on the
 * storefront pages that Bloque 3 builds (same routes as esencia / bw_bikes).
 * Copy is Spanish (customer-facing); code is English.
 *
 * No user-supplied text goes in: anyone who knows an address can register it
 * (or ask for a reset on a never-verified signup) and choose the "name", so
 * interpolating it would let a stranger write into a legitimate Gira email.
 */

interface AccountEmailInput {
  token: string;
}

const verificationUrl = (token: string): string => `${env.clientUrl}/verificar-correo?token=${token}`;
const resetUrl = (token: string): string => `${env.clientUrl}/restablecer-contrasena?token=${token}`;

const forgotUrl = (): string => `${env.clientUrl}/recuperar-contrasena`;

const button = (url: string, label: string): string =>
  `<p><a href="${escapeHtml(url)}" style="display:inline-block;padding:12px 20px;` +
  `background:#1a1a1a;color:#ffffff;text-decoration:none;font-weight:bold">${escapeHtml(label)}</a></p>` +
  `<p style="font-size:12px;color:#666">Si el botón no abre, copia este enlace en tu navegador:<br>` +
  `${escapeHtml(url)}</p>`;

const renderVerificationEmail = ({ token }: AccountEmailInput): RenderedMail => {
  const url = verificationUrl(token);
  return {
    subject: "Activa tu cuenta en Gira Clothing",
    html: layout(
      "Activa tu cuenta",
      `<p>Gracias por crear tu cuenta. Abre el enlace y escribe la contraseña que elegiste para activarla.</p>` +
        button(url, "Activar mi cuenta") +
        `<p>El enlace vence en 24 horas. Si tú no creaste esta cuenta, ignora este correo.</p>`,
    ),
    text:
      `Activa tu cuenta en Gira Clothing.\n\n` +
      `Abre el enlace y escribe la contraseña que elegiste para activarla:\n${url}\n\n` +
      `El enlace vence en 24 horas. Si tú no creaste esta cuenta, ignora este correo.`,
  };
};

const renderPasswordResetEmail = ({ token }: AccountEmailInput): RenderedMail => {
  const url = resetUrl(token);
  return {
    subject: "Restablece tu contraseña de Gira Clothing",
    html: layout(
      "Elige una contraseña nueva",
      `<p>Recibimos una solicitud para cambiar la contraseña de tu cuenta. El enlace funciona una sola vez.</p>` +
        button(url, "Elegir contraseña nueva") +
        `<p>El enlace vence en 1 hora. Si tú no lo pediste, ignora este correo: tu contraseña actual sigue funcionando.</p>`,
    ),
    text:
      `Recibimos una solicitud para cambiar la contraseña de tu cuenta en Gira Clothing.\n\n` +
      `Elige una contraseña nueva aquí (funciona una sola vez):\n${url}\n\n` +
      `El enlace vence en 1 hora. Si tú no lo pediste, ignora este correo: tu contraseña actual sigue funcionando.`,
  };
};

/** Security notice after a password change. No name, address, date or IP: only what the person needs to react. */
const renderPasswordChangedEmail = (): RenderedMail => {
  const url = forgotUrl();
  return {
    subject: "Tu contraseña cambió — Gira Clothing",
    html: layout(
      "Tu contraseña cambió",
      `<p>La contraseña de tu cuenta se actualizó correctamente y cerramos tus otras sesiones.</p>` +
        `<p>Si no fuiste tú, restablécela de inmediato:</p>` +
        button(url, "Restablecer mi contraseña"),
    ),
    text:
      `La contraseña de tu cuenta en Gira Clothing se actualizó correctamente y cerramos tus otras sesiones.\n\n` +
      `Si no fuiste tú, restablécela de inmediato:\n${url}`,
  };
};

export type { AccountEmailInput };
export { renderVerificationEmail, renderPasswordResetEmail, renderPasswordChangedEmail };
