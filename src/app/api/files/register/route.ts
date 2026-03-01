import { NextRequest, NextResponse } from "next/server";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { r2, R2_BUCKET } from "@/lib/r2";
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

  // Generate tags in the background — fetch PDF from R2, run Gemini, store tags.
  // We respond immediately and don't block on this.
  (async () => {
    try {
      const obj = await r2.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: path }));
      const chunks: Uint8Array[] = [];
      for await (const chunk of obj.Body as AsyncIterable<Uint8Array>) {
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);
      const tags = await generateTags(buffer);
      if (tags.length > 0) {
        await updateFileTags(path, tags);
      }
    } catch (err) {
      console.error("Tag generation failed:", err);
    }
  })();

  return NextResponse.json({ success: true, fileName: path });
}
