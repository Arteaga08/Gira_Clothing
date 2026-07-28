import { listQueryBase } from "./listQueryValidator.js";
import { slugValue } from "./commonValidator.js";

// Public listings never accept isActive — visitors only ever see active documents.
const publicListQuerySchema = listQueryBase;

const publicPrintQuerySchema = listQueryBase.keys({ family: slugValue });

const publicProductQuerySchema = listQueryBase.keys({
  category: slugValue,
  print: slugValue,
  family: slugValue,
});

export { publicListQuerySchema, publicPrintQuerySchema, publicProductQuerySchema };
