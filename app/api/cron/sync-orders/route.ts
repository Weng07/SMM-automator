import { NextRequest, NextResponse } from "next/server";

function isAuthorized(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return false;
  }

  const bearer = req.headers.get("authorization");
  if (bearer === `Bearer ${expected}`) {
    return true;
  }

  const secret = new URL(req.url).searchParams.get("secret");
  return secret === expected;
}

async function runSync(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const origin = new URL(req.url).origin;
  const syncRes = await fetch(`${origin}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "sync", limit: 200 }),
    cache: "no-store",
  });

  const data = await syncRes.json().catch(() => ({}));

  if (!syncRes.ok) {
    return NextResponse.json(
      { error: data.error ?? "Sync trigger failed." },
      { status: syncRes.status }
    );
  }

  return NextResponse.json({ ok: true, cron: true, ...data });
}

export async function GET(req: NextRequest) {
  return runSync(req);
}

export async function POST(req: NextRequest) {
  return runSync(req);
}
