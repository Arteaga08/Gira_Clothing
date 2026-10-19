/**
 * The API has no typed error codes: `errorHandler` answers `{status, message}`
 * and nothing else (apps/api/src/middlewares/errorHandler.ts). Messages the
 * panel must show verbatim live here, imported by both apps, instead of being
 * typed out twice. Since M8.4 the panel no longer recognises a flow step by
 * comparing a message: login answers 200 with a `status` discriminator.
 */
const TWO_FACTOR_INVALID_MESSAGE = "El código de verificación es incorrecto.";
const INVALID_CREDENTIALS_MESSAGE = "Correo o contraseña incorrectos.";

export { TWO_FACTOR_INVALID_MESSAGE, INVALID_CREDENTIALS_MESSAGE };
