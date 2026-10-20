import { Router } from "express";
import { optionalAuth } from "../../middlewares/protect.js";
import { validate } from "../../middlewares/validate.js";
import { shippingQuoteLimiter } from "../../middlewares/rateLimit.js";
import { createQuoteSchema } from "../../validators/shippingValidator.js";
import { createQuote } from "../../controllers/shippingController.js";

const shippingRouter = Router();

// Open to guests like checkout; the quote is bound to the account when there is one.
shippingRouter.post(
  "/quotes",
  shippingQuoteLimiter,
  optionalAuth,
  validate(createQuoteSchema),
  createQuote,
);

export { shippingRouter };
