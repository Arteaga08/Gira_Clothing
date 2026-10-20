import type { AdminOrder, Wire } from "@gira/shared";

/**
 * An order as the panel holds it. The API's admin DTO still carries fields the
 * UI must never see: `user` / `statusHistory` carry internal ids the panel does
 * not use. They are removed at the HTTP boundary, so they never reach component
 * props, React state, or the RSC payload serialized into the page.
 *
 * `publicId` is a credential (whoever holds it can read the public order page).
 * The admin API no longer sends it, but it is still dropped here as defense in
 * depth, so a regression on the API side cannot reach the DOM.
 */
type PanelOrder = Omit<Wire<AdminOrder>, "user" | "statusHistory">;

type RawAdminOrder = Wire<AdminOrder> & { publicId?: string };

const toPanelOrder = (order: RawAdminOrder): PanelOrder => {
  const { publicId, user, statusHistory, ...rest } = order;
  void publicId;
  void user;
  void statusHistory;
  return rest;
};

export { toPanelOrder };
export type { PanelOrder, RawAdminOrder };
