import type { Metadata } from "next";
import type { CSSProperties, ReactNode } from "react";
import { CartMergeNotice } from "@/components/store/cart/CartMergeNotice";
import { SiteFooter } from "@/components/store/footer/SiteFooter";
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
 * Shell of the public store: announcement marquee, sticky navbar, content, footer.
 * The session is read only to label the account link; an unreachable API
 * degrades to the visitor view and never blocks the storefront.
 */
const StoreLayout = async ({ children }: { children: ReactNode }) => {
  const [announcement, session] = await Promise.all([getAnnouncement(), loadSession()]);

  return (
    <div
      className="store-skin min-h-dvh"
      style={announcement.enabled && announcement.messages.length > 0 ? undefined : ({ "--store-marquee-block": "0px" } as CSSProperties)}
    >
      <AnnouncementBar announcement={announcement} />
      <SiteHeader authenticated={session.kind === "authenticated"} />
      <CartMergeNotice />
      <main id="main-content">{children}</main>
      <SiteFooter />
    </div>
  );
};

export { metadata };
export default StoreLayout;
