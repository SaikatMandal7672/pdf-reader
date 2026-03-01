import { NextRequest, NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { supabase, BUCKET_NAME } from "@/lib/supabase";
import { isAdmin } from "@/lib/auth";
import { MAX_FILE_SIZE } from "@/lib/constants";
import { getAllFileVisibility, ensurePdfFileRow } from "@/lib/db";
import { recordMetric } from "@/lib/api-metrics";
import type { PdfFile } from "@/types";

// Shared fetch — hits Supabase storage + DB visibility table
async function fetchAllFiles(): Promise<PdfFile[]> {
  const { data, error } = await supabase.storage.from(BUCKET_NAME).list("", {
    sortBy: { column: "created_at", order: "desc" },
  });

  if (error) throw new Error(error.message);

  const pdfFiles = (data ?? []).filter((f) => f.name.endsWith(".pdf"));
  const visibilityMap = await getAllFileVisibility();

  const files: PdfFile[] = [];
  for (const f of pdfFiles) {
    const meta = visibilityMap.get(f.name);
    if (meta === undefined) {
      ensurePdfFileRow(f.name, true).catch(() => {});
    }
    files.push({
      id: f.id ?? f.name,
      name: f.name,
      size: f.metadata?.size ?? 0,
      created_at: f.created_at ?? new Date().toISOString(),
      is_public: meta?.is_public ?? true,
      tags: meta?.tags ?? [],
    });
  }

  return files;
}

// Cached version — only for public files
// revalidate: 300 = auto-expire after 5 min as a safety net
// tags: ["files-list"] = allows instant invalidation via revalidateTag()
const getCachedPublicFiles = unstable_cache(
  async () => (await fetchAllFiles()).filter((f) => f.is_public),
  ["public-files-list"],
  { revalidate: 300, tags: ["files-list"] }
);

// GET /api/files — list PDFs
// Default: public files only (cached). ?admin=true: all files, bypasses cache (requires auth).
export async function GET(request: NextRequest) {
  const start = Date.now();
  const adminRequested =
    request.nextUrl.searchParams.get("admin") === "true";

  if (adminRequested) {
    if (!(await isAdmin())) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    // Admin always gets fresh data — no cache, no metrics recording
    try {
      const files = await fetchAllFiles();
      return NextResponse.json(files);
    } catch (err) {
      return NextResponse.json({ error: (err as Error).message }, { status: 500 });
    }
  }

  // Public: serve from cache, record timing
  try {
    const files = await getCachedPublicFiles();
    recordMetric("GET /api/files", Date.now() - start, 200).catch(() => {});
    return NextResponse.json(files);
  } catch (err) {
    recordMetric("GET /api/files", Date.now() - start, 500).catch(() => {});
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// POST /api/files — generate a presigned upload URL (admin only)
// The client uploads the file directly to Supabase to avoid Vercel's 4.5MB body limit.
// After uploading, the client must call POST /api/files/register to record the file in the DB.
export async function POST(request: NextRequest) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { fileName, fileSize } = body;

  if (!fileName || typeof fileName !== "string") {
    return NextResponse.json({ error: "fileName is required" }, { status: 400 });
  }

  if (!fileName.toLowerCase().endsWith(".pdf")) {
    return NextResponse.json(
      { error: "Only PDF files are allowed" },
      { status: 400 }
    );
  }

  if (typeof fileSize === "number" && fileSize > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: `File size exceeds ${MAX_FILE_SIZE / (1024 * 1024)}MB limit` },
      { status: 400 }
    );
  }

  const baseName = fileName.split(/[/\\]/).pop() ?? "upload.pdf";
  const safeName = baseName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storagePath = `${Date.now()}-${safeName}`;

  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .createSignedUploadUrl(storagePath);

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "Failed to create upload URL" },
      { status: 500 }
    );
  }

  return NextResponse.json({ signedUrl: data.signedUrl, path: storagePath });
}
