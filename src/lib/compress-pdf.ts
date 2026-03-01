import { PDFDocument } from "pdf-lib";

const COMPRESS_THRESHOLD = 15 * 1024 * 1024; // 15MB
const TARGET_SIZE = 10 * 1024 * 1024; // 10MB target

export async function maybeCompressPdf(
  file: File,
  onProgress?: (msg: string) => void
): Promise<File> {
  if (file.size <= COMPRESS_THRESHOLD) return file;

  onProgress?.("Compressing...");

  // Step 1: lossless recompression via pdf-lib (preserves text/selectable content)
  const lossless = await losslessCompress(file);
  if (lossless.size <= TARGET_SIZE) {
    onProgress?.(`Compressed ${formatSize(file.size)} → ${formatSize(lossless.size)}`);
    return lossless;
  }

  // Step 2: lossy canvas re-render at reduced JPEG quality (rasterises pages)
  onProgress?.("Compressing images...");
  const lossy = await lossyCompress(lossless, onProgress);
  onProgress?.(`Compressed ${formatSize(file.size)} → ${formatSize(lossy.size)}`);
  return lossy;
}

// Lossless: restructure PDF object streams — preserves text selectability
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

// Lossy: render each page to canvas, rebuild PDF as JPEG images
async function lossyCompress(
  file: File,
  onProgress?: (msg: string) => void
): Promise<File> {
  try {
    const pdfjsLib = await import("pdfjs-dist");
    pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

    const bytes = new Uint8Array(await file.arrayBuffer());
    const pdfDoc = await pdfjsLib.getDocument({ data: bytes }).promise;
    const newDoc = await PDFDocument.create();

    // Iteratively lower quality until target size is met
    let quality = 0.7;
    const minQuality = 0.3;
    const step = 0.1;

    while (quality >= minQuality) {
      const pages: Uint8Array[] = [];

      for (let i = 1; i <= pdfDoc.numPages; i++) {
        onProgress?.(`Compressing page ${i} / ${pdfDoc.numPages}...`);
        const page = await pdfDoc.getPage(i);
        const viewport = page.getViewport({ scale: 1.2 });

        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext("2d")!;

        await page.render({ canvasContext: ctx, viewport }).promise;
        const blob = await new Promise<Blob>((res) =>
          canvas.toBlob((b) => res(b!), "image/jpeg", quality)
        );
        pages.push(new Uint8Array(await blob.arrayBuffer()));
      }

      // Build new PDF
      const tempDoc = await PDFDocument.create();
      for (const jpegBytes of pages) {
        const img = await tempDoc.embedJpg(jpegBytes);
        const pg = tempDoc.addPage([img.width, img.height]);
        pg.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
      }

      const result = await tempDoc.save({ useObjectStreams: true });
      if (result.byteLength <= TARGET_SIZE || quality <= minQuality) {
        return new File([result], file.name, { type: "application/pdf" });
      }

      quality = Math.max(minQuality, quality - step);
    }

    return file;
  } catch {
    return file;
  }
}

function formatSize(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export const COMPRESS_THRESHOLD_MB = COMPRESS_THRESHOLD / (1024 * 1024);
