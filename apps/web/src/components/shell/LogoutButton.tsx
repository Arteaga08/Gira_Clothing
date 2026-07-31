"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { logout } from "@/lib/api/auth";

/**
 * Always ends up at `/login`, even when the session was already gone by the
 * time this runs — `logout()` swallows a 401 for exactly that reason. From
 * the admin's point of view, "log out" never fails.
 */
const LogoutButton = () => {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  const handleClick = async () => {
    setPending(true);
    await logout();
    router.replace("/login");
    router.refresh();
  };

  return (
    <Button variant="secondary" size="sm" loading={pending} onClick={() => void handleClick()}>
      Cerrar sesión
    </Button>
  );
};

export { LogoutButton };
