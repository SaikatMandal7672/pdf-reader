import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeRequest, parseResponse, makeParams } from "../helpers";
import { makeSupabaseMock } from "../mocks/supabase";

vi.mock("@/lib/auth", () => ({ isAdmin: vi.fn() }));

let sb: ReturnType<typeof makeSupabaseMock>;
vi.mock("@/lib/supabase", () => ({
  get supabase() { return sb; },
  BUCKET_NAME: "pdf-2",
}));

import { isAdmin } from "@/lib/auth";
const mockIsAdmin = vi.mocked(isAdmin);

import { GET as getThumbnail, POST as uploadThumbnail } from "@/app/api/thumbnails/[id]/route";

describe("GET /api/thumbnails/[id]", () => {
  beforeEach(() => {
    sb = makeSupabaseMock();
  });

  it("returns JPEG with immutable cache when thumbnail exists", async () => {
    sb._storage.download.mockResolvedValue({
      data: new Blob([new Uint8Array([0xff, 0xd8])], { type: "image/jpeg" }),
      error: null,
    });
    const req = makeRequest("/api/thumbnails/book.pdf");
    const res = await getThumbnail(req, makeParams({ id: "book.pdf" }));

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/jpeg");
    expect(res.headers.get("Cache-Control")).toContain("immutable");
  });

  it("returns 404 when thumbnail has not been generated", async () => {
    sb._storage.download.mockResolvedValue({ data: null, error: { message: "Not found" } });
    const req = makeRequest("/api/thumbnails/missing.pdf");
    const res = await getThumbnail(req, makeParams({ id: "missing.pdf" }));
    expect(res.status).toBe(404);
  });
});

describe("POST /api/thumbnails/[id]", () => {
  beforeEach(() => {
    sb = makeSupabaseMock();
    mockIsAdmin.mockResolvedValue(true);
  });

  it("returns 401 when not admin", async () => {
    mockIsAdmin.mockResolvedValue(false);
    const req = new Request("http://localhost/api/thumbnails/book.pdf", {
      method: "POST",
      body: new Blob([new Uint8Array([0xff, 0xd8])]),
      headers: { "Content-Type": "image/jpeg" },
    });
    const { status } = await parseResponse(
      await uploadThumbnail(req as never, makeParams({ id: "book.pdf" }))
    );
    expect(status).toBe(401);
  });

  it("stores thumbnail and returns success", async () => {
    const req = new Request("http://localhost/api/thumbnails/book.pdf", {
      method: "POST",
      body: new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: "image/jpeg" }),
      headers: { "Content-Type": "image/jpeg" },
    });
    const { status, body } = await parseResponse<{ success: boolean }>(
      await uploadThumbnail(req as never, makeParams({ id: "book.pdf" }))
    );
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(sb._storage.upload).toHaveBeenCalledWith(
      "thumbnails/book.pdf.jpg",
      expect.any(Blob),
      expect.objectContaining({ contentType: "image/jpeg", upsert: true })
    );
  });

  it("returns 400 when body is empty", async () => {
    const req = new Request("http://localhost/api/thumbnails/book.pdf", {
      method: "POST",
      body: new Blob([]),
      headers: { "Content-Type": "image/jpeg" },
    });
    const { status } = await parseResponse(
      await uploadThumbnail(req as never, makeParams({ id: "book.pdf" }))
    );
    expect(status).toBe(400);
  });

  it("returns 500 when Supabase upload fails", async () => {
    sb._storage.upload.mockResolvedValue({ error: { message: "Upload failed" } });
    const req = new Request("http://localhost/api/thumbnails/book.pdf", {
      method: "POST",
      body: new Blob([new Uint8Array([0xff, 0xd8, 0xff])]),
      headers: { "Content-Type": "image/jpeg" },
    });
    const { status } = await parseResponse(
      await uploadThumbnail(req as never, makeParams({ id: "book.pdf" }))
    );
    expect(status).toBe(500);
  });
});
