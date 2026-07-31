import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { useFocusTrap } from "@/hooks/useFocusTrap";

const Harness = ({ active }: { active: boolean }) => {
  const ref = useFocusTrap<HTMLDivElement>(active);
  return (
    <div>
      <button type="button">Disparador</button>
      {active ? (
        <div ref={ref}>
          <button type="button">Primero</button>
          <button type="button">Segundo</button>
          <button type="button">Tercero</button>
        </div>
      ) : null}
    </div>
  );
};

describe("useFocusTrap", () => {
  it("al activarse, enfoca el primer elemento focoable del contenedor", () => {
    render(<Harness active={true} />);
    expect(screen.getByRole("button", { name: "Primero" })).toHaveFocus();
  });

  it("Tab en el último elemento cicla al primero", async () => {
    render(<Harness active={true} />);
    screen.getByRole("button", { name: "Tercero" }).focus();

    await userEvent.tab();

    expect(screen.getByRole("button", { name: "Primero" })).toHaveFocus();
  });

  it("Shift+Tab en el primer elemento cicla al último", async () => {
    render(<Harness active={true} />);
    screen.getByRole("button", { name: "Primero" }).focus();

    await userEvent.tab({ shift: true });

    expect(screen.getByRole("button", { name: "Tercero" })).toHaveFocus();
  });

  it("al desactivarse, devuelve el foco al disparador", () => {
    const { rerender } = render(<Harness active={false} />);
    const trigger = screen.getByRole("button", { name: "Disparador" });
    trigger.focus();
    expect(trigger).toHaveFocus();

    rerender(<Harness active={true} />);
    expect(screen.getByRole("button", { name: "Primero" })).toHaveFocus();

    rerender(<Harness active={false} />);
    expect(trigger).toHaveFocus();
  });

  it("active:false no intenta enfocar nada", () => {
    render(<Harness active={false} />);
    expect(document.activeElement).toBe(document.body);
  });
});
