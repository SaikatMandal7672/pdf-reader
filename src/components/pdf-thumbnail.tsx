"use client";

import { useEffect, useRef, useState } from "react";
import { FileText } from "lucide-react";
import { THUMBNAIL_WIDTH } from "@/lib/constants";
import type { PDFDocumentProxy } from "pdfjs-dist";

interface PdfThumbnailProps {
  fileUrl: string;
}

export function PdfThumbnail({ fileUrl }: PdfThumbnailProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

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
        if (cancelled) {
          doc.destroy();
          return;
        }

        const page = await doc.getPage(1);
        if (cancelled) {
          doc.destroy();
          return;
        }

        const canvas = canvasRef.current;
        if (!canvas) {
          doc.destroy();
          return;
        }

        const baseViewport = page.getViewport({ scale: 1 });
        const scale = THUMBNAIL_WIDTH / baseViewport.width;
        const viewport = page.getViewport({ scale });

        const dpr = window.devicePixelRatio || 1;
        canvas.width = viewport.width * dpr;
        canvas.height = viewport.height * dpr;
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;

        const context = canvas.getContext("2d");
        if (!context) {
          doc.destroy();
          return;
        }
        context.scale(dpr, dpr);

        await page.render({
          canvasContext: context,
          canvas,
          viewport,
        }).promise;

        if (!cancelled) setLoaded(true);
        doc.destroy();
        doc = null;
      } catch {
        if (!cancelled) setError(true);
        if (doc) {
          doc.destroy();
          doc = null;
        }
      }
    }

    return () => {
      cancelled = true;
      observer.disconnect();
      if (doc) doc.destroy();
    };
  }, [fileUrl]);

  return (
    <div
      ref={containerRef}
      className="relative flex items-center justify-center overflow-hidden rounded-md bg-muted/50"
      style={{ minHeight: 160 }}
    >
      {error ? (
        <FileText className="h-10 w-10 text-muted-foreground/40" />
      ) : (
        <>
          {!loaded && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground/20 border-t-muted-foreground/60" />
            </div>
          )}
          <canvas
            ref={canvasRef}
            className={`transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"}`}
          />
        </>
      )}
    </div>
  );
}
