import { NextRequest, NextResponse } from "next/server";
import { supabase, BUCKET_NAME } from "@/lib/supabase";
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

// GET /api/files/[id] — stream PDF to client
// Private files require admin auth. ?meta=1 returns access info without streaming.
export async function GET(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const fileName = sanitizeFileName(id);

  if (!fileName) {
    return NextResponse.json({ error: "Invalid file name" }, { status: 400 });
  }

  // Check visibility
  const isPublic = await getFileVisibility(fileName);
  if (!isPublic && !(await isAdmin())) {
    return NextResponse.json(
      { error: "This document is private" },
      { status: 403 }
    );
  }

  // Lightweight access check — no file download
  if (request.nextUrl.searchParams.get("meta") === "1") {
    return NextResponse.json({ accessible: true, is_public: isPublic });
  }

  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .download(fileName);

  if (error || !data) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  const arrayBuffer = await data.arrayBuffer();

  return new NextResponse(arrayBuffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": "inline",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
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

  const { error } = await supabase.storage
    .from(BUCKET_NAME)
    .remove([fileName]);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  try {
    await deletePdfFileRow(fileName);
  } catch (dbError) {
    console.error("Failed to delete pdf_files row:", dbError);
  }

  return NextResponse.json({ success: true });
}
