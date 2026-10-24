import type { Metadata } from "next";
import type { CSSProperties, ReactNode } from "react";
import "./mock.css";

/*
 * TEMPORARY route: three product-card samples for M13 section 3 (Más vendidos).
 * Not linked from anywhere; delete the folder once Manuel picks one.
 * Photos are the hero photos already in Cloudinary, cropped differently per card.
 */

type Tone = "pink" | "lilac" | "mint" | "bone";

interface SampleProduct {
  name: string;
  slug: string;
  category: string;
  tone: Tone;
  material: string;
  price: number;
  photo: string;
}

const PHOTO_A = "v1792804826/gira/home/jzbyfx3iuvksdncwnrrt.png";
const PHOTO_B = "v1792804960/gira/home/wamsmuc2vicwbbhzdezw.png";
const crop = (photo: string, gravity: string) =>
  `https://res.cloudinary.com/jjk8bve3/image/upload/c_fill,w_640,h_800,g_${gravity},f_auto,q_auto/${photo}`;

const PRODUCTS: SampleProduct[] = [
  { name: "Gorra dad hat", slug: "gorra-dad-hat", category: "Gorras", tone: "pink", material: "Algodón 100 %", price: 34900, photo: crop(PHOTO_A, "north") },
  { name: "Playera oversize", slug: "playera-oversize", category: "Playeras", tone: "lilac", material: "Algodón 100 %", price: 42900, photo: crop(PHOTO_B, "center") },
  { name: "Sudadera con capucha", slug: "sudadera-con-capucha", category: "Sudaderas", tone: "mint", material: "Algodón y poliéster", price: 89900, photo: crop(PHOTO_A, "south") },
  { name: "Tote de lona", slug: "tote-de-lona", category: "Tote bags", tone: "bone", material: "Lona de algodón", price: 29900, photo: crop(PHOTO_A, "east") },
];

const money = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });
const formatPrice = (cents: number) => money.format(cents / 100);

const enterStyle = (i: number) => ({ ["--i" as string]: i }) as CSSProperties;

/* ── A · Etiqueta de lata: bands of colour stacked like the reference. ─────── */
const CardBands = ({ product, index }: { product: SampleProduct; index: number }) => (
  <a
    href={`#${product.slug}`}
    data-tone={product.tone}
    style={enterStyle(index)}
    className="bs-enter bs-lift flex flex-col overflow-hidden rounded-nb border-2 border-ink bg-surface text-text-primary shadow-nb"
  >
    <p className="bs-tone border-b-2 border-ink flex min-h-[5.25rem] items-center justify-center px-4 py-3 text-center font-display text-2xl uppercase leading-none">
      {product.name}
    </p>
    <p className="bs-tone-soft border-b-2 border-ink px-4 py-2 text-center text-sm">
      {product.category}, {product.material.toLowerCase()}
    </p>
    <div className="relative aspect-[4/5] grow overflow-hidden">
      <img src={product.photo} alt={product.name} className="bs-photo absolute inset-0 size-full object-cover" />
    </div>
    <p className="bs-tone-soft flex items-center justify-between border-t-2 border-ink px-4 py-3">
      <span className="text-sm font-bold">Ver prenda</span>
      <span className="font-mono text-lg font-bold">{formatPrice(product.price)}</span>
    </p>
  </a>
);

/* ── B · Sticker sobre foto: the photo is the card, the name rides on it. ──── */
const CardStickers = ({ product, index }: { product: SampleProduct; index: number }) => (
  <a
    href={`#${product.slug}`}
    data-tone={product.tone}
    style={enterStyle(index)}
    className="bs-enter bs-lift relative block aspect-[4/5] overflow-hidden rounded-nb border-2 border-ink text-text-primary shadow-nb"
  >
    <img src={product.photo} alt={product.name} className="bs-photo absolute inset-0 size-full object-cover" />
    <span
      className="bs-sticker absolute right-3 top-3 rounded-nb-sm border-2 border-ink bg-surface px-3 py-1 font-mono text-base font-bold shadow-nb-sm"
      style={{ ["--tilt" as string]: "4deg", ["--tilt-hover" as string]: "0deg" }}
    >
      {formatPrice(product.price)}
    </span>
    <span
      className="bs-sticker bs-tone absolute bottom-4 left-3 max-w-[85%] rounded-nb-sm border-2 border-ink px-4 pb-1.5 pt-2.5 font-display text-xl uppercase md:text-2xl leading-[1.05] shadow-nb"
      style={{ ["--tilt" as string]: "-4deg", ["--tilt-hover" as string]: "-1deg" }}
    >
      {product.name}
    </span>
  </a>
);

