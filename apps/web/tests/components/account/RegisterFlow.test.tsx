import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { RegisterFlow } from "@/components/store/account/auth/RegisterFlow";
import { jsonResponse, stubFetch } from "../../helpers/fetchMock";

const created = jsonResponse(201, { status: "success", message: "ok" });

const fillAll = async (overrides: Partial<Record<"first" | "last" | "email" | "pass" | "confirm", string>> = {}) => {
  await userEvent.type(screen.getByLabelText("Nombre"), overrides.first ?? "María");
  await userEvent.type(screen.getByLabelText("Apellido"), overrides.last ?? "López");
  await userEvent.type(screen.getByLabelText("Correo"), overrides.email ?? "maria@correo.mx");
  await userEvent.type(screen.getByLabelText("Contraseña"), overrides.pass ?? "Gira2026xyz");
  await userEvent.type(screen.getByLabelText("Repite la contraseña"), overrides.confirm ?? "Gira2026xyz");
};
const submit = () => userEvent.click(screen.getByRole("button", { name: "Crear mi cuenta" }));
const accept = () => userEvent.click(screen.getByRole("checkbox"));
const setup = () => render(<RegisterFlow redirectTo="/cuenta" photo={null} />);

describe("RegisterFlow", () => {
  it("vacío: marca cada campo y los términos, sin llamar al API", async () => {
    const fetchMock = stubFetch();
    setup();
    await submit();

    expect(screen.getByText("Falta tu nombre.")).toBeInTheDocument();
    expect(screen.getByText("Falta tu apellido.")).toBeInTheDocument();
    expect(screen.getByText("Falta tu correo.")).toBeInTheDocument();
    expect(screen.getByText("Escribe una contraseña.")).toBeInTheDocument();
    expect(screen.getByText("Repite tu contraseña.")).toBeInTheDocument();
    expect(screen.getByText("Acepta los Términos y el Aviso de privacidad para crear tu cuenta.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    // La casilla queda ligada a su mensaje y el foco va al primer campo inválido.
    const message = screen.getByText("Acepta los Términos y el Aviso de privacidad para crear tu cuenta.");
    expect(screen.getByRole("checkbox")).toHaveAttribute("aria-describedby", message.id);
    await waitFor(() => expect(screen.getByLabelText("Nombre")).toHaveFocus());
  });

  it("contraseñas distintas o débiles se detienen antes del API", async () => {
    const fetchMock = stubFetch();
    setup();
    await fillAll({ pass: "corta", confirm: "otra" });
    await accept();
    await submit();

    expect(screen.getByText(/^Te falta al menos 10 caracteres/)).toBeInTheDocument();
    expect(screen.getByText("Las contraseñas no coinciden.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("editar un campo borra solo su error", async () => {
    stubFetch();
    setup();
    await submit();
    await userEvent.type(screen.getByLabelText("Nombre"), "Ma");

    expect(screen.queryByText("Falta tu nombre.")).not.toBeInTheDocument();
    expect(screen.getByText("Falta tu apellido.")).toBeInTheDocument();
  });

  it("éxito: manda los cuatro campos, no inicia sesión y pasa a «Revisa tu correo» con el reenvío en espera", async () => {
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValueOnce(created);
    setup();
    await fillAll({ first: "  María ", email: " maria@correo.mx " });
    await accept();
    await submit();

    expect(await screen.findByRole("heading", { name: "Revisa tu correo" })).toBeInTheDocument();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://api.test/api/v1/auth/register");
    expect(JSON.parse(init.body as string)).toEqual({
      firstName: "María",
      lastName: "López",
      email: "maria@correo.mx",
      password: "Gira2026xyz",
    });
    expect(screen.getByText("maria@correo.mx")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reenviar en 1:00" })).toBeDisabled();
  });

  it("«Usar otro correo» regresa al formulario con lo escrito", async () => {
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValueOnce(created);
    setup();
    await fillAll();
    await accept();
    await submit();
    await userEvent.click(await screen.findByRole("button", { name: "Usar otro correo" }));

    expect(screen.getByLabelText("Correo")).toHaveValue("maria@correo.mx");
  });

  it("error del API (400) se muestra sin salir del formulario", async () => {
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValueOnce(jsonResponse(400, { status: "fail", message: "Esa contraseña es muy común." }));
    setup();
    await fillAll();
    await accept();
    await submit();

    expect(await screen.findByRole("alert")).toHaveTextContent("Esa contraseña es muy común.");
    expect(screen.getByRole("button", { name: "Crear mi cuenta" })).toBeEnabled();
  });

  it("el medidor y la checklist avanzan al escribir", async () => {
    stubFetch();
    setup();
    expect(screen.getByText("Una mayúscula")).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Contraseña"), "Gira2026xyz");

    await waitFor(() => expect(screen.getByText("Fuerte")).toBeInTheDocument());
  });

  it("Mostrar/Ocultar cambia el tipo del campo", async () => {
    stubFetch();
    setup();
    const field = screen.getByLabelText("Contraseña");
    expect(field).toHaveAttribute("type", "password");
    const toggle = screen.getAllByRole("button", { name: "Mostrar contraseña" })[0] as HTMLElement;
    await userEvent.click(toggle);
    expect(field).toHaveAttribute("type", "text");
    // Etiqueta fija + aria-pressed: un lector de pantalla no anuncia «Ocultar, presionado».
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    expect(toggle).toHaveAccessibleName("Mostrar contraseña");
  });
});
