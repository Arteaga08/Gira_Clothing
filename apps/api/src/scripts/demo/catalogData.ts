/**
 * Demo catalog content. Prices are MXN centavos; weights in grams. Images are
 * left to the owner: prints carry a placeholder (their schema requires one),
 * products and variants have none.
 */

interface DemoTaxon {
  name: string;
  slug: string;
  description: string;
}

interface DemoPrint {
  name: string;
  slug: string;
  sku: string;
  family: string;
}

interface DemoProduct {
  name: string;
  slug: string;
  category: string;
  description: string;
  basePrice: number;
  weightGrams: number;
  materials: string[];
  /** How many prints this model is offered in. */
  printCount: number;
}

const DEMO_CATEGORIES: DemoTaxon[] = [
  { name: "Playeras", slug: "playeras", description: "Playeras de algodón con estampa al frente." },
  { name: "Sudaderas", slug: "sudaderas", description: "Sudaderas de felpa para el frío." },
  { name: "Tote bags", slug: "tote-bags", description: "Bolsas de lona para el día a día." },
  { name: "Gorras", slug: "gorras", description: "Gorras con estampa bordada o serigrafiada." },
];

const DEMO_FAMILIES: DemoTaxon[] = [
  { name: "Flora mexicana", slug: "flora-mexicana", description: "Flores y plantas de México." },
  { name: "Lotería", slug: "loteria", description: "Cartas clásicas de la lotería mexicana." },
  { name: "Geometría", slug: "geometria", description: "Grecas, talavera y patrones." },
  { name: "Ciudad", slug: "ciudad", description: "Íconos de la Ciudad de México." },
];

const DEMO_PRINTS: DemoPrint[] = [
  { name: "Amapolas", slug: "amapolas", sku: "FLO-AMAPOLAS", family: "flora-mexicana" },
  { name: "Cempasúchil", slug: "cempasuchil", sku: "FLO-CEMPASUCHIL", family: "flora-mexicana" },
  { name: "Nopal", slug: "nopal", sku: "FLO-NOPAL", family: "flora-mexicana" },
  { name: "Jacaranda", slug: "jacaranda", sku: "FLO-JACARANDA", family: "flora-mexicana" },
  { name: "El Gallo", slug: "el-gallo", sku: "LOT-GALLO", family: "loteria" },
  { name: "La Luna", slug: "la-luna", sku: "LOT-LUNA", family: "loteria" },
  { name: "El Corazón", slug: "el-corazon", sku: "LOT-CORAZON", family: "loteria" },
  { name: "La Sirena", slug: "la-sirena", sku: "LOT-SIRENA", family: "loteria" },
  { name: "Grecas", slug: "grecas", sku: "GEO-GRECAS", family: "geometria" },
  { name: "Talavera", slug: "talavera", sku: "GEO-TALAVERA", family: "geometria" },
  { name: "Ondas", slug: "ondas", sku: "GEO-ONDAS", family: "geometria" },
  { name: "Rombos", slug: "rombos", sku: "GEO-ROMBOS", family: "geometria" },
  { name: "Metro", slug: "metro", sku: "CDX-METRO", family: "ciudad" },
  { name: "Ángel", slug: "angel", sku: "CDX-ANGEL", family: "ciudad" },
  { name: "Trajinera", slug: "trajinera", sku: "CDX-TRAJINERA", family: "ciudad" },
  { name: "Chinampas", slug: "chinampas", sku: "CDX-CHINAMPAS", family: "ciudad" },
];

const COTTON = ["Algodón 100 %"];

const DEMO_PRODUCTS: DemoProduct[] = [
  { name: "Playera clásica", slug: "playera-clasica", category: "playeras", description: "Corte regular, cuello redondo.", basePrice: 34_900, weightGrams: 220, materials: COTTON, printCount: 8 },
  { name: "Playera oversize", slug: "playera-oversize", category: "playeras", description: "Corte holgado y hombro caído.", basePrice: 42_900, weightGrams: 260, materials: COTTON, printCount: 6 },
  { name: "Playera manga larga", slug: "playera-manga-larga", category: "playeras", description: "Manga larga con puño en rib.", basePrice: 46_900, weightGrams: 280, materials: COTTON, printCount: 4 },
  { name: "Playera infantil", slug: "playera-infantil", category: "playeras", description: "Tallas de 4 a 12 años.", basePrice: 27_900, weightGrams: 140, materials: COTTON, printCount: 4 },
  { name: "Sudadera con capucha", slug: "sudadera-con-capucha", category: "sudaderas", description: "Felpa perchada, bolsa canguro.", basePrice: 89_900, weightGrams: 650, materials: ["Algodón 80 %", "Poliéster 20 %"], printCount: 6 },
  { name: "Sudadera cuello redondo", slug: "sudadera-cuello-redondo", category: "sudaderas", description: "Felpa ligera, corte recto.", basePrice: 79_900, weightGrams: 560, materials: ["Algodón 80 %", "Poliéster 20 %"], printCount: 4 },
  { name: "Tote bag lona", slug: "tote-bag-lona", category: "tote-bags", description: "Lona de 12 oz con asas largas.", basePrice: 24_900, weightGrams: 300, materials: ["Lona de algodón"], printCount: 6 },
  { name: "Tote bag mini", slug: "tote-bag-mini", category: "tote-bags", description: "Para lo esencial.", basePrice: 17_900, weightGrams: 160, materials: ["Lona de algodón"], printCount: 4 },
  { name: "Gorra trucker", slug: "gorra-trucker", category: "gorras", description: "Malla trasera y broche ajustable.", basePrice: 32_900, weightGrams: 120, materials: ["Algodón", "Malla de poliéster"], printCount: 4 },
  { name: "Gorra dad hat", slug: "gorra-dad-hat", category: "gorras", description: "Visera curva y ajuste con hebilla.", basePrice: 34_900, weightGrams: 110, materials: COTTON, printCount: 4 },
];

/** Public sample from Cloudinary's demo cloud: allowed by the CSP, replaced when the owner uploads the real art. */
const PLACEHOLDER_IMAGE = {
  url: "https://res.cloudinary.com/demo/image/upload/sample.jpg",
  publicId: "gira-demo-placeholder",
  width: 864,
  height: 576,
};

export type { DemoTaxon, DemoPrint, DemoProduct };
export { DEMO_CATEGORIES, DEMO_FAMILIES, DEMO_PRINTS, DEMO_PRODUCTS, PLACEHOLDER_IMAGE };
