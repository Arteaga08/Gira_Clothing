import { vi, type Mock } from "vitest";
import { ShippingProviderName } from "@gira/shared";
import { createStubShippingProvider } from "../../src/adapters/shipping/stubShippingProvider.js";
import {
  __setShippingProviderForTests,
  type ShippingProvider,
} from "../../src/adapters/shipping/index.js";

type FakeShippingProvider = ShippingProvider & {
  getRates: Mock<ShippingProvider["getRates"]>;
  createLabel: Mock<ShippingProvider["createLabel"]>;
  cancelLabel: Mock<ShippingProvider["cancelLabel"]>;
};

/**
 * Wraps the real stub in spies so a test can count calls or force a failure
 * (`fake.createLabel.mockRejectedValueOnce(new ShippingProviderError(...))`).
 * Installs itself as the active provider; call `restoreShippingProvider` in afterEach.
 */
const installFakeShippingProvider = (): FakeShippingProvider => {
  const stub = createStubShippingProvider();
  const fake: FakeShippingProvider = {
    name: ShippingProviderName.STUB,
    getRates: vi.fn(stub.getRates),
    createLabel: vi.fn(stub.createLabel),
    cancelLabel: vi.fn(stub.cancelLabel),
  };
  __setShippingProviderForTests(fake);
  return fake;
};

const restoreShippingProvider = (): void => __setShippingProviderForTests(undefined);

export type { FakeShippingProvider };
export { installFakeShippingProvider, restoreShippingProvider };
