import type { Metadata } from "next";
import type { ReactNode } from "react";
import { fontVariables } from "./fonts";
import "./globals.css";

const metadata: Metadata = {
  title: { default: "Panel · Gira Clothing", template: "%s · Gira Clothing" },
  description: "Panel administrativo de Gira Clothing.",
  // Un panel admin no se indexa.
  robots: { index: false, follow: false },
};

const RootLayout = ({ children }: { children: ReactNode }) => {
  return (
    <html lang="es" className={fontVariables}>
      <body>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:bg-surface focus:border-2 focus:border-ink focus:rounded-nb-sm focus:px-4 focus:py-2 focus:font-bold"
        >
          Saltar al contenido principal
        </a>
        <div id="main-content">{children}</div>
      </body>
    </html>
  );
};

export { metadata };
export default RootLayout;
