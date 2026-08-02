"use client";

import { BellIcon } from "@phosphor-icons/react/dist/ssr";
import { Icon } from "@/components/ui/Icon";
import { useOutboxHealth } from "@/hooks/useOutboxHealth";

/**
 * An indicator, not a button: M8 has no destination to send the admin to
 * (a notifications screen is M12). A button that does nothing on click is
 * worse than no button — it promises an action that doesn't exist yet.
 * `role="status"` announces the count without needing a click at all.
 */
const NotificationBell = () => {
  const health = useOutboxHealth();
  const count = health ? health.pending + health.failed : 0;
  const label = count > 0 ? `Notificaciones: ${count} pendientes` : "Notificaciones: sin pendientes";

  return (
    <span
      role="status"
      aria-label={label}
      className="relative inline-flex h-[38px] w-[38px] items-center justify-center rounded-nb-sm border-2 border-ink bg-surface shadow-nb-sm"
    >
      <Icon icon={BellIcon} />
      {count > 0 ? (
        <span
          aria-hidden="true"
          className="absolute -right-1.5 -top-1.5 grid h-[18px] min-w-[18px] place-items-center rounded-nb-pill border-[1.5px] border-ink bg-danger px-1 font-mono text-[10px] font-bold leading-none text-text-inverse"
        >
          {count}
        </span>
      ) : null}
    </span>
  );
};

export { NotificationBell };
