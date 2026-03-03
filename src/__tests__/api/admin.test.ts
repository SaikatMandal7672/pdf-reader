import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeRequest, parseResponse } from "../helpers";
import { makeSupabaseMock } from "../mocks/supabase";

vi.mock("@/lib/auth", () => ({ isAdmin: vi.fn() }));

// Mock pdf-lib so compress tests don't need real PDF bytes
vi.mock("pdf-lib", () => ({
  PDFDocument: {
    load: vi.fn().mockResolvedValue({
      save: vi.fn().mockResolvedValue(new Uint8Array(500_000)), // 500KB "compressed"
    }),
  },
}));
vi.mock("@/lib/db", () => ({
  getAllFileVisibility: vi.fn(),
  ensurePdfFileRow: vi.fn(),
  updateFileTags: vi.fn(),
}));
vi.mock("@/lib/gemini", () => ({
  generateTags: vi.fn(),
}));
vi.mock("@/lib/api-metrics", () => ({
  getRouteSummaries: vi.fn().mockResolvedValue([]),
  getHourlySeries: vi.fn().mockResolvedValue([]),
}));

let sb: ReturnType<typeof makeSupabaseMock>;
vi.mock("@/lib/supabase", () => ({
  get supabase() { return sb; },
  BUCKET_NAME: "pdf-2",
}));

import { isAdmin } from "@/lib/auth";
import * as db from "@/lib/db";
import { generateTags } from "@/lib/gemini";

const mockIsAdmin = vi.mocked(isAdmin);
const mockGetAllVisibility = vi.mocked(db.getAllFileVisibility);
const mockGenerateTags = vi.mocked(generateTags);

import { GET as analytics } from "@/app/api/admin/analytics/route";
import { POST as generateTagsRoute } from "@/app/api/admin/generate-tags/route";
import { POST as compress } from "@/app/api/admin/compress/route";

