import type { Icon as PhosphorIcon } from "@phosphor-icons/react";

interface IconProps {
  /**
   * The icon component itself, imported by the call site from
   * "@phosphor-icons/react/dist/ssr" — never the package root, which carries
   * "use client" and pulls the full icon barrel into the client bundle.
   */
  icon: PhosphorIcon;
  size?: number;
  className?: string;
}

/**
 * Weight "bold" is fixed here, structurally: the regular weight thins out and
 * disappears next to the 2px ink border used everywhere else in this kit.
 * No call site can forget it — there is no `weight` prop to override it with.
 */
const Icon = ({ icon: PhosphorIconComponent, size = 16, className }: IconProps) => {
  return <PhosphorIconComponent weight="bold" size={size} className={className} aria-hidden="true" />;
};

export type { IconProps };
export { Icon };
