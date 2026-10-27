import Link from "next/link";
import { buttonClassName } from "@/components/ui/Button";

interface AuthSwitchProps {
  text: string;
  label: string;
  href: string;
}

/** The line at the foot of a ticket that sends the visitor to the other access page. */
const AuthSwitch = ({ text, label, href }: AuthSwitchProps) => (
  <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t-2 border-dashed border-ink pt-5">
    <span className="text-sm text-text-secondary">{text}</span>
    <Link href={href} className={buttonClassName("edit", "sm")}>
      {label}
    </Link>
  </div>
);

export { AuthSwitch };
