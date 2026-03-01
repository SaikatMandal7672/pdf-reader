"use client";

interface PdfViewerProps {
  fileUrl: string;
}

export function PdfViewer({ fileUrl }: PdfViewerProps) {
  return (
    <iframe
      src={fileUrl}
      className="w-full rounded-lg border shadow-sm"
      style={{ height: "calc(100vh - 130px)" }}
      title="PDF Viewer"
    />
  );
}
