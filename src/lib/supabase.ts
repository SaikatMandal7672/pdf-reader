import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Server-side only client using service role key
// This bypasses RLS and has full access to the private bucket
export const supabase = createClient(supabaseUrl, supabaseServiceKey);

export const BUCKET_NAME = "pdf-2";
