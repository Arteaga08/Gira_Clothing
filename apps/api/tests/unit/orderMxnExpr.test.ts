import { describe, it, expect } from "vitest";
import { mxnOf, NET_MXN_EXPR } from "../../src/utils/orderMxnExpr.js";

describe("orderMxnExpr", () => {
  it("mxnOf deja los pesos tal cual y convierte USD con la tasa guardada", () => {
    expect(JSON.stringify(mxnOf("$total"))).toContain('"$eq":["$currency","MXN"]');
    expect(JSON.stringify(mxnOf("$total"))).toContain('"$exchangeRate"');
  });

  it("NET_MXN_EXPR resta el reembolso acumulado y nunca baja de 0", () => {
    const text = JSON.stringify(NET_MXN_EXPR);
    expect(text).toContain("payment.refundedAmount");
    expect(text).toContain('"$max"');
  });
});
