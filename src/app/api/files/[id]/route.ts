import { NextRequest, NextResponse } from "next/server";
import { supabase, BUCKET_NAME } from "@/lib/supabase";
import { isAdmin } from "@/lib/auth";

type RouteContext = { params: Promise<{ id: string }> };

function sanitizeFileName(raw: string): string | null {
  const decoded = decodeURIComponent(raw);

  // Block path traversal attempts
  if (decoded.includes("..") || decoded.includes("/") || decoded.includes("\\")) {
    return null;
  }

  return decoded;
}

// GET /api/files/[id] — stream PDF to client (public, but proxied)
export async function GET(_request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const fileName = sanitizeFileName(id);

  if (!fileName) {
    return NextResponse.json({ error: "Invalid file name" }, { status: 400 });
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

  return NextResponse.json({ success: true });
}
