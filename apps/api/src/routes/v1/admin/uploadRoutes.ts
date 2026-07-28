import { Router } from "express";
import { uploadSingleImage } from "../../../middlewares/upload.js";
import { validate } from "../../../middlewares/validate.js";
import { uploadBodySchema } from "../../../validators/uploadValidator.js";
import { uploadImageHandler } from "../../../controllers/uploadController.js";

const uploadRouter = Router();

// multer parses the multipart body first, THEN Joi validates the text fields.
uploadRouter.post("/", uploadSingleImage, validate(uploadBodySchema), uploadImageHandler);

export { uploadRouter };
