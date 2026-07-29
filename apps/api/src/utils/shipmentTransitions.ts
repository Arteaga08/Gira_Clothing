import { ShipmentStatus } from "@gira/shared";
import { AppError } from "./AppError.js";

/**
 * The single source of truth for the parcel lifecycle. Separate from
 * orderTransitions on purpose: the ORDER is shipped the moment the package
 * leaves, and stays that way, while the PARCEL keeps moving through states the
 * order does not model (out for delivery, returned, lost).
 *
 * There is no "created/pending" state: a Shipment only exists once the admin
 * has the carrier and the tracking number in hand, so it is born IN_TRANSIT.
 */

const TRANSITIONS: Readonly<Record<ShipmentStatus, readonly ShipmentStatus[]>> = Object.freeze({
  [ShipmentStatus.IN_TRANSIT]: [
    ShipmentStatus.OUT_FOR_DELIVERY,
    ShipmentStatus.DELIVERED,
    ShipmentStatus.RETURNED,
    ShipmentStatus.LOST,
  ],
  [ShipmentStatus.OUT_FOR_DELIVERY]: [
    ShipmentStatus.DELIVERED,
    ShipmentStatus.RETURNED,
    ShipmentStatus.LOST,
  ],
  [ShipmentStatus.DELIVERED]: [],
  [ShipmentStatus.RETURNED]: [],
  [ShipmentStatus.LOST]: [],
});

const LABELS: Readonly<Record<ShipmentStatus, string>> = Object.freeze({
  [ShipmentStatus.IN_TRANSIT]: "en tránsito",
  [ShipmentStatus.OUT_FOR_DELIVERY]: "en reparto",
  [ShipmentStatus.DELIVERED]: "entregado",
  [ShipmentStatus.RETURNED]: "devuelto",
  [ShipmentStatus.LOST]: "extraviado",
});

const canTransitionShipment = (from: ShipmentStatus, to: ShipmentStatus): boolean =>
  TRANSITIONS[from].includes(to);

const assertShipmentTransition = (from: ShipmentStatus, to: ShipmentStatus): void => {
  if (!canTransitionShipment(from, to)) {
    throw new AppError(`No se puede pasar un envío de "${LABELS[from]}" a "${LABELS[to]}".`, 409);
  }
};

export { TRANSITIONS, LABELS, canTransitionShipment, assertShipmentTransition };
