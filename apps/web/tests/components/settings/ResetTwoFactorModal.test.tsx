import { TWO_FACTOR_INVALID_MESSAGE } from "@gira/shared";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ResetTwoFactorModal } from "@/components/settings/ResetTwoFactorModal";
import { ApiError } from "@/lib/api/ApiError";

const { resetMock, replaceMock, refreshMock } = vi.hoisted(() => ({
  resetMock: vi.fn(),
  replaceMock: vi.fn(),
  refreshMock: vi.fn(),
}));
vi.mock("@/lib/api/auth", () => ({ resetTwoFactor: resetMock }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock, refresh: refreshMock, push: vi.fn() }),
}));

const onClose = vi.fn();

const renderModal = () => render(<ResetTwoFactorModal onClose={onClose} />);
const codeField = () => screen.getByLabelText("Código de tu app de autenticación");
const submit = () => screen.getByRole("button", { name: "Reiniciar 2FA" });

beforeEach(() => {
  resetMock.mockReset();
  replaceMock.mockReset();
  refreshMock.mockReset();
  onClose.mockReset();
});

describe("ResetTwoFactorModal", () => {
  it("explica que cierra todas las sesiones antes de pedir el código", () => {
    renderModal();
    const dialog = screen.getByRole("dialog", { name: "Reiniciar verificación en dos pasos" });
    expect(within(dialog).getByText(/cierra todas las sesiones de tu cuenta, incluida esta/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/configurar tu app de nuevo/i)).toBeInTheDocument();
  });

  it("con un código vigente reinicia y manda a iniciar sesión", async () => {
    resetMock.mockResolvedValue(undefined);
    renderModal();
    await userEvent.type(codeField(), "123456");
    await userEvent.click(submit());

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/login"));
    expect(resetMock).toHaveBeenCalledWith("123456");
    expect(refreshMock).toHaveBeenCalled();
  });

  it("un código que no tiene 6 dígitos no llega al API", async () => {
    renderModal();
    await userEvent.type(codeField(), "12a4");
    await userEvent.click(submit());

    expect(await screen.findByText("Escribe los 6 dígitos de tu app.")).toBeInTheDocument();
    expect(resetMock).not.toHaveBeenCalled();
  });

  it("un código incorrecto queda sobre el campo y no cierra sesión", async () => {
    resetMock.mockRejectedValue(new ApiError(TWO_FACTOR_INVALID_MESSAGE, "http", 400));
    renderModal();
    await userEvent.type(codeField(), "000000");
    await userEvent.click(submit());

    expect(await screen.findByText(TWO_FACTOR_INVALID_MESSAGE)).toBeInTheDocument();
    expect(codeField()).toHaveAttribute("aria-invalid", "true");
    expect(replaceMock).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("el bloqueo por intentos se muestra tal cual lo dice el API", async () => {
    const locked = "Demasiados códigos incorrectos. Intenta de nuevo en 15 minutos.";
    resetMock.mockRejectedValue(new ApiError(locked, "http", 429));
    renderModal();
    await userEvent.type(codeField(), "111111");
    await userEvent.click(submit());

    expect(await screen.findByText(locked)).toBeInTheDocument();
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it("un fallo de red avisa sin culpar al código", async () => {
    resetMock.mockRejectedValue(new ApiError("No se pudo conectar con el servidor.", "network"));
    renderModal();
    await userEvent.type(codeField(), "123456");
    await userEvent.click(submit());

    expect(await screen.findByText("No se pudo conectar con el servidor.")).toBeInTheDocument();
    expect(codeField()).not.toHaveAttribute("aria-invalid", "true");
  });

  it("no se puede cerrar mientras reinicia", async () => {
    resetMock.mockReturnValue(new Promise(() => {}));
    renderModal();
    await userEvent.type(codeField(), "123456");
    await userEvent.click(submit());

    expect(screen.getByRole("button", { name: "Cancelar" })).toBeDisabled();
    await userEvent.keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();
  });
});
