/**
 * User-facing Spanish messages for failures the API itself never describes:
 * a dropped connection, a client-side timeout, or a response body that
 * wasn't valid JSON. Kept in one place so the wording stays consistent
 * wherever `request()` is consumed.
 */
const NETWORK_ERROR_MESSAGE = "No se pudo conectar con el servidor. Revisa tu conexión e intenta de nuevo.";
const TIMEOUT_ERROR_MESSAGE = "El servidor tardó demasiado en responder. Intenta de nuevo.";
const PARSE_ERROR_MESSAGE = "Recibimos una respuesta inesperada del servidor. Intenta de nuevo.";
const MISSING_DATA_MESSAGE = "El servidor no devolvió la información esperada.";

export { NETWORK_ERROR_MESSAGE, TIMEOUT_ERROR_MESSAGE, PARSE_ERROR_MESSAGE, MISSING_DATA_MESSAGE };
