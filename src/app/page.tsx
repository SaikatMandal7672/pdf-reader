"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { FileText, Calendar, HardDrive, Search, X, ShieldCheck } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Header } from "@/components/header";
import { PdfThumbnail } from "@/components/pdf-thumbnail";
import { formatFileSize, formatDate, getDisplayName } from "@/lib/format";
import type { PdfFile } from "@/types";

export default function HomePage() {
  const [files, setFiles] = useState<PdfFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/files")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load documents");
        return res.json();
      })
      .then((data: PdfFile[]) => {
        setFiles(data);
        setLoading(false);
      })
      .catch((err: Error) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return files;
    const query = search.toLowerCase();
    return files.filter((f) =>
      getDisplayName(f.name).toLowerCase().includes(query)
    );
  }, [files, search]);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-8">
        <div className="mb-8 flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Documents</h1>
            <p className="mt-1 text-muted-foreground">
              Browse and read available PDFs
            </p>
          </div>
          <Link href="/admin/login">
            <Button variant="outline" size="sm">
              <ShieldCheck className="mr-2 h-4 w-4" />
              Admin
            </Button>
          </Link>
        </div>

        {/* Search */}
        {!loading && files.length > 0 && (
          <div className="relative mb-6 max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search documents..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-9"
            />
            {search && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2"
                onClick={() => setSearch("")}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        )}

        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i}>
                <CardContent className="p-0">
                  <Skeleton className="h-40 w-full rounded-b-none rounded-t-lg" />
                </CardContent>
                <CardHeader className="pb-3 pt-4">
                  <Skeleton className="h-5 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                </CardHeader>
              </Card>
            ))}
          </div>
        ) : error ? (
          <div className="flex h-[40vh] flex-col items-center justify-center gap-3 text-destructive">
            <p className="text-lg">{error}</p>
            <Button variant="outline" onClick={() => window.location.reload()}>
              Retry
            </Button>
          </div>
        ) : files.length === 0 ? (
          <div className="flex h-[40vh] flex-col items-center justify-center gap-3 text-muted-foreground">
            <FileText className="h-12 w-12" />
            <p className="text-lg">No documents uploaded yet</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex h-[30vh] flex-col items-center justify-center gap-3 text-muted-foreground">
            <Search className="h-10 w-10" />
            <p className="text-lg">No documents match &ldquo;{search}&rdquo;</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((file) => (
              <Link
                key={file.id}
                href={`/viewer/${encodeURIComponent(file.name)}`}
              >
                <Card className="group cursor-pointer overflow-hidden transition-all hover:shadow-md hover:bg-accent/30">
                  <div className="relative border-b">
                    <PdfThumbnail
                      fileUrl={`/api/files/${encodeURIComponent(file.name)}`}
                    />
                  </div>
                  <CardHeader className="pb-3 pt-4">
                    <CardTitle className="flex items-start gap-2 text-sm font-medium">
                      <FileText className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <span className="line-clamp-2 break-all">
                        {getDisplayName(file.name)}
                      </span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0 pb-4">
                    <CardDescription className="flex items-center gap-4 text-xs">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {formatDate(file.created_at)}
                      </span>
                      <span className="flex items-center gap-1">
                        <HardDrive className="h-3 w-3" />
                        {formatFileSize(file.size)}
                      </span>
                    </CardDescription>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
