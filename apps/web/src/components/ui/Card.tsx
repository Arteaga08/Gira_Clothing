import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { NB_SURFACE } from "./styles";

type CardTag = "div" | "section" | "article";

interface CardProps {
  as?: CardTag;
  className?: string;
  children: ReactNode;
}

const Card = ({ as: Tag = "div", className, children }: CardProps) => {
  return <Tag className={cn(NB_SURFACE, "p-4", className)}>{children}</Tag>;
};

export type { CardProps };
export { Card };
