"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { FileText, Calendar, HardDrive, Search, X, ShieldCheck, Tag } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  const [activeTag, setActiveTag] = useState<string | null>(null);

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

  // All unique tags across all files
  const allTags = useMemo(() => {
    const set = new Set<string>();
    files.forEach((f) => f.tags?.forEach((t) => set.add(t)));
    return Array.from(set).sort();
  }, [files]);

  const filtered = useMemo(() => {
    return files.filter((f) => {
      const matchesSearch = search.trim()
        ? getDisplayName(f.name).toLowerCase().includes(search.toLowerCase())
        : true;
      const matchesTag = activeTag ? f.tags?.includes(activeTag) : true;
      return matchesSearch && matchesTag;
    });
  }, [files, search, activeTag]);

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

        {!loading && files.length > 0 && (
          <div className="mb-6 space-y-3">
            {/* Search */}
            <div className="relative max-w-md">
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

            {/* Tag filter */}
            {allTags.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <Tag className="h-3.5 w-3.5 text-muted-foreground" />
                {allTags.map((tag) => (
                  <Badge
                    key={tag}
                    variant={activeTag === tag ? "default" : "secondary"}
                    className="cursor-pointer transition-colors"
                    onClick={() => setActiveTag(activeTag === tag ? null : tag)}
                  >
                    {tag}
                  </Badge>
                ))}
                {activeTag && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={() => setActiveTag(null)}
                  >
                    Clear
                  </Button>
                )}
              </div>
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
            <p className="text-lg">No documents match your filters</p>
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
                  <CardHeader className="pb-2 pt-4">
                    <CardTitle className="flex items-start gap-2 text-sm font-medium">
                      <FileText className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <span className="line-clamp-2 break-all">
                        {getDisplayName(file.name)}
                      </span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0 pb-4 space-y-2">
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
                    {file.tags?.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {file.tags.map((tag) => (
                          <Badge
                            key={tag}
                            variant="outline"
                            className="text-xs px-1.5 py-0"
                          >
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    )}
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
