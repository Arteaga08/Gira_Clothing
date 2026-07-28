import type { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendResponse } from "../utils/sendResponse.js";
import {
  listPublicFamilies,
  getPublicFamily,
  listPublicPrints,
  getPublicPrint,
  listPublicCategories,
  listPublicProducts,
  getPublicProduct,
} from "../services/catalogService.js";

/**
 * Public catalog controllers — read-only, no auth. Orchestrate req/res only.
 */

const listFamilies = asyncHandler(async (req: Request, res: Response) => {
  const { items, meta } = await listPublicFamilies(req.query);
  sendResponse(res, 200, "Familias de estampados obtenidas correctamente.", { families: items }, meta);
});

const familyDetail = asyncHandler(async (req: Request, res: Response) => {
  const family = await getPublicFamily(req.params.slug as string);
  sendResponse(res, 200, "Familia de estampados obtenida correctamente.", { family });
});

const listPrints = asyncHandler(async (req: Request, res: Response) => {
  const { items, meta } = await listPublicPrints(req.query);
  sendResponse(res, 200, "Estampados obtenidos correctamente.", { prints: items }, meta);
});

const printDetail = asyncHandler(async (req: Request, res: Response) => {
  const print = await getPublicPrint(req.params.slug as string);
  sendResponse(res, 200, "Estampado obtenido correctamente.", { print });
});

const listCategories = asyncHandler(async (req: Request, res: Response) => {
  const { items, meta } = await listPublicCategories(req.query);
  sendResponse(res, 200, "Categorías obtenidas correctamente.", { categories: items }, meta);
});

const listProducts = asyncHandler(async (req: Request, res: Response) => {
  const { items, meta } = await listPublicProducts(req.query);
  sendResponse(res, 200, "Productos obtenidos correctamente.", { products: items }, meta);
});

const productDetail = asyncHandler(async (req: Request, res: Response) => {
  const product = await getPublicProduct(req.params.slug as string);
  sendResponse(res, 200, "Producto obtenido correctamente.", { product });
});

export {
  listFamilies,
  familyDetail,
  listPrints,
  printDetail,
  listCategories,
  listProducts,
  productDetail,
};
