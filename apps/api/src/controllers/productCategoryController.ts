import type { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendResponse } from "../utils/sendResponse.js";
import { buildContext } from "../utils/requestContext.js";
import { getAdminProductCategoryOrThrow, listAdminProductCategories } from "../services/adminProductCategoryService.js";
import {
  createProductCategory,
  updateProductCategory,
  deactivateProductCategory,
  type CreateProductCategoryInput,
  type UpdateProductCategoryInput,
} from "../services/productCategoryService.js";

/**
 * ProductCategory admin controllers — orchestrate req/res only, never touch models.
 */

const create = asyncHandler(async (req: Request, res: Response) => {
  const created = await createProductCategory(req.body as CreateProductCategoryInput, buildContext(req));
  const category = await getAdminProductCategoryOrThrow(created.id);
  sendResponse(res, 201, "Categoría creada correctamente.", { category });
});

const list = asyncHandler(async (req: Request, res: Response) => {
  const { items, meta } = await listAdminProductCategories(req.query);
  sendResponse(res, 200, "Categorías obtenidas correctamente.", { categories: items }, meta);
});

const detail = asyncHandler(async (req: Request, res: Response) => {
  const category = await getAdminProductCategoryOrThrow(req.params.id as string);
  sendResponse(res, 200, "Categoría obtenida correctamente.", { category });
});

const update = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  await updateProductCategory(id, req.body as UpdateProductCategoryInput, buildContext(req));
  const category = await getAdminProductCategoryOrThrow(id);
  sendResponse(res, 200, "Categoría actualizada correctamente.", { category });
});

const deactivate = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  await deactivateProductCategory(id, buildContext(req));
  const category = await getAdminProductCategoryOrThrow(id);
  sendResponse(res, 200, "Categoría retirada correctamente.", { category });
});

export { create, list, detail, update, deactivate };
