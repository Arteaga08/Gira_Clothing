import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SavedPage from "@/app/(store)/cuenta/guardados/page";

const { requireCustomer, getSavedItems } = vi.hoisted(() => ({ requireCustomer: vi.fn(), getSavedItems: vi.fn() }));

vi.mock("@/lib/account/requireCustomer", () => ({ requireCustomer }));
vi.mock("@/lib/api/wishlistServer", () => ({ getSavedItems }));
vi.mock("@/components/store/account/shell/AccountShell", () => ({
  AccountShell: ({ children }: { children: React.ReactNode }) => <div data-testid="shell">{children}</div>,
}));
vi.mock("@/components/store/account/shell/AccountUnavailable", () => ({ AccountUnavailable: () => <p>cuenta no disponible</p> }));
vi.mock("@/components/store/account/shell/BackToAccount", () => ({ BackToAccount: () => <a href="/cuenta">Mi cuenta</a> }));
vi.mock("@/components/store/account/shell/LoadFailure", () => ({ LoadFailure: ({ what }: { what: string }) => <p>falló {what}</p> }));
vi.mock("@/components/store/wishlist/SavedGrid", () => ({ SavedGrid: ({ initialItems }: { initialItems: unknown[] }) => <p>{initialItems.length} guardados</p> }));

beforeEach(() => {
  requireCustomer.mockReset();
  getSavedItems.mockReset();
});

describe("página de Guardados", () => {
  it("usa el guard de cliente con su propia ruta de regreso y se dibuja dentro de la tarjeta de Mi cuenta", async () => {
    requireCustomer.mockResolvedValue({ kind: "customer", user: { firstName: "María" } });
    getSavedItems.mockResolvedValue({ status: "ok", items: [{}, {}] });

    render(await SavedPage());

    expect(requireCustomer).toHaveBeenCalledWith("/cuenta/guardados");
    expect(screen.getByTestId("shell")).toContainElement(screen.getByRole("heading", { name: "Guardados" }));
    expect(screen.getByText("2 guardados")).toBeInTheDocument();
  });

  it("si el guard no puede confirmar la cuenta no pide los guardados", async () => {
    requireCustomer.mockResolvedValue({ kind: "unavailable", message: "x" });
    render(await SavedPage());
    expect(screen.getByText("cuenta no disponible")).toBeInTheDocument();
    expect(getSavedItems).not.toHaveBeenCalled();
  });

  it("un fallo al cargar los guardados queda dentro de la tarjeta, con reintento", async () => {
    requireCustomer.mockResolvedValue({ kind: "customer", user: { firstName: "María" } });
    getSavedItems.mockResolvedValue({ status: "error" });
    render(await SavedPage());
    expect(screen.getByText("falló tus guardados")).toBeInTheDocument();
  });
});
