import { describe, it, expect, beforeEach } from "vitest";
import { createAdminToken, verifyAdminToken, getAdminCookieConfig } from "../auth";

beforeEach(() => {
  process.env.ADMIN_SECRET = "test-secret-that-is-long-enough";
});

describe("createAdminToken", () => {
  it("returns a JWT string", async () => {
    const token = await createAdminToken();
    expect(typeof token).toBe("string");
    // JWTs have 3 dot-separated parts
    expect(token.split(".")).toHaveLength(3);
  });
});

describe("verifyAdminToken", () => {
  it("returns true for a valid token", async () => {
    const token = await createAdminToken();
    expect(await verifyAdminToken(token)).toBe(true);
  });

  it("returns false for a garbage token", async () => {
    expect(await verifyAdminToken("not.a.token")).toBe(false);
  });

  it("returns false for a token signed with a different secret", async () => {
    const token = await createAdminToken();
    process.env.ADMIN_SECRET = "completely-different-secret-value";
    expect(await verifyAdminToken(token)).toBe(false);
  });
});

describe("getAdminCookieConfig", () => {
  it("returns correct cookie shape", () => {
    const config = getAdminCookieConfig("mytoken");
    expect(config.value).toBe("mytoken");
    expect(config.httpOnly).toBe(true);
    expect(config.sameSite).toBe("lax");
    expect(config.path).toBe("/");
    expect(typeof config.maxAge).toBe("number");
  });
});
