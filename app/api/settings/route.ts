import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET() {
  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from("app_settings")
    .select("socpanel_api_url, socpanel_api_key")
    .eq("id", 1)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    socpanel_api_url: data.socpanel_api_url,
    socpanel_api_key_set: !!data.socpanel_api_key,
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const supabase = supabaseAdmin();

  const update: Record<string, string> = {};
  if (typeof body.socpanel_api_key === "string" && body.socpanel_api_key.length > 0) {
    update.socpanel_api_key = body.socpanel_api_key;
  }
  if (typeof body.socpanel_api_url === "string" && body.socpanel_api_url.length > 0) {
    update.socpanel_api_url = body.socpanel_api_url;
  }

  const { error } = await supabase.from("app_settings").update(update).eq("id", 1);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
