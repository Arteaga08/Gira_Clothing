import type { Types } from "mongoose";
import type { BillingInfo, SaveBillingRequest } from "@gira/shared";
import { User, type BillingAttrs } from "../models/User.js";
import { AppError } from "../utils/AppError.js";

/**
 * The customer's tax data (M15c): one block per account, replaced whole on
 * save and removed whole on delete. It is only stored for now — no invoice is
 * issued from it. The RFC is personal data: it never goes to a log or to the
 * audit trail, so these functions record nothing.
 */

const toBillingInfo = (row: BillingAttrs | undefined): BillingInfo | null =>
  row
    ? {
        rfc: row.rfc,
        legalName: row.legalName,
        fiscalRegime: row.fiscalRegime,
        cfdiUse: row.cfdiUse,
        postalCode: row.postalCode,
      }
    : null;

interface BillingRow {
  billing?: BillingAttrs | undefined;
}

const saveBilling = async (userId: Types.ObjectId, input: SaveBillingRequest): Promise<BillingInfo | null> => {
  const billing: BillingAttrs = {
    rfc: input.rfc,
    legalName: input.legalName,
    fiscalRegime: input.fiscalRegime,
    cfdiUse: input.cfdiUse,
    postalCode: input.postalCode,
  };
  const row = await User.findOneAndUpdate(
    { _id: userId, isActive: true },
    { $set: { billing } },
    { new: true, runValidators: true },
  )
    .select("billing")
    .lean<BillingRow>();
  if (!row) throw new AppError("No encontramos tu cuenta.", 404);
  return toBillingInfo(row.billing);
};

const deleteBilling = async (userId: Types.ObjectId): Promise<void> => {
  const row = await User.findOneAndUpdate({ _id: userId, isActive: true }, { $unset: { billing: "" } }).select("_id");
  if (!row) throw new AppError("No encontramos tu cuenta.", 404);
};

export { toBillingInfo, saveBilling, deleteBilling };
