import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeRequest, parseResponse } from "../helpers";
import { makeSupabaseMock } from "../mocks/supabase";

vi.mock("@/lib/auth", () => ({ isAdmin: vi.fn() }));
vi.mock("@/lib/db", () => ({
  ensurePdfFileRow: vi.fn().mockResolvedValue(undefined),
  updateFileTags: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/gemini", () => ({
  generateTags: vi.fn().mockResolvedValue({ tags: [], debug: null }),
}));

let sb: ReturnType<typeof makeSupabaseMock>;
vi.mock("@/lib/supabase", () => ({
  get supabase() { return sb; },
  BUCKET_NAME: "pdf-2",
}));

import { isAdmin } from "@/lib/auth";
import * as db from "@/lib/db";
const mockIsAdmin = vi.mocked(isAdmin);

import { POST as register } from "@/app/api/files/register/route";

describe("POST /api/files/register", () => {
  beforeEach(() => {
    sb = makeSupabaseMock();
    mockIsAdmin.mockResolvedValue(true);
    vi.mocked(db.ensurePdfFileRow).mockResolvedValue(undefined);
  });

  it("returns 401 when not admin", async () => {
    mockIsAdmin.mockResolvedValue(false);
    const req = makeRequest("/api/files/register", {
      method: "POST",
      body: { path: "file.pdf" },
    });
    const { status } = await parseResponse(await register(req));
    expect(status).toBe(401);
  });

  it("returns 400 when path is missing", async () => {
    const req = makeRequest("/api/files/register", { method: "POST", body: {} });
    const { status } = await parseResponse(await register(req));
    expect(status).toBe(400);
  });

  it("returns 400 when path is not a string", async () => {
    const req = makeRequest("/api/files/register", {
      method: "POST",
      body: { path: 123 },
    });
    const { status } = await parseResponse(await register(req));
    expect(status).toBe(400);
  });

  it("returns 500 when DB insert fails", async () => {
    vi.mocked(db.ensurePdfFileRow).mockRejectedValue(new Error("DB error"));
    const req = makeRequest("/api/files/register", {
      method: "POST",
      body: { path: "file.pdf" },
    });
    const { status, body } = await parseResponse<{ error: string }>(await register(req));
    expect(status).toBe(500);
    expect(body.error).toBe("Failed to register file");
  });

  it("returns 200 with fileName on success", async () => {
    const req = makeRequest("/api/files/register", {
      method: "POST",
      body: { path: "1234-my-book.pdf" },
    });
    const { status, body } = await parseResponse<{ success: boolean; fileName: string }>(
      await register(req)
    );
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.fileName).toBe("1234-my-book.pdf");
    expect(db.ensurePdfFileRow).toHaveBeenCalledWith("1234-my-book.pdf", true);
  });

  it("responds immediately without waiting for background tag generation", async () => {
    // Background IIFE runs after response — verify the response returns promptly
    // even if Supabase download for tagging is slow
    sb._storage.download.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ data: null, error: null }), 5000))
    );
    const req = makeRequest("/api/files/register", {
      method: "POST",
      body: { path: "slow-file.pdf" },
    });
    const start = Date.now();
    const { status } = await parseResponse(await register(req));
    expect(status).toBe(200);
    expect(Date.now() - start).toBeLessThan(500); // did not wait for the background task
  });
});
