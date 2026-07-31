import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Tabs } from "@/components/ui/Tabs";

const TABS = [
  { id: "todos", label: "Todos", count: 12 },
  { id: "pendientes", label: "Pendientes", count: 3 },
  { id: "enviados", label: "Enviados" },
];

describe("Tabs", () => {
  it("marca aria-selected solo en la pestaña activa", () => {
    render(<Tabs tabs={TABS} value="pendientes" onChange={vi.fn()} />);
    expect(screen.getByRole("tab", { name: /Pendientes/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: /Todos/ })).toHaveAttribute("aria-selected", "false");
  });

  it("flecha derecha mueve la selección y el foco a la siguiente pestaña", async () => {
    const onChange = vi.fn();
    render(<Tabs tabs={TABS} value="todos" onChange={onChange} />);
    screen.getByRole("tab", { name: /Todos/ }).focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(onChange).toHaveBeenCalledWith("pendientes");
    expect(screen.getByRole("tab", { name: /Pendientes/ })).toHaveFocus();
  });

  it("flecha izquierda en la primera pestaña da la vuelta a la última", async () => {
    const onChange = vi.fn();
    render(<Tabs tabs={TABS} value="todos" onChange={onChange} />);
    screen.getByRole("tab", { name: /Todos/ }).focus();
    await userEvent.keyboard("{ArrowLeft}");
    expect(onChange).toHaveBeenCalledWith("enviados");
  });

  it("renderiza el conteo cuando se provee", () => {
    render(<Tabs tabs={TABS} value="todos" onChange={vi.fn()} />);
    expect(screen.getByText("12")).toBeInTheDocument();
  });
});
