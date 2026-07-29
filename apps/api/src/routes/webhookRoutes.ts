import { Router, raw } from "express";
import { stripeWebhook } from "../controllers/webhookController.js";

/**
 * NOT under routes/v1/: this router mounts before the middleware chain in
 * app.ts (raw body, no helmet/json/sanitize), so it deliberately sits outside
 * the versioned tree that assumes the standard chain already ran.
 */
const webhookRouter = Router();

webhookRouter.post("/stripe", raw({ type: "application/json", limit: "1mb" }), stripeWebhook);

export { webhookRouter };
