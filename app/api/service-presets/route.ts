import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET() {
  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from("service_presets")
    .select("*, api_providers(id, name)")
    .order("platform", { ascending: true })
    .order("tier", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ presets: data });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    platform,
    tier,
    service_type,
    api_provider_id,
    panel_service_id,
    socpanel_service_id,
    quantity,
    enabled,
  } = body;

  if (!platform || !tier || !service_type) {
    return NextResponse.json(
      { error: "platform, tier, and service_type are required." },
      { status: 400 }
    );
  }

  const serviceId = panel_service_id ?? socpanel_service_id ?? null;

  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from("service_presets")
    .upsert(
      {
        platform,
        tier,
        service_type,
        api_provider_id: api_provider_id || null,
        panel_service_id: serviceId,
        socpanel_service_id: serviceId,
        quantity: quantity ?? 0,
        enabled: enabled ?? true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "platform,tier,service_type" }
    )
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ preset: data });
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required." }, { status: 400 });

  const supabase = supabaseAdmin();
  const { error } = await supabase.from("service_presets").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
