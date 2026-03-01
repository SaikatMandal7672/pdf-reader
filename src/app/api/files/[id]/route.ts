import { NextRequest, NextResponse } from "next/server";
import { GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { r2, R2_BUCKET } from "@/lib/r2";
import { isAdmin } from "@/lib/auth";
import {
  getFileVisibility,
  deletePdfFileRow,
  ensurePdfFileRow,
  setFileVisibility,
} from "@/lib/db";

type RouteContext = { params: Promise<{ id: string }> };

function sanitizeFileName(raw: string): string | null {
  const decoded = decodeURIComponent(raw);

  if (decoded.includes("..") || decoded.includes("/") || decoded.includes("\\")) {
    return null;
  }

  return decoded;
}

// GET /api/files/[id] — redirect to a short-lived R2 presigned URL
// Private files require admin auth. ?meta=1 returns access info without redirecting.
export async function GET(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const fileName = sanitizeFileName(id);

  if (!fileName) {
    return NextResponse.json({ error: "Invalid file name" }, { status: 400 });
  }

  const isPublic = await getFileVisibility(fileName);
  if (!isPublic && !(await isAdmin())) {
    return NextResponse.json(
      { error: "This document is private" },
      { status: 403 }
    );
  }

  // Lightweight access check — no redirect
  if (request.nextUrl.searchParams.get("meta") === "1") {
    return NextResponse.json({ accessible: true, is_public: isPublic });
  }

  // Generate a short-lived presigned GET URL and redirect the browser to it.
  // This streams the PDF directly from R2 — no Vercel memory usage.
  const signedUrl = await getSignedUrl(
    r2,
    new GetObjectCommand({ Bucket: R2_BUCKET, Key: fileName }),
    { expiresIn: 900 } // 15 minutes
  );

  return NextResponse.redirect(signedUrl, { status: 307 });
}

// PATCH /api/files/[id] — toggle visibility (admin only)
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const fileName = sanitizeFileName(id);

  if (!fileName) {
    return NextResponse.json({ error: "Invalid file name" }, { status: 400 });
  }

  let body: { is_public: boolean };
  try {
    body = await request.json();
    if (typeof body.is_public !== "boolean") {
      throw new Error();
    }
  } catch {
    return NextResponse.json(
      { error: "Request body must contain { is_public: boolean }" },
      { status: 400 }
    );
  }

  try {
    await ensurePdfFileRow(fileName, true);
    const isPublic = await setFileVisibility(fileName, body.is_public);
    return NextResponse.json({ success: true, is_public: isPublic });
  } catch {
    return NextResponse.json(
      { error: "Failed to update visibility" },
      { status: 500 }
    );
  }
}

// DELETE /api/files/[id] — delete a PDF (admin only)
export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const fileName = sanitizeFileName(id);

  if (!fileName) {
    return NextResponse.json({ error: "Invalid file name" }, { status: 400 });
  }

  try {
    await r2.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: fileName }));
  } catch {
    return NextResponse.json({ error: "Failed to delete file" }, { status: 500 });
  }

  try {
    await deletePdfFileRow(fileName);
  } catch (dbError) {
    console.error("Failed to delete pdf_files row:", dbError);
  }

  return NextResponse.json({ success: true });
}
