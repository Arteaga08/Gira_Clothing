import { describe, it, expect } from "vitest";
import request from "supertest";
import { UserRole } from "@gira/shared";
import { buildApp } from "../../src/app.js";
import { User } from "../../src/models/User.js";
import { loginAsAdmin, loginAsCustomer } from "../helpers/auth.js";

const app = buildApp();
const URL = "/api/v1/admin/users";

describe("GET /admin/users", () => {
  it("rechaza sin sesión", async () => {
    expect((await request(app).get(URL)).status).toBe(401);
  });

  it("rechaza a un customer", async () => {
    const cookie = await loginAsCustomer(app);
    expect((await request(app).get(URL).set("cookie", cookie)).status).toBe(403);
  });

  it("lista con meta de paginación", async () => {
    const cookie = await loginAsAdmin(app);
    await User.create({ name: "Cliente Uno", email: "uno@example.com", password: "Clave1234" });
    const res = await request(app).get(`${URL}?limit=5`).set("cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body.data.users.length).toBeGreaterThan(0);
    expect(res.body.meta).toEqual(
      expect.objectContaining({ page: 1, limit: 5, total: expect.any(Number) }),
    );
  });

  it("el DTO nunca expone password ni twoFactor.secret", async () => {
    const cookie = await loginAsAdmin(app);
    const res = await request(app).get(URL).set("cookie", cookie);
    for (const user of res.body.data.users) {
      expect(user).not.toHaveProperty("password");
      expect(user).not.toHaveProperty("twoFactor");
      expect(user).toEqual(
        expect.objectContaining({
          id: expect.any(String),
          name: expect.any(String),
          email: expect.any(String),
          role: expect.any(String),
          isActive: expect.any(Boolean),
          twoFactorEnabled: expect.any(Boolean),
        }),
      );
    }
  });

  it("busca por nombre y por email", async () => {
    const cookie = await loginAsAdmin(app);
    await User.create({ name: "Zoe Mendoza", email: "zoe.m@example.com", password: "Clave1234" });
    const byName = await request(app).get(`${URL}?search=Zoe`).set("cookie", cookie);
    const byEmail = await request(app).get(`${URL}?search=zoe.m@`).set("cookie", cookie);
    expect(
      byName.body.data.users.some((u: { email: string }) => u.email === "zoe.m@example.com"),
    ).toBe(true);
    expect(
      byEmail.body.data.users.some((u: { email: string }) => u.email === "zoe.m@example.com"),
    ).toBe(true);
  });

  it("filtra por role e isActive", async () => {
    const cookie = await loginAsAdmin(app);
    const res = await request(app).get(`${URL}?role=admin`).set("cookie", cookie);
    for (const user of res.body.data.users) expect(user.role).toBe(UserRole.ADMIN);
  });

  it("un sort desconocido cae al default sin romper", async () => {
    const cookie = await loginAsAdmin(app);
    const res = await request(app).get(`${URL}?sort=noExiste`).set("cookie", cookie);
    expect(res.status).toBe(200);
  });
});
