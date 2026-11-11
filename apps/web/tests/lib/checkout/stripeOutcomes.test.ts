import { describe, it, expect } from "vitest";
import { mapConfirmResult, mapSubmitError } from "@/lib/checkout/stripeOutcomes";

describe("mapConfirmResult", () => {
  it("un pago exitoso o en proceso es 'submitted'", () => {
    expect(mapConfirmResult({ paymentIntent: { status: "succeeded" } })).toEqual({ status: "submitted" });
    expect(mapConfirmResult({ paymentIntent: { status: "processing" } })).toEqual({ status: "submitted" });
  });

  it("un rechazo de tarjeta conserva el mensaje de Stripe y permite reintentar", () => {
    expect(mapConfirmResult({ error: { type: "card_error", message: "Tu tarjeta fue rechazada." } })).toEqual({
      status: "declined",
      message: "Tu tarjeta fue rechazada.",
    });
  });

  it("un rechazo sin mensaje usa el texto por defecto", () => {
    const outcome = mapConfirmResult({ error: { type: "card_error" } });
    expect(outcome.status).toBe("declined");
    expect(outcome).toHaveProperty("message", expect.stringContaining("rechaz"));
  });

  it("un error de validación pide revisar los datos", () => {
    expect(mapConfirmResult({ error: { type: "validation_error", message: "Revisa el número." } })).toEqual({
      status: "invalid",
      message: "Revisa el número.",
    });
  });

  it("payment_intent_unexpected_state significa que el pago ya se hizo", () => {
    expect(mapConfirmResult({ error: { type: "invalid_request_error", code: "payment_intent_unexpected_state" } })).toEqual({
      status: "already",
    });
  });

  it("requires_payment_method tras confirmar es un rechazo", () => {
    expect(mapConfirmResult({ paymentIntent: { status: "requires_payment_method" } }).status).toBe("declined");
  });

  it("cualquier otra cosa es un error genérico sin filtrar el mensaje técnico", () => {
    const outcome = mapConfirmResult({ error: { type: "api_error", message: "internal_secret_detail" } });
    expect(outcome.status).toBe("error");
    expect(JSON.stringify(outcome)).not.toContain("internal_secret_detail");
    expect(mapConfirmResult({}).status).toBe("error");
  });
});

describe("mapSubmitError", () => {
  it("muestra el mensaje de validación del Element", () => {
    expect(mapSubmitError({ type: "validation_error", message: "Falta el CVC." })).toBe("Falta el CVC.");
  });
  it("usa un texto por defecto si no hay mensaje", () => {
    expect(mapSubmitError({ type: "validation_error" })).toContain("Revisa");
  });
});
