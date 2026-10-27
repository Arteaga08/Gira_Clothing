import type { ReactNode } from "react";

/**
 * Frame of the access pages (login, signup, verify, forgot, reset): a centred column wide
 * enough for the ticket. They inherit `noindex` from the root layout until M17.
 */
const AccessLayout = ({ children }: { children: ReactNode }) => (
  <div className="mx-auto flex min-h-[70dvh] w-full max-w-[1040px] items-center px-4 py-10 md:px-6 md:py-20">
    <div className="w-full">{children}</div>
  </div>
);

export default AccessLayout;
