import { T_PAGE_TITLE } from "@/components/ui/typography";

/**
 * TEMPORARY home: only gives the navbar something to scroll over. The hero
 * (section 2 of M13) replaces it.
 */
const HomePage = () => (
  <div className="mx-auto flex min-h-[200dvh] max-w-[90rem] flex-col gap-4 px-4 py-14 md:px-8">
    <h1 className={T_PAGE_TITLE}>Gira Clothing</h1>
    <p className="text-text-inverse-secondary">Contenido de ejemplo mientras se construye el home.</p>
  </div>
);

export default HomePage;
