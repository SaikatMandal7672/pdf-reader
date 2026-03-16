import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import { writeFile, readFile, unlink } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import { supabase, BUCKET_NAME } from "@/lib/supabase";
import { isAdmin } from "@/lib/auth";

export const maxDuration = 60; // Vercel max for hobby plan

// Ghostscript binary — installed via Homebrew on macOS
const GS_BIN = "/opt/homebrew/bin/gs";

// POST /api/admin/compress — server-side Ghostscript PDF compression (admin only)
// Downloads from Supabase, runs gs /printer profile, re-uploads if smaller.
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

  // Write input to temp file
  const id = randomUUID();
  const inputPath = join(tmpdir(), `${id}_input.pdf`);
  const outputPath = join(tmpdir(), `${id}_output.pdf`);

  try {
    await writeFile(inputPath, originalBytes);

    // Run Ghostscript with /printer profile — preserves text and image sharpness
    await runGhostscript(inputPath, outputPath);

    const compressedBytes = await readFile(outputPath);
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
  } catch (err) {
    return NextResponse.json(
      { error: `Compression failed: ${(err as Error).message}` },
      { status: 500 }
    );
  } finally {
    // Clean up temp files
    await unlink(inputPath).catch(() => {});
    await unlink(outputPath).catch(() => {});
  }
}

function runGhostscript(inputPath: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = [
      "-sDEVICE=pdfwrite",
      "-dCompatibilityLevel=1.4",
      "-dPDFSETTINGS=/printer", // 300dpi — high quality, preserves sharpness
      "-dNOPAUSE",
      "-dQUIET",
      "-dBATCH",
      `-sOutputFile=${outputPath}`,
      inputPath,
    ];

    const gs = spawn(GS_BIN, args);
    const stderr: string[] = [];

    gs.stderr.on("data", (d) => stderr.push(d.toString()));
    gs.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Ghostscript exited with code ${code}: ${stderr.join("")}`));
      }
    });
    gs.on("error", (err) => reject(new Error(`Failed to start Ghostscript: ${err.message}`)));
  });
}
