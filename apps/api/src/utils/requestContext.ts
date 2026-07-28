import type { Request } from "express";
import type { Types } from "mongoose";

/** Shared audit context threaded from controller to service on every mutation. */
interface RequestContext {
  actorId?: Types.ObjectId | undefined;
  ip?: string | undefined;
}

/** Builds the audit context from an authenticated request (admin routes only). */
const buildContext = (req: Request): RequestContext => ({
  actorId: req.user?._id,
  ip: req.ip,
});

export type { RequestContext };
export { buildContext };
