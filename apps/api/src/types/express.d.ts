import type { UserDocument } from "../models/User.js";

/**
 * Augments Express Request with the authenticated user loaded by `protect`.
 */
declare global {
  namespace Express {
    interface Request {
      user?: UserDocument;
      /** The session (`sid`) the request authenticated with — logout closes exactly this one. */
      sessionId?: string;
    }
  }
}

export {};
