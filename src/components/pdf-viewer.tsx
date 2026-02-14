"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from "lucide-react";
import { DEFAULT_SCALE, ZOOM_MIN, ZOOM_MAX, ZOOM_STEP } from "@/lib/constants";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";

interface PdfViewerProps {
  fileUrl: string;
}

export function PdfViewer({ fileUrl }: PdfViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [scale, setScale] = useState(DEFAULT_SCALE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const renderTaskRef = useRef<RenderTask | null>(null);

  useEffect(() => {
    let cancelled = false;
    let doc: PDFDocumentProxy | null = null;

    async function loadPdf() {
      try {
        const pdfjsLib = await import("pdfjs-dist");
        pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

        doc = await pdfjsLib.getDocument(fileUrl).promise;
        if (cancelled) {
          doc.destroy();
          return;
        }

        setPdfDoc(doc);
        setTotalPages(doc.numPages);
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load PDF");
        setLoading(false);
      }
    }

    loadPdf();

    return () => {
      cancelled = true;
      if (doc) doc.destroy();
    };
  }, [fileUrl]);

  const renderPage = useCallback(
    async (pageNum: number) => {
      if (!pdfDoc || !canvasRef.current) return;

      // Cancel any ongoing render
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch {
          // ignore — cancelling a completed task throws
        }
      }

      try {
        const page = await pdfDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current;
        const context = canvas.getContext("2d");
        if (!context) return;

        const dpr = window.devicePixelRatio || 1;
        canvas.width = viewport.width * dpr;
        canvas.height = viewport.height * dpr;
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        context.scale(dpr, dpr);

        const renderTask = page.render({
          canvasContext: context,
          canvas,
          viewport,
        });
        renderTaskRef.current = renderTask;

        await renderTask.promise;
      } catch (err) {
        if (err instanceof Error && err.message.includes("Rendering cancelled")) {
          return;
        }
      }
    },
    [pdfDoc, scale]
  );

  useEffect(() => {
    renderPage(currentPage);
  }, [currentPage, renderPage]);

  const goToPrev = () => setCurrentPage((p) => Math.max(1, p - 1));
  const goToNext = () => setCurrentPage((p) => Math.min(totalPages, p + 1));
  const zoomIn = () => setScale((s) => Math.min(ZOOM_MAX, s + ZOOM_STEP));
  const zoomOut = () => setScale((s) => Math.max(ZOOM_MIN, s - ZOOM_STEP));

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="animate-pulse text-muted-foreground">
          Loading PDF...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <p className="text-destructive">{error}</p>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col items-center gap-4"
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Controls */}
      <div className="sticky top-0 z-10 flex items-center gap-2 rounded-lg border bg-background/95 px-4 py-2 shadow-sm backdrop-blur">
        <Button
          variant="ghost"
          size="icon"
          onClick={goToPrev}
          disabled={currentPage <= 1}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="min-w-[80px] text-center text-sm text-muted-foreground">
          {currentPage} / {totalPages}
        </span>
        <Button
          variant="ghost"
          size="icon"
          onClick={goToNext}
          disabled={currentPage >= totalPages}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        <div className="mx-2 h-4 w-px bg-border" />
        <Button variant="ghost" size="icon" onClick={zoomOut} disabled={scale <= ZOOM_MIN}>
          <ZoomOut className="h-4 w-4" />
        </Button>
        <span className="min-w-[50px] text-center text-sm text-muted-foreground">
          {Math.round(scale * 100)}%
        </span>
        <Button variant="ghost" size="icon" onClick={zoomIn} disabled={scale >= ZOOM_MAX}>
          <ZoomIn className="h-4 w-4" />
        </Button>
      </div>

      {/* Canvas */}
      <div className="overflow-auto rounded-lg border bg-muted/30 p-4 shadow-inner">
        <canvas
          ref={canvasRef}
          className="select-none"
          style={{ userSelect: "none", WebkitUserSelect: "none" }}
        />
      </div>
    </div>
  );
}
