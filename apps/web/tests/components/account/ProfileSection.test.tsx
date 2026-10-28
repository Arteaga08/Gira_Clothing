import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ProfileSection } from "@/components/store/account/profile/ProfileSection";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }) }));

const PROFILE = { firstName: "María", lastName: "López", email: "m@correo.mx", phone: null, birthDate: null, city: null };

describe("ProfileSection · foco", () => {
  it("«Editar» lleva el foco al primer campo y Cancelar lo devuelve al título del bloque", async () => {
    render(<ProfileSection initialProfile={PROFILE} />);
    await userEvent.click(screen.getByRole("button", { name: "Editar" }));
    expect(screen.getByLabelText("Nombre")).toHaveFocus();

    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.getByRole("heading", { name: "Datos personales" })).toHaveFocus();
  });

  it("«Cambiar» lleva el foco a la contraseña actual y Cancelar lo devuelve a «Contraseña»", async () => {
    render(<ProfileSection initialProfile={PROFILE} />);
    await userEvent.click(screen.getByRole("button", { name: "Cambiar" }));
    expect(screen.getByLabelText("Contraseña actual")).toHaveFocus();

    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.getByRole("heading", { name: "Contraseña" })).toHaveFocus();
  });
});
