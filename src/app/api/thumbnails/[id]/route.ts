import { NextRequest, NextResponse } from "next/server";
import { supabase, BUCKET_NAME } from "@/lib/supabase";
import { isAdmin } from "@/lib/auth";

type RouteContext = { params: Promise<{ id: string }> };

// Thumbnails live in the same bucket under a thumbnails/ prefix.
// Key: thumbnails/{storagePath}.jpg
function thumbKey(id: string) {
  return `thumbnails/${decodeURIComponent(id)}.jpg`;
}

// GET /api/thumbnails/[id] — serve thumbnail with 1-year cache
// Returns 404 if not generated yet (client falls back to PDF.js rendering)
export async function GET(_request: NextRequest, { params }: RouteContext) {
  const { id } = await params;

  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .download(thumbKey(id));

  if (error || !data) {
    return new NextResponse(null, { status: 404 });
  }

  return new NextResponse(await data.arrayBuffer(), {
    headers: {
      "Content-Type": "image/jpeg",
      // Thumbnails are immutable — same file name always produces same image
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}

// POST /api/thumbnails/[id] — save thumbnail (admin only)
// Body: raw JPEG blob
export async function POST(request: NextRequest, { params }: RouteContext) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const blob = await request.blob();

  if (!blob || blob.size === 0) {
    return NextResponse.json({ error: "No thumbnail data" }, { status: 400 });
  }

  const { error } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(thumbKey(id), blob, {
      contentType: "image/jpeg",
      upsert: true,
    });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
