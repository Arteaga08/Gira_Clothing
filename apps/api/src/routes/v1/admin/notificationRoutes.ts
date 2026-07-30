import { Router } from "express";
import { health } from "../../../controllers/notificationController.js";

const notificationRouter = Router();

notificationRouter.get("/health", health);

export { notificationRouter };
