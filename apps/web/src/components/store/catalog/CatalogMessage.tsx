import Link from "next/link";
import { buttonClassName } from "@/components/ui/Button";
import { NB_SURFACE } from "@/components/ui/styles";
import { cn } from "@/lib/cn";

interface CatalogMessageProps {
  /** `empty`: nothing matches (or nothing is published yet); `error`: the API could not be reached. */
  variant: "empty" | "error";
  /** Where the button goes: the unfiltered catalog (empty) or this same page (error). */
  href: string;
  /** Only for `empty`: whether some filter is on (offers to clear it) or the shop is simply empty. */
  filtered?: boolean;
}

const COPY = {
  emptyFiltered: { title: "Aquí todavía no hay nada", text: "Ninguna prenda coincide con lo que elegiste. Prueba con otra categoría o ve todo el catálogo.", action: "Ver todo el catálogo", variant: "positive" },
  emptyShop: { title: "Estamos preparando la colección", text: "Pronto vas a encontrar aquí las prendas de la gira.", action: null, variant: "positive" },
  error: { title: "No pudimos cargar el catálogo", text: "Revisa tu conexión e inténtalo de nuevo.", action: "Reintentar", variant: "positive" },
} as const;

/**
 * Empty and error states of the listing, drawn on a hueso island so they never
 * look like a blank gap. Menta button («positive»: clear a filter, retry); the
 * only yellow button of the store is the hero's.
 */
const CatalogMessage = ({ variant, href, filtered = false }: CatalogMessageProps) => {
  const copy = variant === "error" ? COPY.error : filtered ? COPY.emptyFiltered : COPY.emptyShop;
  return (
    <div role={variant === "error" ? "alert" : "status"} className={cn(NB_SURFACE, "mx-auto flex max-w-2xl flex-col items-center gap-4 px-6 py-12 text-center")}>
      <h2 className="font-display text-4xl uppercase leading-none">{copy.title}</h2>
      <p className="max-w-[40ch]">{copy.text}</p>
      {copy.action ? (
        <Link href={href} className={buttonClassName(copy.variant)}>
          {copy.action}
        </Link>
      ) : null}
    </div>
  );
};

export type { CatalogMessageProps };
export { CatalogMessage };
