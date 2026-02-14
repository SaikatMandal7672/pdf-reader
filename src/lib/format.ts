const FILE_SIZE_UNITS = ["B", "KB", "MB", "GB"];
const FILE_SIZE_BASE = 1024;

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const i = Math.floor(Math.log(bytes) / Math.log(FILE_SIZE_BASE));
  return `${parseFloat((bytes / Math.pow(FILE_SIZE_BASE, i)).toFixed(1))} ${FILE_SIZE_UNITS[i]}`;
}

export function formatDate(dateStr: string, includeTime = false): string {
  const options: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "short",
    day: "numeric",
    ...(includeTime && { hour: "2-digit", minute: "2-digit" }),
  };
  return new Date(dateStr).toLocaleDateString("en-US", options);
}

export function getDisplayName(fileName: string): string {
  return fileName.replace(/^\d+-/, "").replace(/_/g, " ").replace(/\.pdf$/i, "");
}
