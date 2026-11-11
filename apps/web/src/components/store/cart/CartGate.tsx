"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { buttonClassName } from "@/components/ui/Button";
import { T_PASS_SECTION } from "@/components/ui/typography";
import { STORE_ROUTES, withRedirect } from "@/lib/store/routes";

/**
 * The visitor's door to the checkout: buying needs an account (so the order can be followed), and both
 * links carry `?redirect=/checkout` so they come back here. It replaces the «Continuar al pago» button in
 * place, so it takes focus on its heading.
 */
const CartGate = () => {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => headingRef.current?.focus(), []);

  return (
    <section aria-labelledby="cart-gate-title" className="grid gap-3">
      <h2 id="cart-gate-title" ref={headingRef} tabIndex={-1} className={`${T_PASS_SECTION} outline-none`}>
        Entra para pagar
      </h2>
      <p className="text-sm text-text-secondary">Tu carrito se guarda en tu cuenta. Compras solo con cuenta, para que puedas seguir tu pedido.</p>
      <Link href={withRedirect(STORE_ROUTES.login, STORE_ROUTES.checkout)} className={buttonClassName("primary", "md", "w-full")}>
        Iniciar sesión
      </Link>
      <Link href={withRedirect(STORE_ROUTES.register, STORE_ROUTES.checkout)} className={buttonClassName("edit", "md", "w-full")}>
        Crear cuenta
      </Link>
    </section>
  );
};

export { CartGate };
