"use client";

import { PlusIcon } from "@phosphor-icons/react/dist/ssr";
import { Button, type ButtonVariant } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";

interface NewPrintButtonProps {
  /** The header's is the screen's one primary (yellow) button; any other instance must not be. */
  variant?: ButtonVariant;
  onClick: () => void;
}

const NewPrintButton = ({ variant = "primary", onClick }: NewPrintButtonProps) => (
  <Button variant={variant} onClick={onClick}>
    <Icon icon={PlusIcon} />
    Nueva estampa
  </Button>
);

export type { NewPrintButtonProps };
export { NewPrintButton };
