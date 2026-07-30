import { Router } from "express";
import { validate } from "../../../middlewares/validate.js";
import { userListQuerySchema } from "../../../validators/userValidator.js";
import { list } from "../../../controllers/userController.js";

const userRouter = Router();

userRouter.get("/", validate(userListQuerySchema, "query"), list);

export { userRouter };
