import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { fetchProviders } from "@/lib/smm-panel";

export async function GET() {
  try {
    const providers = await fetchProviders();
    return NextResponse.json({ providers });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to load API providers." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, name, api_url, api_key, is_active } = body;

    if (!name || !api_url) {
      return NextResponse.json({ error: "Provider name and API URL are required." }, { status: 400 });
    }

    const supabase = supabaseAdmin();
    const payload: Record<string, unknown> = {
      name,
      api_url,
      is_active: is_active ?? true,
      updated_at: new Date().toISOString(),
    };

    if (api_key) payload.api_key = api_key;

    const query = id
      ? supabase.from("api_providers").update(payload).eq("id", id)
      : supabase.from("api_providers").insert(payload);

    const { data, error } = await query.select("id, name, api_url, is_active, created_at").single();

    if (error) throw error;
    return NextResponse.json({ provider: data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to save API provider." }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id is required." }, { status: 400 });

    const supabase = supabaseAdmin();
    const { error } = await supabase.from("api_providers").delete().eq("id", id);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to delete API provider." }, { status: 500 });
  }
}
