import { isValidObjectId, type Types } from "mongoose";
import { Session } from "../models/Session.js";
import { User } from "../models/User.js";
import { env } from "../config/env.js";
import { parseDurationMs } from "../utils/token.js";

/**
 * Per-device sessions (M8.5). The session JWT names one of these documents;
 * deleting it closes that device only. Closing every session also bumps
 * `tokenVersion`, which `protect` checks too, so it holds even for a session
 * created concurrently with the purge — and it kills open 2FA challenges.
 */

type UserId = Types.ObjectId | string;

/** Same lifetime as the JWT it backs. Returns the sid to sign into the token. */
const createSession = async (userId: UserId): Promise<string> => {
  const session = await Session.create({
    user: userId,
    expiresAt: new Date(Date.now() + parseDurationMs(env.jwtExpiresIn)),
  });
  return String(session._id);
};

/** The session must exist, belong to that user and not be past its expiry (TTL sweeps lag). */
const isSessionActive = async (sid: string, userId: string): Promise<boolean> => {
  if (!isValidObjectId(sid)) return false;
  const found = await Session.exists({ _id: sid, user: userId, expiresAt: { $gt: new Date() } });
  return found !== null;
};

const revokeSession = async (sid: string): Promise<void> => {
  if (!isValidObjectId(sid)) return;
  await Session.deleteOne({ _id: sid });
};

/**
 * Deletes the session documents only. For callers that already bumped
 * tokenVersion in their own atomic update (reset, 2FA enrolment): the bump is
 * what revokes; this is cleanup.
 */
const purgeSessions = async (userId: UserId): Promise<void> => {
  await Session.deleteMany({ user: userId });
};

/**
 * Every session of the account except the one making the request. No
 * tokenVersion bump: that would also end the current session, and a
 * password change must keep the device the person is using.
 */
const revokeOtherSessions = async (userId: UserId, currentSid: string): Promise<void> => {
  if (!isValidObjectId(currentSid)) return;
  await Session.deleteMany({ user: userId, _id: { $ne: currentSid } });
};

/** Every device of the account: "close all", 2FA reset. */
const revokeAllSessions = async (userId: UserId): Promise<void> => {
  await User.updateOne({ _id: userId }, { $inc: { tokenVersion: 1 } });
  await purgeSessions(userId);
};

export {
  createSession,
  isSessionActive,
  revokeSession,
  revokeOtherSessions,
  purgeSessions,
  revokeAllSessions,
};
