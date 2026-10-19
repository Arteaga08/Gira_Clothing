import type { Types } from "mongoose";
import { User } from "../models/User.js";
import { generateOneTimeToken, hashOneTimeToken } from "../utils/oneTimeToken.js";

/**
 * Issues the one-time links of an account. One live link per kind: the new
 * one overwrites the subdocument, so the previous token stops matching.
 * The cooldown lives in the update FILTER, which makes it atomic — two
 * concurrent requests can never both issue (and email) a link.
 */

type AccountTokenKind = "emailVerification" | "passwordReset";

const HOUR_MS = 60 * 60 * 1000;

const TOKEN_TTL_MS: Record<AccountTokenKind, number> = {
  emailVerification: 24 * HOUR_MS,
  passwordReset: HOUR_MS,
};

const ISSUE_COOLDOWN_MS = 60 * 1000;

/** Returns the raw token to email, or null while the previous link is under 60 s old. */
const issueAccountToken = async (
  userId: Types.ObjectId | string,
  kind: AccountTokenKind,
): Promise<string | null> => {
  const now = new Date();
  const token = generateOneTimeToken();
  const result = await User.updateOne(
    {
      _id: userId,
      $or: [
        { [`${kind}.issuedAt`]: { $exists: false } },
        { [`${kind}.issuedAt`]: { $lte: new Date(now.getTime() - ISSUE_COOLDOWN_MS) } },
      ],
    },
    {
      $set: {
        [kind]: {
          tokenHash: hashOneTimeToken(token),
          expiresAt: new Date(now.getTime() + TOKEN_TTL_MS[kind]),
          issuedAt: now,
        },
      },
    },
  );
  return result.modifiedCount === 1 ? token : null;
};

/** Filter that matches the user holding a live (unexpired) link of this kind. */
const liveTokenFilter = (kind: AccountTokenKind, token: string): Record<string, unknown> => ({
  [`${kind}.tokenHash`]: hashOneTimeToken(token),
  [`${kind}.expiresAt`]: { $gt: new Date() },
});

export type { AccountTokenKind };
export { issueAccountToken, liveTokenFilter, TOKEN_TTL_MS, ISSUE_COOLDOWN_MS };
