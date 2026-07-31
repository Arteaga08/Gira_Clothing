import type { Icon as PhosphorIcon } from "@phosphor-icons/react";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "./Icon";
import { NB_PRESSABLE } from "./styles";

type IconButtonSize = "sm" | "md";

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: PhosphorIcon;
  /**
   * Required, not optional: an icon-only button with no accessible name is
   * invisible to a screen reader. This is the reason IconButton exists as its
   * own component instead of `<Button><Icon .../></Button>`.
   */
  label: string;
  size?: IconButtonSize;
}

const SIZE_CLASSES: Record<IconButtonSize, string> = {
  sm: "h-8 w-8",
  md: "h-[38px] w-[38px]",
};

const IconButton = ({ icon, label, size = "md", className, type = "button", ...rest }: IconButtonProps) => {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex items-center justify-center rounded-nb-sm border-2 border-ink bg-surface shadow-nb-sm",
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none",
        NB_PRESSABLE,
        SIZE_CLASSES[size],
        className,
      )}
      {...rest}
    >
      <Icon icon={icon} />
    </button>
  );
};

export type { IconButtonProps };
export { IconButton };
