import type { Request, Response } from "express";
import type { SaveAddressRequest, SaveBillingRequest, UpdateAddressRequest, UpdateProfileRequest } from "@gira/shared";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendResponse } from "../utils/sendResponse.js";
import { AppError } from "../utils/AppError.js";
import { getAccount as getAccountSummary, updateAccountProfile } from "../services/accountService.js";
import { createAddress, deleteAddress, setDefaultAddress, updateAddress } from "../services/addressService.js";
import { deleteBilling, saveBilling } from "../services/billingService.js";

/**
 * Account controllers — orchestrate req/res only. The router already applies
 * `protect` + `restrictTo(customer)`; the guard below is defense-in-depth.
 */

const requireUser = (req: Request) => {
  if (!req.user) throw new AppError("No has iniciado sesión.", 401);
  return req.user;
};

const getAccount = asyncHandler(async (req: Request, res: Response) => {
  const account = await getAccountSummary(requireUser(req)._id);
  sendResponse(res, 200, "Cuenta obtenida correctamente.", account);
});

const updateProfile = asyncHandler(async (req: Request, res: Response) => {
  const profile = await updateAccountProfile(requireUser(req)._id, req.body as UpdateProfileRequest);
  sendResponse(res, 200, "Guardamos tus cambios.", { profile });
});

const addressId = (req: Request): string => String(req.params.addressId);

const addAddress = asyncHandler(async (req: Request, res: Response) => {
  const addresses = await createAddress(requireUser(req)._id, req.body as SaveAddressRequest);
  sendResponse(res, 201, "Guardamos tu dirección.", { addresses });
});

const editAddress = asyncHandler(async (req: Request, res: Response) => {
  const addresses = await updateAddress(requireUser(req)._id, addressId(req), req.body as UpdateAddressRequest);
  sendResponse(res, 200, "Guardamos los cambios de la dirección.", { addresses });
});

const makeAddressDefault = asyncHandler(async (req: Request, res: Response) => {
  const addresses = await setDefaultAddress(requireUser(req)._id, addressId(req));
  sendResponse(res, 200, "Cambiamos tu dirección predeterminada.", { addresses });
});

const removeAddress = asyncHandler(async (req: Request, res: Response) => {
  const addresses = await deleteAddress(requireUser(req)._id, addressId(req));
  sendResponse(res, 200, "Eliminamos la dirección.", { addresses });
});

const putBilling = asyncHandler(async (req: Request, res: Response) => {
  const billing = await saveBilling(requireUser(req)._id, req.body as SaveBillingRequest);
  sendResponse(res, 200, "Guardamos tus datos fiscales.", { billing });
});

const removeBilling = asyncHandler(async (req: Request, res: Response) => {
  await deleteBilling(requireUser(req)._id);
  sendResponse(res, 200, "Eliminamos tus datos fiscales.", { billing: null });
});

export { getAccount, updateProfile, addAddress, editAddress, makeAddressDefault, removeAddress, putBilling, removeBilling };
