import Joi from "joi";
import { ShipmentStatus } from "@gira/shared";

const createShipmentSchema = Joi.object({
  carrier: Joi.string().trim().min(2).max(60).required().messages({
    "any.required": "Indica la paquetería.",
    "string.empty": "Indica la paquetería.",
  }),
  trackingNumber: Joi.string().trim().min(3).max(60).required().messages({
    "any.required": "Indica el número de guía.",
    "string.empty": "Indica el número de guía.",
  }),
  // https only: this link ships inside the customer's tracking email.
  trackingUrl: Joi.string().trim().uri({ scheme: ["https"] }).max(500).messages({
    "string.uri": "El enlace de seguimiento debe ser una URL https válida.",
  }),
});

const addShipmentEventSchema = Joi.object({
  status: Joi.string()
    .valid(...Object.values(ShipmentStatus))
    .required()
    .messages({ "any.only": "El estado del envío no es válido." }),
  note: Joi.string().trim().max(200),
});

export { createShipmentSchema, addShipmentEventSchema };
