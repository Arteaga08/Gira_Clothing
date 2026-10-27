import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SavedError } from "@/components/store/wishlist/SavedError";
import { SavedGrid } from "@/components/store/wishlist/SavedGrid";
import { loadSession } from "@/lib/api/session";
import { getSavedItems } from "@/lib/api/wishlistServer";
import { STORE_ROUTES } from "@/lib/store/routes";

const metadata: Metadata = { title: "Guardados", robots: { index: false, follow: false } };

/**
 * «Guardados» (wishlist): the saved prints of the signed-in customer with their
 * live price and stock notice. Account area, so no indexing; a visitor goes to
 * the login. Three states: with items, empty, and load error with retry.
 */
const SavedPage = async () => {
  const session = await loadSession();
  if (session.kind === "anonymous") redirect(STORE_ROUTES.login);
  const saved = session.kind === "authenticated" ? await getSavedItems() : ({ status: "error" } as const);

  return (
    <div className="mx-auto w-full max-w-[96rem] px-4 pb-14 pt-6 md:px-8">
      <h1 className="mb-5 font-display text-4xl uppercase leading-none text-text-inverse">Guardados</h1>
      {saved.status === "ok" ? <SavedGrid initialItems={saved.items} /> : <SavedError />}
    </div>
  );
};

export { metadata };
export default SavedPage;
