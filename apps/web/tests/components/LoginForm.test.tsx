import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { LoginForm } from "@/components/auth/LoginForm";
import { jsonResponse, networkFailure, stubFetch } from "../helpers/fetchMock";

// `vi.mock`/`vi.hoisted` are hoisted above every import in this file
// (including imports of local helper modules), so the mock has to be
// self-contained here rather than delegate to a shared factory.
const { router } = vi.hoisted(() => ({
  router: { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/login",
}));

const ok = (data: unknown) => jsonResponse(200, { status: "success", message: "ok", data });
const AUTHENTICATED = { status: "authenticated", user: { id: "1" } };
const EXPIRED = { status: "fail", message: "Tu verificación expiró. Inicia sesión de nuevo." };

const fillCredentials = async (email = "admin@gira.mx", password = "secret123") => {
  await userEvent.type(screen.getByLabelText("Correo"), email);
  await userEvent.type(screen.getByLabelText("Contraseña"), password);
};

const submit = () => userEvent.click(screen.getByRole("button", { name: "Entrar" }));

describe("LoginForm", () => {
  it("cliente/sesión directa: llama con credentials include y navega a /resumen", async () => {
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValueOnce(ok(AUTHENTICATED));

    render(<LoginForm />);
    await fillCredentials();
    await submit();

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/resumen"));
    expect(router.refresh).toHaveBeenCalled();
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.credentials).toBe("include");
    expect(JSON.parse(init.body as string)).toEqual({ email: "admin@gira.mx", password: "secret123" });
  });

  it("two_factor_required: aparece el campo de código con foco, sin error", async () => {
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValueOnce(ok({ status: "two_factor_required" }));

    render(<LoginForm />);
    await fillCredentials();
    await submit();

    const codeField = await screen.findByLabelText("Código de verificación");
    expect(codeField).toHaveFocus();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("el código se envía SOLO a /auth/2fa/verify: la contraseña no se reenvía", async () => {
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValueOnce(ok({ status: "two_factor_required" }));
    fetchMock.mockResolvedValueOnce(ok(AUTHENTICATED));

    render(<LoginForm />);
    await fillCredentials();
    await submit();
    await userEvent.type(await screen.findByLabelText("Código de verificación"), "123456");
    await submit();

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/resumen"));
    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toContain("/auth/2fa/verify");
    expect(JSON.parse(init.body as string)).toEqual({ code: "123456" });
  });

  it("código incorrecto: se queda en la fase de código y anuncia el error exacto del API", async () => {
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValueOnce(ok({ status: "two_factor_required" }));
    fetchMock.mockResolvedValueOnce(
      jsonResponse(400, { status: "fail", message: "El código de verificación es incorrecto." }),
    );

    render(<LoginForm />);
    await fillCredentials();
    await submit();
    await userEvent.type(await screen.findByLabelText("Código de verificación"), "000000");
    await submit();

    expect(await screen.findByRole("alert")).toHaveTextContent("El código de verificación es incorrecto.");
    expect(screen.getByLabelText("Código de verificación")).toBeInTheDocument();
  });

  it("reto expirado (401 en la fase de código): vuelve a correo/contraseña con el error", async () => {
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValueOnce(ok({ status: "two_factor_required" }));
    fetchMock.mockResolvedValueOnce(jsonResponse(401, EXPIRED));

    render(<LoginForm />);
    await fillCredentials();
    await submit();
    await userEvent.type(await screen.findByLabelText("Código de verificación"), "123456");
    await submit();

    expect(await screen.findByRole("alert")).toHaveTextContent("Tu verificación expiró.");
    expect(screen.queryByLabelText("Código de verificación")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Correo")).toBeInTheDocument();
  });

  it("enrollment_required: reemplaza los campos por la pantalla de enrolamiento", async () => {
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValueOnce(ok({ status: "enrollment_required" }));
    fetchMock.mockResolvedValueOnce(ok({ qrDataUrl: "data:image/png;base64,AAAA", manualKey: "ABCDEFGH" }));

    render(<LoginForm />);
    await fillCredentials();
    await submit();

    expect(await screen.findByAltText("Código QR para tu app de autenticación")).toBeInTheDocument();
    expect(screen.queryByLabelText("Contraseña")).not.toBeInTheDocument();
  });

  it("enrolamiento completo: activa y navega a /resumen", async () => {
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValueOnce(ok({ status: "enrollment_required" }));
    fetchMock.mockResolvedValueOnce(ok({ qrDataUrl: "data:image/png;base64,AAAA", manualKey: "ABCDEFGH" }));
    fetchMock.mockResolvedValueOnce(ok(AUTHENTICATED));

    render(<LoginForm />);
    await fillCredentials();
    await submit();
    await userEvent.type(await screen.findByLabelText("Código de verificación"), "123456");
    await userEvent.click(screen.getByRole("button", { name: "Activar y entrar" }));

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/resumen"));
    const [url] = fetchMock.mock.calls[2] as [string, RequestInit];
    expect(url).toContain("/auth/2fa/enroll/complete");
  });

  it("credenciales incorrectas: muestra el error y no revela el campo de código", async () => {
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValueOnce(
      jsonResponse(401, { status: "fail", message: "Correo o contraseña incorrectos." }),
    );

    render(<LoginForm />);
    await fillCredentials();
    await submit();

    expect(await screen.findByRole("alert")).toHaveTextContent("Correo o contraseña incorrectos.");
    expect(screen.queryByLabelText("Código de verificación")).not.toBeInTheDocument();
  });

  it("429: muestra el mensaje del servidor", async () => {
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValueOnce(
      jsonResponse(429, {
        status: "fail",
        message: "Demasiados intentos de inicio de sesión. Intenta de nuevo más tarde.",
      }),
    );

    render(<LoginForm />);
    await fillCredentials();
    await submit();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Demasiados intentos de inicio de sesión. Intenta de nuevo más tarde.",
    );
  });

  it("red caída: muestra el mensaje de red y el botón vuelve a habilitarse", async () => {
    const fetchMock = stubFetch();
    fetchMock.mockImplementationOnce(networkFailure);

    render(<LoginForm />);
    await fillCredentials();
    await submit();

    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo conectar con el servidor.");
    expect(screen.getByRole("button", { name: "Entrar" })).toBeEnabled();
  });

  it("un doble clic durante el envío llama a fetch una sola vez", async () => {
    const fetchMock = stubFetch();
    let resolveFetch: (value: Response) => void = () => {};
    fetchMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );

    render(<LoginForm />);
    await fillCredentials();
    const submitButton = screen.getByRole("button", { name: "Entrar" });
    await userEvent.click(submitButton);
    await userEvent.click(submitButton);

    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Flush the pending request instead of leaving it dangling: an
    // unresolved promise from one test can update state in the next.
    const callsBefore = router.replace.mock.calls.length;
    resolveFetch(ok(AUTHENTICATED));
    await waitFor(() => expect(router.replace.mock.calls.length).toBeGreaterThan(callsBefore));
  });
});
