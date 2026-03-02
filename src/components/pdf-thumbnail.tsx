"use client";

import { useEffect, useRef, useState } from "react";
import { FileText } from "lucide-react";
import { THUMBNAIL_WIDTH } from "@/lib/constants";
import type { PDFDocumentProxy } from "pdfjs-dist";

interface PdfThumbnailProps {
  fileName: string; // storage path — used to build thumbnail URL
  fileUrl: string;  // full PDF URL — used as fallback for old files
}

// Fast path: serve pre-generated JPEG from Supabase via /api/thumbnails/[id]
// Fallback: render page 1 via PDF.js for files uploaded before this feature
export function PdfThumbnail({ fileName, fileUrl }: PdfThumbnailProps) {
  const [state, setState] = useState<"img" | "canvas" | "error">("img");
  const thumbnailUrl = `/api/thumbnails/${encodeURIComponent(fileName)}`;

  if (state === "img") {
    return (
      <div className="relative overflow-hidden bg-muted/50" style={{ minHeight: 160 }}>
        <img
          src={thumbnailUrl}
          alt=""
          className="w-full object-cover"
          onError={() => setState("canvas")}
        />
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="flex items-center justify-center overflow-hidden bg-muted/50" style={{ minHeight: 160 }}>
        <FileText className="h-10 w-10 text-muted-foreground/40" />
      </div>
    );
  }

  // Fallback: PDF.js canvas rendering (for PDFs uploaded before thumbnail feature)
  return <PdfThumbnailCanvas fileUrl={fileUrl} onError={() => setState("error")} />;
}

// Existing PDF.js rendering — kept as fallback for old uploads
function PdfThumbnailCanvas({
  fileUrl,
  onError,
}: {
  fileUrl: string;
  onError: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    let doc: PDFDocumentProxy | null = null;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          observer.disconnect();
          renderThumbnail();
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(container);

    async function renderThumbnail() {
      try {
        const pdfjsLib = await import("pdfjs-dist");
        pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

        doc = await pdfjsLib.getDocument(fileUrl).promise;
        if (cancelled) { doc.destroy(); return; }

        const page = await doc.getPage(1);
        if (cancelled) { doc.destroy(); return; }

        const canvas = canvasRef.current;
        if (!canvas) { doc.destroy(); return; }

        const baseViewport = page.getViewport({ scale: 1 });
        const scale = THUMBNAIL_WIDTH / baseViewport.width;
        const viewport = page.getViewport({ scale });

        const dpr = window.devicePixelRatio || 1;
        canvas.width = viewport.width * dpr;
        canvas.height = viewport.height * dpr;
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;

        const context = canvas.getContext("2d");
        if (!context) { doc.destroy(); return; }
        context.scale(dpr, dpr);

        await page.render({ canvasContext: context, canvas, viewport }).promise;
        if (!cancelled) setLoaded(true);
        doc.destroy();
        doc = null;
      } catch {
        if (!cancelled) onError();
        if (doc) { doc.destroy(); doc = null; }
      }
    }

    return () => {
      cancelled = true;
      observer.disconnect();
      if (doc) doc.destroy();
    };
  }, [fileUrl, onError]);

  return (
    <div
      ref={containerRef}
      className="relative flex items-center justify-center overflow-hidden bg-muted/50"
      style={{ minHeight: 160 }}
    >
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground/20 border-t-muted-foreground/60" />
        </div>
      )}
      <canvas
        ref={canvasRef}
        className={`transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"}`}
      />
    </div>
  );
}
