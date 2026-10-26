import Joi from "joi";
import {
  ANNOUNCEMENT_MAX_LENGTH,
  ANNOUNCEMENT_MAX_MESSAGES,
  Currency,
  HERO_BUTTON_COLORS,
  HERO_CARD_MAX_LENGTH,
  HERO_HEADLINE_MAX_LENGTH,
  HERO_HEADLINE_MAX_WORDS,
  HERO_MAX_CARDS,
  HERO_MAX_SLIDES,
  HERO_SURFACE_COLORS,
  MEXICAN_STATE_CODES,
  OFFER_ALT_MAX_LENGTH,
  OFFER_BUTTON_MAX_LENGTH,
  OFFER_MESSAGE_MAX_LENGTH,
  PHONE_PATTERN,
  POSTAL_CODE_PATTERN,
  PriceRounding,
} from "@gira/shared";
import { imageObjectSchema, objectId } from "./commonValidator.js";

const money = Joi.number()
  .integer()
  .min(0)
  .max(100_000_000)
  .messages({
    "number.base": "El monto debe ser un número.",
    "number.integer": "Los montos se expresan en centavos, sin decimales.",
    "number.min": "El monto no puede ser negativo.",
  });

const originSchema = Joi.object({
  name: Joi.string().trim().min(2).max(120).required(),
  phone: Joi.string().trim().pattern(PHONE_PATTERN).required().messages({
    "string.pattern.base": "El teléfono debe tener 10 dígitos.",
  }),
  email: Joi.string().trim().lowercase().email().max(160).allow(""),
  line1: Joi.string().trim().min(3).max(200).required(),
  district: Joi.string().trim().min(2).max(120).required(),
  city: Joi.string().trim().min(2).max(120).required(),
  state: Joi.string()
    .valid(...MEXICAN_STATE_CODES)
    .required()
    .messages({ "any.only": "Elige un estado válido." }),
  postalCode: Joi.string().trim().pattern(POSTAL_CODE_PATTERN).required().messages({
    "string.pattern.base": "El código postal debe tener 5 dígitos.",
  }),
});

const parcelSettingsSchema = Joi.object({
  tareGrams: Joi.number().integer().min(0).max(5_000),
  boxLengthCm: Joi.number().integer().min(1).max(200),
  boxWidthCm: Joi.number().integer().min(1).max(200),
  boxHeightCm: Joi.number().integer().min(1).max(200),
  extraUnitHeightCm: Joi.number().integer().min(0).max(100),
  maxWeightGrams: Joi.number().integer().min(1).max(70_000),
}).min(1);

const updateShippingSchema = Joi.object({
  origin: originSchema,
  freeShippingThreshold: money.allow(null),
  parcel: parcelSettingsSchema,
  quoteTtlMinutes: Joi.number().integer().min(5).max(240),
})
  .min(1)
  .messages({ "object.min": "Envía al menos un campo para actualizar." });

const updateCurrencySchema = Joi.object({
  mxnPerUsdCents: Joi.number().integer().min(1).max(1_000_000).messages({
    "number.min": "El tipo de cambio debe ser mayor a cero.",
  }),
  rounding: Joi.string()
    .valid(...Object.values(PriceRounding))
    .messages({ "any.only": "El modo de redondeo no es válido." }),
  supported: Joi.array()
    .items(Joi.string().valid(...Object.values(Currency)))
    .min(1),
})
  .min(1)
  .messages({ "object.min": "Envía al menos un campo para actualizar." });

const updateReservationSchema = Joi.object({
  ttlMinutes: Joi.number().integer().min(1).max(1440).messages({
    "number.max": "La reserva no puede durar más de 24 horas.",
  }),
  cartInactivityDays: Joi.number().integer().min(1).max(365),
})
  .min(1)
  .messages({ "object.min": "Envía al menos un campo para actualizar." });

const updateInventorySchema = Joi.object({
  lowStockThreshold: Joi.number().integer().min(0).max(1000).messages({
    "number.integer": "El umbral debe ser un número entero de unidades.",
    "number.max": "El umbral no puede superar 1000 unidades.",
  }),
})
  .min(1)
  .messages({ "object.min": "Envía al menos un campo para actualizar." });

// strict(): a "16" string must not be coerced into a rate; 1600 bps = 16 %.
const updateTaxSchema = Joi.object({
  rateBps: Joi.number().strict().integer().min(0).max(10_000).required().messages({
    "any.required": "Indica la tasa de IVA.",
    "number.base": "La tasa de IVA debe ser un número.",
    "number.integer": "La tasa se expresa en puntos base, sin decimales.",
    "number.min": "La tasa de IVA no puede ser negativa.",
    "number.max": "La tasa de IVA no puede superar el 100 %.",
  }),
});

