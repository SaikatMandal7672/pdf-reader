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
  Activity,
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

interface RouteSummary {
  route: string;
  count: number;
  avg_ms: number;
  p95_ms: number;
  error_count: number;
}

interface HourlyPoint {
  hour: string;
  route: string;
  avg_ms: number;
}

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
  apiMetrics: {
    routeSummaries: RouteSummary[];
    hourlySeries: HourlyPoint[];
  };
}

// Consistent color per route
const ROUTE_COLORS: Record<string, string> = {
  "GET /api/files": "#3b82f6",
  "GET /api/files/:id?meta": "#10b981",
  "GET /api/files/:id": "#f59e0b",
};
function routeColor(route: string, idx: number): string {
  return ROUTE_COLORS[route] ?? ["#8b5cf6", "#ef4444", "#06b6d4"][idx % 3];
}

function durationColor(ms: number): string {
  if (ms < 50) return "text-green-500";
  if (ms < 500) return "text-yellow-500";
  return "text-red-500";
}

// Generate the last 24 UTC hour slots
function last24Hours(): string[] {
  const now = new Date();
  now.setUTCMinutes(0, 0, 0);
  return Array.from({ length: 24 }, (_, i) => {
    const d = new Date(now);
    d.setUTCHours(d.getUTCHours() - (23 - i));
    return d.toISOString().slice(0, 13) + ":00:00Z";
  });
}

function buildLinePath(
  hours: string[],
  data: HourlyPoint[],
  route: string,
  xScale: (i: number) => number,
  yScale: (ms: number) => number
): string {
  let d = "";
  let lastNull = true;
  for (let i = 0; i < hours.length; i++) {
    const pt = data.find((p) => p.hour === hours[i] && p.route === route);
    if (!pt) { lastNull = true; continue; }
    const x = xScale(i).toFixed(1);
    const y = yScale(pt.avg_ms).toFixed(1);
    d += lastNull ? `M${x},${y} ` : `L${x},${y} `;
    lastNull = false;
  }
  return d.trim();
}

