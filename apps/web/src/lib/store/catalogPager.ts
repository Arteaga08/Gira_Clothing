type PagerItem = number | "gap";

/** Pages to draw: all of them when few, otherwise first, last and the neighbours of the current one, with gaps. */
const pagerItems = (current: number, total: number): PagerItem[] => {
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);
  const pages = new Set([1, total, current - 1, current, current + 1].filter((page) => page >= 1 && page <= total));
  const sorted = [...pages].sort((a, b) => a - b);
  const items: PagerItem[] = [];
  sorted.forEach((page, index) => {
    const previous = sorted[index - 1];
    if (previous !== undefined && page - previous > 1) items.push(page - previous === 2 ? page - 1 : "gap");
    items.push(page);
  });
  return items;
};

export type { PagerItem };
export { pagerItems };
