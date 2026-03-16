"use client";

import { use, useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
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

  const compactHeader = (
    <header className="flex items-center gap-2 border-b bg-background/95 px-4 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <Link href="/">
        <Button variant="ghost" size="icon">
          <ArrowLeft className="h-4 w-4" />
        </Button>
      </Link>
      <h1 className="flex-1 truncate text-sm font-semibold">{displayName}</h1>
      <ThemeToggle />
    </header>
  );

  if (checking) {
    return (
      <div className="flex flex-col h-screen bg-background">
        {compactHeader}
        <div className="flex flex-1 items-center justify-center">
          <div className="animate-pulse text-muted-foreground">Loading...</div>
        </div>
      </div>
    );
  }

  if (accessDenied) {
    return (
      <div className="flex flex-col h-screen bg-background">
        {compactHeader}
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-muted-foreground">
          <Lock className="h-12 w-12" />
          <p className="text-lg font-medium">This document is private</p>
          <p className="text-sm">You need admin access to view this document.</p>
          <Link href="/admin/login">
            <Button variant="outline">Sign in as Admin</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col h-screen bg-background"
      onContextMenu={(e) => e.preventDefault()}
    >
      {compactHeader}
      <PdfViewer fileUrl={fileUrl} />
    </div>
  );
}
