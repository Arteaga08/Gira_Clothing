import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { SelectField } from "@/components/ui/SelectField";

const OPTIONS = [
  { value: "", label: "Todos" },
  { value: "a", label: "Opción A" },
  { value: "b", label: "Beta" },
];

const Controlled = ({ onChange }: { onChange?: (value: string) => void }) => {
  const [value, setValue] = useState("");
  return (
    <SelectField
      label="Estado"
      options={OPTIONS}
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange?.(next);
      }}
    />
  );
};

describe("SelectField", () => {
  it("asocia la etiqueta con el combobox y muestra la opción elegida", () => {
    render(<SelectField label="Estado" options={OPTIONS} defaultValue="a" />);
    const trigger = screen.getByRole("combobox", { name: "Estado" });
    expect(trigger).toHaveTextContent("Opción A");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("la lista no existe hasta abrirla y abre con clic", async () => {
    render(<SelectField label="Estado" options={OPTIONS} defaultValue="" />);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("combobox", { name: "Estado" }));
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Todos" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("combobox", { name: "Estado" })).toHaveAttribute("aria-expanded", "true");
  });

  it("elegir una opción avisa con el valor y cierra la lista", async () => {
    const onChange = vi.fn();
    render(<Controlled onChange={onChange} />);
    await userEvent.click(screen.getByRole("combobox", { name: "Estado" }));
    await userEvent.click(screen.getByRole("option", { name: "Opción A" }));
    expect(onChange).toHaveBeenCalledWith("a");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Estado" })).toHaveTextContent("Opción A");
  });

  it("sin value controlado guarda la elección por su cuenta", async () => {
    render(<SelectField label="Estado" options={OPTIONS} defaultValue="" />);
    await userEvent.click(screen.getByRole("combobox", { name: "Estado" }));
    await userEvent.click(screen.getByRole("option", { name: "Beta" }));
    expect(screen.getByRole("combobox", { name: "Estado" })).toHaveTextContent("Beta");
  });

  it("se maneja con el teclado: flechas, Enter y Escape", async () => {
    const onChange = vi.fn();
    render(<Controlled onChange={onChange} />);
    const trigger = screen.getByRole("combobox", { name: "Estado" });
    trigger.focus();
    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    await userEvent.keyboard("{ArrowDown}{ArrowDown}");
    expect(trigger.getAttribute("aria-activedescendant")).toBe(screen.getByRole("option", { name: "Beta" }).id);
    await userEvent.keyboard("{Enter}");
    expect(onChange).toHaveBeenCalledWith("b");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();

    await userEvent.keyboard("{ArrowDown}{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("Escape con la lista abierta no llega al panel que la contiene", async () => {
    const onKeyDown = vi.fn();
    render(
      <div onKeyDown={onKeyDown}>
        <SelectField label="Estado" options={OPTIONS} defaultValue="" />
      </div>,
    );
    const trigger = screen.getByRole("combobox", { name: "Estado" });
    trigger.focus();
    await userEvent.keyboard("{ArrowDown}");
    onKeyDown.mockClear();
    await userEvent.keyboard("{Escape}");
    expect(onKeyDown).not.toHaveBeenCalled();
  });

  it("un clic fuera la cierra", async () => {
    render(
      <div>
        <SelectField label="Estado" options={OPTIONS} defaultValue="" />
        <button>fuera</button>
      </div>,
    );
    await userEvent.click(screen.getByRole("combobox", { name: "Estado" }));
    await userEvent.click(screen.getByRole("button", { name: "fuera" }));
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("deshabilitado no abre", async () => {
    render(<SelectField label="Estado" options={OPTIONS} defaultValue="" disabled />);
    await userEvent.click(screen.getByRole("combobox", { name: "Estado" }));
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("Inicio, Fin y escribir una letra mueven la opción activa", async () => {
    render(<SelectField label="Estado" options={OPTIONS} defaultValue="" />);
    const trigger = screen.getByRole("combobox", { name: "Estado" });
    trigger.focus();
    await userEvent.keyboard("{ArrowDown}{End}");
    expect(trigger.getAttribute("aria-activedescendant")).toBe(screen.getByRole("option", { name: "Beta" }).id);
    await userEvent.keyboard("{Home}");
    expect(trigger.getAttribute("aria-activedescendant")).toBe(screen.getByRole("option", { name: "Todos" }).id);
    await userEvent.keyboard("o");
    expect(trigger.getAttribute("aria-activedescendant")).toBe(screen.getByRole("option", { name: "Opción A" }).id);
  });

  it("escribir una letra con la lista cerrada elige la opción", async () => {
    const onChange = vi.fn();
    render(<SelectField label="Estado" options={OPTIONS} defaultValue="" onChange={onChange} />);
    screen.getByRole("combobox", { name: "Estado" }).focus();
    await userEvent.keyboard("b");
    expect(onChange).toHaveBeenCalledWith("b");
  });

  it("Tab, el scroll de la página y desactivarlo cierran la lista", async () => {
    const { rerender } = render(<SelectField label="Estado" options={OPTIONS} defaultValue="" />);
    const trigger = screen.getByRole("combobox", { name: "Estado" });
    await userEvent.click(trigger);
    await userEvent.keyboard("{Tab}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();

    await userEvent.click(trigger);
    fireEvent.scroll(document.body);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();

    await userEvent.click(trigger);
    rerender(<SelectField label="Estado" options={OPTIONS} defaultValue="" disabled />);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("un valor que no está entre las opciones no marca ninguna como elegida", async () => {
    render(<SelectField label="Estado" options={OPTIONS} value="x" onChange={vi.fn()} />);
    const trigger = screen.getByRole("combobox", { name: "Estado" });
    expect(trigger).toHaveTextContent("Elige una opción");
    await userEvent.click(trigger);
    expect(screen.queryAllByRole("option", { selected: true })).toHaveLength(0);
  });

  it("la flecha es propia, decorativa y deja aire respecto al texto y al borde", () => {
    const { container } = render(<SelectField label="Estado" options={OPTIONS} defaultValue="" />);
    const arrow = container.querySelector("svg");
    expect(arrow).toHaveAttribute("aria-hidden", "true");
    const trigger = screen.getByRole("combobox", { name: "Estado" });
    expect(trigger.className).toContain("gap-3");
    expect(trigger.className).toContain("pr-3");
  });

  it("muestra el error y lo enlaza con aria-describedby", () => {
    render(<SelectField label="Estado" options={OPTIONS} error="Elige uno" defaultValue="" />);
    const trigger = screen.getByRole("combobox", { name: "Estado" });
    expect(trigger).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Elige uno")).toHaveAttribute("id", trigger.getAttribute("aria-describedby"));
  });
});
