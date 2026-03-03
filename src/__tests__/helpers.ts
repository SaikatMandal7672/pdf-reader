import { NextRequest } from "next/server";

const BASE = "http://localhost";

export interface RequestOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  searchParams?: Record<string, string>;
}

/** Build a NextRequest for testing route handlers directly. */
export function makeRequest(path: string, options: RequestOptions = {}): NextRequest {
  const { method = "GET", body, headers = {}, searchParams } = options;

  const url = new URL(path, BASE);
  if (searchParams) {
    Object.entries(searchParams).forEach(([k, v]) => url.searchParams.set(k, v));
  }

  const init: RequestInit = { method, headers };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
    init.headers = { "Content-Type": "application/json", ...headers };
  }

  return new NextRequest(url, init);
}

/** Parse a NextResponse into { status, body } for easy assertions. */
export async function parseResponse<T = unknown>(
  res: Response
): Promise<{ status: number; body: T }> {
  const body = await res.json().catch(() => null);
  return { status: res.status, body: body as T };
}

/** Build dynamic route params (App Router passes them as a Promise). */
export function makeParams<T extends Record<string, string>>(params: T) {
  return { params: Promise.resolve(params) };
}
