import bcrypt from "bcryptjs";
import mongoose, { type Model, type Types } from "mongoose";
import { UserRole } from "@gira/shared";
import { Order } from "../../models/Order.js";
import { Print } from "../../models/Print.js";
import { PrintFamily } from "../../models/PrintFamily.js";
import { Product } from "../../models/Product.js";
import { ProductCategory } from "../../models/ProductCategory.js";
import { Session } from "../../models/Session.js";
import { User } from "../../models/User.js";
import { Variant } from "../../models/Variant.js";
import { getSettings } from "../../services/settingsService.js";
import { buildVariantSku } from "../../utils/sku.js";
import { buildDemoOrders, type DemoBuyer, type SellableVariant } from "./buildOrders.js";
import { DEMO_CATEGORIES, DEMO_FAMILIES, DEMO_PRINTS, DEMO_PRODUCTS, PLACEHOLDER_IMAGE } from "./catalogData.js";
import { DEMO_CUSTOMER_PASSWORD, DEMO_EMAIL_SUFFIX, FIRST_NAMES, LAST_NAMES } from "./peopleData.js";
import { createRandom } from "./random.js";

/**
 * Demo content for development: catalog, customers and order history. Every
 * id it creates is written to a manifest BEFORE inserting, so `resetDemo`
 * removes exactly what the seed added (even after a run that failed halfway)
 * and never anything the owner created by hand. Documents are built with the
 * real models and validated, then inserted raw so `createdAt` can carry history.
 */

const MANIFEST_COLLECTION = "demo_seed_manifest";
const MANIFEST_ID = "demo";

type SeededKey = "families" | "categories" | "prints" | "products" | "variants" | "users" | "orders";
type SeededIds = Record<SeededKey, Types.ObjectId[]>;

interface DemoSeedOptions {
  now?: Date;
  seed?: number;
  customerCount?: number;
  /** Customers who have orders; the rest exist without purchases. */
  buyerCount?: number;
  orderCount?: number;
  days?: number;
}

type DemoSeedSummary = Record<SeededKey, number>;

const DAY = 24 * 3_600_000;

const manifest = () => mongoose.connection.collection<{ _id: string; createdAt: Date; ids: SeededIds }>(MANIFEST_COLLECTION);

/** Validates with the model (casting, enums, required) and inserts as-is, timestamps included. */
const insertValidated = async <T>(
  model: Model<T>,
  docs: mongoose.HydratedDocument<T>[],
  stamps: { createdAt: Date; updatedAt: Date }[],
): Promise<void> => {
  if (docs.length === 0) return;
  await Promise.all(docs.map((doc) => doc.validate()));
  await model.collection.insertMany(
    docs.map((doc, index) => ({ ...(doc.toObject({ depopulate: true }) as Record<string, unknown>), ...stamps[index] })),
  );
};

const listTaken = async (): Promise<string[]> => {
  const [families, categories, prints, products, users] = await Promise.all([
    PrintFamily.find({ slug: { $in: DEMO_FAMILIES.map((f) => f.slug) } }, { slug: 1 }).lean(),
    ProductCategory.find({ slug: { $in: DEMO_CATEGORIES.map((c) => c.slug) } }, { slug: 1 }).lean(),
    Print.find(
      { $or: [{ slug: { $in: DEMO_PRINTS.map((p) => p.slug) } }, { sku: { $in: DEMO_PRINTS.map((p) => p.sku) } }] },
      { slug: 1 },
    ).lean(),
    Product.find({ slug: { $in: DEMO_PRODUCTS.map((p) => p.slug) } }, { slug: 1 }).lean(),
    User.find({ email: { $regex: `${DEMO_EMAIL_SUFFIX.replace(/\./g, "\\.")}$` } }, { email: 1 }).lean(),
  ]);
  return [
    ...families.map((d) => `familia «${d.slug}»`),
    ...categories.map((d) => `categoría «${d.slug}»`),
    ...prints.map((d) => `estampa «${d.slug}»`),
    ...products.map((d) => `producto «${d.slug}»`),
    ...users.map((d) => `cliente «${d.email}»`),
  ];
};

