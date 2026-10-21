"use client";

import { PlusIcon } from "@phosphor-icons/react/dist/ssr";
import { Button, type ButtonVariant } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";

interface NewCouponButtonProps {
  /** The header's is the screen's one primary (yellow) button; any other instance must not be. */
  variant?: ButtonVariant;
  onClick: () => void;
}

const NewCouponButton = ({ variant = "primary", onClick }: NewCouponButtonProps) => (
  <Button variant={variant} onClick={onClick}>
    <Icon icon={PlusIcon} />
    Nuevo cupón
  </Button>
);

export type { NewCouponButtonProps };
export { NewCouponButton };
