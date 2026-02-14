"use client";

import { use } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Header } from "@/components/header";
import { PdfViewer } from "@/components/pdf-viewer";

export default function ViewerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const fileName = decodeURIComponent(id);
  const displayName = fileName.replace(/^\d+-/, "").replace(/_/g, " ");

  return (
    <div
      className="min-h-screen bg-background"
      onContextMenu={(e) => e.preventDefault()}
    >
      <Header />
      <main className="container mx-auto px-4 py-6">
        <div className="mb-6 flex items-center gap-3">
          <Link href="/">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <h1 className="truncate text-lg font-semibold">{displayName}</h1>
        </div>
        <PdfViewer fileUrl={`/api/files/${encodeURIComponent(fileName)}`} />
      </main>
    </div>
  );
}