// ─────────────────────────────────────────────────────────────────────────
describe("GET /api/admin/analytics", () => {
  beforeEach(() => {
    sb = makeSupabaseMock();
    mockIsAdmin.mockResolvedValue(true);
    mockGetAllVisibility.mockResolvedValue(new Map());
    sb._storage.list.mockResolvedValue({
      data: [
        { name: "a.pdf", metadata: { size: 5_000_000 }, created_at: "2024-01-01" },
        { name: "b.pdf", metadata: { size: 10_000_000 }, created_at: "2024-01-02" },
      ],
      error: null,
    });
  });

  it("returns analytics payload for admin", async () => {
    const { status, body } = await parseResponse<{
      totalFiles: number;
      storageUsedBytes: number;
      publicCount: number;
      topTags: unknown[];
    }>(await analytics());

    expect(status).toBe(200);
    expect(body.totalFiles).toBe(2);
    expect(body.storageUsedBytes).toBe(15_000_000);
    expect(Array.isArray(body.topTags)).toBe(true);
  });

  it("returns 401 when not admin", async () => {
    mockIsAdmin.mockResolvedValue(false);
    const { status } = await parseResponse(await analytics());
    expect(status).toBe(401);
  });

  it("returns 500 when Supabase list fails", async () => {
    sb._storage.list.mockResolvedValue({ data: null, error: { message: "fail" } });
    const { status } = await parseResponse(await analytics());
    expect(status).toBe(500);
  });

  it("computes correct public/private counts from visibility map", async () => {
    mockGetAllVisibility.mockResolvedValue(
      new Map([
        ["a.pdf", { is_public: true, tags: [] }],
        ["b.pdf", { is_public: false, tags: [] }],
      ])
    );
    const { body } = await parseResponse<{ publicCount: number; privateCount: number }>(
      await analytics()
    );
    expect(body.publicCount).toBe(1);
    expect(body.privateCount).toBe(1);
  });

  it("counts untagged files correctly", async () => {
    mockGetAllVisibility.mockResolvedValue(
      new Map([
        ["a.pdf", { is_public: true, tags: ["ml"] }],
        ["b.pdf", { is_public: true, tags: [] }],
      ])
    );
    const { body } = await parseResponse<{ untaggedCount: number }>(await analytics());
    expect(body.untaggedCount).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────
describe("POST /api/admin/generate-tags", () => {
  beforeEach(() => {
    sb = makeSupabaseMock();
    mockIsAdmin.mockResolvedValue(true);
    mockGenerateTags.mockResolvedValue({ tags: ["machine-learning", "python"], debug: null });
  });

  it("returns 401 when not admin", async () => {
    mockIsAdmin.mockResolvedValue(false);
    const req = makeRequest("/api/admin/generate-tags", {
      method: "POST",
      body: { fileName: "book.pdf" },
    });
    const { status } = await parseResponse(await generateTagsRoute(req));
    expect(status).toBe(401);
  });

  it("returns 400 when fileName is missing", async () => {
    const req = makeRequest("/api/admin/generate-tags", { method: "POST", body: {} });
    const { status } = await parseResponse(await generateTagsRoute(req));
    expect(status).toBe(400);
  });

  it("returns 404 when file not found in storage", async () => {
    sb._storage.download.mockResolvedValue({ data: null, error: { message: "Not found" } });
    const req = makeRequest("/api/admin/generate-tags", {
      method: "POST",
      body: { fileName: "missing.pdf" },
    });
    const { status } = await parseResponse(await generateTagsRoute(req));
    expect(status).toBe(404);
  });

  it("generates and returns tags for a valid file", async () => {
    const req = makeRequest("/api/admin/generate-tags", {
      method: "POST",
      body: { fileName: "book.pdf" },
    });
    const { status, body } = await parseResponse<{ success: boolean; tags: string[] }>(
      await generateTagsRoute(req)
    );
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.tags).toEqual(["machine-learning", "python"]);
    expect(db.updateFileTags).toHaveBeenCalledWith("book.pdf", ["machine-learning", "python"]);
  });

  it("does not call updateFileTags when no tags generated", async () => {
    mockGenerateTags.mockResolvedValue({ tags: [], debug: null });
    const updateSpy = vi.mocked(db.updateFileTags);
    updateSpy.mockClear();

    const req = makeRequest("/api/admin/generate-tags", {
      method: "POST",
      body: { fileName: "book.pdf" },
    });
    await generateTagsRoute(req);
    expect(updateSpy).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────
describe("POST /api/admin/compress", () => {
  const ORIGINAL = new Uint8Array(2_000_000).fill(1); // 2MB "PDF"

  beforeEach(() => {
    sb = makeSupabaseMock();
    mockIsAdmin.mockResolvedValue(true);
    sb._storage.download.mockResolvedValue({
      data: new Blob([ORIGINAL], { type: "application/pdf" }),
      error: null,
    });
    sb._storage.update.mockResolvedValue({ error: null });
  });

  it("returns 401 when not admin", async () => {
    mockIsAdmin.mockResolvedValue(false);
    const req = makeRequest("/api/admin/compress", {
      method: "POST",
      body: { fileName: "book.pdf" },
    });
    const { status } = await parseResponse(await compress(req));
    expect(status).toBe(401);
  });

  it("returns 400 when fileName is missing", async () => {
    const req = makeRequest("/api/admin/compress", { method: "POST", body: {} });
    const { status } = await parseResponse(await compress(req));
    expect(status).toBe(400);
  });

  it("returns 500 when download fails", async () => {
    sb._storage.download.mockResolvedValue({ data: null, error: { message: "fail" } });
    const req = makeRequest("/api/admin/compress", {
      method: "POST",
      body: { fileName: "book.pdf" },
    });
    const { status } = await parseResponse(await compress(req));
    expect(status).toBe(500);
  });

  it("returns fileName and size info in response", async () => {
    const req = makeRequest("/api/admin/compress", {
      method: "POST",
      body: { fileName: "book.pdf" },
    });
    const { status, body } = await parseResponse<{
      fileName: string;
      originalSize: number;
      reduced: boolean;
    }>(await compress(req));

    expect(status).toBe(200);
    expect(body.fileName).toBe("book.pdf");
    expect(typeof body.originalSize).toBe("number");
    expect(typeof body.reduced).toBe("boolean");
  });

  it("returns reduced: false when compression yields no size reduction", async () => {
    const { PDFDocument } = await import("pdf-lib");
    vi.mocked(PDFDocument.load).mockResolvedValueOnce({
      // Compressed result is LARGER than original (2MB + 1 byte)
      save: vi.fn().mockResolvedValue(new Uint8Array(2_000_001)),
    } as never);

    const req = makeRequest("/api/admin/compress", {
      method: "POST",
      body: { fileName: "book.pdf" },
    });
    const { status, body } = await parseResponse<{ reduced: boolean; message: string }>(
      await compress(req)
    );
    expect(status).toBe(200);
    expect(body.reduced).toBe(false);
    expect(body.message).toContain("unchanged");
  });

  it("returns 500 when pdf-lib fails to parse the file", async () => {
    const { PDFDocument } = await import("pdf-lib");
    vi.mocked(PDFDocument.load).mockRejectedValueOnce(new Error("Invalid PDF structure"));

    const req = makeRequest("/api/admin/compress", {
      method: "POST",
      body: { fileName: "corrupt.pdf" },
    });
    const { status, body } = await parseResponse<{ error: string }>(await compress(req));
    expect(status).toBe(500);
    expect(body.error).toContain("Compression failed");
  });

  it("returns 500 when re-upload fails after compression", async () => {
    sb._storage.update.mockResolvedValue({ error: { message: "Upload failed" } });
    const req = makeRequest("/api/admin/compress", {
      method: "POST",
      body: { fileName: "book.pdf" },
    });
    const { status, body } = await parseResponse<{ error: string }>(await compress(req));
    expect(status).toBe(500);
    expect(body.error).toContain("Upload failed");
  });
});
