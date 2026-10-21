import { vi } from "vitest";
import type { PanelTaxon } from "@/lib/taxonomy/panelTaxon";

const FAMILY_ID = "68f2ab12c3d4e5f6a7b8c9e1";
const FAMILY_2_ID = "68f2ab12c3d4e5f6a7b8c9e2";
const PRINT_ID = "68f2ab12c3d4e5f6a7b8c9f1";

const makePanelTaxon = (overrides: Partial<PanelTaxon> = {}): PanelTaxon => ({
  id: FAMILY_ID,
  name: "Florales",
  description: "Rosas y peonías",
  isActive: true,
  childCount: 8,
  activeChildCount: 6,
  activeChildren: [{ id: PRINT_ID, name: "Rosas de verano" }],
  updatedAt: "2026-10-20T10:00:00.000Z",
  ...overrides,
});

const makeClientMock = () => ({
  list: vi.fn(),
  get: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  retire: vi.fn(),
  reactivate: vi.fn(),
});

export { FAMILY_ID, FAMILY_2_ID, PRINT_ID, makePanelTaxon, makeClientMock };
