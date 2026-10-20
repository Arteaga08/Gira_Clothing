import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider, useToast, type ToastInput } from "@/components/ui/Toast";

let fire: (input: ToastInput) => void = () => {};

const Capture = () => {
  const { toast } = useToast();
  useEffect(() => {
    fire = toast;
  }, [toast]);
  return null;
};

const setup = () =>
  render(
    <ToastProvider>
      <Capture />
    </ToastProvider>,
  );

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("Toast", () => {
  it("un éxito aparece y se va a los 4 s", () => {
    setup();
    act(() => fire({ variant: "success", title: "Pedido en proceso" }));
    expect(screen.getByText("Pedido en proceso")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(3999));
    expect(screen.getByText("Pedido en proceso")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(2));
    expect(screen.queryByText("Pedido en proceso")).not.toBeInTheDocument();
  });

  it("info dura 5 s y warning 6 s", () => {
    setup();
    act(() => {
      fire({ variant: "info", title: "Info" });
      fire({ variant: "warning", title: "Aviso" });
    });
    act(() => vi.advanceTimersByTime(5001));
    expect(screen.queryByText("Info")).not.toBeInTheDocument();
    expect(screen.getByText("Aviso")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.queryByText("Aviso")).not.toBeInTheDocument();
  });

  it("un error no se cierra solo y trae botón Cerrar", () => {
    vi.useRealTimers();
    setup();
    act(() => fire({ variant: "error", title: "No se pudo", description: "Primero en preparación." }));
    expect(screen.getByRole("alert")).toHaveTextContent("Primero en preparación.");
    return userEvent.click(screen.getByRole("button", { name: "Cerrar" })).then(() => {
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
  });

  it("el cuarto toast desplaza al más viejo", () => {
    setup();
    act(() => {
      ["Uno", "Dos", "Tres", "Cuatro"].forEach((title) => fire({ variant: "info", title }));
    });
    expect(screen.queryByText("Uno")).not.toBeInTheDocument();
    expect(screen.getByText("Cuatro")).toBeInTheDocument();
    expect(screen.getAllByRole("status")).toHaveLength(3);
  });

  it("useToast fuera del provider lanza", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Capture />)).toThrow("useToast");
    spy.mockRestore();
  });
});
