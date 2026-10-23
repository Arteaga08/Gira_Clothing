import { TrashIcon } from "@phosphor-icons/react/dist/ssr";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { IconButton } from "@/components/ui/IconButton";

describe("IconButton", () => {
  it("con label expone un nombre accesible", () => {
    render(<IconButton icon={TrashIcon} label="Eliminar" variant="danger" />);
    expect(screen.getByRole("button", { name: "Eliminar" })).toBeInTheDocument();
  });

  it("sin label no compila", () => {
    // @ts-expect-error label es obligatorio: un icon button sin nombre accesible es invisible para un lector de pantalla.
    const jsx = <IconButton icon={TrashIcon} />;
    expect(jsx).toBeDefined();
  });

  it("cada variante rellena con su color y nunca con el blanco de superficie", () => {
    const { rerender } = render(<IconButton icon={TrashIcon} label="Eliminar" variant="danger" />);
    const danger = screen.getByRole("button", { name: "Eliminar" });
    expect(danger).toHaveClass("bg-danger-soft", "text-danger");
    expect(danger).not.toHaveClass("bg-surface");

    rerender(<IconButton icon={TrashIcon} label="Mover" variant="edit" />);
    expect(screen.getByRole("button", { name: "Mover" })).toHaveClass("bg-tile-alt");
    expect(screen.getByRole("button", { name: "Mover" })).not.toHaveClass("bg-surface");
  });
});

