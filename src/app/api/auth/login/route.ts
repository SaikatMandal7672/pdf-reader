import { NextRequest, NextResponse } from "next/server";
import { createAdminToken, getAdminCookieConfig } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const { password } = await request.json();

    if (password !== process.env.ADMIN_PASSWORD) {
      return NextResponse.json({ error: "Invalid password" }, { status: 401 });
    }

    const token = await createAdminToken();
    const response = NextResponse.json({ success: true });
    response.cookies.set(getAdminCookieConfig(token));
    return response;
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
