import { describe, it, expect } from "vitest";
import { renderVerificationEmail, renderPasswordResetEmail, renderPasswordChangedEmail } from "../../src/templates/authEmails.js";

const TOKEN = "f".repeat(64);

describe("correos de cuenta", () => {
  it("verificación: enlace a /verificar-correo?token=, vigencia de 24 h y texto plano", () => {
    const mail = renderVerificationEmail({ token: TOKEN });
    expect(mail.subject).toMatch(/activa/i);
    expect(mail.html).toContain(`/verificar-correo?token=${TOKEN}`);
    expect(mail.text).toContain(`/verificar-correo?token=${TOKEN}`);
    expect(mail.text).toMatch(/24 horas/);
  });

  it("restablecer: enlace a /restablecer-contrasena?token= y vigencia de 1 hora", () => {
    const mail = renderPasswordResetEmail({ token: TOKEN });
    expect(mail.html).toContain(`/restablecer-contrasena?token=${TOKEN}`);
    expect(mail.text).toContain(`/restablecer-contrasena?token=${TOKEN}`);
    expect(mail.text).toMatch(/1 hora/);
  });

  it("no llevan texto del usuario: el nombre lo pudo escribir cualquiera que conozca el correo", () => {
    for (const render of [renderVerificationEmail, renderPasswordResetEmail]) {
      const mail = render({ token: TOKEN, firstName: "Atacante" } as never);
      expect(mail.html).not.toContain("Atacante");
      expect(mail.text).not.toContain("Atacante");
    }
  });

  it("aviso de contraseña cambiada: asunto fijo, enlace a recuperar sin token y sin datos del usuario", () => {
    const mail = renderPasswordChangedEmail();
    expect(mail.subject).toBe("Tu contraseña cambió — Gira Clothing");
    for (const body of [mail.html, mail.text]) {
      expect(body).toContain("/recuperar-contrasena");
      expect(body).not.toMatch(/token=/);
    }
    expect(mail.text).toMatch(/si no fuiste tú/i);
  });
});
