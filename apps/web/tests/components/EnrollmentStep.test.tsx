import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { EnrollmentStep } from "@/components/auth/EnrollmentStep";
import { jsonResponse, networkFailure, stubFetch } from "../helpers/fetchMock";

const ok = (data: unknown) => jsonResponse(200, { status: "success", message: "ok", data });
const START = { qrDataUrl: "data:image/png;base64,AAAA", manualKey: "ABCDEFGH" };
const AUTHENTICATED = { status: "authenticated", user: { id: "1" } };

const setup = () => {
  const onDone = vi.fn();
  const onExpired = vi.fn();
  render(<EnrollmentStep onDone={onDone} onExpired={onExpired} />);
  return { onDone, onExpired };
};

describe("EnrollmentStep", () => {
  it("al montarse pide el QR una sola vez y lo muestra con su clave manual", async () => {
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValueOnce(ok(START));

    setup();

    const qr = await screen.findByAltText("Código QR para tu app de autenticación");
    expect(qr).toHaveAttribute("src", START.qrDataUrl);
    expect(screen.getByText(START.manualKey)).toBeInTheDocument();
    expect(screen.getByText(/5 minutos/)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/auth/2fa/enroll/start");
  });

  it("mientras carga no muestra el campo de código", () => {
    const fetchMock = stubFetch();
    fetchMock.mockImplementationOnce(() => new Promise(() => {}));

    setup();

    expect(screen.queryByLabelText("Código de verificación")).not.toBeInTheDocument();
    expect(screen.getByText("Preparando tu código QR…")).toBeInTheDocument();
  });

  it("código válido: envía a enroll/complete y avisa con onDone", async () => {
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValueOnce(ok(START));
    fetchMock.mockResolvedValueOnce(ok(AUTHENTICATED));

    const { onDone } = setup();
    await userEvent.type(await screen.findByLabelText("Código de verificación"), "123456");
    await userEvent.click(screen.getByRole("button", { name: "Activar y entrar" }));

    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toContain("/auth/2fa/enroll/complete");
    expect(JSON.parse(init.body as string)).toEqual({ code: "123456" });
  });

  it("código incorrecto: muestra el error del API, conserva la pantalla y no avisa", async () => {
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValueOnce(ok(START));
    fetchMock.mockResolvedValueOnce(
      jsonResponse(400, { status: "fail", message: "El código de verificación es incorrecto." }),
    );

    const { onDone, onExpired } = setup();
    await userEvent.type(await screen.findByLabelText("Código de verificación"), "000000");
    await userEvent.click(screen.getByRole("button", { name: "Activar y entrar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("El código de verificación es incorrecto.");
    expect(onDone).not.toHaveBeenCalled();
    expect(onExpired).not.toHaveBeenCalled();
  });

  it("reto expirado al pedir el QR (401): avisa con onExpired y el mensaje", async () => {
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValueOnce(
      jsonResponse(401, { status: "fail", message: "Tu verificación expiró. Inicia sesión de nuevo." }),
    );

    const { onExpired } = setup();

    await waitFor(() =>
      expect(onExpired).toHaveBeenCalledWith("Tu verificación expiró. Inicia sesión de nuevo."),
    );
  });

  it("reto expirado al activar (401): avisa con onExpired", async () => {
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValueOnce(ok(START));
    fetchMock.mockResolvedValueOnce(
      jsonResponse(401, { status: "fail", message: "Tu verificación expiró. Inicia sesión de nuevo." }),
    );

    const { onExpired } = setup();
    await userEvent.type(await screen.findByLabelText("Código de verificación"), "123456");
    await userEvent.click(screen.getByRole("button", { name: "Activar y entrar" }));

    await waitFor(() => expect(onExpired).toHaveBeenCalledTimes(1));
  });

  it("falla de red al pedir el QR: muestra el error en pantalla", async () => {
    const fetchMock = stubFetch();
    fetchMock.mockImplementationOnce(networkFailure);

    setup();

    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo conectar con el servidor.");
  });
});
