import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeRequest, parseResponse } from "../helpers";

// ── Mock auth lib so isAdmin() is controllable per test ───────────────────
vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return {
    ...actual,               // keep real createAdminToken / verifyAdminToken
    isAdmin: vi.fn(),        // stub — set return value per test
  };
});

import { isAdmin } from "@/lib/auth";
const mockIsAdmin = vi.mocked(isAdmin);

// ── Route handlers ────────────────────────────────────────────────────────
import { POST as login } from "@/app/api/auth/login/route";
import { GET as check } from "@/app/api/auth/check/route";
import { POST as logout } from "@/app/api/auth/logout/route";

// ─────────────────────────────────────────────────────────────────────────
describe("POST /api/auth/login", () => {
  it("returns 200 and sets cookie on correct password", async () => {
    const req = makeRequest("/api/auth/login", {
      method: "POST",
      body: { password: "test-password" },
    });
    const res = await login(req);
    const { status, body } = await parseResponse<{ success: boolean }>(res);

    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(res.headers.get("set-cookie")).toContain("admin_token");
  });

  it("returns 401 on wrong password", async () => {
    const req = makeRequest("/api/auth/login", {
      method: "POST",
      body: { password: "wrong" },
    });
    const { status, body } = await parseResponse<{ error: string }>(await login(req));

    expect(status).toBe(401);
    expect(body.error).toBe("Invalid password");
  });

  it("returns 400 on malformed JSON body", async () => {
    const req = new Request("http://localhost/api/auth/login", {
      method: "POST",
      body: "not-json",
      headers: { "Content-Type": "application/json" },
    });
    const { status } = await parseResponse(await login(req as never));
    expect(status).toBe(400);
  });
});

// ─────────────────────────────────────────────────────────────────────────
describe("GET /api/auth/check", () => {
  it("returns authenticated: true when admin cookie is valid", async () => {
    mockIsAdmin.mockResolvedValue(true);
    const { status, body } = await parseResponse<{ authenticated: boolean }>(await check());
    expect(status).toBe(200);
    expect(body.authenticated).toBe(true);
  });

  it("returns authenticated: false when no valid token", async () => {
    mockIsAdmin.mockResolvedValue(false);
    const { status, body } = await parseResponse<{ authenticated: boolean }>(await check());
    expect(status).toBe(200);
    expect(body.authenticated).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────
describe("POST /api/auth/logout", () => {
  beforeEach(() => mockIsAdmin.mockResolvedValue(true));

  it("returns 200 and clears the cookie", async () => {
    const res = await logout();
    const { status, body } = await parseResponse<{ success: boolean }>(res);

    expect(status).toBe(200);
    expect(body.success).toBe(true);

    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("admin_token=");
    expect(cookie).toContain("Max-Age=0");
  });
});
