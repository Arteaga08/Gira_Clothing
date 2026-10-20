import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Toggle } from "@/components/ui/Toggle";

describe("Toggle", () => {
  it("expone role switch con aria-checked y el texto visible", () => {
    render(<Toggle checked label="Solo urgentes" onChange={() => {}} />);
    expect(screen.getByRole("switch", { name: "Solo urgentes" })).toHaveAttribute("aria-checked", "true");
  });

  it("alterna con clic y con teclado", async () => {
    const onChange = vi.fn();
    render(<Toggle checked={false} label="Solo urgentes" onChange={onChange} />);
    const toggle = screen.getByRole("switch");
    await userEvent.click(toggle);
    toggle.focus();
    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard(" ");
    expect(onChange).toHaveBeenCalledTimes(3);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("no cambia cuando está deshabilitado", async () => {
    const onChange = vi.fn();
    render(<Toggle checked={false} label="Solo urgentes" onChange={onChange} disabled />);
    await userEvent.click(screen.getByRole("switch"));
    expect(onChange).not.toHaveBeenCalled();
  });
});
