import { PackageIcon } from "@phosphor-icons/react/dist/ssr";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import { Notice } from "@/components/ui/Notice";
import { PageHeader } from "@/components/ui/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { SelectField } from "@/components/ui/SelectField";
import { Skeleton, SkeletonRows, SkeletonStatCard } from "@/components/ui/Skeleton";
import { StatCard } from "@/components/ui/StatCard";
import { Table, Tbody, Td, Th, Thead, Tr } from "@/components/ui/Table";

describe("Icon", () => {
  it("aplica weight bold y mezcla className", () => {
    const { container } = render(<Icon icon={PackageIcon} className="custom" />);
    const svg = container.querySelector("svg");
    expect(svg).toHaveClass("custom");
  });
});

describe("Card", () => {
  it("renderiza los hijos con el className mezclado", () => {
    render(<Card className="custom">Contenido</Card>);
    expect(screen.getByText("Contenido")).toHaveClass("custom");
  });
});

describe("Panel", () => {
  it("renderiza título, hint y contenido", () => {
    render(
      <Panel title="Pedidos recientes" hint="Últimos 30 días">
        <p>Cuerpo</p>
      </Panel>,
    );
    expect(screen.getByRole("heading", { name: "Pedidos recientes" })).toBeInTheDocument();
    expect(screen.getByText("Últimos 30 días")).toBeInTheDocument();
    expect(screen.getByText("Cuerpo")).toBeInTheDocument();
  });
});

describe("PageHeader", () => {
  it("renderiza un único h1 con subtítulo", () => {
    render(<PageHeader title="Resumen" subtitle="Vista general de la tienda" />);
    expect(screen.getByRole("heading", { level: 1, name: "Resumen" })).toBeInTheDocument();
    expect(screen.getByText("Vista general de la tienda")).toBeInTheDocument();
  });
});

describe("StatCard", () => {
  it("renderiza etiqueta, valor y pie", () => {
    render(<StatCard label="Pedidos" value={128} foot="Últimos 30 días" />);
    expect(screen.getByText("Pedidos")).toBeInTheDocument();
    expect(screen.getByText("128")).toBeInTheDocument();
    expect(screen.getByText("Últimos 30 días")).toBeInTheDocument();
  });
});

describe("Table", () => {
  it("marca data-busy en una fila en proceso", () => {
    render(
      <Table>
        <Thead>
          <Tr>
            <Th>SKU</Th>
            <Th>Total</Th>
          </Tr>
        </Thead>
        <Tbody>
          <Tr busy>
            <Td>ABC-123</Td>
            <Td numeric>$100.00</Td>
          </Tr>
        </Tbody>
      </Table>,
    );
    const row = screen.getByText("ABC-123").closest("tr");
    expect(row).toHaveAttribute("data-busy", "true");
  });
});

describe("Skeleton", () => {
  it("SkeletonRows renderiza el número de filas y columnas pedido", () => {
    const { container } = render(<SkeletonRows rows={2} cols={3} />);
    expect(container.querySelectorAll('[aria-hidden="true"]')).toHaveLength(2 * 3);
  });

  it("SkeletonStatCard renderiza sin errores", () => {
    const { container } = render(<SkeletonStatCard />);
    expect(container.firstChild).toBeTruthy();
  });

  it("Skeleton mezcla className", () => {
    const { container } = render(<Skeleton className="h-10" />);
    expect(container.firstChild).toHaveClass("h-10");
  });
});

describe("EmptyState", () => {
  it("renderiza título y descripción", () => {
    render(<EmptyState icon={PackageIcon} title="Sin pedidos" description="Todavía no hay pedidos que mostrar." />);
    expect(screen.getByText("Sin pedidos")).toBeInTheDocument();
    expect(screen.getByText("Todavía no hay pedidos que mostrar.")).toBeInTheDocument();
  });
});

describe("Notice", () => {
  it("variant danger usa role=alert", () => {
    render(
      <Notice variant="danger" title="Error">
        Algo salió mal.
      </Notice>,
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("variant info usa role=status", () => {
    render(
      <Notice variant="info" title="Aviso">
        Información.
      </Notice>,
    );
    expect(screen.getByRole("status")).toBeInTheDocument();
  });
});

describe("SelectField", () => {
  it("asocia el label al select y lista las opciones", () => {
    render(
      <SelectField
        label="Estado"
        options={[
          { value: "paid", label: "Pagada" },
          { value: "shipped", label: "Enviada" },
        ]}
      />,
    );
    const select = screen.getByLabelText("Estado");
    expect(select).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Pagada" })).toBeInTheDocument();
  });
});
