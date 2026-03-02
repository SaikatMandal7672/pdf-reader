import { THUMBNAIL_WIDTH } from "./constants";

// Renders the first page of a PDF file to a JPEG blob.
// Runs client-side — uses the PDF bytes already in memory during upload.
export async function generateThumbnailBlob(file: File): Promise<Blob | null> {
  try {
    const pdfjsLib = await import("pdfjs-dist");
    pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

    const bytes = new Uint8Array(await file.arrayBuffer());
    const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
    const page = await pdf.getPage(1);

    const baseViewport = page.getViewport({ scale: 1 });
    const scale = THUMBNAIL_WIDTH / baseViewport.width;
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement("canvas");
    const dpr = window.devicePixelRatio || 1;
    canvas.width = viewport.width * dpr;
    canvas.height = viewport.height * dpr;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(dpr, dpr);

    await page.render({ canvasContext: ctx, canvas, viewport }).promise;
    pdf.destroy();

    return new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", 0.85)
    );
  } catch {
    return null;
  }
}
