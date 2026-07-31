import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Pagination } from "@/components/ui/Pagination";

describe("Pagination", () => {
  it("«Anterior» está deshabilitado en la página 1", () => {
    render(<Pagination page={1} limit={20} total={137} onPageChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Anterior/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Siguiente/ })).toBeEnabled();
  });

  it("«Siguiente» está deshabilitado en la última página", () => {
    render(<Pagination page={7} limit={20} total={137} onPageChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Siguiente/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Anterior/ })).toBeEnabled();
  });

  it("onPageChange recibe el número correcto al avanzar", async () => {
    const onPageChange = vi.fn();
    render(<Pagination page={2} limit={20} total={137} onPageChange={onPageChange} />);
    await userEvent.click(screen.getByRole("button", { name: /Siguiente/ }));
    expect(onPageChange).toHaveBeenCalledWith(3);
  });

  it("anuncia el rango visible en texto", () => {
    render(<Pagination page={2} limit={20} total={137} onPageChange={vi.fn()} />);
    expect(screen.getByText("21–40 de 137")).toBeInTheDocument();
  });
});
