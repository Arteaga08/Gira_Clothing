import Link from "next/link";
import type { FooterColumnData } from "@/lib/store/footerLinks";

interface FooterColumnProps {
  column: FooterColumnData;
}

/** One open column of links (desktop): title in Anton, links in the text face. */
const FooterColumn = ({ column }: FooterColumnProps) => (
  <nav aria-label={column.title}>
    <h3 className="font-display text-3xl uppercase leading-none text-text-inverse">{column.title}</h3>
    <ul className="mt-4 flex flex-col">
      {column.links.map((link) => (
        <li key={link.href}>
          <Link href={link.href} className="footer-link inline-flex min-h-10 items-center text-base">
            {link.label}
          </Link>
        </li>
      ))}
    </ul>
  </nav>
);

export type { FooterColumnProps };
export { FooterColumn };
