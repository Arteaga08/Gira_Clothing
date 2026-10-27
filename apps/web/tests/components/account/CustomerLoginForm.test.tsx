import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CustomerLoginForm } from "@/components/store/account/auth/CustomerLoginForm";
import { jsonResponse, stubFetch } from "../../helpers/fetchMock";

const { router, mergeGuestCart } = vi.hoisted(() => ({
  router: { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() },
  mergeGuestCart: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => "/ingresar" }));
vi.mock("@/lib/cart/mergeGuestCart", () => ({ mergeGuestCart }));

const ok = (data?: unknown) => jsonResponse(200, { status: "success", message: "ok", data });
const AUTHENTICATED = { status: "authenticated", user: { id: "1", role: "customer" } };

const fill = async (email = "maria@correo.mx", password = "Gira2026xyz") => {
  await userEvent.type(screen.getByLabelText("Correo"), email);
  await userEvent.type(screen.getByLabelText("Contraseña"), password);
};
const submit = () => userEvent.click(screen.getByRole("button", { name: "Entrar" }));
const setup = (redirectTo = "/cuenta") => render(<CustomerLoginForm redirectTo={redirectTo} photo={null} />);

describe("CustomerLoginForm", () => {
  it("campos vacíos: explica qué falta y no llama al API", async () => {
    const fetchMock = stubFetch();
    setup();
    await submit();

    expect(screen.getByText("Falta tu correo.")).toBeInTheDocument();
    expect(screen.getByText("Falta tu contraseña.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("campos vacíos: el foco va al primer campo inválido", async () => {
    stubFetch();
    setup();
    await submit();

    await waitFor(() => expect(screen.getByLabelText("Correo")).toHaveFocus());
  });

  it("éxito: mezcla el carrito ANTES de navegar al destino saneado y refresca", async () => {
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValueOnce(ok(AUTHENTICATED));
    mergeGuestCart.mockResolvedValue({ moved: 1, dropped: 0, kept: 0 });
    router.replace.mockClear();
    setup("/tienda?categoria=playeras");

    await fill();
    await submit();

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/tienda?categoria=playeras"));
    expect(router.refresh).toHaveBeenCalled();
    expect(mergeGuestCart.mock.invocationCallOrder[0]).toBeLessThan(router.replace.mock.invocationCallOrder[0] ?? 0);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://api.test/api/v1/auth/login");
    expect(init.credentials).toBe("include");
    expect(JSON.parse(init.body as string)).toEqual({ email: "maria@correo.mx", password: "Gira2026xyz" });
  });

  it("credenciales incorrectas: muestra el mensaje del API y no navega", async () => {
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValueOnce(jsonResponse(401, { status: "fail", message: "Correo o contraseña incorrectos." }));
    router.replace.mockClear();
    setup();

    await fill();
    await submit();

    expect(await screen.findByRole("alert")).toHaveTextContent("Correo o contraseña incorrectos.");
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("429: texto propio de demasiados intentos", async () => {
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValueOnce(jsonResponse(429, { status: "fail", message: "Too many" }));
    setup();

    await fill();
    await submit();

    expect(await screen.findByRole("alert")).toHaveTextContent("Hiciste demasiados intentos.");
  });

  it("403 (correo sin verificar): aviso con reenvío y el formulario sigue ahí", async () => {
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValueOnce(jsonResponse(403, { status: "fail", message: "Activa tu cuenta con el enlace que te enviamos por correo." }));
    setup();

    await fill("sin.verificar@correo.mx");
    await submit();

    expect(await screen.findByText("Todavía no verificas tu correo")).toBeInTheDocument();
    expect(screen.queryByText("Activa tu cuenta con el enlace que te enviamos por correo.")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Correo")).toHaveValue("sin.verificar@correo.mx");

    fetchMock.mockResolvedValueOnce(ok());
    await userEvent.click(screen.getByRole("button", { name: "Reenviar el enlace" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toMatch(/\/auth\/resend-verification$/);
    expect(JSON.parse(init.body as string)).toEqual({ email: "sin.verificar@correo.mx" });
    expect(await screen.findByText(/Listo, pedimos un enlace nuevo/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Reenviar en/ })).toBeDisabled();
  });

  it("cuenta del equipo: apunta al panel, no abre sesión y permite usar otra cuenta", async () => {
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValueOnce(ok({ status: "two_factor_required" }));
    router.replace.mockClear();
    setup();

    await fill("admin@gira.mx");
    await submit();

    expect(await screen.findByText("Esta cuenta es del equipo")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ir al panel" })).toHaveAttribute("href", "/login");
    expect(router.replace).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Usar otra cuenta" }));
    expect(screen.getByLabelText("Correo")).toBeInTheDocument();

    // The form must be usable again, not stuck in «cargando» (regresión: la ruta del equipo no es una navegación).
    const enter = screen.getByRole("button", { name: "Entrar" });
    expect(enter).toBeEnabled();
    fetchMock.mockResolvedValueOnce(ok(AUTHENTICATED));
    mergeGuestCart.mockResolvedValue({ moved: 0, dropped: 0, kept: 0 });
    await userEvent.clear(screen.getByLabelText("Correo"));
    await userEvent.type(screen.getByLabelText("Correo"), "cliente@correo.mx");
    await userEvent.click(enter);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(router.replace).toHaveBeenCalled());
  });

  it("dos envíos en el mismo instante mandan una sola petición (guardia del hook, no solo el botón)", async () => {
    const fetchMock = stubFetch();
    fetchMock.mockImplementation(() => new Promise<Response>((resolve) => setTimeout(() => resolve(ok(AUTHENTICATED)), 30)));
    mergeGuestCart.mockResolvedValue({ moved: 0, dropped: 0, kept: 0 });
    router.replace.mockClear();
    setup();

    await fill();
    const form = screen.getByRole("button", { name: "Entrar" }).closest("form") as HTMLFormElement;
    fireEvent.submit(form);
    fireEvent.submit(form);

    await waitFor(() => expect(router.replace).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("los enlaces a crear cuenta y a recuperar conservan el destino", () => {
    setup("/tienda");
    expect(screen.getByRole("link", { name: "Crear cuenta" })).toHaveAttribute("href", "/crear-cuenta?redirect=%2Ftienda");
    expect(screen.getByRole("link", { name: "Olvidé mi contraseña" })).toHaveAttribute("href", "/recuperar-contrasena");
  });

  it("con foto la talonera la usa; sin foto no hay imagen", () => {
    const { container, unmount } = render(<CustomerLoginForm redirectTo="/cuenta" photo={{ url: "https://res.cloudinary.com/x/a.jpg", width: 800, height: 1200 }} />);
    expect(container.querySelector("img.store-ticket-photo")).toHaveAttribute("src", "https://res.cloudinary.com/x/a.jpg");
    unmount();
    const second = render(<CustomerLoginForm redirectTo="/cuenta" photo={null} />);
    expect(second.container.querySelector("img")).toBeNull();
  });
});
