import { describe, expect, it } from "vitest";
import { changePassword, updateProfile } from "@/lib/api/account";
import { ApiError } from "@/lib/api/ApiError";
import { jsonResponse, stubFetch } from "../../helpers/fetchMock";

const PROFILE = { firstName: "María", lastName: "López", email: "m@correo.mx", phone: null, birthDate: null, city: null };

describe("cliente de «Mi cuenta»", () => {
  it("updateProfile: PATCH /account/profile con credenciales y devuelve el perfil", async () => {
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { status: "success", message: "ok", data: { profile: PROFILE } }));

    const profile = await updateProfile({ city: "CDMX", phone: null });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://api.test/api/v1/account/profile");
    expect(init.method).toBe("PATCH");
    expect(init.credentials).toBe("include");
    expect(JSON.parse(init.body as string)).toEqual({ city: "CDMX", phone: null });
    expect(profile).toEqual(PROFILE);
  });

  it("changePassword: PATCH /auth/password con las dos contraseñas", async () => {
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { status: "success", message: "ok" }));

    await changePassword({ currentPassword: "Vieja12345", newPassword: "Nueva12345" });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://api.test/api/v1/auth/password");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body as string)).toEqual({ currentPassword: "Vieja12345", newPassword: "Nueva12345" });
  });

  it("changePassword: una contraseña actual incorrecta llega como error HTTP 400 con el texto del API", async () => {
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValueOnce(jsonResponse(400, { status: "fail", message: "La contraseña actual no es correcta." }));

    await expect(changePassword({ currentPassword: "x", newPassword: "Nueva12345" })).rejects.toMatchObject({
      kind: "http",
      status: 400,
      message: "La contraseña actual no es correcta.",
    } satisfies Partial<ApiError>);
  });
});
