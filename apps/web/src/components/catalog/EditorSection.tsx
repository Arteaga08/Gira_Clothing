import type { ReactNode } from "react";
import { NB_SURFACE } from "@/components/ui/styles";
import { T_PANEL_HINT, T_PANEL_TITLE } from "@/components/ui/typography";
import { cn } from "@/lib/cn";

interface EditorSectionProps {
  title: string;
  hint?: string;
  /** Top-right slot: a counter, a link. */
  aside?: ReactNode;
  children: ReactNode;
}

/** One island of the editor. Islands never nest (DESIGN.md), so the sections are siblings. */
const EditorSection = ({ title, hint, aside, children }: EditorSectionProps) => (
  <section aria-label={title} className={cn(NB_SURFACE, "flex flex-col gap-4 p-6")}>
    <div className="flex items-start justify-between gap-3">
      <div>
        <h2 className={T_PANEL_TITLE}>{title}</h2>
        {hint ? <p className={T_PANEL_HINT}>{hint}</p> : null}
      </div>
      {aside}
    </div>
    {children}
  </section>
);

export type { EditorSectionProps };
export { EditorSection };
