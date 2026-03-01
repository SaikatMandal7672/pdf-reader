import { supabase } from "@/lib/supabase";

/**
 * Ensure a pdf_files row exists for a given file.
 * Uses upsert with ignoreDuplicates so it's safe to call multiple times.
 */
export async function ensurePdfFileRow(
  fileName: string,
  isPublic: boolean = true
) {
  const { error } = await supabase
    .from("pdf_files")
    .upsert(
      { file_name: fileName, is_public: isPublic },
      { onConflict: "file_name", ignoreDuplicates: true }
    );
  if (error) throw error;
}

/**
 * Delete the pdf_files row when a file is removed from storage.
 */
export async function deletePdfFileRow(fileName: string) {
  const { error } = await supabase
    .from("pdf_files")
    .delete()
    .eq("file_name", fileName);
  if (error) throw error;
}

/**
 * Set visibility for a file. Returns the updated is_public value.
 */
export async function setFileVisibility(
  fileName: string,
  isPublic: boolean
): Promise<boolean> {
  const { data, error } = await supabase
    .from("pdf_files")
    .update({ is_public: isPublic })
    .eq("file_name", fileName)
    .select("is_public")
    .single();
  if (error) throw error;
  return data.is_public;
}

/**
 * Get visibility for a single file.
 * Returns true (public) if no row exists — backwards compatibility.
 */
export async function getFileVisibility(fileName: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("pdf_files")
    .select("is_public")
    .eq("file_name", fileName)
    .single();
  if (error || !data) return true;
  return data.is_public;
}

/**
 * Get visibility and tags for all files in a single query.
 * Returns Map<file_name, { is_public, tags }>.
 */
export async function getAllFileVisibility(): Promise<
  Map<string, { is_public: boolean; tags: string[] }>
> {
  const { data, error } = await supabase
    .from("pdf_files")
    .select("file_name, is_public, tags");
  if (error || !data) return new Map();
  return new Map(
    data.map((row) => [row.file_name, { is_public: row.is_public, tags: row.tags ?? [] }])
  );
}

/**
 * Update tags for a file.
 */
export async function updateFileTags(
  fileName: string,
  tags: string[]
): Promise<void> {
  const { error } = await supabase
    .from("pdf_files")
    .update({ tags })
    .eq("file_name", fileName);
  if (error) throw error;
}