// strict(): "true" must not be coerced. An enabled bar needs something to say.
const updateAnnouncementSchema = Joi.object({
  enabled: Joi.boolean().strict().required().messages({
    "any.required": "Indica si la barra se muestra.",
    "boolean.base": "El estado de la barra debe ser verdadero o falso.",
  }),
  messages: Joi.array()
    .items(
      Joi.string().trim().min(1).max(ANNOUNCEMENT_MAX_LENGTH).messages({
        "string.empty": "Los mensajes no pueden estar vacíos.",
        "string.max": `Cada mensaje admite hasta ${ANNOUNCEMENT_MAX_LENGTH} caracteres.`,
      }),
    )
    .max(ANNOUNCEMENT_MAX_MESSAGES)
    .required()
    .messages({
      "any.required": "Envía la lista de mensajes.",
      "array.max": `La barra admite hasta ${ANNOUNCEMENT_MAX_MESSAGES} mensajes.`,
    }),
})
  .custom((value: { enabled: boolean; messages: string[] }, helpers) =>
    value.enabled && value.messages.length === 0 ? helpers.error("announcement.empty") : value,
  )
  .messages({ "announcement.empty": "Agrega al menos un mensaje para mostrar la barra." });

const heroCardSchema = Joi.object({
  text: Joi.string().trim().min(1).max(HERO_CARD_MAX_LENGTH).required().messages({
    "string.empty": "El texto de la card no puede estar vacío.",
    "string.max": `El texto de la card admite hasta ${HERO_CARD_MAX_LENGTH} caracteres.`,
    "any.required": "El texto de la card es obligatorio.",
  }),
  color: Joi.string()
    .valid(...HERO_SURFACE_COLORS)
    .required()
    .messages({ "any.only": "El color de la card no es válido." }),
});

// Empty is allowed: the storefront then shows the brand name for that photo.
const heroHeadlineSchema = Joi.string()
  .trim()
  .allow("")
  .max(HERO_HEADLINE_MAX_LENGTH)
  .required()
  .custom((value: string, helpers) =>
    value.split(/\s+/).filter(Boolean).length > HERO_HEADLINE_MAX_WORDS ? helpers.error("hero.words") : value,
  )
  .messages({
    "string.max": `El titular admite hasta ${HERO_HEADLINE_MAX_LENGTH} caracteres.`,
    "hero.words": `El titular admite hasta ${HERO_HEADLINE_MAX_WORDS} palabras.`,
    "any.required": "Cada foto necesita su titular (puede ir vacío).",
  });

const heroSlideSchema = Joi.object({
  headline: heroHeadlineSchema,
  image: imageObjectSchema.required(),
  productId: objectId.allow(null).required().messages({
    "any.required": "Indica el producto de la foto o déjalo vacío.",
  }),
  titleColor: Joi.string()
    .valid(...HERO_SURFACE_COLORS)
    .required()
    .messages({ "any.only": "El color del titular no es válido." }),
  buttonColor: Joi.string()
    .valid(...HERO_BUTTON_COLORS)
    .required()
    .messages({ "any.only": "El color del botón no es válido." }),
  cards: Joi.array().items(heroCardSchema).max(HERO_MAX_CARDS).required().messages({
    "array.max": `Máximo ${HERO_MAX_CARDS} cards por foto.`,
  }),
});

const updateHeroSchema = Joi.object({
  slides: Joi.array().items(heroSlideSchema).max(HERO_MAX_SLIDES).required().messages({
    "array.max": `Máximo ${HERO_MAX_SLIDES} fotos.`,
    "any.required": "Envía la lista de fotos.",
  }),
});

const OFFER_REQUIRED_TO_SHOW = ["image", "alt", "message", "buttonLabel"] as const;

// Every text may be empty while the banner is hidden; shown, nothing may be
// missing. No model: the button leads to the shop.
const updateOfferBannerSchema = Joi.object({
  enabled: Joi.boolean().strict().required().messages({
    "any.required": "Indica si el banner se muestra.",
    "boolean.base": "El estado del banner debe ser verdadero o falso.",
  }),
  image: imageObjectSchema.allow(null).required().messages({
    "any.required": "Envía la foto del banner o déjala vacía.",
  }),
  alt: Joi.string().trim().allow("").max(OFFER_ALT_MAX_LENGTH).required().messages({
    "string.max": `La descripción de la foto admite hasta ${OFFER_ALT_MAX_LENGTH} caracteres.`,
    "any.required": "Envía la descripción de la foto.",
  }),
  message: Joi.string().trim().allow("").max(OFFER_MESSAGE_MAX_LENGTH).required().messages({
    "string.max": `La frase admite hasta ${OFFER_MESSAGE_MAX_LENGTH} caracteres.`,
    "any.required": "Envía la frase del banner.",
  }),
  buttonLabel: Joi.string().trim().allow("").max(OFFER_BUTTON_MAX_LENGTH).required().messages({
    "string.max": `El texto del botón admite hasta ${OFFER_BUTTON_MAX_LENGTH} caracteres.`,
    "any.required": "Envía el texto del botón.",
  }),
  productId: objectId.allow(null).required().messages({
    "any.required": "Indica el producto del banner o déjalo vacío.",
  }),
})
  .custom((value: Record<(typeof OFFER_REQUIRED_TO_SHOW)[number], unknown> & { enabled: boolean }, helpers) =>
    value.enabled && OFFER_REQUIRED_TO_SHOW.some((field) => !value[field]) ? helpers.error("offer.incomplete") : value,
  )
  .messages({ "offer.incomplete": "Para mostrar el banner completa la foto, su descripción, la frase y el botón." });

export {
  updateHeroSchema,
  updateOfferBannerSchema,
  updateShippingSchema,
  updateCurrencySchema,
  updateReservationSchema,
  updateInventorySchema,
  updateTaxSchema,
  updateAnnouncementSchema,
};
