import type { AdminOrder, Wire } from "@gira/shared";

/**
 * An order as the panel holds it. The API's admin DTO still carries fields the
 * UI must never see: `publicId` is a credential (whoever holds it can read the
 * public order page), and `user` / `statusHistory` carry internal ids the panel
 * does not use. They are removed at the HTTP boundary, so they never reach
 * component props, React state, or the RSC payload serialized into the page.
 */
type PanelOrder = Omit<Wire<AdminOrder>, "publicId" | "user" | "statusHistory">;

const toPanelOrder = (order: Wire<AdminOrder>): PanelOrder => {
  const { publicId, user, statusHistory, ...rest } = order;
  void publicId;
  void user;
  void statusHistory;
  return rest;
};

export { toPanelOrder };
export type { PanelOrder };
