import { describe, it, expect } from "vitest";
import request from "supertest";
import { buildApp } from "../../src/app.js";
import { Print } from "../../src/models/Print.js";
import { PrintFamily } from "../../src/models/PrintFamily.js";
import { Product } from "../../src/models/Product.js";
import { ProductCategory } from "../../src/models/ProductCategory.js";
import { Variant } from "../../src/models/Variant.js";

const app = buildApp();

const CATALOG_PRODUCTS = "/api/v1/catalog/products";

const image = (name: string) => ({
  url: `https://res.cloudinary.com/gira/image/upload/v1/${name}.jpg`,
  publicId: `gira/${name}`,
  width: 800,
  height: 600,
});

const seedPrint = async (name: string, sku: string) => {
  const family =
    (await PrintFamily.findOne({ slug: "flores" })) ?? (await PrintFamily.create({ name: "Flores", slug: "flores" }));
  return Print.create({ name, slug: name.toLowerCase(), sku, family: family._id, image: image(`print-${sku}`) });
};

interface SeedOpts {
  basePrice: number;
  salePrice?: number;
  priceOverride?: number;
}

/** A model with one active variant; the card shows that variant. */
const seedModel = async (name: string, opts: SeedOpts) => {
  const category =
    (await ProductCategory.findOne({ slug: "playeras" })) ??
    (await ProductCategory.create({ name: "Playeras", slug: "playeras" }));
  const print = await seedPrint(`Print ${name}`, `SKU-${name}`);
  const product = await Product.create({
    name,
    slug: name.toLowerCase().replace(/\s+/g, "-"),
    category: category._id,
    basePrice: opts.basePrice,
    ...(opts.salePrice !== undefined ? { salePrice: opts.salePrice } : {}),
    weightGrams: 300,
  });
  const variant = await Variant.create({
    product: product._id,
    print: print._id,
    sku: `V-${name}`,
    images: [],
    onHand: 5,
    reserved: 0,
    ...(opts.priceOverride !== undefined ? { priceOverride: opts.priceOverride } : {}),
  });
  return { product, variant };
};

interface Card {
  price: number;
  compareAtPrice?: number;
}
interface Row {
  name: string;
  card?: Card;
}

const list = async (query = ""): Promise<{ items: Row[]; meta: { total: number; page: number } }> => {
  const res = await request(app).get(`${CATALOG_PRODUCTS}${query}`);
  return { items: res.body.data.products as Row[], meta: res.body.meta };
};

describe("Catálogo público · precio de rebaja en la tarjeta", () => {
  it("modelo en rebaja: price rebajado y compareAtPrice con el precio base", async () => {
    await seedModel("Playera", { basePrice: 50000, salePrice: 39900 });
    const { items } = await list();
    expect(items[0]?.card).toMatchObject({ price: 39900, compareAtPrice: 50000 });
  });

  it("modelo sin rebaja: price base y sin compareAtPrice", async () => {
    await seedModel("Playera", { basePrice: 50000 });
    const card = (await list()).items[0]?.card;
    expect(card?.price).toBe(50000);
    expect(card).not.toHaveProperty("compareAtPrice");
  });

  it("estampa con precio especial: gana a la rebaja y no se tacha nada", async () => {
    await seedModel("Playera", { basePrice: 50000, salePrice: 39900, priceOverride: 45000 });
    const card = (await list()).items[0]?.card;
    expect(card?.price).toBe(45000);
    expect(card).not.toHaveProperty("compareAtPrice");
  });

  it("el resumen público ya no expone basePrice", async () => {
    await seedModel("Playera", { basePrice: 50000 });
    const res = await request(app).get(CATALOG_PRODUCTS);
    expect(res.body.data.products[0]).not.toHaveProperty("basePrice");
  });
});

describe("Catálogo público · ficha con precio efectivo por variante", () => {
  it("cada variante trae price y compareAtPrice; sin priceOverride en el DTO", async () => {
    const { product } = await seedModel("Playera", { basePrice: 50000, salePrice: 39900 });
    const special = await seedPrint("Especial", "SKU-ESP");
    await Variant.create({
      product: product._id,
      print: special._id,
      sku: "V-ESP",
      images: [],
      onHand: 5,
      reserved: 0,
      priceOverride: 45000,
    });

    const res = await request(app).get(`${CATALOG_PRODUCTS}/${product.slug}`);
    const variants = res.body.data.product.variants as Array<{ sku: string; price: number; compareAtPrice?: number }>;
    const regular = variants.find((v) => v.sku === "V-PLAYERA");
    const override = variants.find((v) => v.sku === "V-ESP");

    expect(regular).toMatchObject({ price: 39900, compareAtPrice: 50000 });
    expect(override?.price).toBe(45000);
    expect(override).not.toHaveProperty("compareAtPrice");
    expect(res.body.data.product).not.toHaveProperty("basePrice");
    for (const v of variants) expect(v).not.toHaveProperty("priceOverride");
  });
});

describe("Catálogo público · orden por precio efectivo", () => {
  const seedMix = async () => {
    await seedModel("Caro", { basePrice: 90000 }); // 900
    await seedModel("Rebajado", { basePrice: 80000, salePrice: 20000 }); // 200
    await seedModel("Especial", { basePrice: 10000, priceOverride: 60000 }); // 600
    await seedModel("Medio", { basePrice: 40000 }); // 400
  };

  it("sort=price ordena por lo que se cobra, no por basePrice", async () => {
    await seedMix();
    expect((await list("?sort=price")).items.map((i) => i.name)).toEqual(["Rebajado", "Medio", "Especial", "Caro"]);
  });

  it("sort=-price ordena de mayor a menor", async () => {
    await seedMix();
    expect((await list("?sort=-price")).items.map((i) => i.name)).toEqual(["Caro", "Especial", "Medio", "Rebajado"]);
  });

  it("pagina sobre el orden por precio, con total correcto", async () => {
    await seedMix();
    const first = await list("?sort=price&limit=3&page=1");
    const second = await list("?sort=price&limit=3&page=2");
    expect(first.items.map((i) => i.name)).toEqual(["Rebajado", "Medio", "Especial"]);
    expect(second.items.map((i) => i.name)).toEqual(["Caro"]);
    expect(first.meta.total).toBe(4);
  });

  it("empata por nombre y sigue respetando los filtros", async () => {
    await seedModel("Bravo", { basePrice: 30000 });
    await seedModel("Alfa", { basePrice: 30000 });
    await seedModel("Oculto", { basePrice: 100 });
    await Product.updateOne({ name: "Oculto" }, { $set: { isActive: false } });
    expect((await list("?sort=price")).items.map((i) => i.name)).toEqual(["Alfa", "Bravo"]);
  });
});