/* ── C · Etiqueta colgante: the whole card is the garment's hang tag. ─────── */
const CardHangTag = ({ product, index }: { product: SampleProduct; index: number }) => (
  <a
    href={`#${product.slug}`}
    data-tone={product.tone}
    style={enterStyle(index)}
    className="bs-enter bs-lift bs-tone flex h-full flex-col gap-4 rounded-nb border-2 border-ink p-4 pt-12 text-text-primary shadow-nb"
  >
    <span aria-hidden className="bs-hole absolute left-1/2 top-4 size-5 -translate-x-1/2 rounded-full border-2 border-ink" />
    <div className="aspect-square overflow-hidden rounded-nb-sm border-2 border-ink">
      <img src={product.photo} alt={product.name} className="bs-photo size-full object-cover" />
    </div>
    <p className="min-h-[3.2rem] font-display text-2xl uppercase leading-[0.95] md:min-h-[3.7rem] md:text-3xl">{product.name}</p>
    <p className="mt-auto flex items-end justify-between gap-2 border-t-2 border-ink pt-3">
      <span className="text-sm">{product.category}</span>
      <span className="font-mono text-xl font-bold">{formatPrice(product.price)}</span>
    </p>
  </a>
);

const Sample = ({ letter, title, note, children }: { letter: string; title: string; note: string; children: ReactNode }) => (
  <section className="mx-auto flex w-full max-w-[90rem] flex-col gap-8 px-4 md:px-8">
    <header className="flex flex-col gap-2 text-text-inverse">
      <h2 className="font-display text-[clamp(2.5rem,6vw,5rem)] uppercase leading-[0.9]">
        {letter} · {title}
      </h2>
      <p className="max-w-[60ch] text-base text-text-inverse-secondary">{note}</p>
    </header>
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4 md:gap-6">{children}</div>
  </section>
);

const metadata: Metadata = { title: "Muestras · Más vendidos", robots: { index: false } };

const BestSellersSamplesPage = () => (
  <div className="bs-mock flex flex-col gap-32 pb-40 pt-[calc(var(--store-marquee-block)+var(--store-nav-height)+4rem)]">
    <Sample
      letter="A"
      title="Etiqueta de lata"
      note="Fiel a la referencia: banda fuerte con el nombre, banda suave con categoría y material, la foto al centro y el precio abajo. El color sale de la categoría."
    >
      {PRODUCTS.map((p, i) => (
        <CardBands key={p.slug} product={p} index={i} />
      ))}
    </Sample>

    <Sample
      letter="B"
      title="Sticker sobre foto"
      note="La foto es toda la card; nombre y precio son etiquetas inclinadas como las del hero. El color de la categoría solo vive en la etiqueta del nombre."
    >
      {PRODUCTS.map((p, i) => (
        <CardStickers key={p.slug} product={p} index={i} />
      ))}
    </Sample>

    <Sample
      letter="C"
      title="Etiqueta colgante"
      note="Toda la card es la etiqueta que cuelga de la prenda: relleno del color de la categoría, perforación arriba, foto enmarcada, nombre grande y precio."
    >
      {PRODUCTS.map((p, i) => (
        <div key={p.slug} className="relative">
          <CardHangTag product={p} index={i} />
        </div>
      ))}
    </Sample>
  </div>
);

export { metadata };
export default BestSellersSamplesPage;
