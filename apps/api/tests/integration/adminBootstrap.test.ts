import { describe, it, expect } from "vitest";
import bcrypt from "bcryptjs";
import { UserRole } from "@gira/shared";
import { User } from "../../src/models/User.js";
import { ensureAdmin } from "../../src/services/adminBootstrapService.js";
import { encryptSecret } from "../../src/utils/crypto.js";

const input = {
  email: "admin@gira.mx",
  password: "Admin12345",
  firstName: "Manuel",
  lastName: "Arteaga",
};

describe("seed:admin (ensureAdmin)", () => {
  it("crea al admin ya verificado y sin 2FA (lo enrola en su primer login)", async () => {
    expect(await ensureAdmin(input)).toBe("created");
    const admin = await User.findOne({ email: input.email }).select("+password");
    expect(admin!.role).toBe(UserRole.ADMIN);
    expect(admin!.emailVerified).toBe(true);
    expect(admin!.firstName).toBe("Manuel");
    expect(admin!.twoFactor.enabled).toBe(false);
    expect(await bcrypt.compare(input.password, admin!.password)).toBe(true);
  });

  it("completa a un admin anterior a M8.5 sin tocar su contraseña ni su 2FA", async () => {
    const hash = await bcrypt.hash("ClaveVieja123", 4);
    const secret = encryptSecret("JBSWY3DPEHPK3PXP");
    // Raw insert: the legacy document still has `name` and no emailVerified.
    await User.collection.insertOne({
      name: "Administrador",
      email: input.email,
      password: hash,
      role: UserRole.ADMIN,
      twoFactor: { enabled: true, secret, failedAttempts: 0 },
      isActive: true,
      tokenVersion: 3,
    });

    expect(await ensureAdmin(input)).toBe("updated");

    const raw = await User.collection.findOne({ email: input.email });
    expect(raw).not.toHaveProperty("name");
    expect(raw).toMatchObject({
      firstName: "Manuel",
      lastName: "Arteaga",
      emailVerified: true,
      password: hash,
      tokenVersion: 3,
      twoFactor: { enabled: true, secret },
    });
  });

  it("rechaza un correo que pertenece a un customer", async () => {
    await User.create({
      firstName: "Cliente",
      lastName: "Uno",
      email: input.email,
      password: "Cliente123",
      role: UserRole.CUSTOMER,
    });
    await expect(ensureAdmin(input)).rejects.toThrow(/no es administrador/);
  });
});
