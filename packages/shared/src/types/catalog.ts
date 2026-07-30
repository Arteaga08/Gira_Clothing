import type { ImageAttrs } from "./order.js";

interface PrintFamily {
  id: string;
  name: string;
  slug: string;
  description?: string;
  isActive: boolean;
}

interface ProductCategory {
  id: string;
  name: string;
  slug: string;
  description?: string;
  isActive: boolean;
}

interface Print {
  id: string;
  name: string;
  slug: string;
  sku: string;
  family: string;
  image: ImageAttrs;
  isActive: boolean;
}

interface Measurements {
  widthCm?: number;
  heightCm?: number;
  depthCm?: number;
}

interface Product {
  id: string;
  name: string;
  slug: string;
  category: string;
  description?: string;
  basePrice: number;
  measurements?: Measurements;
  materials?: string[];
  isActive: boolean;
}

interface Variant {
  id: string;
  product: string;
  print: string;
  sku: string;
  images: ImageAttrs[];
  priceOverride?: number;
  onHand: number;
  reserved: number;
  /** Computed: onHand - reserved. Never stored. */
  available: number;
  isActive: boolean;
}

export type { PrintFamily, ProductCategory, Print, Measurements, Product, Variant };
