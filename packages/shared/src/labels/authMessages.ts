/**
 * The API has no typed error codes: `errorHandler` answers `{status, message}`
 * and nothing else (apps/api/src/middlewares/errorHandler.ts). The admin panel
 * therefore has to recognise "the second factor is missing" by comparing this
 * exact string, so it lives here, imported by both apps, instead of being
 * typed out twice. Changing the wording becomes a cross-app change by
 * construction, not a silent drift.
 */
const TWO_FACTOR_REQUIRED_MESSAGE = "Se requiere el código de verificación de dos factores.";
const TWO_FACTOR_INVALID_MESSAGE = "El código de verificación es incorrecto.";
const INVALID_CREDENTIALS_MESSAGE = "Correo o contraseña incorrectos.";

export { TWO_FACTOR_REQUIRED_MESSAGE, TWO_FACTOR_INVALID_MESSAGE, INVALID_CREDENTIALS_MESSAGE };
