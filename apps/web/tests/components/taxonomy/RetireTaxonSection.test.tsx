import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RetireTaxonSection } from "@/components/taxonomy/RetireTaxonSection";
import { categoryConfig, familyConfig } from "@/lib/taxonomy/config";
import { PRINT_ID, makePanelTaxon } from "../../helpers/taxonomy";

const noop = async () => true;

describe("RetireTaxonSection", () => {
  it("con estampas activas bloquea el retiro, las nombra con enlace y ofrece ver todas", () => {
    render(
      <RetireTaxonSection config={familyConfig} taxon={makePanelTaxon()} error={null} onRetire={noop} onReactivate={noop} />,
    );
    expect(screen.getByText("No se puede retirar todavía")).toBeInTheDocument();
    expect(screen.getByText(/Tiene 6 estampas activas/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Rosas de verano/ })).toHaveAttribute("href", `/estampas?estampa=${PRINT_ID}`);
    expect(screen.getByRole("link", { name: "Ver las 6 estampas en Estampas" })).toHaveAttribute(
      "href",
      expect.stringContaining("/estampas?familia="),
    );
    expect(screen.getByRole("button", { name: "Retirar familia" })).toBeDisabled();
    expect(screen.getByText("y 5 más")).toBeInTheDocument();
  });

  it("una categoría enlaza a sus modelos en Productos", () => {
    render(
      <RetireTaxonSection
        config={categoryConfig}
        taxon={makePanelTaxon({ activeChildCount: 1, childCount: 1, activeChildren: [{ id: PRINT_ID, name: "Neceser" }] })}
        error={null}
        onRetire={noop}
        onReactivate={noop}
      />,
    );
    expect(screen.getByText(/Tiene 1 modelo activo/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Neceser/ })).toHaveAttribute("href", `/productos/${PRINT_ID}`);
    expect(screen.getByRole("link", { name: "Ver el modelo en Productos" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retirar categoría" })).toBeDisabled();
  });

  it("sin hijos activos confirma y retira", async () => {
    const onRetire = vi.fn().mockResolvedValue(true);
    render(
      <RetireTaxonSection
        config={familyConfig}
        taxon={makePanelTaxon({ activeChildCount: 0, activeChildren: [] })}
        error={null}
        onRetire={onRetire}
        onReactivate={noop}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Retirar familia" }));
    expect(onRetire).not.toHaveBeenCalled();
    const confirm = within(screen.getByRole("dialog")).getByRole("button", { name: "Retirar familia" });
    await userEvent.click(confirm);
    await waitFor(() => expect(onRetire).toHaveBeenCalledTimes(1));
  });

  it("una retirada se reactiva sin validar nada", async () => {
    const onReactivate = vi.fn().mockResolvedValue(true);
    render(
      <RetireTaxonSection
        config={familyConfig}
        taxon={makePanelTaxon({ isActive: false, activeChildCount: 0, activeChildren: [] })}
        error={null}
        onRetire={noop}
        onReactivate={onReactivate}
      />,
    );
    expect(screen.getByText("Esta familia está retirada")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Reactivar familia" }));
    await waitFor(() => expect(onReactivate).toHaveBeenCalledTimes(1));
  });

  it("muestra el mensaje del API (409) junto al botón", () => {
    render(
      <RetireTaxonSection
        config={familyConfig}
        taxon={makePanelTaxon({ activeChildCount: 0, activeChildren: [] })}
        error="No puedes retirar una familia con estampados activos."
        onRetire={noop}
        onReactivate={noop}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("No puedes retirar una familia con estampados activos.");
  });
});
