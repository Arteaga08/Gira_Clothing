/**
 * Operational error: an expected failure with an HTTP status and a user-facing
 * (Spanish) message. `isOperational` lets the global error handler distinguish
 * these from unexpected bugs, which must never leak internals in production.
 */
class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    Object.setPrototypeOf(this, AppError.prototype);
    Error.captureStackTrace(this, this.constructor);
  }
}

export { AppError };
