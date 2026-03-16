"use client";

interface PdfViewerProps {
  fileUrl: string;
}

export function PdfViewer({ fileUrl }: PdfViewerProps) {
  return (
    <iframe
      src={fileUrl}
      className="w-full flex-1 min-h-0"
      title="PDF Viewer"
    />
  );
}
