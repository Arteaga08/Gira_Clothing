import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ForgotFlow } from "@/components/store/account/auth/ForgotFlow";
import { ResetFlow } from "@/components/store/account/auth/ResetFlow";
import { VerifyFlow } from "@/components/store/account/auth/VerifyFlow";
import { jsonResponse, stubFetch } from "../../helpers/fetchMock";

const TOKEN = "a".repeat(64);
const ok = jsonResponse(200, { status: "success", message: "ok" });

describe("VerifyFlow", () => {
  it("sin token válido: «Este enlace ya no sirve» con formulario de reenvío", () => {
    render(<VerifyFlow token={null} photo={null} />);
    expect(screen.getByRole("heading", { name: "Este enlace ya no sirve" })).toBeInTheDocument();
    expect(screen.getByLabelText("Correo de tu cuenta")).toBeInTheDocument();
  });

  it("el reenvío pide el correo y responde sin confirmar si existe", async () => {
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValueOnce(ok);
    render(<VerifyFlow token={null} photo={null} />);

    await userEvent.click(screen.getByRole("button", { name: "Pedir un enlace nuevo" }));
    expect(screen.getByText("Falta tu correo.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();

    await userEvent.type(screen.getByLabelText("Correo de tu cuenta"), "maria@correo.mx");
    await userEvent.click(screen.getByRole("button", { name: "Pedir un enlace nuevo" }));
    expect(await screen.findByText("Si la cuenta existe y falta verificarla, te enviamos un enlace nuevo.")).toBeInTheDocument();
  });

  it("contraseña vacía no llama al API", async () => {
    const fetchMock = stubFetch();
    render(<VerifyFlow token={TOKEN} photo={null} />);
    await userEvent.click(screen.getByRole("button", { name: "Activar mi cuenta" }));

    expect(screen.getByText("Escribe tu contraseña.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("contraseña equivocada (401): lo dice y el enlace sigue vivo", async () => {
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValueOnce(jsonResponse(401, { status: "fail", message: "La contraseña no coincide con la de tu registro." }));
    render(<VerifyFlow token={TOKEN} photo={null} />);
    await userEvent.type(screen.getByLabelText("Contraseña"), "Equivocada1x");
    await userEvent.click(screen.getByRole("button", { name: "Activar mi cuenta" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Esa no es la contraseña de tu cuenta. Revísala e inténtalo de nuevo.");
    expect(screen.getByRole("button", { name: "Activar mi cuenta" })).toBeEnabled();
  });

  it("éxito: manda token + contraseña y ofrece Ingresar (no abre sesión)", async () => {
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValueOnce(ok);
    render(<VerifyFlow token={TOKEN} photo={null} />);
    await userEvent.type(screen.getByLabelText("Contraseña"), "Gira2026xyz");
    await userEvent.click(screen.getByRole("button", { name: "Activar mi cuenta" }));

    expect(await screen.findByRole("heading", { name: "Cuenta verificada" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ingresar" })).toHaveAttribute("href", "/ingresar");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/auth\/verify-email$/);
    expect(JSON.parse(init.body as string)).toEqual({ token: TOKEN, password: "Gira2026xyz" });
  });

  it("enlace vencido (400): pasa al panel de enlace inválido", async () => {
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValueOnce(jsonResponse(400, { status: "fail", message: "El enlace no es válido o ya venció." }));
    render(<VerifyFlow token={TOKEN} photo={null} />);
    await userEvent.type(screen.getByLabelText("Contraseña"), "Gira2026xyz");
    await userEvent.click(screen.getByRole("button", { name: "Activar mi cuenta" }));

    expect(await screen.findByRole("heading", { name: "Este enlace ya no sirve" })).toBeInTheDocument();
  });
});

describe("ResetFlow", () => {
  it("sin token válido: enlace inválido que manda a recuperar", () => {
    render(<ResetFlow token={null} photo={null} />);
    expect(screen.getByRole("heading", { name: "Este enlace ya no sirve" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Pedir un enlace nuevo" })).toHaveAttribute("href", "/recuperar-contrasena");
  });

  it("contraseña débil o distinta se detiene antes del API", async () => {
    const fetchMock = stubFetch();
    render(<ResetFlow token={TOKEN} photo={null} />);
    await userEvent.type(screen.getByLabelText("Contraseña nueva"), "corta");
    await userEvent.type(screen.getByLabelText("Repite la contraseña"), "otra");
    await userEvent.click(screen.getByRole("button", { name: "Guardar contraseña" }));

    expect(screen.getByText(/^Te falta al menos 10 caracteres/)).toBeInTheDocument();
    expect(screen.getByText("Las contraseñas no coinciden.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("éxito: avisa del cierre de sesiones y ofrece Ingresar", async () => {
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValueOnce(ok);
    render(<ResetFlow token={TOKEN} photo={null} />);
    await userEvent.type(screen.getByLabelText("Contraseña nueva"), "Nueva2026xyz");
    await userEvent.type(screen.getByLabelText("Repite la contraseña"), "Nueva2026xyz");
    await userEvent.click(screen.getByRole("button", { name: "Guardar contraseña" }));

    expect(await screen.findByRole("heading", { name: "Contraseña actualizada" })).toBeInTheDocument();
    expect(screen.getByText(/cerramos tu sesión en todos tus dispositivos/)).toBeInTheDocument();
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ token: TOKEN, password: "Nueva2026xyz" });
  });

  it("400 que habla del enlace: enlace inválido; 400 de otra cosa: se queda en el formulario", async () => {
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValueOnce(jsonResponse(400, { status: "fail", message: "Esa contraseña es muy común." }));
    render(<ResetFlow token={TOKEN} photo={null} />);
    await userEvent.type(screen.getByLabelText("Contraseña nueva"), "Nueva2026xyz");
    await userEvent.type(screen.getByLabelText("Repite la contraseña"), "Nueva2026xyz");
    await userEvent.click(screen.getByRole("button", { name: "Guardar contraseña" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Esa contraseña es muy común.");

    fetchMock.mockResolvedValueOnce(jsonResponse(400, { status: "fail", message: "El enlace no es válido o ya venció." }));
    await userEvent.click(screen.getByRole("button", { name: "Guardar contraseña" }));
    expect(await screen.findByRole("heading", { name: "Este enlace ya no sirve" })).toBeInTheDocument();
  });
});

describe("ForgotFlow", () => {
  it("correo inválido no llama al API", async () => {
    const fetchMock = stubFetch();
    render(<ForgotFlow photo={null} />);
    await userEvent.type(screen.getByLabelText("Correo"), "sin-arroba");
    await userEvent.click(screen.getByRole("button", { name: "Enviar enlace" }));

    expect(screen.getByText(/le falta la @/)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("responde igual exista o no la cuenta y avisa que vence en 1 hora", async () => {
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValueOnce(ok);
    render(<ForgotFlow photo={null} />);
    await userEvent.type(screen.getByLabelText("Correo"), "maria@correo.mx");
    await userEvent.click(screen.getByRole("button", { name: "Enviar enlace" }));

    expect(await screen.findByText(/Si/, { selector: "p" })).toHaveTextContent("tiene una cuenta");
    expect(screen.getByText(/Vence en 1 hora/)).toBeInTheDocument();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/auth\/forgot-password$/);
    expect(JSON.parse(init.body as string)).toEqual({ email: "maria@correo.mx" });
  });

  it("429: texto de demasiados intentos", async () => {
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValueOnce(jsonResponse(429, { status: "fail", message: "Too many" }));
    render(<ForgotFlow photo={null} />);
    await userEvent.type(screen.getByLabelText("Correo"), "maria@correo.mx");
    await userEvent.click(screen.getByRole("button", { name: "Enviar enlace" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Hiciste demasiados intentos.");
  });
});
