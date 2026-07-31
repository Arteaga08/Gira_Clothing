"use client";

import { OrderStatus, ShipmentStatus } from "@gira/shared";
import {
  BellIcon,
  CheckCircleIcon,
  MagnifyingGlassIcon,
  PackageIcon,
  ShoppingBagOpenIcon,
  TrashIcon,
  TruckIcon,
  UsersIcon,
} from "@phosphor-icons/react/dist/ssr";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field } from "@/components/ui/Field";
import { IconButton } from "@/components/ui/IconButton";
import { Notice } from "@/components/ui/Notice";
import { PageHeader } from "@/components/ui/PageHeader";
import { Pagination } from "@/components/ui/Pagination";
import { Panel } from "@/components/ui/Panel";
import { SelectField } from "@/components/ui/SelectField";
import { Skeleton, SkeletonRows, SkeletonStatCard } from "@/components/ui/Skeleton";
import { StatCard } from "@/components/ui/StatCard";
import { StatusChip } from "@/components/ui/StatusChip";
import { Table, Tbody, Td, Th, Thead, Tr } from "@/components/ui/Table";
import { Tabs } from "@/components/ui/Tabs";

const SURFACE_SWATCHES = [
  { token: "--color-wallpaper", className: "bg-wallpaper", label: "wallpaper" },
  { token: "--color-surface", className: "bg-surface", label: "surface" },
  { token: "--color-surface-raised", className: "bg-surface-raised", label: "surface-raised" },
  { token: "--color-surface-sunken", className: "bg-surface-sunken", label: "surface-sunken" },
  { token: "--color-ink", className: "bg-ink", label: "ink" },
  { token: "--color-brand", className: "bg-brand", label: "brand" },
  { token: "--color-brand-hover", className: "bg-brand-hover", label: "brand-hover" },
  { token: "--color-brand-subtle", className: "bg-brand-subtle", label: "brand-subtle" },
  { token: "--color-accent", className: "bg-accent", label: "accent" },
];

const TEXT_SCALE = ["text-xs", "text-sm", "text-base", "text-lg", "text-xl", "text-2xl", "text-3xl"] as const;

const TABS_DEMO = [
  { id: "todos", label: "Todos", count: 12 },
  { id: "pendientes", label: "Pendientes", count: 3 },
  { id: "enviados", label: "Enviados" },
];

/**
 * Design-system kitchen sink. All the interactive demos (Tabs, Pagination,
 * the Button loading toggle) need state, so this is the Client Component;
 * the production/404 gate lives one level up in page.tsx, which stays a
 * Server Component with no state of its own.
 */
