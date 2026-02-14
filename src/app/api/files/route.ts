import { NextRequest, NextResponse } from "next/server";
import { supabase, BUCKET_NAME } from "@/lib/supabase";
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

  const { data, error } = await supabase.storage.from(BUCKET_NAME).list("", {
    sortBy: { column: "created_at", order: "desc" },
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const pdfFiles = (data ?? []).filter((f) => f.name.endsWith(".pdf"));
  const visibilityMap = await getAllFileVisibility();

  const files: PdfFile[] = [];
  for (const f of pdfFiles) {
    let isPublic = visibilityMap.get(f.name);

    if (isPublic === undefined) {
      // Backwards compat: file in storage but not in DB — treat as public
      isPublic = true;
      ensurePdfFileRow(f.name, true).catch(() => {});
    }

    files.push({
      id: f.id ?? f.name,
      name: f.name,
      size: f.metadata?.size ?? 0,
      created_at: f.created_at ?? new Date().toISOString(),
      is_public: isPublic,
    });
  }

  if (!adminRequested) {
    return NextResponse.json(files.filter((f) => f.is_public));
  }

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

  try {
    await ensurePdfFileRow(fileName, true);
  } catch (dbError) {
    console.error("Failed to create pdf_files row:", dbError);
  }

  return NextResponse.json({ success: true, fileName });
}
