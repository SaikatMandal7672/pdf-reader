import { NextResponse } from "next/server";
import { supabase, BUCKET_NAME } from "@/lib/supabase";
import { isAdmin } from "@/lib/auth";
import { getAllFileVisibility } from "@/lib/db";
import { getRouteSummaries, getHourlySeries } from "@/lib/api-metrics";

const SUPABASE_FREE_STORAGE = 1 * 1024 * 1024 * 1024; // 1GB

export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase.storage.from(BUCKET_NAME).list("", {
    sortBy: { column: "created_at", order: "desc" },
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const pdfFiles = (data ?? []).filter((f) => f.name.endsWith(".pdf"));
  const visibilityMap = await getAllFileVisibility();

  let storageUsed = 0;
  let publicCount = 0;
  let privateCount = 0;
  let untaggedCount = 0;
  const tagFrequency: Record<string, number> = {};

  for (const f of pdfFiles) {
    const size = f.metadata?.size ?? 0;
    storageUsed += size;

    const meta = visibilityMap.get(f.name);
    if (meta?.is_public ?? true) {
      publicCount++;
    } else {
      privateCount++;
    }

    const tags = meta?.tags ?? [];
    if (tags.length === 0) {
      untaggedCount++;
    } else {
      for (const tag of tags) {
        tagFrequency[tag] = (tagFrequency[tag] ?? 0) + 1;
      }
    }
  }

  const topTags = Object.entries(tagFrequency)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([tag, count]) => ({ tag, count }));

  const largestFiles = [...pdfFiles]
    .sort((a, b) => (b.metadata?.size ?? 0) - (a.metadata?.size ?? 0))
    .slice(0, 5)
    .map((f) => ({ name: f.name, size: f.metadata?.size ?? 0 }));

  const recentFiles = pdfFiles.slice(0, 5).map((f) => ({
    name: f.name,
    created_at: f.created_at ?? new Date().toISOString(),
  }));

  const [routeSummaries, hourlySeries] = await Promise.all([
    getRouteSummaries().catch(() => []),
    getHourlySeries().catch(() => []),
  ]);

  return NextResponse.json({
    totalFiles: pdfFiles.length,
    publicCount,
    privateCount,
    untaggedCount,
    storageUsedBytes: storageUsed,
    storageCapacityBytes: SUPABASE_FREE_STORAGE,
    topTags,
    largestFiles,
    recentFiles,
    apiMetrics: { routeSummaries, hourlySeries },
  });
}
