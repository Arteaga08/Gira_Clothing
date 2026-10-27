import { LockKey, SealCheck, ShieldCheck, Truck } from "@phosphor-icons/react";
import { AccordionRows, type AccordionRow } from "./AccordionRows";
import { CardBrands } from "./CardBrands";

const TEXT = "flex max-w-[62ch] flex-col gap-2 text-sm leading-relaxed text-text-secondary";

/**
 * Purchase guarantees under the cart button. They are the same for every
 * product, so the copy lives here and not in each product's own content.
 */
const ASSURANCES: AccordionRow[] = [
  {
    key: "payments",
    label: "Pagos 100% seguros",
    icon: LockKey,
    content: (
      <div className={TEXT}>
        <p>Paga con tarjeta de crédito o débito.</p>
        <p>El cobro lo procesa Stripe: los datos de tu tarjeta viajan cifrados y nunca se guardan en nuestra tienda.</p>
        <CardBrands />
      </div>
    ),
  },
  {
    key: "shipping",
    label: "Envíos a todo México",
    icon: Truck,
    content: (
      <div className={TEXT}>
        <p>Al pagar ves el costo y los días de entrega según tu código postal.</p>
        <p>Cuando tu pedido sale, te mandamos por correo la guía para rastrearlo.</p>
      </div>
    ),
  },
  {
    key: "quality",
    label: "Garantía de calidad",
    icon: ShieldCheck,
    content: (
      <div className={TEXT}>
        <p>Revisamos cada pedido antes de enviarlo.</p>
        <p>Si tu prenda llega dañada o no es la que pediste, escríbenos y lo resolvemos contigo.</p>
      </div>
    ),
  },
  {
    key: "own",
    label: "Diseños propios de Gira",
    icon: SealCheck,
    content: (
      <div className={TEXT}>
        <p>Cada estampa es diseño de la marca.</p>
      </div>
    ),
  },
];

const PurchaseAssurances = () => <AccordionRows rows={ASSURANCES} />;

export { PurchaseAssurances };
