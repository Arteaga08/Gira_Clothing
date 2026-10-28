import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SessionsCard } from "@/components/store/account/profile/SessionsCard";
import { jsonResponse, stubFetch } from "../../helpers/fetchMock";

const assign = vi.fn();

describe("SessionsCard", () => {
  const original = window.location;
  afterEach(() => {
    Object.defineProperty(window, "location", { configurable: true, value: original });
    assign.mockClear();
  });

  const stubLocation = () =>
    Object.defineProperty(window, "location", { configurable: true, value: { ...original, assign } });

  it("pide confirmación antes de cerrar y no llama al API si se cancela", async () => {
    const fetchMock = stubFetch();
    render(<SessionsCard />);
    await userEvent.click(screen.getByRole("button", { name: "Cerrar sesión en todos los dispositivos" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("al confirmar llama a logout-all y recarga en /ingresar", async () => {
    stubLocation();
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { status: "success", message: "ok" }));
    render(<SessionsCard />);
    await userEvent.click(screen.getByRole("button", { name: "Cerrar sesión en todos los dispositivos" }));
    await userEvent.click(screen.getByRole("button", { name: "Cerrar todas las sesiones" }));

    await waitFor(() => expect(assign).toHaveBeenCalledWith("/ingresar"));
    expect((fetchMock.mock.calls[0] as [string])[0]).toBe("http://api.test/api/v1/auth/logout-all");
  });
});
