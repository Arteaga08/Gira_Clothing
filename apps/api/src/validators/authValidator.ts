import Joi from "joi";

/**
 * Auth input schemas (Joi, stripUnknown). Messages are in Spanish (user-facing).
 * `role` is intentionally absent — mass assignment dies at the door.
 */

const email = Joi.string().email().lowercase().trim().required().messages({
  "string.email": "El correo no tiene un formato válido.",
  "string.empty": "El correo es obligatorio.",
  "any.required": "El correo es obligatorio.",
});

const registerSchema = Joi.object({
  name: Joi.string().trim().min(2).max(120).required().messages({
    "string.min": "El nombre debe tener al menos 2 caracteres.",
    "string.empty": "El nombre es obligatorio.",
    "any.required": "El nombre es obligatorio.",
  }),
  email,
  password: Joi.string()
    .min(8)
    .pattern(/[a-z]/, "minúscula")
    .pattern(/[A-Z]/, "mayúscula")
    .pattern(/[0-9]/, "número")
    .required()
    .messages({
      "string.min": "La contraseña debe tener al menos 8 caracteres.",
      "string.pattern.name": "La contraseña debe incluir una {#name}.",
      "string.empty": "La contraseña es obligatoria.",
      "any.required": "La contraseña es obligatoria.",
    }),
});

const loginSchema = Joi.object({
  email,
  password: Joi.string().required().messages({
    "string.empty": "La contraseña es obligatoria.",
    "any.required": "La contraseña es obligatoria.",
  }),
  // Optional TOTP code, only used when the account has 2FA enabled.
  code: Joi.string().trim().pattern(/^\d{6}$/).messages({
    "string.pattern.base": "El código de verificación debe tener 6 dígitos.",
  }),
});

/**
 * `code` is OPTIONAL here: it is only required when the account already has an
 * active second factor, which is a question about stored state, not about the
 * payload — authService decides and rejects.
 */
const twoFactorSetupSchema = Joi.object({
  code: Joi.string()
    .trim()
    .pattern(/^\d{6}$/)
    .messages({ "string.pattern.base": "El código de verificación debe tener 6 dígitos." }),
});

const twoFactorCodeSchema = Joi.object({
  code: Joi.string()
    .trim()
    .pattern(/^\d{6}$/)
    .required()
    .messages({
      "string.pattern.base": "El código de verificación debe tener 6 dígitos.",
      "string.empty": "El código de verificación es obligatorio.",
      "any.required": "El código de verificación es obligatorio.",
    }),
});

export { registerSchema, loginSchema, twoFactorSetupSchema, twoFactorCodeSchema };
