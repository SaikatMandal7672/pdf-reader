import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { ensurePdfFileRow } from "@/lib/db";

// POST /api/files/register — record an already-uploaded file in the DB (admin only)
// Called by the client after a successful direct-to-Supabase upload.
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

  return NextResponse.json({ success: true, fileName: path });
}
