import type { PublicStorefrontHero } from "@gira/shared";
import { getHero } from "@/lib/api/storefront";

/** The picture on the stub of an access-page ticket: the first photo of the home hero. */
interface AuthPhoto {
  url: string;
  width: number;
  height: number;
}

const firstHeroPhoto = (hero: PublicStorefrontHero): AuthPhoto | null => {
  const image = hero.slides[0]?.image;
  return image ? { url: image.url, width: image.width, height: image.height } : null;
};

/** `getHero` never throws (it collapses to "no photos"), so a down API just gives the ticket its flat colour. */
const getAuthPhoto = async (): Promise<AuthPhoto | null> => firstHeroPhoto(await getHero());

export type { AuthPhoto };
export { firstHeroPhoto, getAuthPhoto };
