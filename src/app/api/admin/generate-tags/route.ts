import { NextRequest, NextResponse } from "next/server";
import { supabase, BUCKET_NAME } from "@/lib/supabase";
import { isAdmin } from "@/lib/auth";
import { updateFileTags } from "@/lib/db";
import { generateTags } from "@/lib/gemini";

// POST /api/admin/generate-tags — generate tags for a specific file
// Body: { fileName: string }
export async function POST(request: NextRequest) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { fileName } = await request.json();

  if (!fileName || typeof fileName !== "string") {
    return NextResponse.json({ error: "fileName is required" }, { status: 400 });
  }

  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .download(fileName);

  if (error || !data) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  const buffer = Buffer.from(await data.arrayBuffer());
  const { tags, debug } = await generateTags(buffer);

  if (tags.length > 0) {
    await updateFileTags(fileName, tags);
  }

  return NextResponse.json({ success: true, tags, debug });
}
