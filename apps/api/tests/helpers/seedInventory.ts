import { Print } from "../../src/models/Print.js";
import { PrintFamily } from "../../src/models/PrintFamily.js";
import { Product } from "../../src/models/Product.js";
import { ProductCategory } from "../../src/models/ProductCategory.js";
import { Variant } from "../../src/models/Variant.js";

const image = {
  url: "https://res.cloudinary.com/gira/image/upload/v1/prints/x.jpg",
  publicId: "gira/prints/x",
  width: 800,
  height: 600,
};

interface SeedVariantInput {
  /** Unique suffix; every name/slug/sku derives from it. */
  tag: string;
  categoryTag?: string;
  onHand?: number;
  reserved?: number;
  isActive?: boolean;
  productName?: string;
  printName?: string;
}

interface SeededVariant {
  id: string;
  sku: string;
  productId: string;
  printId: string;
  categoryId: string;
}

/** Creates category + product + family + print + variant straight through the models. */
const seedVariant = async (input: SeedVariantInput): Promise<SeededVariant> => {
  const { tag, categoryTag = tag } = input;
  const category =
    (await ProductCategory.findOne({ slug: `cat-${categoryTag}` })) ??
    (await ProductCategory.create({ name: `Categoría ${categoryTag}`, slug: `cat-${categoryTag}` }));
  const family = await PrintFamily.create({ name: `Familia ${tag}`, slug: `fam-${tag}` });
  const print = await Print.create({
    name: input.printName ?? `Print ${tag}`,
    slug: `print-${tag}`,
    sku: `P-${tag}`,
    family: family._id,
    image,
  });
  const product = await Product.create({
    name: input.productName ?? `Modelo ${tag}`,
    slug: `modelo-${tag}`,
    category: category._id,
    basePrice: 30000,
    weightGrams: 400,
  });
  const variant = await Variant.create({
    product: product._id,
    print: print._id,
    sku: `SKU-${tag}`.toUpperCase(),
    onHand: input.onHand ?? 0,
    reserved: input.reserved ?? 0,
    isActive: input.isActive ?? true,
  });
  return {
    id: String(variant._id),
    sku: variant.sku,
    productId: String(product._id),
    printId: String(print._id),
    categoryId: String(category._id),
  };
};

export type { SeedVariantInput, SeededVariant };
export { seedVariant };
