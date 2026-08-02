"use client";

import { ArrowClockwiseIcon } from "@phosphor-icons/react/dist/ssr";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { IconButton } from "@/components/ui/IconButton";

/** Re-fetches the current route's server data — the closest thing to a "retry" without a dedicated Client Component per section. */
const RefreshButton = () => {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <IconButton
      icon={ArrowClockwiseIcon}
      label="Actualizar datos"
      aria-busy={isPending}
      onClick={() => startTransition(() => router.refresh())}
    />
  );
};

export { RefreshButton };
