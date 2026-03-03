import { vi } from "vitest";

// ── Next.js internals ──────────────────────────────────────────────────────
vi.mock("next/cache", () => ({
  revalidateTag: vi.fn(),
  // Wrap the function so cached calls go straight through to the real fn
  unstable_cache: vi.fn((fn: (...args: unknown[]) => unknown) => (...args: unknown[]) => fn(...args)),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(() => ({
    get: vi.fn().mockReturnValue(undefined),
    set: vi.fn(),
  })),
}));

// ── Environment ────────────────────────────────────────────────────────────
process.env.ADMIN_PASSWORD = "test-password";
process.env.ADMIN_SECRET = "test-secret-that-is-long-enough-32ch";
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
process.env.GEMINI_API_KEY = "test-gemini-key";
