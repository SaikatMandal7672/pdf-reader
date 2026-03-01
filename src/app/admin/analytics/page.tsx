"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  HardDrive,
  FileText,
  Globe,
  Lock,
  Tag,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Header } from "@/components/header";
import { Separator } from "@/components/ui/separator";
import { formatFileSize, formatDate, getDisplayName } from "@/lib/format";

interface AnalyticsData {
  totalFiles: number;
  publicCount: number;
  privateCount: number;
  untaggedCount: number;
  storageUsedBytes: number;
  storageCapacityBytes: number;
  topTags: { tag: string; count: number }[];
  largestFiles: { name: string; size: number }[];
  recentFiles: { name: string; created_at: string }[];
}

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(true);
  const router = useRouter();

  useEffect(() => {
    fetch("/api/auth/check")
      .then((res) => res.json())
      .then((d) => {
        if (!d.authenticated) router.push("/admin/login");
        else setChecking(false);
      })
      .catch(() => router.push("/admin/login"));
  }, [router]);

  useEffect(() => {
    if (checking) return;
    fetchAnalytics();
  }, [checking]);

  async function fetchAnalytics() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/analytics");
      if (!res.ok) throw new Error();
      setData(await res.json());
    } finally {
      setLoading(false);
    }
  }

  if (checking || loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="flex h-[60vh] items-center justify-center">
          <p className="animate-pulse text-muted-foreground">Loading analytics...</p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const storagePercent = Math.min(
    (data.storageUsedBytes / data.storageCapacityBytes) * 100,
    100
  );
  const storageRemaining = data.storageCapacityBytes - data.storageUsedBytes;

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/admin">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Analytics</h1>
              <p className="mt-1 text-muted-foreground">Storage and document insights</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={fetchAnalytics}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </div>

        <Separator className="mb-8" />

        {/* Stats row */}
        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1">
                <FileText className="h-3.5 w-3.5" /> Total Files
              </CardDescription>
              <CardTitle className="text-3xl">{data.totalFiles}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1">
                <Globe className="h-3.5 w-3.5" /> Public
              </CardDescription>
              <CardTitle className="text-3xl">{data.publicCount}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1">
                <Lock className="h-3.5 w-3.5" /> Private
              </CardDescription>
              <CardTitle className="text-3xl">{data.privateCount}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1">
                <Tag className="h-3.5 w-3.5" /> Untagged
              </CardDescription>
              <CardTitle className="text-3xl">{data.untaggedCount}</CardTitle>
            </CardHeader>
          </Card>
        </div>

        {/* Storage */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <HardDrive className="h-5 w-5" />
              Supabase Storage
            </CardTitle>
            <CardDescription>Free tier — 1GB total</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="font-medium">{formatFileSize(data.storageUsedBytes)} used</span>
              <span className="text-muted-foreground">{formatFileSize(storageRemaining)} remaining</span>
            </div>
            <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${storagePercent}%`,
                  backgroundColor:
                    storagePercent > 90
                      ? "hsl(var(--destructive))"
                      : storagePercent > 70
                      ? "#f59e0b"
                      : "hsl(var(--primary))",
                }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {storagePercent.toFixed(1)}% of 1GB used
            </p>
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Top tags */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Tag className="h-5 w-5" />
                Top Tags
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.topTags.length === 0 ? (
                <p className="text-sm text-muted-foreground">No tags yet</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {data.topTags.map(({ tag, count }) => (
                    <Badge key={tag} variant="secondary" className="gap-1">
                      {tag}
                      <span className="rounded-full bg-muted-foreground/20 px-1 text-xs">
                        {count}
                      </span>
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Largest files */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <HardDrive className="h-5 w-5" />
                Largest Files
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.largestFiles.map((f) => (
                <div key={f.name} className="flex items-center justify-between text-sm">
                  <span className="truncate text-muted-foreground max-w-[70%]">
                    {getDisplayName(f.name)}
                  </span>
                  <span className="font-medium">{formatFileSize(f.size)}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Recent uploads */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <FileText className="h-5 w-5" />
                Recent Uploads
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.recentFiles.map((f) => (
                <div key={f.name} className="flex items-center justify-between text-sm">
                  <span className="truncate text-muted-foreground max-w-[70%]">
                    {getDisplayName(f.name)}
                  </span>
                  <span className="text-muted-foreground">{formatDate(f.created_at, true)}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
