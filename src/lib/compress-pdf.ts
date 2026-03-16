import { PDFDocument } from "pdf-lib";

const COMPRESS_THRESHOLD = 15 * 1024 * 1024; // 15MB

export async function maybeCompressPdf(
  file: File,
  onProgress?: (msg: string) => void
): Promise<File> {
  if (file.size <= COMPRESS_THRESHOLD) return file;

  onProgress?.("Compressing...");

  // Lossless recompression — restructures object streams, preserves text and image quality
  const lossless = await losslessCompress(file);
  onProgress?.(`Compressed ${formatSize(file.size)} → ${formatSize(lossless.size)}`);
  return lossless;
}

async function losslessCompress(file: File): Promise<File> {
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const compressed = await doc.save({ useObjectStreams: true, addDefaultPage: false });
    return new File([compressed.buffer as ArrayBuffer], file.name, { type: "application/pdf" });
  } catch {
    return file;
  }
}

function formatSize(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export const COMPRESS_THRESHOLD_MB = COMPRESS_THRESHOLD / (1024 * 1024);
