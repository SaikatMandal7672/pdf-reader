import { vi } from "vitest";

/**
 * Creates a fresh Supabase mock with configurable return values.
 * Call makeSupabaseMock() in beforeEach to get a clean mock per test.
 */
export function makeSupabaseMock() {
  const storage = {
    download: vi.fn().mockResolvedValue({ data: new Blob(["pdf"]), error: null }),
    upload: vi.fn().mockResolvedValue({ data: {}, error: null }),
    update: vi.fn().mockResolvedValue({ data: {}, error: null }),
    remove: vi.fn().mockResolvedValue({ data: {}, error: null }),
    list: vi.fn().mockResolvedValue({ data: [], error: null }),
    createSignedUploadUrl: vi.fn().mockResolvedValue({
      data: { signedUrl: "https://supabase.example.com/signed" },
      error: null,
    }),
  };

  // Supabase storage chains: supabase.storage.from(bucket).method()
  const fromStorage = vi.fn().mockReturnValue(storage);

  // Supabase DB chains: supabase.from(table).select/update/upsert/delete...
  const dbResult = { data: [], error: null };
  const dbChain = {
    select: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockResolvedValue({ error: null }),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(dbResult),
    then: undefined as unknown,
  };
  // Make the chain itself awaitable so callers can do `await supabase.from(...).delete().eq()`
  (dbChain as unknown as Promise<unknown>).then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve({ error: null }).then(resolve);

  const fromDb = vi.fn().mockReturnValue(dbChain);

  const client = {
    storage: { from: fromStorage },
    from: fromDb,
    _storage: storage,
    _dbChain: dbChain,
  };

  return client;
}

export type SupabaseMock = ReturnType<typeof makeSupabaseMock>;
