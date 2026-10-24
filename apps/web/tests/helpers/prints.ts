import type { PanelPrint } from "@/lib/prints/panelPrint";

const FAMILY_A_ID = "68f2ab12c3d4e5f6a7b8c9a1";
const FAMILY_B_ID = "68f2ab12c3d4e5f6a7b8c9a2";
const PRINT_ID = "68f2ab12c3d4e5f6a7b8c9b1";
const PRINT_2_ID = "68f2ab12c3d4e5f6a7b8c9b2";
const MODEL_ID = "68f2ab12c3d4e5f6a7b8c9c1";

const makePanelPrint = (overrides: Partial<PanelPrint> = {}): PanelPrint => ({
  id: PRINT_ID,
  name: "Rosas de verano",
  sku: "FLR-001",
  family: { id: FAMILY_A_ID, name: "Florales" },
  imageUrl: "https://res.cloudinary.com/gira/rosas.jpg",
  isActive: true,
  homePosition: null,
  variantCount: 6,
  activeVariantCount: 6,
  activeProducts: [{ id: MODEL_ID, name: "Cosmetiquera chica" }],
  ...overrides,
});

export { FAMILY_A_ID, FAMILY_B_ID, PRINT_ID, PRINT_2_ID, MODEL_ID, makePanelPrint };
