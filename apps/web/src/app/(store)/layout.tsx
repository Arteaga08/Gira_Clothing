import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AnnouncementBar } from "@/components/store/navbar/AnnouncementBar";
import { SiteHeader } from "@/components/store/navbar/SiteHeader";
import { getAnnouncement } from "@/lib/api/storefront";
import { loadSession } from "@/lib/api/session";
import "@/styles/store-skin.css";

// Robots stay inherited (noindex) from the root layout until the store is real: M17 opens indexing.
const metadata: Metadata = {
  title: { default: "Gira Clothing", template: "%s · Gira Clothing" },
  description: "Ropa con estampas para llevar a todos lados.",
};

/**
 * Shell of the public store: announcement marquee, sticky navbar, content.
 * The session is read only to label the account link; an unreachable API
 * degrades to the visitor view and never blocks the storefront.
 */
const StoreLayout = async ({ children }: { children: ReactNode }) => {
  const [announcement, session] = await Promise.all([getAnnouncement(), loadSession()]);

  return (
    <div className="store-skin min-h-dvh">
      <AnnouncementBar announcement={announcement} />
      <SiteHeader authenticated={session.kind === "authenticated"} />
      <main id="main-content">{children}</main>
    </div>
  );
};

export { metadata };
export default StoreLayout;
