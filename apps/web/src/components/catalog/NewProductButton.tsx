"use client";

import { PlusIcon } from "@phosphor-icons/react/dist/ssr";
import { useRouter } from "next/navigation";
import { Button, type ButtonVariant } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";

interface NewProductButtonProps {
  /** The header's is the screen's one primary (yellow) button; any other instance must not be. */
  variant?: ButtonVariant;
}

const NewProductButton = ({ variant = "primary" }: NewProductButtonProps) => {
  const router = useRouter();
  return (
    <Button variant={variant} onClick={() => router.push("/productos/nuevo")}>
      <Icon icon={PlusIcon} />
      Nuevo producto
    </Button>
  );
};

export type { NewProductButtonProps };
export { NewProductButton };
