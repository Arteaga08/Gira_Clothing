import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { CartMergeNotice } from "@/components/store/cart/CartMergeNotice";
import { announceDroppedLines, droppedLinesMessage } from "@/lib/cart/mergeNotice";

describe("CartMergeNotice", () => {
  it("no muestra nada hasta que el login anuncia líneas descartadas", () => {
    render(<CartMergeNotice />);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("muestra el aviso en singular y en plural, y se puede cerrar", async () => {
    render(<CartMergeNotice />);
    act(() => announceDroppedLines(1));
    expect(screen.getByText("Quitamos 1 producto de tu carrito porque ya no está disponible.")).toBeInTheDocument();

    act(() => announceDroppedLines(3));
    expect(screen.getByText("Quitamos 3 productos de tu carrito porque ya no están disponibles.")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Cerrar aviso" }));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("ignora un conteo en cero o inválido", () => {
    render(<CartMergeNotice />);
    act(() => {
      announceDroppedLines(0);
      announceDroppedLines(-2);
      announceDroppedLines(1.5);
    });
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("deja de escuchar al desmontarse", () => {
    const { unmount } = render(<CartMergeNotice />);
    unmount();
    expect(() => act(() => announceDroppedLines(2))).not.toThrow();
  });

  it("el texto singular y plural", () => {
    expect(droppedLinesMessage(1)).toMatch(/1 producto de tu carrito/);
    expect(droppedLinesMessage(2)).toMatch(/2 productos de tu carrito/);
  });
});
