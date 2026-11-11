import type { ReactNode } from "react";
import { T_PAGE_SUBTITLE, T_STORE_TITLE } from "@/components/ui/typography";

/** Width and title block shared by the cart, checkout and order pages: the title sits on the wallpaper, the pass below it. */
const StorePage = ({ title, lead, children }: { title: string; lead?: string; children: ReactNode }) => (
  <div className="mx-auto w-full max-w-[72rem] px-4 pb-14 pt-6 md:px-8">
    <header className="mb-5">
      <h1 className={T_STORE_TITLE}>{title}</h1>
      {lead ? <p className={T_PAGE_SUBTITLE}>{lead}</p> : null}
    </header>
    {children}
  </div>
);

export { StorePage };
