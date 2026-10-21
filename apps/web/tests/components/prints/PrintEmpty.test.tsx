import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PrintEmpty } from "@/components/prints/PrintEmpty";

describe("PrintEmpty", () => {
  it("con filtros ofrece limpiarlos", async () => {
    const onClear = vi.fn();
    render(<PrintEmpty filters={{ search: "zzz", status: "active", sort: "name", page: 1 }} onClear={onClear} onCreate={vi.fn()} />);
    expect(screen.getByText("Ninguna estampa coincide")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Limpiar filtros" }));
    expect(onClear).toHaveBeenCalled();
  });

  it("sin filtros invita a crear la primera", async () => {
    const onCreate = vi.fn();
    render(<PrintEmpty filters={{ status: "active", sort: "name", page: 1 }} onClear={vi.fn()} onCreate={onCreate} />);
    expect(screen.getByText("Todavía no hay estampas")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Nueva estampa/ }));
    expect(onCreate).toHaveBeenCalled();
  });
});
