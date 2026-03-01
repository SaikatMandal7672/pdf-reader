import { supabase } from "./supabase";

export async function recordMetric(
  route: string,
  durationMs: number,
  statusCode: number
): Promise<void> {
  await supabase.from("api_metrics").insert({
    route,
    duration_ms: durationMs,
    status_code: statusCode,
  });
}

export interface RouteSummary {
  route: string;
  count: number;
  avg_ms: number;
  p95_ms: number;
  error_count: number;
}

export interface HourlyPoint {
  hour: string; // ISO hour e.g. "2024-01-01T10:00:00Z"
  route: string;
  avg_ms: number;
}

// Per-route stats for the last 24h — computed in JS since Supabase free tier
// doesn't support percentile functions.
export async function getRouteSummaries(): Promise<RouteSummary[]> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("api_metrics")
    .select("route, duration_ms, status_code")
    .gte("created_at", since);

  if (error || !data || data.length === 0) return [];

  const grouped = new Map<string, { durations: number[]; errors: number }>();
  for (const row of data) {
    if (!grouped.has(row.route)) grouped.set(row.route, { durations: [], errors: 0 });
    const g = grouped.get(row.route)!;
    g.durations.push(row.duration_ms);
    if (row.status_code >= 400) g.errors++;
  }

  return Array.from(grouped.entries())
    .map(([route, { durations, errors }]) => {
      const sorted = [...durations].sort((a, b) => a - b);
      const avg = Math.round(durations.reduce((a, b) => a + b, 0) / durations.length);
      const p95idx = Math.max(0, Math.floor(sorted.length * 0.95) - 1);
      return {
        route,
        count: durations.length,
        avg_ms: avg,
        p95_ms: sorted[p95idx] ?? 0,
        error_count: errors,
      };
    })
    .sort((a, b) => b.count - a.count);
}

// Hourly average response time per route for the last 24h.
export async function getHourlySeries(): Promise<HourlyPoint[]> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("api_metrics")
    .select("route, duration_ms, created_at")
    .gte("created_at", since)
    .order("created_at", { ascending: true });

  if (error || !data || data.length === 0) return [];

  const grouped = new Map<string, { sum: number; count: number }>();
  for (const row of data) {
    const hour = (row.created_at as string).slice(0, 13) + ":00:00Z";
    const key = `${hour}|${row.route}`;
    if (!grouped.has(key)) grouped.set(key, { sum: 0, count: 0 });
    const g = grouped.get(key)!;
    g.sum += row.duration_ms;
    g.count++;
  }

  return Array.from(grouped.entries())
    .map(([key, { sum, count }]) => {
      const pipe = key.indexOf("|");
      return {
        hour: key.slice(0, pipe),
        route: key.slice(pipe + 1),
        avg_ms: Math.round(sum / count),
      };
    })
    .sort((a, b) => a.hour.localeCompare(b.hour));
}
