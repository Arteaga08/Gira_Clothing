import { Router } from "express";
import mongoose from "mongoose";
import { globalLimiter } from "../../middlewares/rateLimit.js";
import { sendResponse } from "../../utils/sendResponse.js";
import { authRouter } from "./authRoutes.js";
import { adminRouter } from "./admin/index.js";
import { catalogRouter } from "./catalogRoutes.js";
import { cartRouter } from "./cartRoutes.js";
import { orderRouter } from "./orderRoutes.js";
import { shippingRouter } from "./shippingRoutes.js";
import { storefrontRouter } from "./storefrontRoutes.js";

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

// Admin sits BEFORE the global limiter on purpose: the actor already passed
// login + role, and throttling legitimate work there helps nobody.
v1Router.use("/admin", adminRouter);

v1Router.use(globalLimiter);
v1Router.use("/auth", authRouter);
v1Router.use("/catalog", catalogRouter);
v1Router.use("/cart", cartRouter);
v1Router.use("/orders", orderRouter);
v1Router.use("/shipping", shippingRouter);
v1Router.use("/storefront", storefrontRouter);

export { v1Router };
