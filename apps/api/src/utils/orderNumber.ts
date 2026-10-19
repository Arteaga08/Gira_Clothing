import { randomInt } from "node:crypto";
import {
  ORDER_NUMBER_ALPHABET,
  ORDER_NUMBER_BODY_LENGTH,
  ORDER_NUMBER_PREFIX,
} from "@gira/shared";

/**
 * Human folio, dictated over the phone. Random on purpose: a shared counter is a
 * write hot spot under concurrency and leaks the shop's total sales volume.
 * Uniqueness is enforced by the unique index; the caller retries on collision.
 */
const generateOrderNumber = (): string => {
  let body = "";
  for (let i = 0; i < ORDER_NUMBER_BODY_LENGTH; i += 1) {
    body += ORDER_NUMBER_ALPHABET[randomInt(ORDER_NUMBER_ALPHABET.length)];
  }
  return `${ORDER_NUMBER_PREFIX}${body}`;
};

export { generateOrderNumber };
