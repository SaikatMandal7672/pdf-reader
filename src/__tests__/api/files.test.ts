import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeRequest, parseResponse, makeParams } from "../helpers";
import { makeSupabaseMock } from "../mocks/supabase";

// ── Module mocks ──────────────────────────────────────────────────────────
vi.mock("@/lib/auth", () => ({ isAdmin: vi.fn() }));
vi.mock("@/lib/db", () => ({
  getAllFileVisibility: vi.fn(),
  ensurePdfFileRow: vi.fn().mockResolvedValue(undefined),
  getFileVisibility: vi.fn(),
  setFileVisibility: vi.fn(),
  deletePdfFileRow: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/api-metrics", () => ({ recordMetric: vi.fn().mockResolvedValue(undefined) }));

let sb: ReturnType<typeof makeSupabaseMock>;
vi.mock("@/lib/supabase", () => ({
  get supabase() { return sb; },
  BUCKET_NAME: "pdf-2",
}));

import { isAdmin } from "@/lib/auth";
import * as db from "@/lib/db";
const mockIsAdmin = vi.mocked(isAdmin);
const mockGetAllVisibility = vi.mocked(db.getAllFileVisibility);
const mockGetVisibility = vi.mocked(db.getFileVisibility);
const mockSetVisibility = vi.mocked(db.setFileVisibility);

import { GET as listFiles, POST as createUploadUrl } from "@/app/api/files/route";
import { GET as getFile, PATCH as patchFile, DELETE as deleteFile } from "@/app/api/files/[id]/route";

// ─────────────────────────────────────────────────────────────────────────
describe("GET /api/files", () => {
  beforeEach(() => {
    sb = makeSupabaseMock();
    mockIsAdmin.mockResolvedValue(false);
    mockGetAllVisibility.mockResolvedValue(new Map());
    sb._storage.list.mockResolvedValue({
      data: [
        { id: "1", name: "book.pdf", created_at: "2024-01-01", metadata: { size: 1024 } },
      ],
      error: null,
    });
  });

  it("returns public files for unauthenticated requests", async () => {
    const req = makeRequest("/api/files");
    const { status, body } = await parseResponse<unknown[]>(await listFiles(req));
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
  });

  it("returns 401 when ?admin=true without auth", async () => {
    mockIsAdmin.mockResolvedValue(false);
    const req = makeRequest("/api/files", { searchParams: { admin: "true" } });
    const { status } = await parseResponse(await listFiles(req));
    expect(status).toBe(401);
  });

  it("returns all files for authenticated admin", async () => {
    mockIsAdmin.mockResolvedValue(true);
    const req = makeRequest("/api/files", { searchParams: { admin: "true" } });
    const { status, body } = await parseResponse<unknown[]>(await listFiles(req));
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
  });

  it("returns 500 when Supabase storage fails", async () => {
    mockIsAdmin.mockResolvedValue(true);
    sb._storage.list.mockResolvedValue({ data: null, error: { message: "Storage error" } });
    const req = makeRequest("/api/files", { searchParams: { admin: "true" } });
    const { status } = await parseResponse(await listFiles(req));
    expect(status).toBe(500);
  });
});

// ─────────────────────────────────────────────────────────────────────────
describe("POST /api/files", () => {
  beforeEach(() => {
    sb = makeSupabaseMock();
    mockIsAdmin.mockResolvedValue(true);
  });

  it("returns signedUrl for valid PDF upload request", async () => {
    const req = makeRequest("/api/files", {
      method: "POST",
      body: { fileName: "test.pdf", fileSize: 1024 },
    });
    const { status, body } = await parseResponse<{ signedUrl: string; path: string }>(
      await createUploadUrl(req)
    );
    expect(status).toBe(200);
    expect(body.signedUrl).toBeDefined();
    expect(body.path).toMatch(/\.pdf$/);
  });

  it("returns 401 when not admin", async () => {
    mockIsAdmin.mockResolvedValue(false);
    const req = makeRequest("/api/files", {
      method: "POST",
      body: { fileName: "test.pdf" },
    });
    const { status } = await parseResponse(await createUploadUrl(req));
    expect(status).toBe(401);
  });

  it("returns 400 when fileName is missing", async () => {
    const req = makeRequest("/api/files", { method: "POST", body: {} });
    const { status } = await parseResponse(await createUploadUrl(req));
    expect(status).toBe(400);
  });

  it("returns 400 when file is not a PDF", async () => {
    const req = makeRequest("/api/files", {
      method: "POST",
      body: { fileName: "image.png" },
    });
    const { status } = await parseResponse(await createUploadUrl(req));
    expect(status).toBe(400);
  });

  it("returns 400 when file exceeds size limit", async () => {
    const req = makeRequest("/api/files", {
      method: "POST",
      body: { fileName: "big.pdf", fileSize: 100 * 1024 * 1024 },
    });
    const { status } = await parseResponse(await createUploadUrl(req));
    expect(status).toBe(400);
  });
});

// ─────────────────────────────────────────────────────────────────────────
describe("GET /api/files/[id]", () => {
  beforeEach(() => {
    sb = makeSupabaseMock();
    mockIsAdmin.mockResolvedValue(false);
    mockGetVisibility.mockResolvedValue(true); // public by default
  });

  it("returns PDF content for a public file", async () => {
    const req = makeRequest("/api/files/book.pdf");
    const res = await getFile(req, makeParams({ id: "book.pdf" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
  });

  it("returns 403 for a private file when not admin", async () => {
    mockGetVisibility.mockResolvedValue(false);
    const req = makeRequest("/api/files/secret.pdf");
    const { status } = await parseResponse(await getFile(req, makeParams({ id: "secret.pdf" })));
    expect(status).toBe(403);
  });

  it("allows admin to access private files", async () => {
    mockGetVisibility.mockResolvedValue(false);
    mockIsAdmin.mockResolvedValue(true);
    const req = makeRequest("/api/files/secret.pdf");
    const res = await getFile(req, makeParams({ id: "secret.pdf" }));
    expect(res.status).toBe(200);
  });

  it("returns 400 for path traversal attempts", async () => {
    const req = makeRequest("/api/files/..%2Fetc%2Fpasswd");
    const { status } = await parseResponse(
      await getFile(req, makeParams({ id: "..%2Fetc%2Fpasswd" }))
    );
    expect(status).toBe(400);
  });

  it("returns 404 when file not found in storage", async () => {
    sb._storage.download.mockResolvedValue({ data: null, error: { message: "Not found" } });
    const req = makeRequest("/api/files/missing.pdf");
    const { status } = await parseResponse(await getFile(req, makeParams({ id: "missing.pdf" })));
    expect(status).toBe(404);
  });

  it("returns meta JSON when ?meta=1", async () => {
    const req = makeRequest("/api/files/book.pdf", { searchParams: { meta: "1" } });
    const { status, body } = await parseResponse<{ accessible: boolean; is_public: boolean }>(
      await getFile(req, makeParams({ id: "book.pdf" }))
    );
    expect(status).toBe(200);
    expect(body.accessible).toBe(true);
    expect(typeof body.is_public).toBe("boolean");
  });

  it("sets public Cache-Control for public files", async () => {
    const req = makeRequest("/api/files/book.pdf");
    const res = await getFile(req, makeParams({ id: "book.pdf" }));
    expect(res.headers.get("Cache-Control")).toContain("public");
  });

  it("sets private Cache-Control for private files accessed by admin", async () => {
    mockGetVisibility.mockResolvedValue(false);
    mockIsAdmin.mockResolvedValue(true);
    const req = makeRequest("/api/files/secret.pdf");
    const res = await getFile(req, makeParams({ id: "secret.pdf" }));
    expect(res.headers.get("Cache-Control")).toContain("private");
  });
});

// ─────────────────────────────────────────────────────────────────────────
describe("PATCH /api/files/[id]", () => {
  beforeEach(() => {
    sb = makeSupabaseMock();
    mockIsAdmin.mockResolvedValue(true);
    mockSetVisibility.mockResolvedValue(false);
  });

  it("returns 401 when not admin", async () => {
    mockIsAdmin.mockResolvedValue(false);
    const req = makeRequest("/api/files/book.pdf", {
      method: "PATCH",
      body: { is_public: false },
    });
    const { status } = await parseResponse(await patchFile(req, makeParams({ id: "book.pdf" })));
    expect(status).toBe(401);
  });

  it("toggles visibility and returns updated value", async () => {
    mockSetVisibility.mockResolvedValue(true);
    const req = makeRequest("/api/files/book.pdf", {
      method: "PATCH",
      body: { is_public: true },
    });
    const { status, body } = await parseResponse<{ success: boolean; is_public: boolean }>(
      await patchFile(req, makeParams({ id: "book.pdf" }))
    );
    expect(status).toBe(200);
    expect(body.is_public).toBe(true);
  });

  it("returns 400 when is_public is not a boolean", async () => {
    const req = makeRequest("/api/files/book.pdf", {
      method: "PATCH",
      body: { is_public: "yes" },
    });
    const { status } = await parseResponse(await patchFile(req, makeParams({ id: "book.pdf" })));
    expect(status).toBe(400);
  });

  it("returns 400 for path traversal", async () => {
    const req = makeRequest("/api/files/..%2Fetc", {
      method: "PATCH",
      body: { is_public: true },
    });
    const { status } = await parseResponse(await patchFile(req, makeParams({ id: "..%2Fetc" })));
    expect(status).toBe(400);
  });
});

// ─────────────────────────────────────────────────────────────────────────
describe("DELETE /api/files/[id]", () => {
  beforeEach(() => {
    sb = makeSupabaseMock();
    mockIsAdmin.mockResolvedValue(true);
  });

  it("returns 401 when not admin", async () => {
    mockIsAdmin.mockResolvedValue(false);
    const req = makeRequest("/api/files/book.pdf", { method: "DELETE" });
    const { status } = await parseResponse(await deleteFile(req, makeParams({ id: "book.pdf" })));
    expect(status).toBe(401);
  });

  it("deletes file and returns success", async () => {
    const req = makeRequest("/api/files/book.pdf", { method: "DELETE" });
    const { status, body } = await parseResponse<{ success: boolean }>(
      await deleteFile(req, makeParams({ id: "book.pdf" }))
    );
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(sb._storage.remove).toHaveBeenCalledWith(["book.pdf"]);
  });

  it("returns 500 when storage deletion fails", async () => {
    sb._storage.remove.mockResolvedValue({ data: null, error: { message: "Storage failure" } });
    const req = makeRequest("/api/files/book.pdf", { method: "DELETE" });
    const { status } = await parseResponse(await deleteFile(req, makeParams({ id: "book.pdf" })));
    expect(status).toBe(500);
  });

  it("returns 400 for path traversal", async () => {
    const req = makeRequest("/api/files/..%2F..", { method: "DELETE" });
    const { status } = await parseResponse(
      await deleteFile(req, makeParams({ id: "..%2F.." }))
    );
    expect(status).toBe(400);
  });
});
