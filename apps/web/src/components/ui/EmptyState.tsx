import type { Icon as PhosphorIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "./Icon";

interface EmptyStateProps {
  icon: PhosphorIcon;
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
}

const EmptyState = ({ icon, title, description, action, className }: EmptyStateProps) => (
  <div className={cn("grid justify-items-center gap-3 px-4 py-10 text-center", className)}>
    <span className="grid h-12 w-12 place-items-center rounded-nb border-2 border-ink bg-surface-raised shadow-nb-sm">
      <Icon icon={icon} size={22} />
    </span>
    <p className="text-base font-bold">{title}</p>
    <p className="max-w-[40ch] text-sm text-text-secondary">{description}</p>
    {action ? <div className="mt-1">{action}</div> : null}
  </div>
);

export type { EmptyStateProps };
export { EmptyState };
