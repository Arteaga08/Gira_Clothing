import { Router } from "express";
import mongoose from "mongoose";
import { sendResponse } from "../../utils/sendResponse.js";
import { authRouter } from "./authRoutes.js";
import { adminRouter } from "./admin/index.js";
import { catalogRouter } from "./catalogRoutes.js";

/**
 * API v1 router. Mounts feature routers and the health check.
 */
const v1Router = Router();

v1Router.get("/health", (_req, res) => {
  const dbState = Number(mongoose.connection.readyState) === 1 ? "up" : "down";
  sendResponse(res, 200, "Servicio operativo", {
    uptime: process.uptime(),
    db: dbState,
  });
});

v1Router.use("/auth", authRouter);
v1Router.use("/admin", adminRouter);
v1Router.use("/catalog", catalogRouter);

export { v1Router };
