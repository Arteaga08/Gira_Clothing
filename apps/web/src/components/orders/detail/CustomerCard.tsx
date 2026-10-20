
import { T_PANEL_TITLE } from "@/components/ui/typography";
import type { PanelOrder } from "@/lib/orders/panelOrder";

/** Customer contact as frozen on the order (a guest checkout has no account to link to). */
const CustomerCard = ({ customer }: { customer: PanelOrder["customer"] }) => (
  <section aria-labelledby="customer-title">
    <h3 id="customer-title" className={T_PANEL_TITLE}>
      Cliente
    </h3>
    <p className="mt-3 text-sm leading-relaxed">
      <strong>{customer.name}</strong>
      <br />
      <a href={`mailto:${customer.email}`} className="underline">
        {customer.email}
      </a>
      {customer.phone ? (
        <>
          <br />
          <span className="font-mono text-xs">tel. {customer.phone}</span>
        </>
      ) : null}
    </p>
  </section>
);

export { CustomerCard };
