import type { FooterColumnData } from "@/lib/store/footerLinks";
import type { SocialNetwork } from "@/lib/store/socialLinks";
import { FooterAccordion } from "./FooterAccordion";
import { FooterColumn } from "./FooterColumn";
import { FooterSocial } from "./FooterSocial";
import { FooterWordmark } from "./FooterWordmark";

interface SiteFooterViewProps {
  columns: FooterColumnData[];
  networks: SocialNetwork[];
  year: number;
}

/**
 * Store footer, after Esencia's: verde bosque, its top cut with the lomas
 * (next in the cycle after the events' festón). Desktop: GIRA across the
 * width, four open columns, then a last row with the credits and the
 * networks. Phone: accordion, networks, GIRA and the credits; the order
 * changes with `order`, and the last row uses `contents` so its children sort
 * inside the footer itself. No newsletter field (decision of 2026-10-26).
 */
const SiteFooterView = ({ columns, networks, year }: SiteFooterViewProps) => (
  <footer className="store-footer store-cut store-cut-lomas flex flex-col">
    <div className="order-3 mx-auto w-full max-w-[96rem] px-4 pb-6 pt-8 md:px-8 lg:order-1 lg:pb-0 lg:pt-20">
      <FooterWordmark />
    </div>

    <div className="order-1 pt-10 lg:order-2 lg:pt-0">
      <FooterAccordion columns={columns} />
      <div className="mx-auto hidden max-w-[96rem] grid-cols-4 gap-x-8 px-8 py-14 lg:grid">
        {columns.map((column) => (
          <FooterColumn key={column.title} column={column} />
        ))}
      </div>
    </div>

    <div className="footer-rule contents lg:order-3 lg:block lg:border-t-2">
      <div className="contents lg:mx-auto lg:flex lg:max-w-[96rem] lg:items-center lg:justify-between lg:gap-12 lg:px-8 lg:py-8">
        <div className="order-4 px-4 pb-10 text-sm text-text-inverse lg:order-none lg:p-0">
          <p>© {year} Gira Clothing</p>
          <p className="mt-1">Desarrollado por Vidix Studio</p>
        </div>
        <div className="order-2 px-4 pt-8 lg:order-none lg:p-0">
          <FooterSocial networks={networks} />
        </div>
      </div>
    </div>
  </footer>
);

export type { SiteFooterViewProps };
export { SiteFooterView };
