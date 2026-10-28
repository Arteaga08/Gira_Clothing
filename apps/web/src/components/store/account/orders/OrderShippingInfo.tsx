import type { CustomerOrder, Wire } from "@gira/shared";
import { buttonClassName } from "@/components/ui/Button";
import { T_PANEL_TITLE } from "@/components/ui/typography";
import { carrierServiceLabel } from "@/lib/orders/shipping";

/** The API's tracking link goes into an `href`: only a real web address is ever rendered as one. */
const isWebUrl = (value: string | undefined): value is string => value !== undefined && /^https?:\/\//i.test(value);

/** «Envío a» of an order: the address it goes to, how it travels and, once shipped, the guide and tracking link. */
const OrderShippingInfo = ({ order }: { order: Wire<CustomerOrder> }) => {
  const { shipping, shippingSelection, shipment } = order;
  const street = shipping.line2 ? `${shipping.line1}, ${shipping.line2}` : shipping.line1;

  return (
    <section aria-labelledby="order-shipping-title">
      <h2 id="order-shipping-title" className={`${T_PANEL_TITLE} mb-3 text-2xl`}>
        Envío a
      </h2>
      <address className="grid gap-0.5 text-sm not-italic">
        <b>{shipping.recipient}</b>
        <span>{street}</span>
        <span>{`${shipping.district}, ${shipping.city}, ${shipping.state}, C.P. ${shipping.postalCode}`}</span>
      </address>
      {shippingSelection ? (
        <p className="mt-3 text-sm text-text-secondary">{carrierServiceLabel(shippingSelection.carrier, shippingSelection.serviceName)}</p>
      ) : null}
      {shipment ? (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <span className="font-mono text-sm font-bold">{`Guía ${shipment.trackingNumber}`}</span>
          {isWebUrl(shipment.trackUrl) ? (
            <a href={shipment.trackUrl} target="_blank" rel="noopener noreferrer" className={buttonClassName("edit", "sm")}>
              Rastrear paquete
            </a>
          ) : null}
        </div>
      ) : null}
    </section>
  );
};

export { OrderShippingInfo };
