"use client";

import { ListIcon, MagnifyingGlassIcon } from "@phosphor-icons/react/dist/ssr";
import { Icon } from "@/components/ui/Icon";
import { IconButton } from "@/components/ui/IconButton";
import { useCommandPalette } from "./CommandPaletteProvider";
import { useMobileNav } from "./MobileNavProvider";
import { NotificationBell } from "./NotificationBell";
import { RefreshButton } from "./RefreshButton";

/**
 * No greeting, no "today's date" here on purpose: a date rendered in a
 * shell that wraps every screen is a guaranteed server/client hydration
 * mismatch across timezones. The one screen that's actually about "today"
 * (Resumen, M8) renders its own, once, server-side.
 */
const TopBar = () => {
  const { open, openNav } = useMobileNav();
  const { openPalette } = useCommandPalette();

  return (
    <header className="sticky top-0 z-(--z-topbar) flex min-h-(--topbar-height) items-center gap-3 border-b-2 border-ink bg-wallpaper px-4 lg:px-6">
      <IconButton
        icon={ListIcon}
        label="Abrir navegación"
        aria-controls="sidebar"
        aria-expanded={open}
        className="lg:hidden"
        onClick={openNav}
      />
      <div className="ml-auto flex items-center gap-2">
        <RefreshButton />
        <NotificationBell />
        <button
          type="button"
          onClick={openPalette}
          className="flex items-center gap-2 rounded-nb-sm border-2 border-ink bg-surface px-3 py-1.5 text-xs font-bold shadow-nb-sm"
        >
          <Icon icon={MagnifyingGlassIcon} size={14} />
          Buscar
          <kbd className="rounded-nb-sm border border-ink bg-surface-sunken px-1.5 py-0.5 font-mono text-[10px]">
            ⌘K
          </kbd>
        </button>
      </div>
    </header>
  );
};

export { TopBar };
