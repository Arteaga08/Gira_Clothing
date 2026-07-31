import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { LogoutButton } from "@/components/shell/LogoutButton";
import { jsonResponse, stubFetch } from "../helpers/fetchMock";

const { router } = vi.hoisted(() => ({
  router: { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() },
}));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

describe("LogoutButton", () => {
  it("un 401 (la sesión ya no existía) no impide navegar a /login", async () => {
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValueOnce(
      jsonResponse(401, { status: "fail", message: "No has iniciado sesión." }),
    );

    render(<LogoutButton />);
    await userEvent.click(screen.getByRole("button", { name: "Cerrar sesión" }));

    expect(router.replace).toHaveBeenCalledWith("/login");
    expect(router.refresh).toHaveBeenCalled();
  });

  it("un logout exitoso navega a /login", async () => {
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { status: "success", message: "Sesión cerrada correctamente." }),
    );

    render(<LogoutButton />);
    await userEvent.click(screen.getByRole("button", { name: "Cerrar sesión" }));

    expect(router.replace).toHaveBeenCalledWith("/login");
  });
});
