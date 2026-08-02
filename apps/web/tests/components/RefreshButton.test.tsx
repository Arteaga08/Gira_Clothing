import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RefreshButton } from "@/components/shell/RefreshButton";

const { refreshMock } = vi.hoisted(() => ({ refreshMock: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: refreshMock }) }));

describe("RefreshButton", () => {
  it("al hacer click llama a router.refresh()", async () => {
    render(<RefreshButton />);
    await userEvent.click(screen.getByRole("button", { name: "Actualizar datos" }));
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });
});
