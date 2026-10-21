import Joi from "joi";
import {
  CANCEL_REASON_MAX,
  CANCEL_REASON_MIN,
  MAX_BULK_ORDERS,
  ORDER_NUMBER_PATTERN,
  ORDER_STATUS_GROUPS,
  OrderPriority,
  OrderStatus,
} from "@gira/shared";
import { listQueryBase } from "./listQueryValidator.js";
import { objectId } from "./commonValidator.js";

const ADMIN_SORTABLE: readonly string[] = ["createdAt", "total", "status", "priority"];

/** A single value or a comma-separated list ("paid,processing"), every item from `allowed`. */
const csvOf = (allowed: readonly string[]) =>
  Joi.string().custom((value: string, helpers) =>
    value.split(",").every((item) => allowed.includes(item)) ? value : helpers.error("any.invalid"),
  );

const adminOrderListQuerySchema = listQueryBase.keys({
  status: csvOf(Object.values(OrderStatus)).messages({ "any.invalid": "El estado no es válido." }),
  group: Joi.string()
    .valid(...Object.keys(ORDER_STATUS_GROUPS))
    .messages({ "any.only": "El grupo no es válido." }),
  priority: Joi.string()
    .valid(...Object.values(OrderPriority))
    .messages({ "any.only": "La prioridad no es válida." }),
  customer: Joi.string()
    .hex()
    .length(24)
    .messages({ "string.hex": "El cliente no es válido.", "string.length": "El cliente no es válido." }),
  orderNumber: Joi.string()
    .trim()
    .uppercase()
    .pattern(ORDER_NUMBER_PATTERN)
    .messages({ "string.pattern.base": "El folio no tiene un formato válido." }),
  sort: Joi.string()
    .trim()
    .max(40)
    .custom((value: string, helpers) =>
      ADMIN_SORTABLE.includes(value.replace(/^-/, "")) ? value : helpers.error("any.invalid"),
    )
    .messages({ "any.invalid": "No se puede ordenar por ese campo." }),
});

const updateOrderStatusSchema = Joi.object({
  status: Joi.string()
    .valid(...Object.values(OrderStatus))
    .required()
    .messages({ "any.only": "El estado no es válido." }),
  // Cancelling closes a sale: the "why" is mandatory and stays on the order.
  reason: Joi.when("status", {
    is: OrderStatus.CANCELLED,
    then: Joi.string()
      .trim()
      .min(CANCEL_REASON_MIN)
      .max(CANCEL_REASON_MAX)
      .required()
      .messages({
        "any.required": "Escribe el motivo de la cancelación.",
        "string.empty": "Escribe el motivo de la cancelación.",
        "string.min": `El motivo debe tener al menos ${String(CANCEL_REASON_MIN)} caracteres.`,
        "string.max": `El motivo no puede pasar de ${String(CANCEL_REASON_MAX)} caracteres.`,
      }),
    otherwise: Joi.forbidden().messages({ "any.unknown": "El motivo solo aplica al cancelar." }),
  }),
});

const updatePrioritySchema = Joi.object({
  priority: Joi.string()
    .valid(...Object.values(OrderPriority))
    .required()
    .messages({ "any.only": "La prioridad no es válida.", "any.required": "Indica la prioridad." }),
});

const bulkStatusSchema = Joi.object({
  ids: Joi.array()
    .items(objectId)
    .min(1)
    .max(MAX_BULK_ORDERS)
    .unique()
    .required()
    .messages({
      "array.min": "Selecciona al menos una orden.",
      "array.max": `Máximo ${String(MAX_BULK_ORDERS)} órdenes por lote.`,
      "array.unique": "Hay órdenes repetidas en el lote.",
      "any.required": "Selecciona al menos una orden.",
    }),
  // The only manual move that makes sense in bulk (paid -> processing).
  status: Joi.string()
    .valid(OrderStatus.PROCESSING)
    .required()
    .messages({ "any.only": "Solo se puede pasar a «en proceso» en lote." }),
});

export {
  adminOrderListQuerySchema,
  updateOrderStatusSchema,
  updatePrioritySchema,
  bulkStatusSchema,
};