// Grafana-style SVG time-series line chart
function LineChart({ data, routes }: { data: HourlyPoint[]; routes: string[] }) {
  const W = 760;
  const H = 160;
  const PAD = { top: 10, right: 16, bottom: 28, left: 48 };
  const cW = W - PAD.left - PAD.right;
  const cH = H - PAD.top - PAD.bottom;

  const hours = last24Hours();
  const maxMs = Math.max(...data.map((d) => d.avg_ms), 100);
  const xScale = (i: number) => (i / (hours.length - 1)) * cW;
  const yScale = (ms: number) => cH - (ms / maxMs) * cH;

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => ({
    y: yScale(maxMs * t),
    label: `${Math.round(maxMs * t)}`,
  }));

  const xLabels = hours
    .map((h, i) => ({ i, label: h.slice(11, 13) + "h" }))
    .filter((_, i) => i % 4 === 0);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      style={{ fontFamily: "inherit" }}
    >
      <g transform={`translate(${PAD.left},${PAD.top})`}>
        {/* Grid lines + Y labels */}
        {yTicks.map(({ y, label }) => (
          <g key={label}>
            <line
              x1={0} y1={y} x2={cW} y2={y}
              stroke="currentColor" strokeOpacity={0.1} strokeDasharray="4 2"
            />
            <text
              x={-6} y={y + 4}
              textAnchor="end" fontSize={9}
              fill="currentColor" opacity={0.5}
            >
              {label}ms
            </text>
          </g>
        ))}

        {/* X axis labels */}
        {xLabels.map(({ i, label }) => (
          <text
            key={i} x={xScale(i)} y={cH + 18}
            textAnchor="middle" fontSize={9}
            fill="currentColor" opacity={0.5}
          >
            {label}
          </text>
        ))}

        {/* Route lines */}
        {routes.map((route, ri) => {
          const path = buildLinePath(hours, data, route, xScale, yScale);
          if (!path) return null;
          return (
            <path
              key={route}
              d={path}
              fill="none"
              stroke={routeColor(route, ri)}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          );
        })}

        {/* Data dots */}
        {routes.map((route, ri) =>
          hours.map((h, i) => {
            const pt = data.find((p) => p.hour === h && p.route === route);
            if (!pt) return null;
            return (
              <circle
                key={`${route}-${h}`}
                cx={xScale(i)} cy={yScale(pt.avg_ms)} r={3}
                fill={routeColor(route, ri)}
              />
            );
          })
        )}
      </g>
    </svg>
  );
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
  const { routeSummaries, hourlySeries } = data.apiMetrics;
  const routes = [...new Set(hourlySeries.map((p) => p.route))];
  const totalRequests = routeSummaries.reduce((s, r) => s + r.count, 0);
  const overallAvg =
    routeSummaries.length > 0
      ? Math.round(
          routeSummaries.reduce((s, r) => s + r.avg_ms * r.count, 0) /
            Math.max(totalRequests, 1)
        )
      : null;

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
              <p className="mt-1 text-muted-foreground">Storage and API performance</p>
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

        {/* ── API Performance ─────────────────────────────────────── */}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-start justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Activity className="h-5 w-5" />
                  API Performance
                </CardTitle>
                <CardDescription>Last 24 hours · public routes only</CardDescription>
              </div>
              {/* Summary stats */}
              {overallAvg !== null && (
                <div className="flex gap-4 text-right">
                  <div>
                    <p className="text-xs text-muted-foreground">Total requests</p>
                    <p className="text-xl font-bold">{totalRequests.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Overall avg</p>
                    <p className={`text-xl font-bold ${durationColor(overallAvg)}`}>
                      {overallAvg}ms
                    </p>
                  </div>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {routeSummaries.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No data yet — metrics appear after the first requests hit the public API.
              </p>
            ) : (
              <>
                {/* Route summary table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-xs text-muted-foreground">
                        <th className="pb-2 text-left font-medium">Route</th>
                        <th className="pb-2 text-right font-medium">Requests</th>
                        <th className="pb-2 text-right font-medium">Avg</th>
                        <th className="pb-2 text-right font-medium">P95</th>
                        <th className="pb-2 text-right font-medium">Errors</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {routeSummaries.map((r, ri) => (
                        <tr key={r.route} className="py-2">
                          <td className="py-2 pr-4">
                            <div className="flex items-center gap-2">
                              <span
                                className="inline-block h-2 w-2 rounded-full flex-shrink-0"
                                style={{ backgroundColor: routeColor(r.route, ri) }}
                              />
                              <span className="font-mono text-xs">{r.route}</span>
                            </div>
                          </td>
                          <td className="py-2 text-right tabular-nums">
                            {r.count.toLocaleString()}
                          </td>
                          <td className={`py-2 text-right tabular-nums font-medium ${durationColor(r.avg_ms)}`}>
                            {r.avg_ms}ms
                          </td>
                          <td className={`py-2 text-right tabular-nums ${durationColor(r.p95_ms)}`}>
                            {r.p95_ms}ms
                          </td>
                          <td className="py-2 text-right tabular-nums">
                            {r.error_count > 0 ? (
                              <Badge variant="destructive" className="text-xs">
                                {r.error_count}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Time series chart */}
                {hourlySeries.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs text-muted-foreground">
                      Avg response time per hour (ms)
                    </p>
                    <div className="rounded-lg border bg-muted/30 p-3">
                      <LineChart data={hourlySeries} routes={routes} />
                    </div>
                    {/* Legend */}
                    <div className="mt-2 flex flex-wrap gap-4">
                      {routes.map((route, ri) => (
                        <div key={route} className="flex items-center gap-1.5">
                          <span
                            className="inline-block h-2 w-4 rounded-full"
                            style={{ backgroundColor: routeColor(route, ri) }}
                          />
                          <span className="font-mono text-xs text-muted-foreground">
                            {route}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
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
