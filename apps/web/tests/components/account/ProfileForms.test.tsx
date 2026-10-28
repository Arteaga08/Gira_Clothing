import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ChangePasswordForm } from "@/components/store/account/profile/ChangePasswordForm";
import { ProfileForm } from "@/components/store/account/profile/ProfileForm";
import { jsonResponse, stubFetch } from "../../helpers/fetchMock";

const PROFILE = { firstName: "María", lastName: "López", email: "m@correo.mx", phone: null, birthDate: null, city: null };
const ok = (data?: unknown) => jsonResponse(200, { status: "success", message: "ok", data });

describe("ProfileForm", () => {
  it("al abrirse toma el foco en el primer campo (el botón «Editar» ya no existe)", () => {
    render(<ProfileForm profile={PROFILE} onSaved={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByLabelText("Nombre")).toHaveFocus();
  });

  it("muestra el correo de solo lectura", () => {
    render(<ProfileForm profile={PROFILE} onSaved={vi.fn()} onCancel={vi.fn()} />);
    const email = screen.getByLabelText("Correo");
    expect(email).toHaveAttribute("readonly");
    expect(email).toHaveValue("m@correo.mx");
  });

  it("el celular solo admite dígitos y se corta en 10", async () => {
    render(<ProfileForm profile={PROFILE} onSaved={vi.fn()} onCancel={vi.fn()} />);
    await userEvent.type(screen.getByLabelText("Celular (opcional)"), "55-1234 5678 99");
    expect(screen.getByLabelText("Celular (opcional)")).toHaveValue("5512345678");
  });

  it("con datos inválidos explica y no llama al API", async () => {
    const fetchMock = stubFetch();
    render(<ProfileForm profile={PROFILE} onSaved={vi.fn()} onCancel={vi.fn()} />);
    await userEvent.clear(screen.getByLabelText("Nombre"));
    await userEvent.type(screen.getByLabelText("Celular (opcional)"), "55123");
    await userEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));

    expect(screen.getByText("Falta tu nombre.")).toBeInTheDocument();
    expect(screen.getByText(/Escribe los 10 dígitos/)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("guarda: manda los cinco campos (sin correo, null en los vacíos) y avisa con el perfil nuevo", async () => {
    const fetchMock = stubFetch();
    const saved = { ...PROFILE, city: "Guadalajara" };
    fetchMock.mockResolvedValueOnce(ok({ profile: saved }));
    const onSaved = vi.fn();
    render(<ProfileForm profile={PROFILE} onSaved={onSaved} onCancel={vi.fn()} />);

    await userEvent.type(screen.getByLabelText("Ciudad (opcional)"), "Guadalajara");
    await userEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(saved));
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({
      firstName: "María",
      lastName: "López",
      phone: null,
      birthDate: null,
      city: "Guadalajara",
    });
  });

  it("un error del API se muestra y no cierra el formulario", async () => {
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValueOnce(jsonResponse(400, { status: "fail", message: "La fecha no puede ser futura." }));
    const onSaved = vi.fn();
    render(<ProfileForm profile={PROFILE} onSaved={onSaved} onCancel={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));

    expect(await screen.findByText("La fecha no puede ser futura.")).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("Cancelar avisa sin tocar el API", async () => {
    const fetchMock = stubFetch();
    const onCancel = vi.fn();
    render(<ProfileForm profile={PROFILE} onSaved={vi.fn()} onCancel={onCancel} />);
    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onCancel).toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("ChangePasswordForm", () => {
  const fill = async (current: string, next: string, confirm: string) => {
    const type = async (label: string, value: string) => {
      if (value !== "") await userEvent.type(screen.getByLabelText(label), value);
    };
    await type("Contraseña actual", current);
    await type("Contraseña nueva", next);
    await type("Repite la contraseña nueva", confirm);
    await userEvent.click(screen.getByRole("button", { name: "Cambiar contraseña" }));
  };

  it("valida: actual vacía, nueva débil y confirmación distinta", async () => {
    const fetchMock = stubFetch();
    render(<ChangePasswordForm onDone={vi.fn()} onCancel={vi.fn()} />);
    await fill("", "corta", "otra");

    expect(screen.getByText("Escribe tu contraseña actual.")).toBeInTheDocument();
    expect(screen.getByText("Las contraseñas no coinciden.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("cambia: manda actual y nueva, y avisa al terminar", async () => {
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValueOnce(ok());
    const onDone = vi.fn();
    render(<ChangePasswordForm onDone={onDone} onCancel={vi.fn()} />);
    await fill("Vieja12345", "Nueva12345x", "Nueva12345x");

    await waitFor(() => expect(onDone).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://api.test/api/v1/auth/password");
    expect(JSON.parse(init.body as string)).toEqual({ currentPassword: "Vieja12345", newPassword: "Nueva12345x" });
  });

  it("contraseña actual incorrecta (400): muestra el mensaje del API y no cierra", async () => {
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValueOnce(jsonResponse(400, { status: "fail", message: "La contraseña actual no es correcta." }));
    const onDone = vi.fn();
    render(<ChangePasswordForm onDone={onDone} onCancel={vi.fn()} />);
    await fill("Equivocada1", "Nueva12345x", "Nueva12345x");

    expect(await screen.findByText("La contraseña actual no es correcta.")).toBeInTheDocument();
    expect(onDone).not.toHaveBeenCalled();
  });

  it("429: texto propio, sin repetir el del servidor", async () => {
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValueOnce(jsonResponse(429, { status: "fail", message: "texto del servidor" }));
    render(<ChangePasswordForm onDone={vi.fn()} onCancel={vi.fn()} />);
    await fill("Vieja12345", "Nueva12345x", "Nueva12345x");

    expect(await screen.findByText(/demasiados intentos/i)).toBeInTheDocument();
    expect(screen.queryByText("texto del servidor")).toBeNull();
  });
});
