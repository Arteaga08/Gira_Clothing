"use client";

import Link from "next/link";
import { useState } from "react";
import { BreadcrumbLabel } from "@/components/shell/BreadcrumbLabel";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { PageHeader } from "@/components/ui/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { useCustomerDetail } from "@/hooks/useCustomerDetail";
import { formatMxn } from "@/lib/coupons/money";
import { customerFullName } from "@/lib/customers/panelCustomer";
import { formatShortDate } from "@/lib/format";
import { CustomerOrdersCard } from "./CustomerOrdersCard";
import { GiveCouponModal } from "./GiveCouponModal";
import { NB_TILE } from "./tileStyles";

interface CustomerDetailPageProps {
  customerId: string;
  /** `?cupon=nuevo` opens the modal on load; after that the state is local. */
  initialGiveOpen: boolean;
}

const LABEL = "font-mono text-2xs font-bold uppercase tracking-wide text-text-muted";

/** The customer's page: what they have bought, their orders, and the way to give them a personal coupon. */
const CustomerDetailPage = ({ customerId, initialGiveOpen }: CustomerDetailPageProps) => {
  const { customer, orders } = useCustomerDetail(customerId);
  const [giveOpen, setGiveOpen] = useState(initialGiveOpen);

  if (customer.status === "error") {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Cliente" />
        <Notice variant="danger" title={customer.gone ? "Cliente no encontrado" : "No se pudo cargar el cliente"}>
          <p>{customer.gone ? "El cliente ya no existe. Puede que el enlace sea viejo." : customer.error}</p>
          {customer.gone ? (
            <Link href="/clientes" className="mt-2 inline-block underline">
              Volver a Clientes
            </Link>
          ) : (
            <Button size="sm" className="mt-2" onClick={customer.refresh}>
              Reintentar
            </Button>
          )}
        </Notice>
      </div>
    );
  }

  const person = customer.data;
  if (!person) {
    return (
      <div className="flex flex-col gap-6" aria-busy="true">
        <PageHeader title="Cliente" />
        <div className="grid gap-5 lg:grid-cols-[340px_1fr]">
          <Skeleton className="h-72 w-full" />
          <Skeleton className="h-72 w-full" />
        </div>
      </div>
    );
  }

  const name = customerFullName(person);

  return (
    <div className="flex flex-col gap-6">
      <BreadcrumbLabel label={name} />
      <PageHeader
        title={name}
        subtitle={person.email}
        actions={
          <Button variant="primary" onClick={() => setGiveOpen(true)}>
            Dar cupón
          </Button>
        }
      />
      <div className="grid items-start gap-5 lg:grid-cols-[340px_1fr]">
        <section className={`${NB_TILE} flex flex-col gap-4 bg-brand-subtle p-5`} aria-label="Cliente">
          <dl className="flex flex-col gap-4">
            <div>
              <dt className={LABEL}>Gasto neto</dt>
              <dd className="font-mono text-3xl font-bold">{formatMxn(person.spentMxn)}</dd>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <dt className={LABEL}>Compras</dt>
                <dd className="font-mono text-xl font-bold">{person.orderCount}</dd>
              </div>
              <div>
                <dt className={LABEL}>Cliente desde</dt>
                <dd className="font-mono text-base font-bold">{formatShortDate(new Date(person.createdAt))}</dd>
              </div>
            </div>
            <div>
              <dt className={LABEL}>Correo verificado</dt>
              <dd className="font-bold">{person.emailVerified ? "Sí" : "No"}</dd>
            </div>
          </dl>
        </section>
        <CustomerOrdersCard state={orders} onRetry={orders.refresh} />
      </div>
      <GiveCouponModal customer={person} open={giveOpen} onClose={() => setGiveOpen(false)} />
    </div>
  );
};

export type { CustomerDetailPageProps };
export { CustomerDetailPage };
