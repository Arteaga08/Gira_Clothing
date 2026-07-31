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

const fillCredentials = async (email = "admin@gira.mx", password = "secret123") => {
  await userEvent.type(screen.getByLabelText("Correo"), email);
  await userEvent.type(screen.getByLabelText("Contraseña"), password);
};

describe("LoginForm", () => {
  it("éxito sin 2FA: el body no lleva code, la llamada es con credentials include y navega a /resumen", async () => {
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { status: "success", message: "ok", data: { user: { id: "1" } } }),
    );

    render(<LoginForm />);
    await fillCredentials();
    await userEvent.click(screen.getByRole("button", { name: "Entrar" }));

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/resumen"));
    expect(router.refresh).toHaveBeenCalled();

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.credentials).toBe("include");
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body).not.toHaveProperty("code");
  });

  it("cuando el API pide el segundo factor, aparece el campo de código y recibe el foco", async () => {
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValueOnce(
      jsonResponse(401, {
        status: "fail",
        message: "Se requiere el código de verificación de dos factores.",
      }),
    );

    render(<LoginForm />);
    await fillCredentials();
    await userEvent.click(screen.getByRole("button", { name: "Entrar" }));

    const codeField = await screen.findByLabelText("Código de verificación");
    expect(codeField).toHaveFocus();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("el segundo envío manda el código y conserva correo y contraseña", async () => {
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValueOnce(
      jsonResponse(401, {
        status: "fail",
        message: "Se requiere el código de verificación de dos factores.",
      }),
    );
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { status: "success", message: "ok", data: { user: { id: "1" } } }),
    );

    render(<LoginForm />);
    await fillCredentials("admin@gira.mx", "secret123");
    await userEvent.click(screen.getByRole("button", { name: "Entrar" }));
    const codeField = await screen.findByLabelText("Código de verificación");
    await userEvent.type(codeField, "123456");
    await userEvent.click(screen.getByRole("button", { name: "Entrar" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const [, secondInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    const body = JSON.parse(secondInit.body as string) as Record<string, unknown>;
    expect(body).toEqual({ email: "admin@gira.mx", password: "secret123", code: "123456" });
  });

  it("código incorrecto: se queda en la fase de código y anuncia el error exacto del API", async () => {
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValueOnce(
      jsonResponse(401, {
        status: "fail",
        message: "Se requiere el código de verificación de dos factores.",
      }),
    );
    fetchMock.mockResolvedValueOnce(
      jsonResponse(401, { status: "fail", message: "El código de verificación es incorrecto." }),
    );

    render(<LoginForm />);
    await fillCredentials();
    await userEvent.click(screen.getByRole("button", { name: "Entrar" }));
    const codeField = await screen.findByLabelText("Código de verificación");
    await userEvent.type(codeField, "000000");
    await userEvent.click(screen.getByRole("button", { name: "Entrar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "El código de verificación es incorrecto.",
    );
    expect(screen.getByLabelText("Código de verificación")).toBeInTheDocument();
  });

  it("credenciales incorrectas: muestra el error y no revela el campo de código", async () => {
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValueOnce(
      jsonResponse(401, { status: "fail", message: "Correo o contraseña incorrectos." }),
    );

    render(<LoginForm />);
    await fillCredentials();
    await userEvent.click(screen.getByRole("button", { name: "Entrar" }));

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
    await userEvent.click(screen.getByRole("button", { name: "Entrar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Demasiados intentos de inicio de sesión. Intenta de nuevo más tarde.",
    );
  });

  it("red caída: muestra el mensaje de red y el botón vuelve a habilitarse", async () => {
    const fetchMock = stubFetch();
    fetchMock.mockImplementationOnce(networkFailure);

    render(<LoginForm />);
    await fillCredentials();
    await userEvent.click(screen.getByRole("button", { name: "Entrar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No se pudo conectar con el servidor.",
    );
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
    resolveFetch(jsonResponse(200, { status: "success", message: "ok", data: { user: { id: "1" } } }));
    await waitFor(() => expect(router.replace.mock.calls.length).toBeGreaterThan(callsBefore));
  });
});
