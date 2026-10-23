import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatCard } from "@/components/ui/StatCard";
import { Button } from "@/components/ui/Button";
import { Segmented } from "@/components/ui/Segmented";
import type { ButtonVariant } from "@/components/ui/Button";

/**
 * Tailwind v4 sorts same-specificity utilities by NAME, not by their position in the class
 * string, so a second `bg-*` or `text-*` on one element makes the winner arbitrary (it was
 * `bg-surface` beating `bg-cta`/`bg-brand`). jsdom cannot compute the cascade, so this guards
 * the cause: every element names exactly one fill and one text colour.
 */
const fillsOf = (el: HTMLElement): string[] =>
  [...el.classList].filter((c) => !c.includes(":") && /^bg-(?!\[length)/.test(c));
const textColoursOf = (el: HTMLElement): string[] =>
  [...el.classList].filter((c) => !c.includes(":") && /^text-(text-|danger)/.test(c));

describe("composición de relleno y color de texto", () => {
  it.each<[ButtonVariant, string, string]>([
    ["primary", "bg-cta", "text-text-primary"],
    ["danger", "bg-danger-soft", "text-danger"],
    ["edit", "bg-tile-alt", "text-text-primary"],
    ["positive", "bg-brand-subtle", "text-text-primary"],
  ])("Button %s declara un solo relleno y un solo color de texto", (variant, fill, text) => {
    render(<Button variant={variant}>Acción</Button>);
    const button = screen.getByRole("button", { name: "Acción" });
    expect(fillsOf(button)).toEqual([fill]);
    expect(textColoursOf(button)).toEqual([text]);
  });

  it("Segmented seleccionado usa el relleno de marca y texto inverso", () => {
    render(<Segmented selected onClick={() => undefined}>30 días</Segmented>);
    const el = screen.getByRole("button", { name: "30 días" });
    expect(fillsOf(el)).toEqual(["bg-brand"]);
    expect(textColoursOf(el)).toEqual(["text-text-inverse"]);
  });

  it("Segmented sin seleccionar usa el relleno de superficie", () => {
    render(<Segmented selected={false} onClick={() => undefined}>7 días</Segmented>);
    const el = screen.getByRole("button", { name: "7 días" });
    expect(fillsOf(el)).toEqual(["bg-surface"]);
    expect(textColoursOf(el)).toEqual(["text-text-primary"]);
  });

  it("StatCard con acento usa el tinte de marca, sin el relleno de superficie", () => {
    const { container } = render(<StatCard label="Ingresos" value="$1" accent />);
    const card = container.firstElementChild as HTMLElement;
    expect(fillsOf(card)).toEqual(["bg-brand-subtle"]);
  });

  it("StatCard sin acento usa la superficie", () => {
    const { container } = render(<StatCard label="Ingresos" value="$1" />);
    expect(fillsOf(container.firstElementChild as HTMLElement)).toEqual(["bg-surface"]);
  });
});
