"use client";

import { use, useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Header } from "@/components/header";
import { PdfViewer } from "@/components/pdf-viewer";
import { getDisplayName } from "@/lib/format";

export default function ViewerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const fileName = decodeURIComponent(id);
  const displayName = getDisplayName(fileName);
  const fileUrl = `/api/files/${encodeURIComponent(fileName)}`;

  const [accessDenied, setAccessDenied] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    // Lightweight access check — no file download
    fetch(`${fileUrl}?meta=1`)
      .then((res) => {
        if (res.status === 403) {
          setAccessDenied(true);
        }
        setChecking(false);
      })
      .catch(() => setChecking(false));
  }, [fileUrl]);

  if (checking) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-4 py-6">
          <div className="flex h-[60vh] items-center justify-center">
            <div className="animate-pulse text-muted-foreground">
              Loading...
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (accessDenied) {
    return (
      <div className="min-h-screen bg-background">
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
          <div className="flex h-[60vh] flex-col items-center justify-center gap-4 text-muted-foreground">
            <Lock className="h-12 w-12" />
            <p className="text-lg font-medium">This document is private</p>
            <p className="text-sm">
              You need admin access to view this document.
            </p>
            <Link href="/admin/login">
              <Button variant="outline">Sign in as Admin</Button>
            </Link>
          </div>
        </main>
      </div>
    );
  }

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
        <PdfViewer fileUrl={fileUrl} />
      </main>
    </div>
  );
}
