import Joi from "joi";
import { PASSWORD_MIN_LENGTH, PASSWORD_MAX_BYTES } from "@gira/shared";

/**
 * Auth input schemas (Joi, stripUnknown). Messages are in Spanish (user-facing).
 * `role` and `emailVerified` are intentionally absent — mass assignment dies at
 * the door.
 */

const email = Joi.string().email().lowercase().trim().max(254).required().messages({
  "string.email": "El correo no tiene un formato válido.",
  "string.max": "El correo no puede pasar de 254 caracteres.",
  "string.empty": "El correo es obligatorio.",
  "any.required": "El correo es obligatorio.",
});

const personName = (label: string) =>
  Joi.string()
    .trim()
    .min(2)
    .max(60)
    // Letters (any alphabet), spaces, apostrophe, dot, hyphen. No digits, colons
    // or slashes: the name shows up in the panel and must not carry a phone or URL.
    .pattern(/^[\p{L}\p{M}][\p{L}\p{M}' .-]*$/u)
    .required()
    .messages({
      "string.pattern.base": `${label} solo puede llevar letras, espacios, apóstrofo, punto y guion.`,
      "string.min": `${label} debe tener al menos 2 letras.`,
      "string.max": `${label} no puede pasar de 60 caracteres.`,
      "string.empty": `${label} es obligatorio.`,
      "any.required": `${label} es obligatorio.`,
    });

/** bcrypt only reads the first 72 BYTES; anything longer would be silently ignored. */
const withinBcryptLimit = (value: string, helpers: Joi.CustomHelpers): string | Joi.ErrorReport =>
  Buffer.byteLength(value, "utf8") > PASSWORD_MAX_BYTES ? helpers.error("password.bytes") : value;

const BYTES_MESSAGE = `La contraseña no puede pasar de ${String(PASSWORD_MAX_BYTES)} bytes (acentos y emojis cuentan más de uno).`;

/** Creating or changing a password (register, reset). Never trimmed. */
const newPassword = Joi.string()
  .min(PASSWORD_MIN_LENGTH)
  .pattern(/[a-z]/, "minúscula")
  .pattern(/[A-Z]/, "mayúscula")
  .pattern(/[0-9]/, "número")
  .custom(withinBcryptLimit)
  .required()
  .messages({
    "string.min": `La contraseña debe tener al menos ${String(PASSWORD_MIN_LENGTH)} caracteres.`,
    "string.pattern.name": "A la contraseña le falta una {#name}.",
    "password.bytes": BYTES_MESSAGE,
    "string.empty": "La contraseña es obligatoria.",
    "any.required": "La contraseña es obligatoria.",
  });

/** An existing password being typed (login, activation): no policy, only presence. */
const currentPassword = Joi.string().required().messages({
  "string.empty": "La contraseña es obligatoria.",
  "any.required": "La contraseña es obligatoria.",
});

const oneTimeToken = Joi.string()
  .pattern(/^[a-f0-9]{64}$/)
  .required()
  .messages({
    "string.pattern.base": "El enlace no es válido. Pide uno nuevo.",
    "string.empty": "El enlace no es válido. Pide uno nuevo.",
    "any.required": "El enlace no es válido. Pide uno nuevo.",
  });

const registerSchema = Joi.object({
  firstName: personName("El nombre"),
  lastName: personName("El apellido"),
  email,
  password: newPassword,
});

const loginSchema = Joi.object({
  email,
  password: currentPassword,
});

// Activation checks the signup password; only a byte ceiling so a huge body
// never reaches bcrypt.
const verifyEmailSchema = Joi.object({
  token: oneTimeToken,
  password: currentPassword.custom(withinBcryptLimit).messages({ "password.bytes": BYTES_MESSAGE }),
});

const emailOnlySchema = Joi.object({ email });

const resetPasswordSchema = Joi.object({
  token: oneTimeToken,
  password: newPassword,
});

// Signed-in change: the current one is only checked for presence and a byte
// ceiling (a huge body never reaches bcrypt); the new one follows the policy.
const changePasswordSchema = Joi.object({
  currentPassword: currentPassword.custom(withinBcryptLimit).messages({ "password.bytes": BYTES_MESSAGE }),
  newPassword,
});

/** The 6-digit TOTP, sent on its own (never with the password) to `/auth/2fa/*`. */
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

export {
  registerSchema,
  loginSchema,
  verifyEmailSchema,
  emailOnlySchema,
  resetPasswordSchema,
  changePasswordSchema,
  twoFactorCodeSchema,
  personName,
};
