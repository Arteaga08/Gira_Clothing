import { describe, expect, it } from "vitest";
import { changePassword, createAddress, deleteAddress, deleteBilling, saveBilling, setDefaultAddress, updateAddress, updateProfile } from "@/lib/api/account";
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

  const ADDRESS = { id: "a1", label: null, recipient: "M", line1: "x", line2: null, district: "d", city: "c", state: "CX", postalCode: "06000", country: "MX", phone: "5512345678", isDefault: true };

  it("direcciones: cada llamada usa su método y ruta y devuelve la lista completa", async () => {
    const fetchMock = stubFetch();
    const answer = jsonResponse(200, { status: "success", message: "ok", data: { addresses: [ADDRESS] } });
    fetchMock.mockResolvedValue(answer);

    const body = { recipient: "M", line1: "x", district: "d", city: "c", state: "CX", postalCode: "06000", country: "MX" as const, phone: "5512345678" };
    expect(await createAddress(body)).toEqual([ADDRESS]);
    await updateAddress("a1", { city: "Puebla", label: null });
    await setDefaultAddress("a1");
    await deleteAddress("a1");

    const calls = fetchMock.mock.calls as [string, RequestInit][];
    expect(calls.map(([url, init]) => `${init.method} ${url.replace("http://api.test/api/v1", "")}`)).toEqual([
      "POST /account/addresses",
      "PATCH /account/addresses/a1",
      "POST /account/addresses/a1/default",
      "DELETE /account/addresses/a1",
    ]);
    expect(JSON.parse(calls[1]![1].body as string)).toEqual({ city: "Puebla", label: null });
    expect(calls[3]![1].body).toBeUndefined();
  });

  it("facturación: PUT con el bloque completo y DELETE", async () => {
    const fetchMock = stubFetch();
    const billing = { rfc: "LOMM910312AB1", legalName: "M", fiscalRegime: "612", cfdiUse: "G03", postalCode: "06000" };
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { status: "success", message: "ok", data: { billing } }));
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { status: "success", message: "ok", data: { billing: null } }));

    expect(await saveBilling(billing)).toEqual(billing);
    await deleteBilling();

    const calls = fetchMock.mock.calls as [string, RequestInit][];
    expect([calls[0]![1].method, calls[1]![1].method]).toEqual(["PUT", "DELETE"]);
    expect(calls[0]![0]).toBe("http://api.test/api/v1/account/billing");
  });
});
