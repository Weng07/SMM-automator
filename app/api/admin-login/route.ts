import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const password = body.password;

    if (!password) {
      return NextResponse.json(
        { error: "Password is required." },
        { status: 400 }
      );
    }

    if (password !== process.env.ADMIN_PANEL_PASSWORD) {
      return NextResponse.json(
        { error: "Invalid password." },
        { status: 401 }
      );
    }

    const res = NextResponse.json({ ok: true });

    res.cookies.set("panelist_admin", "1", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 12,
    });

    return res;
  } catch {
    return NextResponse.json(
      { error: "Login failed." },
      { status: 500 }
    );
  }
}