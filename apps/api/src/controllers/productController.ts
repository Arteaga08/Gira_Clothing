import type { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendResponse } from "../utils/sendResponse.js";
import { buildContext } from "../utils/requestContext.js";
import {
  createProduct,
  listProducts,
  getProduct,
  updateProduct,
  deactivateProduct,
  type CreateProductInput,
  type UpdateProductInput,
} from "../services/productService.js";

/**
 * Product admin controllers — orchestrate req/res only, never touch models.
 */

const create = asyncHandler(async (req: Request, res: Response) => {
  const product = await createProduct(req.body as CreateProductInput, buildContext(req));
  sendResponse(res, 201, "Producto creado correctamente.", { product });
});

const list = asyncHandler(async (req: Request, res: Response) => {
  const { items, meta } = await listProducts(req.query);
  sendResponse(res, 200, "Productos obtenidos correctamente.", { products: items }, meta);
});

const detail = asyncHandler(async (req: Request, res: Response) => {
  const product = await getProduct(req.params.id as string);
  sendResponse(res, 200, "Producto obtenido correctamente.", { product });
});

const update = asyncHandler(async (req: Request, res: Response) => {
  const product = await updateProduct(
    req.params.id as string,
    req.body as UpdateProductInput,
    buildContext(req),
  );
  sendResponse(res, 200, "Producto actualizado correctamente.", { product });
});

const deactivate = asyncHandler(async (req: Request, res: Response) => {
  const product = await deactivateProduct(req.params.id as string, buildContext(req));
  sendResponse(res, 200, "Producto retirado correctamente.", { product });
});

export { create, list, detail, update, deactivate };
