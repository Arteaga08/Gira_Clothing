import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CatalogSuggestions } from "@/components/store/catalog/CatalogSuggestions";
import { ProductDimensions } from "@/components/store/product/ProductDimensions";
import { ProductMaterials } from "@/components/store/product/ProductMaterials";
import { ProductView } from "@/components/store/product/ProductView";
import { loadSession } from "@/lib/api/session";
import { getProduct } from "@/lib/api/storefront";
import { categoryRoute, STORE_ROUTES } from "@/lib/store/routes";

interface ProductPageProps {
  params: Promise<{ slug: string }>;
}

const generateMetadata = async ({ params }: ProductPageProps): Promise<Metadata> => {
  const product = await getProduct((await params).slug);
  return product ? { title: product.name, ...(product.description ? { description: product.description } : {}) } : { title: "Producto no encontrado" };
};

/**
 * Product page (M14b): the framed «Lata» panel with the prints of the model,
 * then Materiales and Dimensiones when the product has them, then the
 * «Te va a gustar» suggestions. A slug that does
 * not exist (or a retired product) is a 404.
 */
const ProductPage = async ({ params }: ProductPageProps) => {
  const [product, session] = await Promise.all([getProduct((await params).slug), loadSession()]);
  if (!product) notFound();

  return (
    <>
      <div className="mx-auto w-full max-w-[96rem] px-4 pb-10 pt-4 md:px-8 md:pb-14">
        <nav aria-label="Ruta" className="mb-4 font-mono text-xs font-bold uppercase text-text-inverse-secondary">
          <a href={STORE_ROUTES.shop}>Tienda</a> / <a href={categoryRoute(product.category.slug)}>{product.category.name}</a> / {product.name}
        </nav>
        <ProductView product={product} authenticated={session.kind === "authenticated"} />
      </div>
      {product.materials.length > 0 ? <ProductMaterials materials={product.materials} /> : null}
      {product.sizeImage ? <ProductDimensions image={product.sizeImage} color={product.category.color} productName={product.name} /> : null}
      {/* The suggestions band carries a top margin made for the catalog; here it cuts straight into the band above. */}
      <div className="[&>section]:mt-0!">
        <CatalogSuggestions shownSlugs={[product.slug]} authenticated={session.kind === "authenticated"} />
      </div>
    </>
  );
};

export { generateMetadata };
export default ProductPage;
