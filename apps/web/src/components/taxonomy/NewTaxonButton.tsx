"use client";

import { PlusIcon } from "@phosphor-icons/react/dist/ssr";
import { Button, type ButtonVariant } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";

interface NewTaxonButtonProps {
  label: string;
  /** The header's is the screen's one primary (yellow) button; any other instance must not be. */
  variant?: ButtonVariant;
  onClick: () => void;
}

const NewTaxonButton = ({ label, variant = "primary", onClick }: NewTaxonButtonProps) => (
  <Button variant={variant} onClick={onClick}>
    <Icon icon={PlusIcon} />
    {label}
  </Button>
);

export type { NewTaxonButtonProps };
export { NewTaxonButton };
