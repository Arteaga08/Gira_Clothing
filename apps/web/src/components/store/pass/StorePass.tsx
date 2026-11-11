import type { ReactNode } from "react";

type PassTone = "lilac" | "mint";

interface StorePassProps {
  /** Left side: what the person is working on. */
  children: ReactNode;
  /** Right side: the summary and the one action. */
  stub: ReactNode;
  tone?: PassTone;
  seal?: string;
}

/**
 * The «pase de gira» ticket as the frame of cart, checkout and order: content on the left, a stub on
 * the right with the summary and the action. The barcode is only decoration, never a number.
 */
const StorePass = ({ children, stub, tone = "lilac", seal = "Admite una" }: StorePassProps) => (
  <div className="store-pass">
    <div className="store-pass-main">{children}</div>
    <aside className="store-pass-stub" data-tone={tone}>
      <div className="store-pass-stub-inner">
        <span className="store-pass-seal">{seal}</span>
        {stub}
        <span className="store-pass-bars" aria-hidden="true" />
      </div>
    </aside>
  </div>
);

export type { PassTone };
export { StorePass };
