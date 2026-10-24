"use client";

import { List, X } from "@phosphor-icons/react/dist/ssr";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useId, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { STORE_ROUTES } from "@/lib/store/routes";
import { NAV_PILL, NAV_PILL_TONES } from "./navPill";
import { AccountLink } from "./AccountLink";
import { NavLink } from "./NavLink";

interface MobileMenuProps {
  authenticated: boolean;
}

const DESKTOP_QUERY = "(min-width: 48rem)";

/**
 * The navbar below `md`: a disclosure button plus the panel it opens under the
 * bar. `aria-expanded`/`aria-controls`, Escape closes, focus stays inside the
 * button+panel while open and returns to the button on close, the page does
 * not scroll behind it, and it closes by itself on navigation or when the
 * viewport grows to desktop.
 */
const MobileMenu = ({ authenticated }: MobileMenuProps) => {
  const panelId = useId();
  const pathname = usePathname();
  // The menu is open only on the page where it was opened: any navigation closes it, no effect needed.
  const [openedOn, setOpenedOn] = useState<string | null>(null);
  const open = openedOn === pathname;
  const containerRef = useFocusTrap<HTMLDivElement>(open);
  const close = useCallback(() => setOpenedOn(null), []);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    const media = window.matchMedia(DESKTOP_QUERY);
    const onChange = (event: MediaQueryListEvent) => {
      if (event.matches) close();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    document.addEventListener("keydown", onKeyDown);
    media.addEventListener("change", onChange);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      media.removeEventListener("change", onChange);
    };
  }, [open, close]);

  return (
    <div ref={containerRef} className="md:hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={open ? "Cerrar menú" : "Abrir menú"}
        onClick={() => setOpenedOn(open ? null : pathname)}
        className={`${NAV_PILL} ${NAV_PILL_TONES.lila} size-11`}
      >
        <Icon icon={open ? X : List} size={22} />
      </button>
      <nav
        id={panelId}
        aria-label="Menú móvil"
        hidden={!open}
        className="absolute inset-x-0 top-full flex h-[calc(100dvh-100%)] flex-col items-start gap-3 bg-[var(--store-nav-panel-bg)] px-4 py-6"
      >
        <NavLink href={STORE_ROUTES.shop} onNavigate={close}>
          Tienda
        </NavLink>
        <AccountLink authenticated={authenticated} onNavigate={close} />
      </nav>
    </div>
  );
};

export type { MobileMenuProps };
export { MobileMenu };
