import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { NB_SURFACE } from "./styles";

interface PanelProps {
  title: string;
  hint?: string;
  actions?: ReactNode;
  /** Removes the body padding — used when the content is a table that should bleed to the edges. */
  flush?: boolean;
  className?: string | undefined;
  children: ReactNode;
}

const Panel = ({ title, hint, actions, flush = false, className, children }: PanelProps) => {
  return (
    <section className={cn(NB_SURFACE, "overflow-hidden", className)}>
      <header className="flex items-center justify-between gap-3 border-b-2 border-ink px-4 py-3">
        <div>
          <h2 className="text-sm font-bold">{title}</h2>
          {hint ? <p className="text-xs text-text-secondary">{hint}</p> : null}
        </div>
        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
      </header>
      <div className={flush ? "" : "p-4"}>{children}</div>
    </section>
  );
};

export type { PanelProps };
export { Panel };
