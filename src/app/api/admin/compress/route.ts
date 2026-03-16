import { NextRequest, NextResponse } from "next/server";
import { PDFDocument } from "pdf-lib";
import { supabase, BUCKET_NAME } from "@/lib/supabase";
import { isAdmin } from "@/lib/auth";

export const maxDuration = 60; // Vercel max for hobby plan

// POST /api/admin/compress — server-side lossless PDF recompression (admin only)
// Downloads from Supabase, rewrites object streams via pdf-lib, re-uploads if smaller.
export async function POST(request: NextRequest) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { fileName } = body;

  if (!fileName || typeof fileName !== "string") {
    return NextResponse.json({ error: "fileName is required" }, { status: 400 });
  }

  // Download from Supabase
  const { data: blob, error: downloadErr } = await supabase.storage
    .from(BUCKET_NAME)
    .download(fileName);

  if (downloadErr || !blob) {
    return NextResponse.json(
      { error: downloadErr?.message ?? "Download failed" },
      { status: 500 }
    );
  }

  const originalBytes = new Uint8Array(await blob.arrayBuffer());
  const originalSize = originalBytes.byteLength;

  // Lossless recompression via pdf-lib (restructures object streams — no rasterisation)
  let compressedBytes: Uint8Array;
  try {
    const doc = await PDFDocument.load(originalBytes, { ignoreEncryption: true });
    compressedBytes = await doc.save({ useObjectStreams: true, addDefaultPage: false });
  } catch (err) {
    return NextResponse.json(
      { error: `Compression failed: ${(err as Error).message}` },
      { status: 500 }
    );
  }

  const compressedSize = compressedBytes.byteLength;

  // Only re-upload if we actually made it smaller
  if (compressedSize >= originalSize) {
    return NextResponse.json({
      fileName,
      originalSize,
      compressedSize: originalSize,
      reduced: false,
      message: "No size reduction achieved — file unchanged",
    });
  }

  // Re-upload (overwrite) the compressed file at the same path
  const { error: uploadErr } = await supabase.storage
    .from(BUCKET_NAME)
    .update(fileName, compressedBytes, {
      contentType: "application/pdf",
      upsert: true,
    });

  if (uploadErr) {
    return NextResponse.json(
      { error: `Upload failed: ${uploadErr.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({
    fileName,
    originalSize,
    compressedSize,
    savedBytes: originalSize - compressedSize,
    savedPercent: Math.round((1 - compressedSize / originalSize) * 100),
    reduced: true,
  });
}