const KitContent = () => {
  const [activeTab, setActiveTab] = useState("todos");
  const [page, setPage] = useState(2);
  const [loadingDemo, setLoadingDemo] = useState(false);

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-10 p-6">
      <PageHeader
        title="Sistema de diseño"
        subtitle="Kitchen sink de M6 — contrastar contra mockups/ en 390 / 834 / 1440. Se borra en M12."
      />

      <Panel title="Tokens — superficies, ink y marca">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {SURFACE_SWATCHES.map((swatch) => (
            <div key={swatch.token} className="flex flex-col gap-2">
              <div className={`h-16 rounded-nb border-2 border-ink shadow-nb-sm ${swatch.className}`} />
              <p className="font-mono text-xs text-text-secondary">{swatch.label}</p>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Tipografía" hint="Escala fija, ratio ~1.2 — sans y mono">
        <div className="flex flex-col gap-3">
          {TEXT_SCALE.map((size) => (
            <p key={size} className={`${size} font-sans`}>
              {size} — Panel administrativo de Gira Clothing
            </p>
          ))}
          <p className="font-mono text-lg">font-mono — $1,234.00 · SKU-000123</p>
        </div>
      </Panel>

      <Panel title="Botones" hint="4 variantes × 2 tamaños, incluidos disabled y loading">
        <div className="flex flex-col gap-4">
          {(["primary", "secondary", "ghost", "danger"] as const).map((variant) => (
            <div key={variant} className="flex flex-wrap items-center gap-3">
              <span className="w-20 shrink-0 text-xs font-bold uppercase text-text-secondary">{variant}</span>
              <Button variant={variant} size="md">
                Guardar
              </Button>
              <Button variant={variant} size="sm">
                Guardar
              </Button>
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-3">
            <span className="w-20 shrink-0 text-xs font-bold uppercase text-text-secondary">disabled</span>
            <Button disabled>Guardar</Button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="w-20 shrink-0 text-xs font-bold uppercase text-text-secondary">loading</span>
            <Button loading={loadingDemo} onClick={() => setLoadingDemo(true)}>
              Guardar
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setLoadingDemo(false)}>
              reset
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="w-20 shrink-0 text-xs font-bold uppercase text-text-secondary">icon</span>
            <IconButton icon={TrashIcon} label="Eliminar" />
            <IconButton icon={BellIcon} label="Notificaciones" />
          </div>
        </div>
      </Panel>

      <Panel title="Campos">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Correo" placeholder="admin@gira.test" />
          <Field label="Buscar" placeholder="Nombre o correo" icon={MagnifyingGlassIcon} />
          <Field label="Nombre" helper="Tal como aparece en el pedido" />
          <Field label="Código postal" error="Ingresa un código postal válido" />
          <SelectField
            label="Estado del pedido"
            options={Object.values(OrderStatus).map((status) => ({ value: status, label: status }))}
          />
        </div>
      </Panel>

      <Panel title="Chips de estado" hint="Los 9 de pedido + los 5 de envío, con su label real">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            {Object.values(OrderStatus).map((status) => (
              <StatusChip key={status} status={status} />
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {Object.values(ShipmentStatus).map((status) => (
              <StatusChip key={status} shipmentStatus={status} />
            ))}
          </div>
        </div>
      </Panel>

      <Panel title="StatCards">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Pedidos" value={128} foot="Últimos 30 días" icon={ShoppingBagOpenIcon} />
          <StatCard
            label="Ingresos MXN"
            value="$45,320"
            foot="Últimos 30 días"
            icon={PackageIcon}
            accent
          />
          <StatCard label="Envíos activos" value={14} icon={TruckIcon} />
          <StatCard label="Clientes" value={392} unit="activos" icon={UsersIcon} />
        </div>
      </Panel>

      <Panel title="Panel + tabla" flush actions={<Button size="sm">Exportar</Button>}>
        <Table>
          <Thead>
            <Tr>
              <Th>SKU</Th>
              <Th>Estado</Th>
              <Th>Total</Th>
              <Th>Acciones</Th>
            </Tr>
          </Thead>
          <Tbody>
            <Tr>
              <Td>ABC-1001</Td>
              <Td>
                <StatusChip status={OrderStatus.PAID} />
              </Td>
              <Td numeric>$540.00</Td>
              <Td actions>
                <IconButton icon={CheckCircleIcon} label="Marcar procesado" size="sm" />
              </Td>
            </Tr>
            <Tr busy>
              <Td>ABC-1002</Td>
              <Td>
                <StatusChip status={OrderStatus.PROCESSING} />
              </Td>
              <Td numeric>$1,230.00</Td>
              <Td actions>
                <IconButton icon={TrashIcon} label="Cancelar" size="sm" />
              </Td>
            </Tr>
          </Tbody>
        </Table>
      </Panel>

      <Panel title="Tabs">
        <Tabs tabs={TABS_DEMO} value={activeTab} onChange={setActiveTab} />
        <p className="mt-3 text-sm text-text-secondary">Pestaña activa: {activeTab}</p>
      </Panel>

      <Panel title="Pagination">
        <Pagination page={page} limit={20} total={137} onPageChange={setPage} />
      </Panel>

      <Panel title="Skeleton">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
          <SkeletonStatCard />
          <Card className="p-0">
            <SkeletonRows rows={3} cols={4} />
          </Card>
        </div>
      </Panel>

      <Panel title="Empty state">
        <EmptyState
          icon={PackageIcon}
          title="Sin pedidos todavía"
          description="Cuando entre el primer pedido, aparecerá aquí."
          action={<Button size="sm">Ver catálogo</Button>}
        />
      </Panel>

      <Panel title="Notice">
        <div className="flex flex-col gap-3">
          <Notice variant="info" title="Aviso">
            Este es un mensaje informativo.
          </Notice>
          <Notice variant="warning" title="Atención">
            Hay 3 productos con stock bajo.
          </Notice>
          <Notice variant="danger" title="Error">
            No se pudo guardar el cambio. Intenta de nuevo.
          </Notice>
        </div>
      </Panel>
    </main>
  );
};

export default KitContent;
