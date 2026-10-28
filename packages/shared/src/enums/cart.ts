/**
 * Live state of a cart line. `retired` is final (variant gone, or it, its product
 * or its print inactive); `out_of_stock` is temporary and the line stays.
 */
enum CartLineStatus {
  AVAILABLE = "available",
  OUT_OF_STOCK = "out_of_stock",
  RETIRED = "retired",
}

export { CartLineStatus };
