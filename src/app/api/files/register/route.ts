import { NextRequest, NextResponse } from "next/server";
import { supabase, BUCKET_NAME } from "@/lib/supabase";
import { isAdmin } from "@/lib/auth";
import { ensurePdfFileRow, updateFileTags } from "@/lib/db";
import { generateTags } from "@/lib/gemini";

// POST /api/files/register — record an already-uploaded file in the DB (admin only)
// Also triggers Gemini tag generation from the uploaded PDF.
export async function POST(request: NextRequest) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { path } = body;

  if (!path || typeof path !== "string") {
    return NextResponse.json({ error: "path is required" }, { status: 400 });
  }

  try {
    await ensurePdfFileRow(path, true);
  } catch (err) {
    console.error("Failed to register file in DB:", err);
    return NextResponse.json({ error: "Failed to register file" }, { status: 500 });
  }

  // Generate tags in the background — fetch PDF from Supabase, run Gemini, store tags.
  (async () => {
    try {
      const { data, error } = await supabase.storage
        .from(BUCKET_NAME)
        .download(path);

      if (error || !data) return;

      const buffer = Buffer.from(await data.arrayBuffer());
      const { tags, debug } = await generateTags(buffer);
      if (debug) console.log("[generate-tags]", debug);
      if (tags.length > 0) {
        await updateFileTags(path, tags);
      }
    } catch (err) {
      console.error("Tag generation failed:", err);
    }
  })();

  return NextResponse.json({ success: true, fileName: path });
}
