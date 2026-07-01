import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { submitOrderForLink } from "@/lib/place-order";

export async function GET(req: NextRequest) {
  const supabase = supabaseAdmin();
  const { searchParams } = new URL(req.url);
  const limit = Number(searchParams.get("limit") ?? "50");

  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ orders: data });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { platform, tier, link, commentPoolId } = body;

    if (!platform || !tier || !link) {
      return NextResponse.json(
        { error: "platform, tier, and link are required." },
        { status: 400 }
      );
    }

    const result = await submitOrderForLink({
      platform,
      tier,
      link,
      source: "manual",
      commentPoolId: commentPoolId ?? null,
    });

    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Failed to submit order." },
      { status: 500 }
    );
  }
}
