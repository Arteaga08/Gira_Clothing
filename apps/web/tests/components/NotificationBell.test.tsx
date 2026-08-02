import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NotificationBell } from "@/components/shell/NotificationBell";

const { fetchOutboxHealthMock } = vi.hoisted(() => ({ fetchOutboxHealthMock: vi.fn() }));
vi.mock("@/lib/api/outbox", () => ({ fetchOutboxHealth: fetchOutboxHealthMock }));

describe("NotificationBell", () => {
  it("sin datos aún, no muestra badge y anuncia sin pendientes", () => {
    fetchOutboxHealthMock.mockReturnValue(new Promise(() => {}));
    render(<NotificationBell />);
    expect(screen.getByRole("status", { name: "Notificaciones: sin pendientes" })).toBeInTheDocument();
    expect(screen.queryByText(/^\d+$/)).not.toBeInTheDocument();
  });

  it("con pending + failed > 0, muestra el badge y el aria-label con el conteo", async () => {
    fetchOutboxHealthMock.mockResolvedValue({
      pending: 3,
      sending: 0,
      failed: 1,
      sent: 0,
      stale: 0,
      oldestPendingAt: null,
      failedSample: [],
    });
    render(<NotificationBell />);
    expect(await screen.findByText("4")).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Notificaciones: 4 pendientes" })).toBeInTheDocument();
  });

  it("en cero, sin badge", async () => {
    fetchOutboxHealthMock.mockResolvedValue({
      pending: 0,
      sending: 0,
      failed: 0,
      sent: 214,
      stale: 0,
      oldestPendingAt: null,
      failedSample: [],
    });
    render(<NotificationBell />);
    expect(await screen.findByRole("status", { name: "Notificaciones: sin pendientes" })).toBeInTheDocument();
  });
});
