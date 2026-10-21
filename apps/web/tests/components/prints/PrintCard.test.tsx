import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PrintCard } from "@/components/prints/PrintCard";
import { makePanelPrint } from "../../helpers/prints";

describe("PrintCard", () => {
  it("es un botón con nombre, SKU y variantes en su nombre accesible", () => {
    render(<PrintCard print={makePanelPrint()} onOpen={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Rosas de verano, FLR-001, 6 variantes" })).toBeInTheDocument();
    expect(screen.getByText("Florales")).toBeInTheDocument();
  });

  it("singular y sin variantes", () => {
    const { rerender } = render(<PrintCard print={makePanelPrint({ activeVariantCount: 1 })} onOpen={vi.fn()} />);
    expect(screen.getByText("1 variante")).toBeInTheDocument();
    rerender(<PrintCard print={makePanelPrint({ activeVariantCount: 0 })} onOpen={vi.fn()} />);
    expect(screen.getByText("Sin variantes")).toBeInTheDocument();
  });

  it("una estampa retirada se marca como tal", () => {
    render(<PrintCard print={makePanelPrint({ isActive: false, activeVariantCount: 0 })} onOpen={vi.fn()} />);
    expect(screen.getByText("Retirada")).toBeInTheDocument();
  });

  it("al pulsarla avisa con su id", async () => {
    const onOpen = vi.fn();
    render(<PrintCard print={makePanelPrint()} onOpen={onOpen} />);
    await userEvent.click(screen.getByRole("button"));
    expect(onOpen).toHaveBeenCalledWith("68f2ab12c3d4e5f6a7b8c9b1");
  });
});
