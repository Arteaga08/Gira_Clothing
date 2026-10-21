import { AuditAction, AuditModule } from "@gira/shared";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuditPage } from "@/components/audit/AuditPage";
import { ApiError } from "@/lib/api/ApiError";
import { parseAuditFilters, parseSelectedEntry } from "@/lib/audit/filters";
import { chooseOption } from "../../helpers/select";

const { client, replaceMock } = vi.hoisted(() => ({
  client: { list: vi.fn(), get: vi.fn() },
  replaceMock: vi.fn(),
}));
vi.mock("@/lib/api/adminAudit", () => ({ auditClient: client }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/auditoria",
  useRouter: () => ({ replace: replaceMock, push: vi.fn(), refresh: vi.fn() }),
}));

const ORDER_ID = "68f2ab12c3d4e5f6a7b8caa1";
const ENTRY_ID = "68f2ab12c3d4e5f6a7b8cbb2";
const OTHER_ID = "68f2ab12c3d4e5f6a7b8ccc3";

const STATUS_ENTRY = {
  id: ENTRY_ID,
  actor: "admin",
  action: AuditAction.ORDER_STATUS_CHANGED,
  module: AuditModule.ORDERS,
  targetId: ORDER_ID,
  changes: [{ field: "status", before: "paid", after: "processing" }],
  createdAt: "2026-10-21T16:05:00.000Z",
};
const SHIPPING_ENTRY = {
  id: OTHER_ID,
  actor: "system",
  action: AuditAction.SETTINGS_SHIPPING_UPDATED,
  module: AuditModule.SETTINGS,
  targetId: "68f2ab12c3d4e5f6a7b8cdd4",
  changes: [
    { field: "origin", redacted: true },
    { field: "parcel.tareGrams", before: 150, after: 200 },
  ],
  createdAt: "2026-10-20T10:00:00.000Z",
};
const page = (items: unknown[] = [STATUS_ENTRY, SHIPPING_ENTRY]) => ({
  items,
  meta: { total: items.length, page: 1, pages: 1, limit: 25 },
});

const renderPage = (params: Record<string, string> = {}) =>
  render(<AuditPage initialFilters={parseAuditFilters(params)} initialSelected={parseSelectedEntry(params)} />);

beforeEach(() => {
  client.list.mockReset();
  client.get.mockReset();
  client.list.mockResolvedValue(page());
  replaceMock.mockReset();
});

describe("AuditPage", () => {
  it("lista acción, quién, módulo y enlace al pedido", async () => {
    renderPage();
    const action = await screen.findByRole("button", { name: "Cambio de estado" });
    const row = within(action.closest("tr") as HTMLElement);
    expect(row.getByText("Administrador")).toBeInTheDocument();
    expect(row.getByText("Pedidos")).toBeInTheDocument();
    expect(row.getByRole("link", { name: "Ver pedido" })).toHaveAttribute("href", `/pedidos/${ORDER_ID}`);
    expect(screen.getByText("Sistema")).toBeInTheDocument();
  });

  it("por defecto pide solo equipo y sistema de los últimos 30 días", async () => {
    renderPage();
    await screen.findByRole("button", { name: "Cambio de estado" });
    const query = new URLSearchParams(client.list.mock.calls[0]?.[0] as string);
    expect(query.get("actor")).toBe("team");
    expect(query.get("days")).toBe("30");
  });

  it("filtrar por módulo y acción escribe la URL en español", async () => {
    renderPage();
    await screen.findByRole("button", { name: "Cambio de estado" });
    expect(screen.queryByRole("combobox", { name: "Acción" })).not.toBeInTheDocument();
    await chooseOption(screen.getByRole("combobox", { name: "Módulo" }), "Pedidos");
    expect(replaceMock).toHaveBeenLastCalledWith("/auditoria?modulo=pedidos", { scroll: false });
    await chooseOption(await screen.findByRole("combobox", { name: "Acción" }), "Prioridad cambiada");
    expect(replaceMock).toHaveBeenLastCalledWith(
      "/auditoria?modulo=pedidos&accion=order_priority_updated",
      { scroll: false },
    );
    await chooseOption(screen.getByRole("combobox", { name: "Quién" }), "Clientes");
    expect(replaceMock).toHaveBeenLastCalledWith(
      "/auditoria?quien=clientes&modulo=pedidos&accion=order_priority_updated",
      { scroll: false },
    );
  });

  it("abrir una fila escribe ?registro= y muestra los cambios", async () => {
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Cambio de estado" }));
    expect(replaceMock).toHaveBeenLastCalledWith(`/auditoria?registro=${ENTRY_ID}`, { scroll: false });
    const dialog = await screen.findByRole("dialog", { name: "Registro de auditoría" });
    expect(within(dialog).getByText("Estado")).toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: "Ver pedido" })).toBeInTheDocument();
    expect(client.get).not.toHaveBeenCalled();
  });

  it("un campo protegido solo dice que cambió", async () => {
    // Opened from the URL before the list lands: the entry is fetched on its own.
    client.get.mockResolvedValue(SHIPPING_ENTRY);
    renderPage({ registro: OTHER_ID });
    const dialog = await screen.findByRole("dialog", { name: "Registro de auditoría" });
    expect(within(dialog).getByText("Origen de envío")).toBeInTheDocument();
    expect(within(dialog).getByText("Modificado · datos protegidos")).toBeInTheDocument();
    expect(within(dialog).getByText("Peso del empaque (g)")).toBeInTheDocument();
  });

  it("?registro= que no está en la página se pide al API; un 404 se explica", async () => {
    client.get.mockRejectedValue(new ApiError("El registro de auditoría no existe.", "http", 404));
    const missing = "68f2ab12c3d4e5f6a7b8cee5";
    renderPage({ registro: missing });
    expect(await screen.findByText("Registro no encontrado")).toBeInTheDocument();
    expect(client.get).toHaveBeenCalledWith(missing);
  });

  it("si la lista falla, «Reintentar» vuelve a pedir", async () => {
    client.list.mockRejectedValueOnce(new ApiError("Sin conexión.", "network"));
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Reintentar" }));
    expect(await screen.findByRole("button", { name: "Cambio de estado" })).toBeInTheDocument();
  });

  it("vacío con filtros ofrece limpiarlos; sin filtros explica qué se registra", async () => {
    client.list.mockResolvedValue(page([]));
    const { unmount } = renderPage({ modulo: "cupones" });
    await userEvent.click(await screen.findByRole("button", { name: "Limpiar filtros" }));
    expect(replaceMock).toHaveBeenLastCalledWith("/auditoria", { scroll: false });
    unmount();
    renderPage();
    expect(await screen.findByText("Sin actividad en los últimos 30 días")).toBeInTheDocument();
  });
});