const seedDemo = async (options: DemoSeedOptions = {}): Promise<DemoSeedSummary> => {
  const now = options.now ?? new Date();
  const random = createRandom(options.seed ?? 2026);
  const customerCount = options.customerCount ?? 25;
  const buyerCount = options.buyerCount ?? 18;

  if (await manifest().findOne({ _id: MANIFEST_ID })) {
    throw new Error("Ya hay datos demo sembrados. Bórralos primero con --reset.");
  }
  const taken = await listTaken();
  if (taken.length > 0) {
    throw new Error(`Ya existen registros con los datos demo; no se sembró nada:\n  - ${taken.join("\n  - ")}`);
  }

  const settings = await getSettings();
  const admin = await User.findOne({ role: UserRole.ADMIN }, { _id: 1 }).lean();
  const catalogStamp = { createdAt: new Date(now.getTime() - 140 * DAY), updatedAt: new Date(now.getTime() - 140 * DAY) };
  const stamp = <T>(items: T[]) => items.map(() => catalogStamp);

  // Catalog
  const families = DEMO_FAMILIES.map((family) => new PrintFamily(family));
  const familyBySlug = new Map(families.map((doc) => [doc.slug, doc]));
  const categories = DEMO_CATEGORIES.map((category) => new ProductCategory(category));
  const categoryBySlug = new Map(categories.map((doc) => [doc.slug, doc]));
  const prints = DEMO_PRINTS.map(
    (print) =>
      new Print({
        name: print.name,
        slug: print.slug,
        sku: print.sku,
        family: familyBySlug.get(print.family)?._id,
        image: PLACEHOLDER_IMAGE,
      }),
  );
  const products = DEMO_PRODUCTS.map(
    (product) =>
      new Product({
        name: product.name,
        slug: product.slug,
        category: categoryBySlug.get(product.category)?._id,
        description: product.description,
        basePrice: product.basePrice,
        weightGrams: product.weightGrams,
        materials: product.materials,
      }),
  );

  const sellable: SellableVariant[] = [];
  const variants = DEMO_PRODUCTS.flatMap((spec, index) => {
    const product = products[index]!;
    return random.sample(prints, spec.printCount).map((print) => {
      const roll = random.next();
      const onHand = roll < 0.15 ? 0 : roll < 0.3 ? random.int(1, 3) : random.int(5, 40);
      const priceOverride = random.chance(0.08) ? spec.basePrice + 5_000 : undefined;
      const variant = new Variant({
        product: product._id,
        print: print._id,
        sku: buildVariantSku(product.slug, print.sku),
        onHand,
        ...(priceOverride ? { priceOverride } : {}),
      });
      sellable.push({
        variantId: variant._id,
        productId: product._id,
        sku: variant.sku,
        productName: product.name,
        printName: print.name,
        unitPriceMxn: priceOverride ?? spec.basePrice,
        weightGrams: spec.weightGrams,
      });
      return variant;
    });
  });

  // Customers: unique name pairs, all verified, all with the same demo password.
  const passwordHash = await bcrypt.hash(DEMO_CUSTOMER_PASSWORD, 10);
  const names = random
    .sample(FIRST_NAMES.flatMap((first) => LAST_NAMES.map((last) => [first, last] as const)), customerCount)
    .map(([first, last]) => ({ first, last }));
  const userStamps = names.map(() => {
    const created = new Date(now.getTime() - random.int(95, 135) * DAY);
    return { createdAt: created, updatedAt: created };
  });
  const users = names.map(
    ({ first, last }) =>
      new User({
        firstName: first,
        lastName: last,
        email: `${first}.${last}`.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase() + DEMO_EMAIL_SUFFIX,
        password: passwordHash,
        role: UserRole.CUSTOMER,
        emailVerified: true,
      }),
  );
  const buyers: DemoBuyer[] = users.slice(0, buyerCount).map((user) => ({
    userId: user._id,
    name: `${user.firstName} ${user.lastName}`,
    email: user.email,
    phone: `55${String(random.int(10_000_000, 99_999_999))}`,
  }));

  const orderSpecs = buildDemoOrders({
    random,
    now,
    count: options.orderCount ?? 150,
    days: options.days ?? 90,
    variants: sellable,
    buyers,
    adminId: admin?._id,
    taxRateBps: settings.tax.rateBps,
    mxnPerUsdCents: settings.currency.mxnPerUsdCents,
  });
  const orders = orderSpecs.map(({ createdAt: _c, updatedAt: _u, ...spec }) => new Order(spec));

  const ids: SeededIds = {
    families: families.map((d) => d._id),
    categories: categories.map((d) => d._id),
    prints: prints.map((d) => d._id),
    products: products.map((d) => d._id),
    variants: variants.map((d) => d._id),
    users: users.map((d) => d._id),
    orders: orders.map((d) => d._id),
  };
  // Manifest first: a run that dies halfway can still be undone with --reset.
  await manifest().insertOne({ _id: MANIFEST_ID, createdAt: now, ids });

  await insertValidated(PrintFamily, families, stamp(families));
  await insertValidated(ProductCategory, categories, stamp(categories));
  await insertValidated(Print, prints, stamp(prints));
  await insertValidated(Product, products, stamp(products));
  await insertValidated(Variant, variants, stamp(variants));
  await insertValidated(User, users, userStamps);
  await insertValidated(
    Order,
    orders,
    orderSpecs.map(({ createdAt, updatedAt }) => ({ createdAt, updatedAt })),
  );

  return Object.fromEntries(Object.entries(ids).map(([key, list]) => [key, list.length])) as DemoSeedSummary;
};

/** Removes exactly what the manifest lists, plus the demo customers' sessions. Returns what was deleted. */
const resetDemo = async (): Promise<DemoSeedSummary | null> => {
  const found = await manifest().findOne({ _id: MANIFEST_ID });
  if (!found) return null;
  const { ids } = found;
  const [families, categories, prints, products, variants, users, orders] = await Promise.all([
    PrintFamily.deleteMany({ _id: { $in: ids.families } }),
    ProductCategory.deleteMany({ _id: { $in: ids.categories } }),
    Print.deleteMany({ _id: { $in: ids.prints } }),
    Product.deleteMany({ _id: { $in: ids.products } }),
    Variant.deleteMany({ _id: { $in: ids.variants } }),
    User.deleteMany({ _id: { $in: ids.users }, role: UserRole.CUSTOMER }),
    Order.deleteMany({ _id: { $in: ids.orders } }),
  ]);
  await Session.deleteMany({ user: { $in: ids.users } });
  await manifest().deleteOne({ _id: MANIFEST_ID });
  return {
    families: families.deletedCount,
    categories: categories.deletedCount,
    prints: prints.deletedCount,
    products: products.deletedCount,
    variants: variants.deletedCount,
    users: users.deletedCount,
    orders: orders.deletedCount,
  };
};

export type { DemoSeedOptions, DemoSeedSummary };
export { seedDemo, resetDemo };
