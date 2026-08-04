import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { T_PAGE_SUBTITLE, T_PAGE_TITLE } from "./typography";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  className?: string;
}

/**
 * The single <h1> of the page — the only place this app ever writes one.
 * resumen/loading.tsx and login/page.tsx used to each hand-roll their own
 * h1 string; both now render this component instead.
 */
const PageHeader = ({ title, subtitle, actions, className }: PageHeaderProps) => (
  <div className={cn("flex flex-wrap items-start justify-between gap-4", className)}>
    <div>
      <h1 className={T_PAGE_TITLE}>{title}</h1>
      {subtitle ? <p className={T_PAGE_SUBTITLE}>{subtitle}</p> : null}
    </div>
    {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
  </div>
);

export type { PageHeaderProps };
export { PageHeader };
