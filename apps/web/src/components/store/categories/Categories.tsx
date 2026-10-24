import { getCategories } from "@/lib/api/storefront";
import { CategoriesReveal } from "./CategoriesReveal";
import { CategoryTile } from "./CategoryTile";

/**
 * «Categorías» of the home (M13 section 4): one poster per active category,
 * A-Z as the API lists them. Read-only here; the photo and colour are edited
 * in the Categorías screen of the panel. No categories, no section.
 */
const Categories = async () => {
  const categories = await getCategories();
  if (categories.length === 0) return null;
  return (
    <CategoriesReveal titleId="categories-title" title="Categorías">
      <ul className="grid grid-cols-2 gap-x-4 gap-y-6 px-4 md:grid-cols-4 md:gap-6 md:px-8">
        {categories.map((category, index) => (
          <CategoryTile key={category.id} category={category} index={index} />
        ))}
      </ul>
    </CategoriesReveal>
  );
};

export { Categories };
