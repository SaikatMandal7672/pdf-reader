import { describe, it, expect } from "vitest";
import { formatFileSize, formatDate, getDisplayName } from "../format";

describe("formatFileSize", () => {
  it("returns '0 B' for zero bytes", () => {
    expect(formatFileSize(0)).toBe("0 B");
  });

  it("formats bytes", () => {
    expect(formatFileSize(500)).toBe("500 B");
  });

  it("formats kilobytes", () => {
    expect(formatFileSize(1024)).toBe("1 KB");
    expect(formatFileSize(1536)).toBe("1.5 KB");
  });

  it("formats megabytes", () => {
    expect(formatFileSize(1024 * 1024)).toBe("1 MB");
    expect(formatFileSize(10 * 1024 * 1024)).toBe("10 MB");
  });

  it("formats gigabytes", () => {
    expect(formatFileSize(1024 * 1024 * 1024)).toBe("1 GB");
  });
});

describe("formatDate", () => {
  it("formats a date string without time by default", () => {
    const result = formatDate("2024-01-15T10:30:00Z");
    expect(result).toMatch(/Jan/);
    expect(result).toMatch(/15/);
    expect(result).toMatch(/2024/);
  });

  it("includes time when includeTime is true", () => {
    const result = formatDate("2024-01-15T10:30:00Z", true);
    expect(result).toMatch(/:/); // time separator
  });

  it("does not include time by default", () => {
    const result = formatDate("2024-01-15T10:30:00Z");
    // Default output should not include a colon (time)
    expect(result).not.toMatch(/\d+:\d+/);
  });
});

describe("getDisplayName", () => {
  it("strips leading timestamp prefix", () => {
    expect(getDisplayName("1234567890-my-file.pdf")).toBe("my-file");
  });

  it("replaces underscores with spaces", () => {
    expect(getDisplayName("1234567890-my_cool_book.pdf")).toBe("my cool book");
  });

  it("strips .pdf extension case-insensitively", () => {
    expect(getDisplayName("1234567890-Book.PDF")).toBe("Book");
    expect(getDisplayName("1234567890-Book.pdf")).toBe("Book");
  });

  it("handles filenames without a timestamp prefix", () => {
    expect(getDisplayName("plain_name.pdf")).toBe("plain name");
  });

  it("handles a realistic Supabase storage filename", () => {
    const name = "1772357571003-Go_in_Action.pdf";
    expect(getDisplayName(name)).toBe("Go in Action");
  });
});
