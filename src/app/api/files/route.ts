import { NextRequest, NextResponse } from "next/server";
import { ListObjectsV2Command, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { r2, R2_BUCKET } from "@/lib/r2";
import { isAdmin } from "@/lib/auth";
import { MAX_FILE_SIZE } from "@/lib/constants";
import { getAllFileVisibility, ensurePdfFileRow } from "@/lib/db";
import type { PdfFile } from "@/types";

// GET /api/files — list PDFs
// Default: public files only. ?admin=true: all files (requires auth).
export async function GET(request: NextRequest) {
  const adminRequested =
    request.nextUrl.searchParams.get("admin") === "true";

  if (adminRequested && !(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const response = await r2.send(
    new ListObjectsV2Command({ Bucket: R2_BUCKET })
  );

  const objects = (response.Contents ?? []).filter((obj) =>
    obj.Key?.endsWith(".pdf")
  );

  const visibilityMap = await getAllFileVisibility();

  const files: PdfFile[] = [];
  for (const obj of objects) {
    const name = obj.Key!;
    const meta = visibilityMap.get(name);

    if (meta === undefined) {
      ensurePdfFileRow(name, true).catch(() => {});
    }

    files.push({
      id: name,
      name,
      size: obj.Size ?? 0,
      created_at: obj.LastModified?.toISOString() ?? new Date().toISOString(),
      is_public: meta?.is_public ?? true,
      tags: meta?.tags ?? [],
    });
  }

  // Sort newest first
  files.sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  if (!adminRequested) {
    return NextResponse.json(files.filter((f) => f.is_public));
  }

  return NextResponse.json(files);
}

// POST /api/files — generate a presigned upload URL (admin only)
// The client uploads the file directly to R2 to avoid Vercel's 4.5MB body limit.
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

  const signedUrl = await getSignedUrl(
    r2,
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: storagePath,
      ContentType: "application/pdf",
    }),
    { expiresIn: 3600 }
  );

  return NextResponse.json({ signedUrl, path: storagePath });
}
