import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type NoticeVariant = "info" | "warning" | "danger";

interface NoticeProps {
  variant?: NoticeVariant;
  title: string;
  children: ReactNode;
  className?: string;
}

const VARIANT_CLASSES: Record<NoticeVariant, string> = {
  info: "bg-[var(--status-pending_payment)]",
  warning: "bg-[var(--color-warning)]",
  danger: "bg-danger-soft",
};

const Notice = ({ variant = "info", title, children, className }: NoticeProps) => (
  <div
    role={variant === "danger" ? "alert" : "status"}
    className={cn(
      "flex gap-3 rounded-nb-sm border-2 border-ink p-3 text-xs leading-relaxed",
      VARIANT_CLASSES[variant],
      className,
    )}
  >
    <div>
      <strong className="block text-sm">{title}</strong>
      {children}
    </div>
  </div>
);

export type { NoticeProps, NoticeVariant };
export { Notice };
