import { NextRequest, NextResponse } from "next/server";
import { supabase, BUCKET_NAME } from "@/lib/supabase";
import { isAdmin } from "@/lib/auth";
import { MAX_FILE_SIZE } from "@/lib/constants";
import type { PdfFile } from "@/types";

// GET /api/files — list all PDFs (public)
export async function GET() {
  const { data, error } = await supabase.storage.from(BUCKET_NAME).list("", {
    sortBy: { column: "created_at", order: "desc" },
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const files: PdfFile[] = (data ?? [])
    .filter((f) => f.name.endsWith(".pdf"))
    .map((f) => ({
      id: f.id ?? f.name,
      name: f.name,
      size: f.metadata?.size ?? 0,
      created_at: f.created_at ?? new Date().toISOString(),
    }));

  return NextResponse.json(files);
}

// POST /api/files — upload a PDF (admin only)
export async function POST(request: NextRequest) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  if (!file.name.toLowerCase().endsWith(".pdf")) {
    return NextResponse.json(
      { error: "Only PDF files are allowed" },
      { status: 400 }
    );
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: `File size exceeds ${MAX_FILE_SIZE / (1024 * 1024)}MB limit` },
      { status: 400 }
    );
  }

  // Sanitize filename: strip path separators, then keep only safe chars
  const baseName = file.name.split(/[/\\]/).pop() ?? "upload.pdf";
  const safeName = baseName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const fileName = `${Date.now()}-${safeName}`;

  const arrayBuffer = await file.arrayBuffer();

  const { error } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(fileName, new Uint8Array(arrayBuffer), {
      contentType: "application/pdf",
      upsert: false,
    });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, fileName });
}
