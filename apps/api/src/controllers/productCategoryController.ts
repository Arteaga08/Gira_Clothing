import type { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendResponse } from "../utils/sendResponse.js";
import { buildContext } from "../utils/requestContext.js";
import {
  createProductCategory,
  listProductCategories,
  getProductCategory,
  updateProductCategory,
  deactivateProductCategory,
  type CreateProductCategoryInput,
  type UpdateProductCategoryInput,
} from "../services/productCategoryService.js";

/**
 * ProductCategory admin controllers — orchestrate req/res only, never touch models.
 */

const create = asyncHandler(async (req: Request, res: Response) => {
  const category = await createProductCategory(
    req.body as CreateProductCategoryInput,
    buildContext(req),
  );
  sendResponse(res, 201, "Categoría creada correctamente.", { category });
});

const list = asyncHandler(async (req: Request, res: Response) => {
  const { items, meta } = await listProductCategories(req.query);
  sendResponse(res, 200, "Categorías obtenidas correctamente.", { categories: items }, meta);
});

const detail = asyncHandler(async (req: Request, res: Response) => {
  const category = await getProductCategory(req.params.id as string);
  sendResponse(res, 200, "Categoría obtenida correctamente.", { category });
});

const update = asyncHandler(async (req: Request, res: Response) => {
  const category = await updateProductCategory(
    req.params.id as string,
    req.body as UpdateProductCategoryInput,
    buildContext(req),
  );
  sendResponse(res, 200, "Categoría actualizada correctamente.", { category });
});

const deactivate = asyncHandler(async (req: Request, res: Response) => {
  const category = await deactivateProductCategory(req.params.id as string, buildContext(req));
  sendResponse(res, 200, "Categoría retirada correctamente.", { category });
});

export { create, list, detail, update, deactivate };
