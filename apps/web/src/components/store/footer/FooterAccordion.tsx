import { Minus, Plus } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import type { FooterColumnData } from "@/lib/store/footerLinks";

interface FooterAccordionProps {
  columns: FooterColumnData[];
}

/**
 * The columns on a phone as a native accordion (`<details>`): no script,
 * keyboard and screen reader support out of the box. Hidden from lg, where
 * the open columns take over.
 */
const FooterAccordion = ({ columns }: FooterAccordionProps) => (
  <div className="footer-rule border-t-2 lg:hidden">
    {columns.map((column) => (
      <details key={column.title} className="footer-rule group border-b-2">
        <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between px-4 font-display text-3xl uppercase leading-none text-text-inverse focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus [&::-webkit-details-marker]:hidden">
          {column.title}
          <Plus aria-hidden="true" weight="bold" className="size-6 group-open:hidden" />
          <Minus aria-hidden="true" weight="bold" className="hidden size-6 group-open:block" />
        </summary>
        <ul className="flex flex-col px-4 pb-4">
          {column.links.map((link) => (
            <li key={link.href}>
              <Link href={link.href} className="footer-link inline-flex min-h-11 items-center text-base">
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </details>
    ))}
  </div>
);

export type { FooterAccordionProps };
export { FooterAccordion };
