import { notFound } from "next/navigation";
import KitContent from "./KitContent";

/**
 * Route gate for the design-system kitchen sink — deliberately a Server
 * Component with no state, so `notFound()` runs during the server render
 * pass, not inside a "use client" tree (which breaks Next's client-reference
 * manifest at build time when the whole page component always throws).
 * The actual interactive content lives in KitContent.tsx.
 *
 * Deleted at the close of M12, alongside mockups/. Not a panel screen;
 * consumes no API.
 */
const KitPage = () => {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  return <KitContent />;
};

export default KitPage;
