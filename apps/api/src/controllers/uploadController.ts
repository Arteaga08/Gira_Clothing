import type { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendResponse } from "../utils/sendResponse.js";
import { AppError } from "../utils/AppError.js";
import { buildContext } from "../utils/requestContext.js";
import { uploadImage } from "../services/mediaService.js";

const uploadImageHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) {
    throw new AppError('Envía un archivo en el campo "file".', 400);
  }
  const { folder } = req.body as { folder: string };
  const image = await uploadImage(
    { buffer: req.file.buffer, mimetype: req.file.mimetype },
    folder,
    buildContext(req),
  );
  sendResponse(res, 201, "Imagen subida correctamente.", { image });
});

export { uploadImageHandler };
