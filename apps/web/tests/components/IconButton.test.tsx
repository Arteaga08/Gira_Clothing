import { TrashIcon } from "@phosphor-icons/react/dist/ssr";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { IconButton } from "@/components/ui/IconButton";

describe("IconButton", () => {
  it("con label expone un nombre accesible", () => {
    render(<IconButton icon={TrashIcon} label="Eliminar" />);
    expect(screen.getByRole("button", { name: "Eliminar" })).toBeInTheDocument();
  });

  it("sin label no compila", () => {
    // @ts-expect-error label es obligatorio: un icon button sin nombre accesible es invisible para un lector de pantalla.
    const jsx = <IconButton icon={TrashIcon} />;
    expect(jsx).toBeDefined();
  });
});
