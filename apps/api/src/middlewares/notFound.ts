import type { Request, Response, NextFunction } from "express";
import { AppError } from "../utils/AppError.js";

const notFound = (req: Request, _res: Response, next: NextFunction): void => {
  next(new AppError(`Ruta no encontrada: ${req.method} ${req.originalUrl}`, 404));
};

export { notFound };
