import type { ReactNode } from "react";

/**
 * Layout for `/login` and any future unauthenticated screen — a centred
 * card, no shell (sidebar/topbar belong to `(admin)` only). Owns the
 * `main-content` id the root layout's skip link points to; the root layout
 * no longer wraps children in a div of its own (M7, Tarea 2), so each route
 * group provides it.
 */
const AuthLayout = ({ children }: { children: ReactNode }) => {
  return (
    <main id="main-content" className="flex min-h-dvh items-center justify-center p-4">
      <div className="w-full max-w-sm">{children}</div>
    </main>
  );
};

export default AuthLayout;
