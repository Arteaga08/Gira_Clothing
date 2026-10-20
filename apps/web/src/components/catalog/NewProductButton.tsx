import { PlusIcon } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { buttonClassName, type ButtonVariant } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";

interface NewProductButtonProps {
  /** The header's is the screen's one primary (yellow) button; any other instance must not be. */
  variant?: ButtonVariant;
}

const NewProductButton = ({ variant = "primary" }: NewProductButtonProps) => (
  <Link href="/productos/nuevo" className={buttonClassName(variant)}>
    <Icon icon={PlusIcon} />
    Nuevo producto
  </Link>
);

export type { NewProductButtonProps };
export { NewProductButton };
