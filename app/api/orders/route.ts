import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { submitBatchOrders, submitOrderForLink } from "@/lib/place-order";

export async function GET(req: NextRequest) {
  const supabase = supabaseAdmin();
  const { searchParams } = new URL(req.url);
  const limit = Number(searchParams.get("limit") ?? "50");

  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ orders: data });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { platform, tier, link, links, commentPoolId } = body;
    const batchLinks = Array.isArray(links)
      ? links
      : typeof link === "string"
        ? link.split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean)
        : [];

    if (!platform || !tier || batchLinks.length === 0) {
      return NextResponse.json(
        { error: "platform, tier, and at least one link are required." },
        { status: 400 }
      );
    }

    if (batchLinks.length === 1) {
      const result = await submitOrderForLink({
        platform,
        tier,
        link: batchLinks[0],
        commentPoolId: commentPoolId ?? null,
      });
      return NextResponse.json(result);
    }

    const result = await submitBatchOrders({
      platform,
      tier,
      links: batchLinks,
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
