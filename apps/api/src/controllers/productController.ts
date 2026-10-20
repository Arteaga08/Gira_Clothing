import type { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendResponse } from "../utils/sendResponse.js";
import { buildContext } from "../utils/requestContext.js";
import {
  createProduct,
  updateProduct,
  deactivateProduct,
  type CreateProductInput,
  type UpdateProductInput,
} from "../services/productService.js";
import { listAdminProducts, getAdminProductOrThrow } from "../services/adminProductService.js";

/**
 * Product admin controllers — orchestrate req/res only, never touch models.
 * Writes go through productService; every response is re-read as an
 * AdminProduct so the panel always gets the same shape.
 */

const create = asyncHandler(async (req: Request, res: Response) => {
  const created = await createProduct(req.body as CreateProductInput, buildContext(req));
  const product = await getAdminProductOrThrow(created.id);
  sendResponse(res, 201, "Producto creado correctamente.", { product });
});

const list = asyncHandler(async (req: Request, res: Response) => {
  const { items, meta } = await listAdminProducts(req.query);
  sendResponse(res, 200, "Productos obtenidos correctamente.", { products: items }, meta);
});

const detail = asyncHandler(async (req: Request, res: Response) => {
  const product = await getAdminProductOrThrow(req.params.id as string);
  sendResponse(res, 200, "Producto obtenido correctamente.", { product });
});

const update = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  await updateProduct(id, req.body as UpdateProductInput, buildContext(req));
  const product = await getAdminProductOrThrow(id);
  sendResponse(res, 200, "Producto actualizado correctamente.", { product });
});

const deactivate = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  await deactivateProduct(id, buildContext(req));
  const product = await getAdminProductOrThrow(id);
  sendResponse(res, 200, "Producto retirado correctamente.", { product });
});

export { create, list, detail, update, deactivate };
